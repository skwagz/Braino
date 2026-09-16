import { mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createWebApp } from './web/app.ts';
import type { WebConfig } from './web/app.ts';

async function main() {
  const port = Number(process.env.PORT ?? 43821);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const mode = process.env.BRAINO_MODE ?? 'live';
  if (mode !== 'demo' && mode !== 'live') throw new Error('BRAINO_MODE must be demo or live');
  const origin = process.env.BRAINO_BASE_URL ?? `http://127.0.0.1:${port}`;
  const dataDir = resolve(process.env.BRAINO_DATA_DIR ?? 'private-data/web');
  const key = process.env.BRAINO_TOKEN_KEY;
  const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && key
    ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      key, redirectUri: `${origin}/oauth/callback` } : undefined;
  if (google && !/^[a-f0-9]{64}$/i.test(google.key)) throw new Error('Invalid BRAINO_TOKEN_KEY; use auth init');
  if (mode === 'live' && (!google || !process.env.OPENROUTER_API_KEY)) {
    throw new Error('Live mode requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BRAINO_TOKEN_KEY and OPENROUTER_API_KEY. Configure the backend environment before starting.');
  }
  if (process.env.NODE_ENV === 'production' && (mode !== 'live' || !origin.startsWith('https://'))) {
    throw new Error('Production requires BRAINO_MODE=live and an HTTPS BRAINO_BASE_URL.');
  }
  const config: WebConfig = { mode, origin, dataDir, google, apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL };
  await mkdir(dataDir, { recursive: true });
  const lockPath = join(dataDir, 'server.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Server data directory is locked. Stop the existing server, or inspect the stale server.lock after a crash.'); });
  let app: Awaited<ReturnType<typeof createWebApp>> | undefined;
  let stopping = false;
  async function stop() {
    if (stopping) return; stopping = true;
    await app?.close(); await lock.close(); await unlink(lockPath);
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    app = await createWebApp(config);
    await new Promise<void>((resolve, reject) => {
      app!.server.once('error', reject);
      app!.server.listen(port, process.env.BRAINO_HOST ?? '127.0.0.1', resolve);
    });
    console.log(`Braino ${mode} is ready at ${origin}`);
    if (mode === 'demo') console.log('Synthetic sample documents only. No Google or model requests.');
    process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
  } catch (error) { await stop(); throw error; }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
