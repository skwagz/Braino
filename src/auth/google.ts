import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { resolve } from 'node:path';
import { createLoginStore } from './store.ts';
import type { LoginStore, SavedLogin } from './store.ts';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export interface AuthConfig { clientId: string; clientSecret: string; redirectUri: string; key: string }
export interface GoogleLogin {
  begin(state: string, nonce: string): Promise<{ url: string; verifier: string }>;
  exchange(code: string, verifier: string, nonce: string): Promise<SavedLogin>;
}

export function authConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, BRAINO_TOKEN_KEY: key } = env;
  if (!clientId?.trim() || !clientSecret?.trim() || !key?.trim()) {
    throw new Error('Run npm run auth -- init, then set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.');
  }
  const redirectUri = env.GOOGLE_REDIRECT_URI ?? 'http://127.0.0.1:43821/oauth/callback';
  const uri = new URL(redirectUri);
  if (uri.protocol !== 'http:' || uri.hostname !== '127.0.0.1' || !uri.port || Number(uri.port) < 1 ||
      uri.pathname !== '/oauth/callback' || uri.search || uri.hash || uri.username || uri.password) {
    throw new Error('Local login requires http://127.0.0.1:PORT/oauth/callback as GOOGLE_REDIRECT_URI.');
  }
  return { clientId, clientSecret, redirectUri, key };
}

export function loginStore(config: AuthConfig) {
  return createLoginStore(resolve('private-data/google-login.enc'), config.key);
}

function oauthClient(config: AuthConfig) {
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.redirectUri, transporterOptions: { timeout: 30_000 } });
}

export function googleLogin(config: AuthConfig): GoogleLogin {
  const client = oauthClient(config);
  return {
    async begin(state, nonce) {
      const pkce = await client.generateCodeVerifierAsync();
      const url = new URL(client.generateAuthUrl({
        access_type: 'offline', prompt: 'consent select_account', scope: ['openid', 'email', DRIVE_SCOPE],
        state, code_challenge: pkce.codeChallenge, code_challenge_method: CodeChallengeMethod.S256,
      }));
      url.searchParams.set('nonce', nonce);
      return { url: url.toString(), verifier: pkce.codeVerifier };
    },
    async exchange(code, verifier, nonce) {
      try {
        const { tokens } = await client.getToken({ code, codeVerifier: verifier, redirect_uri: config.redirectUri });
        if (!tokens.id_token || !tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) throw new Error();
        const identity = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
        const payload = identity.getPayload();
        if (!payload?.sub || !payload.email || !payload.email_verified || (payload as { nonce?: string }).nonce !== nonce) throw new Error();
        const info = await client.getTokenInfo(tokens.access_token);
        if (info.aud !== config.clientId || !info.scopes.includes(DRIVE_SCOPE)) throw new Error();
        return { clientId: config.clientId, account: { sub: payload.sub, email: payload.email },
          accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
          expiresAt: tokens.expiry_date, scopes: info.scopes };
      } catch { throw new Error('Google login could not be verified. Reconnect and grant Drive access.'); }
    },
  };
}

export function savedAccessToken(config: AuthConfig, store: LoginStore = loginStore(config),
  refresh = async (login: SavedLogin): Promise<SavedLogin> => {
    const client = oauthClient(config);
    client.setCredentials({ access_token: login.accessToken, refresh_token: login.refreshToken, expiry_date: login.expiresAt });
    const result = await client.getAccessToken();
    if (!result.token || !client.credentials.expiry_date) throw new Error();
    return { ...login, accessToken: result.token,
      refreshToken: client.credentials.refresh_token ?? login.refreshToken,
      expiresAt: client.credentials.expiry_date };
  }) {
  let pending: Promise<string> | undefined;
  return async () => {
    if (pending) return pending;
    pending = (async () => {
      const login = await store.read();
      if (!login || login.clientId !== config.clientId || !login.scopes.includes(DRIVE_SCOPE)) {
        throw new Error('Connect Google Drive first: npm run auth -- login');
      }
      if (login.expiresAt > Date.now() + 60_000) return login.accessToken;
      let updated: SavedLogin;
      try { updated = await refresh(login); }
      catch { throw new Error('Google access expired or was revoked. Run npm run auth -- login again.'); }
      await store.write(updated);
      return updated.accessToken;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

export async function disconnect(config: AuthConfig, store: LoginStore = loginStore(config)) {
  const login = await store.read();
  let failed = false;
  try {
    if (login) await oauthClient(config).revokeToken(login.refreshToken);
  } catch { failed = true; }
  finally { await store.clear(); }
  if (failed) throw new Error('Local login removed. Google revocation failed; remove Braino access in your Google Account connections.');
}
