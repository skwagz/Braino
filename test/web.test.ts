import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWebApp } from '../src/web/app.ts';
import { Repository } from '../src/web/database.ts';
import type { Run } from '../src/web/database.ts';
import { DRIVE_SCOPE } from '../src/auth/google.ts';
import { request as httpRequest } from 'node:http';
import type { OrganizingDrive } from '../src/drive.ts';

const origin = 'http://127.0.0.1:43821';
async function fixture(mode: 'demo' | 'live' = 'demo', mockOAuth = false,
  hooks: { disconnectAccount?: () => Promise<void>; driveFor?: () => OrganizingDrive } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'braino-web-'));
  let expectedState = '';
  const app = await createWebApp({ mode, origin, dataDir: directory,
    google: mockOAuth ? { clientId: 'client', clientSecret: 'test', key: 'a'.repeat(64), redirectUri: `${origin}/oauth/callback` } : undefined },
  { ...hooks, classifier: hooks.driveFor ? async () => ({ categoryId: null, evidence: [], reason: 'test', method: 'test' }) : undefined, google: mockOAuth ? {
    async begin(state) { expectedState = state; return { url: 'https://accounts.google.com/mock', verifier: 'proof' }; },
    async exchange(code, verifier) {
      assert.equal(code, 'valid'); assert.equal(verifier, 'proof');
      return { clientId: 'client', account: { sub: 'account', email: 'test@example.com' },
        accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: Date.now() + 3600_000, scopes: [DRIVE_SCOPE] };
    },
  } : undefined });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = (app.server.address() as { port: number }).port;
  async function request(path: string, options: { cookie?: string; csrf?: string; method?: string; body?: unknown; origin?: string; host?: string } = {}) {
    const response = await new Promise<Response>((resolve, reject) => {
      const request = httpRequest(`http://127.0.0.1:${port}${path}`, { method: options.method ?? 'GET',
        headers: { Host: options.host ?? '127.0.0.1:43821', ...(options.cookie ? { Cookie: options.cookie } : {}),
          ...(options.method === 'POST' ? { Origin: options.origin ?? origin, 'x-csrf-token': options.csrf ?? '', 'Content-Type': 'application/json' } : {}) },
      }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            for (const entry of Array.isArray(value) ? value : [value]) if (entry) headers.append(key, entry);
          }
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
        });
      });
      request.on('error', reject);
      request.end(options.body === undefined ? undefined : JSON.stringify(options.body));
    });
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { response, data };
  }
  async function client() {
    const status = await request('/api/status');
    assert.equal(status.response.status, 200, JSON.stringify(status.data));
    return { cookie: status.response.headers.get('set-cookie')!.split(';')[0], csrf: String(status.data.csrfToken) };
  }
  async function wait(id: string, auth: Awaited<ReturnType<typeof client>>) {
    for (let i = 0; i < 100; i++) {
      const value = await request(`/api/runs/${id}`, auth);
      if (!['scanning', 'applying'].includes(String(value.data.status))) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Run did not finish');
  }
  return { app, directory, request, client, wait, state: () => expectedState,
    async close() { await app.close(); await rm(directory, { recursive: true, force: true }); } };
}

test('browser demo scans, moves five samples, preserves review, and reruns with no moves', async () => {
  const f = await fixture();
  try {
    const auth = await f.client();
    const folders = await f.request('/api/folders', auth);
    assert.equal((folders.data.folders as { id: string }[])[0].id, 'demo-folder');
    const started = await f.request('/api/runs', { ...auth, method: 'POST', body: { folderId: 'demo-folder' } });
    assert.equal(started.response.status, 202);
    const id = String(started.data.id);
    const ready = await f.wait(id, auth);
    assert.equal(ready.data.status, 'ready');
    const report = ready.data.report as { review: string[]; folders: unknown[] };
    assert.deepEqual(report.review, ['demo-review']); assert.equal(report.folders.length, 5);
    await f.request(`/api/runs/${id}/apply`, { ...auth, method: 'POST', body: {} });
    const complete = await f.wait(id, auth);
    assert.deepEqual(complete.data.result, { moved: 5 });
    assert.equal((await f.request(`/api/runs/${id}/apply`, { ...auth, method: 'POST', body: {} })).response.status, 200);
    const next = await f.request('/api/runs', { ...auth, method: 'POST', body: { folderId: 'demo-folder' } });
    const again = await f.wait(String(next.data.id), auth);
    assert.deepEqual((again.data.plan as { operations: unknown[] }).operations, []);
  } finally { await f.close(); }
});

test('sessions cannot read or apply another owner run; CSRF and hostile Host rejected', async () => {
  const f = await fixture();
  try {
    const alice = await f.client(), bob = await f.client();
    const start = await f.request('/api/runs', { ...alice, method: 'POST', body: { folderId: 'demo-folder' } });
    const id = String(start.data.id); await f.wait(id, alice);
    assert.equal((await f.request(`/api/runs/${id}`, bob)).response.status, 404);
    assert.equal((await f.request(`/api/runs/${id}/apply`, { ...bob, method: 'POST', body: {} })).response.status, 404);
    assert.equal((await f.request('/api/runs', { ...alice, csrf: 'forged', method: 'POST', body: { folderId: 'demo-folder' } })).response.status, 403);
    assert.equal((await f.request('/api/runs', { ...alice, origin: 'https://evil.example', method: 'POST', body: {} })).response.status, 403);
    assert.equal((await f.request('/api/status', { host: 'evil.example' })).response.status, 403);
    assert.equal((await f.request('/api/runs', { ...alice, method: 'POST', body: { folderId: 'demo-folder', operations: [] } })).response.status, 400);
  } finally { await f.close(); }
});

test('live mode never scans without login, and OAuth rotates sessions without exposing tokens', async () => {
  const f = await fixture('live', true);
  try {
    const old = await f.client();
    assert.equal((await f.request('/api/folders', old)).response.status, 401);
    const start = await f.request('/auth/google/start', old); assert.equal(start.response.status, 302);
    assert.equal((await f.request('/oauth/callback?state=forged&code=valid', old)).response.status, 400);
    const callback = await f.request(`/oauth/callback?state=${f.state()}&code=valid`, old);
    assert.equal(callback.response.status, 302);
    const cookie = callback.response.headers.get('set-cookie')!.split(';')[0];
    assert.notEqual(cookie, old.cookie);
    assert.equal((await f.request('/api/runs', old)).response.status, 401);
    const status = await f.request('/api/status', { cookie });
    assert.equal(status.data.connected, true); assert.equal(status.data.email, 'test@example.com');
    assert.ok(!JSON.stringify(status.data).includes('secret'));
    const missingKey = await f.request('/api/runs', { cookie, csrf: String(status.data.csrfToken), method: 'POST', body: { folderId: 'folder' } });
    assert.equal(missingKey.response.status, 503);
  } finally { await f.close(); }
});

test('persistent runs recover interrupted execution as failed after restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'braino-recovery-'));
  try {
    const path = join(directory, 'db.sqlite');
    const db = new Repository(path);
    const run: Run = { id: 'id', owner: 'owner', folderId: 'folder', status: 'applying', createdAt: Date.now() };
    db.saveRun(run); db.event(run.id, { type: 'move-started', fileId: 'doc', destination: 'folder', oldParent: 'old' }); db.close();
    const recovered = new Repository(path);
    assert.equal(recovered.run('id', 'owner')!.status, 'failed');
    assert.equal(recovered.run('id', 'other'), null); assert.equal(recovered.events('id').length, 1);
    recovered.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('logout excludes concurrent account runs and invalidates existing sessions', async () => {
  let releaseLogout!: () => void, logoutStarted!: () => void;
  const started = new Promise<void>(resolve => { logoutStarted = resolve; });
  const hold = new Promise<void>(resolve => { releaseLogout = resolve; });
  const f = await fixture('live', true, {
    disconnectAccount: async () => { logoutStarted(); await hold; },
    driveFor: () => ({
      async metadata(id) { return { id, name: 'Folder', mimeType: 'application/vnd.google-apps.folder', version: '1' }; },
      async listChildren() { return []; }, async readText() { return ''; },
      async ensureCategory() { throw new Error('Unexpected'); }, async move() { throw new Error('Unexpected'); },
    }),
  });
  try {
    const initial = await f.client();
    await f.request('/auth/google/start', initial);
    const callback = await f.request(`/oauth/callback?state=${f.state()}&code=valid`, initial);
    const cookie = callback.response.headers.get('set-cookie')!.split(';')[0];
    const status = await f.request('/api/status', { cookie });
    const auth = { cookie, csrf: String(status.data.csrfToken) };
    const logout = f.request('/api/logout', { ...auth, method: 'POST', body: {} });
    await started;
    const scan = await f.request('/api/runs', { ...auth, method: 'POST', body: { folderId: 'folder' } });
    assert.equal(scan.response.status, 409);
    releaseLogout(); await logout;
    assert.equal((await f.request('/api/runs', auth)).response.status, 401);
  } finally { releaseLogout(); await f.close(); }
});

test('a scan waiting on preflight cannot resume after its account logs out', async () => {
  let release!: () => void, entered!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const f = await fixture('live', true, {
    disconnectAccount: async () => {},
    driveFor: () => ({
      async metadata(id) { entered(); await hold; return { id, name: 'Folder', mimeType: 'application/vnd.google-apps.folder', version: '1' }; },
      async listChildren() { throw new Error('Scan must not run'); }, async readText() { throw new Error('Scan must not run'); },
      async ensureCategory() { throw new Error('Unexpected'); }, async move() { throw new Error('Unexpected'); },
    }),
  });
  try {
    const initial = await f.client(); await f.request('/auth/google/start', initial);
    const callback = await f.request(`/oauth/callback?state=${f.state()}&code=valid`, initial);
    const cookie = callback.response.headers.get('set-cookie')!.split(';')[0];
    const status = await f.request('/api/status', { cookie });
    const auth = { cookie, csrf: String(status.data.csrfToken) };
    const scan = f.request('/api/runs', { ...auth, method: 'POST', body: { folderId: 'folder' } });
    await waiting;
    await f.request('/api/logout', { ...auth, method: 'POST', body: {} });
    release(); assert.equal((await scan).response.status, 401);
  } finally { release(); await f.close(); }
});
