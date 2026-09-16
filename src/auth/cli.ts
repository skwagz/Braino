import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { authConfig, loginStore, googleLogin, disconnect } from './google.ts';
import { startLogin } from './server.ts';

async function initialize() {
  const defaults = {
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    GOOGLE_REDIRECT_URI: 'http://127.0.0.1:43821/oauth/callback',
    BRAINO_MODE: 'live', BRAINO_BASE_URL: 'http://127.0.0.1:43821',
    BRAINO_HOST: '127.0.0.1', PORT: '43821', BRAINO_DATA_DIR: 'private-data/web',
    OPENROUTER_API_KEY: '', OPENROUTER_MODEL: 'openai/gpt-4o-mini',
  };
  let content: string;
  try { content = await readFile('.env', 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile('.env', [
      ...Object.entries(defaults).map(([name, value]) => `${name}=${value}`),
      `BRAINO_TOKEN_KEY=${randomBytes(32).toString('hex')}`, '',
    ].join('\n'), { flag: 'wx', mode: 0o600 });
    console.log('Created .env. Add your Google OAuth credentials and OPENROUTER_API_KEY for live mode.');
    return;
  }
  const missing = Object.entries(defaults).filter(([name]) => !new RegExp(`^\\s*${name}\\s*=`, 'm').test(content))
    .map(([name, value]) => `${name}=${value}`);
  if (!/^\s*BRAINO_TOKEN_KEY\s*=/m.test(content)) missing.push(`BRAINO_TOKEN_KEY=${randomBytes(32).toString('hex')}`);
  if (missing.length) await appendFile('.env', `\n${missing.join('\n')}\n`, { mode: 0o600 });
  console.log('Environment setup complete. Existing values preserved; missing settings added. Fill OPENROUTER_API_KEY locally for live AI scans.');
}

async function main() {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length || !['init', 'login', 'status', 'logout'].includes(command)) {
    throw new Error('Usage: npm run auth -- init | login | status | logout');
  }
  if (command === 'init') { await initialize(); return; }
  const config = authConfig();
  const store = loginStore(config);
  if (command === 'status') {
    const saved = await store.read();
    console.log(saved && saved.clientId === config.clientId
      ? `Saved Google connection: ${saved.account.email}. Access refreshes automatically when needed.`
      : 'No Google connection saved for this OAuth client.');
    return;
  }
  if (command === 'logout') { await disconnect(config, store); console.log('Disconnected Google Drive and removed the local login.'); return; }
  const session = await startLogin({ port: Number(new URL(config.redirectUri).port), provider: googleLogin(config), store });
  const cancel = () => session.cancel();
  process.once('SIGINT', cancel);
  console.log('Open this local link to choose your Google account and approve Drive access:');
  console.log(session.url);
  console.log('This grants Drive read/write access for organizing existing documents. Login expires in 10 minutes.');
  try {
    const saved = await session.completed;
    console.log(`Connected: ${saved.account.email}. Run npm run organize -- preview YOUR_FOLDER_ID preview.json`);
  } finally { process.removeListener('SIGINT', cancel); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
