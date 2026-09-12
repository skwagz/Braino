import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Repository, secret, digest } from './database.ts';
import type { Run } from './database.ts';
import { demoDrive } from './demo.ts';
import { createDrive } from '../drive.ts';
import type { OrganizingDrive } from '../drive.ts';
import { MIME } from '../brain.ts';
import { categories, classifyByContent } from '../structure.ts';
import type { Classifier } from '../structure.ts';
import { previewOrganization, applyOrganization, defaultEdits, organizationPlan, fileLocations } from '../organizer.ts';
import type { PlanEdit } from '../organizer.ts';
import { googleLogin, savedAccessToken, disconnect } from '../auth/google.ts';
import type { AuthConfig, GoogleLogin } from '../auth/google.ts';
import { createLoginStore } from '../auth/store.ts';
import { createLLMClassifier } from '../classifier.ts';
import { serveDashboard } from './static.ts';

export interface WebConfig {
  mode: 'demo' | 'live'; origin: string; dataDir: string; dashboardDir?: string;
  google?: AuthConfig; apiKey?: string; model?: string;
}
class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
const required = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new HttpError(400, `Invalid ${label}`);
  return value;
};
const publicRun = (run: Run) => ({ id: run.id, folderId: run.folderId, status: run.status, createdAt: run.createdAt,
  report: run.preview?.report, plan: run.preview ? organizationPlan(run.preview, run.edits) : undefined,
  edits: run.preview ? run.edits ?? defaultEdits(run.preview) : [], version: run.version ?? 0,
  locations: run.locations ?? run.preview?.locations ?? {},
  result: run.result, error: run.error });

// All records are owned by authenticated Google subject IDs or isolated demo
// sessions. Clients submit only folder IDs and stored run IDs, never move plans.
export async function createWebApp(config: WebConfig, dependencies: {
  driveFor?: (owner: string) => OrganizingDrive; classifier?: Classifier; google?: GoogleLogin;
  disconnectAccount?: typeof disconnect;
} = {}) {
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin || (origin.protocol !== 'https:' &&
      !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)))) {
    throw new Error('BRAINO_BASE_URL must be an HTTPS origin or a local HTTP origin without a trailing slash');
  }
  await mkdir(config.dataDir, { recursive: true });
  const repository = new Repository(join(config.dataDir, 'braino.sqlite'));
  const tokenStore = (owner: string) => {
    if (!config.google) throw new HttpError(503, 'Configure Google OAuth first. See docs/google-login.md.');
    return createLoginStore(join(config.dataDir, 'accounts', `${digest(owner)}.enc`), config.google.key);
  };
  const drives = new Map<string, OrganizingDrive>();
  const active = new Set<string>();
  const jobs = new Set<Promise<void>>();
  const rate = new Map<string, number[]>();
  const oauth = config.google ? dependencies.google ?? googleLogin(config.google) : undefined;
  const classify = dependencies.classifier ?? (config.mode === 'demo' ? classifyByContent : config.apiKey
    ? createLLMClassifier({ apiKey: config.apiKey, model: config.model }) : undefined);
  let applying = false;

  function throttle(key: string, limit: number, period: number) {
    const now = Date.now();
    const timestamps = (rate.get(key) ?? []).filter(t => t > now - period);
    if (timestamps.length >= limit) throw new HttpError(429, 'Too many requests. Please wait before trying again.');
    timestamps.push(now); rate.set(key, timestamps);
    if (rate.size > 5000) for (const [k, values] of rate) if (values.at(-1)! < now - 600_000) rate.delete(k);
  }
  function drive(owner: string) {
    let value = drives.get(owner);
    if (!value) {
      value = dependencies.driveFor?.(owner) ?? (config.mode === 'demo' ? demoDrive(repository, owner)
        : createDrive({ accessToken: savedAccessToken(config.google!, tokenStore(owner)) }));
      drives.set(owner, value);
    }
    return value;
  }
  function job(run: Run, work: () => Promise<void>) {
    const promise = work().catch(error => {
      // Components use sanitized errors. Never return raw Google/OpenRouter payloads.
      run.status = 'failed';
      run.error = error instanceof Error ? error.message.slice(0, 500) : 'Run failed. Start a fresh preview.';
      repository.saveRun(run); repository.event(run.id, { type: 'failed', message: run.error });
    }).finally(() => { active.delete(run.owner); jobs.delete(promise); });
    jobs.add(promise);
  }
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
  };
  function cookie(res: ServerResponse, token: string) {
    res.setHeader('Set-Cookie', `braino_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${origin.protocol === 'https:' ? '; Secure' : ''}`);
  }
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Expected JSON');
    let text = '';
    for await (const chunk of req) {
      text += String(chunk);
      if (Buffer.byteLength(text) > 65536) throw new HttpError(413, 'Request too large');
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Expected an object');
    return value as Record<string, unknown>;
  }

  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (req.headers.host !== origin.host) throw new HttpError(403, 'Unexpected host');
      const url = new URL(req.url ?? '/', origin);
      if (url.origin !== origin.origin) throw new HttpError(403, 'Unexpected origin');
      if (url.pathname === '/health' && req.method === 'GET') { json(res, 200, { status: 'ok' }); return; }
      if (await serveDashboard(req, res, url.pathname, config.dashboardDir)) return;
      throttle(`ip:${req.socket.remoteAddress}`, 500, 60_000);
      const token = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('braino_session='))?.slice('braino_session='.length) ?? '';
      let session = repository.session(token);
      if (!session) {
        if (url.pathname !== '/api/status' || req.method !== 'GET') throw new HttpError(401, 'Reload the page to start a session.');
        const created = repository.newSession(config.mode === 'demo'); session = created.session; cookie(res, created.token);
      }
      if (req.method !== 'GET') {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
        if (req.headers.origin !== config.origin || req.headers['x-csrf-token'] !== session.csrf) throw new HttpError(403, 'Session verification failed. Reload the page.');
      }
      if (url.pathname === '/api/status' && req.method === 'GET') {
        json(res, 200, { mode: config.mode, connected: Boolean(session.owner), email: session.email,
          csrfToken: session.csrf, config: { google: Boolean(config.google), llm: Boolean(config.apiKey) },
          classifier: config.mode === 'demo' ? 'rules' : 'llm' }); return;
      }
      if (url.pathname === '/auth/google/start' && req.method === 'GET') {
        if (config.mode === 'demo') { res.writeHead(302, { Location: '/' }).end(); return; }
        if (!oauth) throw new HttpError(503, 'Google OAuth is not configured. Follow docs/google-login.md.');
        if (session.owner && active.has(session.owner)) throw new HttpError(409, 'Wait for the active run before changing accounts.');
        throttle(`oauth:${session.id}`, 5, 60_000);
        const state = secret(), nonce = secret();
        const begun = await oauth.begin(state, nonce);
        session.oauth = { state, nonce, verifier: begun.verifier, expiresAt: Date.now() + 600_000 };
        repository.saveSession(session);
        res.writeHead(302, { Location: begun.url }).end(); return;
      }
      if (url.pathname === '/oauth/callback' && req.method === 'GET') {
        const pending = session.oauth;
        if (!pending || pending.expiresAt < Date.now() || pending.state !== url.searchParams.get('state') || !oauth) throw new HttpError(400, 'Google login session expired or does not match.');
        delete session.oauth; repository.saveSession(session);
        if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new HttpError(400, 'Google access was not granted. Return to Braino to reconnect.');
        const login = await oauth.exchange(url.searchParams.get('code')!, pending.verifier, pending.nonce);
        if (repository.session(token)?.id !== session.id) throw new HttpError(401, 'Session ended. Reconnect from the dashboard.');
        const owner = `google:${digest(`${login.clientId}:${login.account.sub}`)}`;
        if (active.has(owner)) throw new HttpError(409, 'This account has an active run. Reconnect after it finishes.');
        active.add(owner);
        try {
          await tokenStore(owner).write(login); drives.delete(owner);
          repository.deleteSession(session.id);
          const created = repository.newSession(false);
          created.session.owner = owner; created.session.email = login.account.email;
          repository.saveSession(created.session); cookie(res, created.token);
        } finally { active.delete(owner); }
        res.writeHead(302, { Location: '/' }).end(); return;
      }
      if (!session.owner) throw new HttpError(401, 'Connect Google Drive before scanning.');
      const owner = session.owner;
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        if (active.has(owner)) throw new HttpError(409, 'Wait for the active run before disconnecting.');
        active.add(owner);
        try { if (config.mode === 'live') await (dependencies.disconnectAccount ?? disconnect)(config.google!, tokenStore(owner)); }
        finally { repository.removeOwnerSessions(owner); drives.delete(owner); cookie(res, ''); active.delete(owner); }
        json(res, 200, { connected: false }); return;
      }
      if (url.pathname === '/api/demo/reset' && req.method === 'POST') {
        if (config.mode !== 'demo') throw new HttpError(404, 'Not available');
        if (active.has(owner)) throw new HttpError(409, 'Wait for the active run before resetting.');
        repository.resetDemo(owner); drives.delete(owner); json(res, 200, { reset: true }); return;
      }
      if (url.pathname === '/api/folders' && req.method === 'GET') {
        const parent = required(url.searchParams.get('parentId') ?? 'root', 'parent folder');
        const parentFile = await drive(owner).metadata(parent);
        if (parentFile.mimeType !== MIME.folder) throw new HttpError(400, 'Select a folder');
        const children = await drive(owner).listChildren(parent);
        json(res, 200, { parentId: parentFile.id, folders: children.filter(f => f.mimeType === MIME.folder)
          .map(f => ({ id: f.id, name: f.name })) }); return;
      }
      if (url.pathname === '/api/runs' && req.method === 'GET') {
        json(res, 200, { runs: repository.runs(owner).map(publicRun) }); return;
      }
      if (url.pathname === '/api/runs' && req.method === 'POST') {
        if (!classify) throw new HttpError(503, 'Configure OPENROUTER_API_KEY for live semantic classification.');
        const input = await body(req);
        if (Object.keys(input).some(k => k !== 'folderId')) throw new HttpError(400, 'Only folderId is accepted');
        const folderId = required(input.folderId, 'folder ID');
        if (folderId === 'root') throw new HttpError(400, 'Choose a specific folder rather than all of Drive.');
        const rootMetadata = await drive(owner).metadata('root');
        if (repository.session(token)?.owner !== owner) throw new HttpError(401, 'Session ended. Reconnect from the dashboard.');
        if (folderId === rootMetadata.id) throw new HttpError(400, 'Choose a specific folder rather than all of Drive.');
        if (active.has(owner)) throw new HttpError(409, 'A run is already active for this account.');
        throttle(`scan:${owner}`, 10, 600_000);
        const run: Run = { id: secret(), owner, folderId, createdAt: Date.now(), status: 'scanning' };
        active.add(owner); repository.saveRun(run);
        job(run, async () => {
          run.preview = await previewOrganization({ folderId, drive: drive(owner), classify: async input => {
            const decision = await classify(input);
            const override = repository.categoryOverride(owner, input.file.id);
            if (!override) return decision;
            return { ...decision, categoryId: override.categoryId,
              destinationSource: 'user',
              reason: `Saved user destination: ${override.categoryId === null ? 'keep current folder' : categories.find(c => c.id === override.categoryId)!.name}. ${decision.reason}`,
              method: `${decision.method}+user-override` };
          } });
          run.status = 'ready'; repository.saveRun(run);
        });
        json(res, 202, publicRun(run)); return;
      }
      const match = /^\/api\/runs\/([a-zA-Z0-9_-]+)(\/apply|\/events|\/plan)?$/.exec(url.pathname);
      if (match) {
        const run = repository.run(match[1], owner);
        if (!run) throw new HttpError(404, 'Run not found');
        if (!match[2] && req.method === 'GET') { json(res, 200, publicRun(run)); return; }
        if (match[2] === '/events' && req.method === 'GET') { json(res, 200, { events: repository.events(run.id) }); return; }
        if (match[2] === '/plan' && req.method === 'POST') {
          const input = await body(req);
          // Reading the body yields: recheck session and run to avoid stale concurrent edits/apply.
          if (repository.session(token)?.owner !== owner) throw new HttpError(401, 'Session ended. Reload the dashboard.');
          const current = repository.run(run.id, owner);
          if (!current?.preview || current.status !== 'ready' || active.has(owner)) throw new HttpError(409, 'This run is not ready to edit.');
          if (Object.keys(input).some(k => !['version', 'sources'].includes(k)) || !Number.isSafeInteger(input.version)) throw new HttpError(400, 'Expected a plan version and sources.');
          if (input.version !== (current.version ?? 0)) throw new HttpError(409, 'The plan changed. Reload it before saving.');
          const ids = new Set(current.preview.report.documents.map(d => d.id));
          if (!Array.isArray(input.sources) || input.sources.length !== ids.size) throw new HttpError(400, 'Include each scanned file exactly once.');
          const edits: PlanEdit[] = input.sources.map(value => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid source edit.');
            const edit = value as Record<string, unknown>;
            if (Object.keys(edit).some(k => !['id', 'name', 'categoryId'].includes(k)) || typeof edit.id !== 'string' || !ids.delete(edit.id)) throw new HttpError(400, 'Unknown or duplicate source.');
            if (typeof edit.name !== 'string' || !edit.name.trim() || edit.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(edit.name)) throw new HttpError(400, 'File names must contain 1–255 characters without slashes or control characters.');
            if (edit.categoryId !== null && !categories.some(c => c.id === edit.categoryId)) throw new HttpError(400, 'Unknown destination category.');
            return { id: edit.id, name: edit.name, categoryId: edit.categoryId } as PlanEdit;
          });
          current.edits = edits; current.version = (current.version ?? 0) + 1;
          repository.saveRun(current); json(res, 200, publicRun(current)); return;
        }
        if (match[2] === '/apply' && req.method === 'POST') {
          const input = await body(req);
          if (repository.session(token)?.owner !== owner) throw new HttpError(401, 'Session ended. Reload the dashboard.');
          const latest = repository.run(run.id, owner);
          if (!latest || !Number.isSafeInteger(input.version) || input.version !== (latest.version ?? 0)) throw new HttpError(409, 'The plan changed. Review the latest version before applying.');
          Object.assign(run, latest);
          if (run.status === 'complete') { json(res, 200, publicRun(run)); return; }
          if (run.status !== 'ready' || !run.preview) throw new HttpError(409, 'This run is not ready to apply.');
          const plan = organizationPlan(run.preview, run.edits);
          if (plan.blocked.length) throw new HttpError(409, plan.blocked.join('; '));
          if (active.has(owner) || applying) throw new HttpError(409, 'Another organization is active. Try again when it finishes.');
          applying = true; active.add(owner); run.status = 'applying'; repository.saveRun(run);
          job(run, async () => {
            try {
              run.result = await applyOrganization(run.preview!, drive(owner), async event => { repository.event(run.id, event); }, run.edits);
              for (const edit of run.edits ?? []) {
                const original = run.preview!.report.documents.find(d => d.id === edit.id)!;
                if (edit.categoryId !== original.classification.categoryId) repository.saveCategoryOverride(owner, edit.id, edit.categoryId);
              }
              run.locations = await fileLocations(drive(owner), run.folderId,
                [...run.preview!.report.documents.map(d => d.id), ...run.preview!.report.skipped.map(s => s.file.id)]);
              run.status = 'complete'; repository.saveRun(run);
            } finally { applying = false; }
          });
          json(res, 202, publicRun(run)); return;
        }
      }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : 'Request failed. Check configuration or reconnect Google Drive.' });
      else res.end();
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  return { server, repository, async close() {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.allSettled([...jobs]); repository.close();
  } };
}
