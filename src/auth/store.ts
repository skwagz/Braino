import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface SavedLogin {
  clientId: string;
  account: { sub: string; email: string };
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}
export interface LoginStore {
  read(): Promise<SavedLogin | null>;
  write(login: SavedLogin): Promise<void>;
  clear(): Promise<void>;
}

export function createLoginStore(path: string, encodedKey: string): LoginStore {
  if (!/^[a-f0-9]{64}$/i.test(encodedKey)) throw new Error('BRAINO_TOKEN_KEY must be 64 hex characters. Run npm run auth -- init.');
  const key = Buffer.from(encodedKey, 'hex');
  const aad = Buffer.from('braino-google-oauth-v1');
  return {
    async read() {
      let serialized: string;
      try { serialized = await readFile(path, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
      try {
        const envelope = JSON.parse(serialized);
        if (envelope.version !== 1) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
        decipher.setAAD(aad);
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
        const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
        if (typeof value.clientId !== 'string' || !value.account?.sub || typeof value.account.email !== 'string' ||
            typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string' ||
            !Number.isFinite(value.expiresAt) || !Array.isArray(value.scopes) || value.scopes.some((s: unknown) => typeof s !== 'string')) throw new Error();
        return value;
      } catch { throw new Error('Cannot decrypt saved Google login. Restore the matching key or remove the local login file and reconnect.'); }
    },
    async write(login) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad);
      const data = Buffer.concat([cipher.update(JSON.stringify(login), 'utf8'), cipher.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        await writeFile(temporary, envelope, { mode: 0o600, flag: 'wx' });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    },
    async clear() { await rm(path, { force: true }); },
  };
}
