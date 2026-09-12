import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLoginStore } from '../src/auth/store.ts';
import type { SavedLogin, LoginStore } from '../src/auth/store.ts';
import { authConfig, savedAccessToken, googleLogin, DRIVE_SCOPE } from '../src/auth/google.ts';
import { startLogin } from '../src/auth/server.ts';

const config = { clientId: 'client', clientSecret: 'secret', key: 'a'.repeat(64), redirectUri: 'http://127.0.0.1:43821/oauth/callback' };
const login: SavedLogin = { clientId: 'client', account: { sub: 'user-1', email: 'test@example.com' },
  accessToken: 'private-access', refreshToken: 'private-refresh', expiresAt: Date.now() + 3_600_000, scopes: [DRIVE_SCOPE] };

function memoryStore(initial: SavedLogin | null = null) {
  let value = initial, writes = 0;
  const store: LoginStore = { async read() { return value; }, async write(v) { value = v; writes++; }, async clear() { value = null; } };
  return { store, count: () => writes };
}

test('token storage is encrypted, survives refresh, detects tampering and clears', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'braino-auth-'));
  try {
    const path = join(directory, 'login.enc');
    const store = createLoginStore(path, config.key);
    assert.equal(await store.read(), null);
    await store.write(login);
    const serialized = await readFile(path, 'utf8');
    assert.ok(!serialized.includes(login.accessToken));
    assert.ok(!serialized.includes(login.account.email));
    assert.deepEqual(await store.read(), login);
    await store.write({ ...login, accessToken: 'new' });
    assert.equal((await store.read())!.accessToken, 'new');
    await assert.rejects(createLoginStore(path, 'b'.repeat(64)).read(), /decrypt/);
    const envelope = JSON.parse(serialized); envelope.tag = Buffer.alloc(16).toString('base64');
    await writeFile(path, JSON.stringify(envelope));
    await assert.rejects(store.read(), /decrypt/);
    await store.clear(); assert.equal(await store.read(), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('uses a valid saved token without contacting Google; refresh persists once', async () => {
  const current = memoryStore(login);
  assert.equal(await savedAccessToken(config, current.store, async () => { throw new Error('Should not refresh'); })(), login.accessToken);
  const expired = memoryStore({ ...login, expiresAt: 1 });
  let refreshes = 0;
  const get = savedAccessToken(config, expired.store, async value => {
    refreshes++; return { ...value, accessToken: 'renewed', expiresAt: Date.now() + 3_600_000 };
  });
  assert.deepEqual(await Promise.all([get(), get(), get()]), ['renewed', 'renewed', 'renewed']);
  assert.equal(refreshes, 1); assert.equal(expired.count(), 1);
  assert.equal(await get(), 'renewed'); assert.equal(refreshes, 1);
});

test('missing login, wrong client and revoked refresh fail safely', async () => {
  await assert.rejects(savedAccessToken(config, memoryStore().store)(), /Connect/);
  await assert.rejects(savedAccessToken(config, memoryStore({ ...login, clientId: 'other' }).store)(), /Connect/);
  await assert.rejects(savedAccessToken(config, memoryStore({ ...login, expiresAt: 1 }).store,
    async () => { throw new Error('private-token-error'); })(), error => {
      assert.ok(error instanceof Error); assert.match(error.message, /revoked/); assert.ok(!error.message.includes('private-token')); return true;
    });
});

test('Google authorization URL includes state, PKCE, nonce, offline and Drive scope', async () => {
  const begun = await googleLogin(config).begin('state-value', 'nonce-value');
  const url = new URL(begun.url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('nonce'), 'nonce-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.ok(url.searchParams.get('scope')!.includes(DRIVE_SCOPE));
  assert.ok(begun.verifier.length >= 43);
});

test('rejects non-loopback callback configuration', () => {
  assert.throws(() => authConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', BRAINO_TOKEN_KEY: config.key,
    GOOGLE_REDIRECT_URI: 'https://example.com/oauth/callback' }), /Local login/);
});

async function sessionFixture() {
  const memory = memoryStore();
  let state = '', exchanges = 0;
  const session = await startLogin({ port: 0, store: memory.store, timeoutMs: 10_000, provider: {
    async begin(s) { state = s; return { url: 'https://accounts.google.com/mock', verifier: 'pkce' }; },
    async exchange(code, verifier) { exchanges++; assert.equal(code, 'code'); assert.equal(verifier, 'pkce'); return login; },
  } });
  return { ...session, ...memory, state: () => state, exchanges: () => exchanges };
}

test('callback needs both state and browser cookie; successful login saves once', async () => {
  const session = await sessionFixture();
  try {
    const start = await fetch(session.url, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    const base = new URL(session.url).origin;
    const forged = await fetch(`${base}/oauth/callback?code=code&state=wrong`, { headers: { Cookie: cookie } });
    assert.equal(forged.status, 400);
    const missingCookie = await fetch(`${base}/oauth/callback?code=code&state=${session.state()}`);
    assert.equal(missingCookie.status, 400); assert.equal(session.exchanges(), 0);
    const response = await fetch(`${base}/oauth/callback?code=code&state=${session.state()}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(login.accessToken));
    assert.deepEqual(await session.completed, login); assert.equal(session.count(), 1);
  } finally { session.cancel(); }
});

test('consent denial stores no tokens; unsolicited login and POST requests rejected', async () => {
  const session = await sessionFixture();
  try {
    const base = new URL(session.url).origin;
    assert.equal((await fetch(`${base}/connect?key=wrong`)).status, 403);
    assert.equal((await fetch(session.url, { method: 'POST' })).status, 403);
    const start = await fetch(session.url, { redirect: 'manual' });
    const cookie = start.headers.get('set-cookie')!.split(';')[0];
    const denial = await fetch(`${base}/oauth/callback?error=access_denied&state=${session.state()}`, { headers: { Cookie: cookie } });
    assert.equal(denial.status, 400);
    await assert.rejects(session.completed, /not granted/);
    assert.equal(session.count(), 0); assert.equal(session.exchanges(), 0);
  } finally { session.cancel(); }
});
