import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleLogin } from './google.ts';
import type { LoginStore, SavedLogin } from './store.ts';

const random = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// Local, single-user login only. No tokens or auth codes are rendered or logged.
export async function startLogin(options: {
  port: number; provider: GoogleLogin; store: LoginStore; timeoutMs?: number;
}) {
  const launch = random();
  let pending: { state: string; nonce: string; verifier: string; cookie: string } | undefined;
  let busy = false;
  let finished = false;
  let resolveLogin!: (value: SavedLogin) => void;
  let rejectLogin!: (error: Error) => void;
  const completed = new Promise<SavedLogin>((resolve, reject) => { resolveLogin = resolve; rejectLogin = reject; });
  // The caller may attach after it has printed the URL.
  completed.catch(() => {});
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const address = server.address();
    const host = `127.0.0.1:${typeof address === 'object' && address ? address.port : options.port}`;
    if (req.headers.host !== host || req.method !== 'GET') { res.writeHead(403).end('Request not allowed.'); return; }
    const url = new URL(req.url ?? '/', `http://${host}`);
    try {
      if (url.pathname === '/connect') {
        if (!equal(url.searchParams.get('key') ?? '', launch) || busy || finished) { res.writeHead(403).end('Use the login link printed by Braino.'); return; }
        busy = true;
        try {
          const state = random(), nonce = random(), cookie = random();
          const begun = await options.provider.begin(state, nonce);
          if (finished) { res.writeHead(410).end('Login timed out.'); return; }
          pending = { state, nonce, cookie, verifier: begun.verifier };
          res.setHeader('Set-Cookie', `braino_oauth=${cookie}; HttpOnly; SameSite=Lax; Path=/oauth/callback; Max-Age=600`);
          res.writeHead(302, { Location: begun.url }).end();
        } finally { busy = false; }
        return;
      }
      if (url.pathname !== '/oauth/callback') { res.writeHead(404).end('Not found.'); return; }
      const cookie = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('braino_oauth='))?.slice('braino_oauth='.length) ?? '';
      if (!pending || busy || finished || !equal(url.searchParams.get('state') ?? '', pending.state) || !equal(cookie, pending.cookie)) {
        res.writeHead(400).end('Login session mismatch or expired. Start login again.'); return;
      }
      const attempt = pending;
      pending = undefined;
      busy = true;
      res.setHeader('Set-Cookie', 'braino_oauth=; HttpOnly; SameSite=Lax; Path=/oauth/callback; Max-Age=0');
      if (url.searchParams.has('error') || !url.searchParams.get('code')) {
        res.writeHead(400).end('Google access was not granted. You can start login again.');
        finish(new Error('Google access was not granted.'));
        return;
      }
      const login = await options.provider.exchange(url.searchParams.get('code')!, attempt.verifier, attempt.nonce);
      if (finished) { res.writeHead(410).end('Login timed out.'); return; }
      await options.store.write(login);
      res.end('Google Drive connected to Braino. You can close this tab and return to the terminal.');
      finish(undefined, login);
    } catch {
      res.writeHead(500).end('Could not connect Google Drive. Return to the terminal and start login again.');
      finish(new Error('Google login failed. Check your OAuth configuration and granted permissions.'));
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  function finish(error?: Error, login?: SavedLogin) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    server.close();
    if (error) rejectLogin(error); else resolveLogin(login!);
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  server.on('error', () => finish(new Error('Local login server failed.')));
  timer = setTimeout(() => finish(new Error('Login timed out. Run login again.')), options.timeoutMs ?? 10 * 60_000);
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/connect?key=${launch}`, completed,
    cancel: () => finish(new Error('Login cancelled.')) };
}
