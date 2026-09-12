import { mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWebApp } from '../../../src/web/app.ts';

const parent = fileURLToPath(new URL('../../../private-data/', import.meta.url));
await mkdir(parent, { recursive: true });
const dataDir = await mkdtemp(`${parent}landing-e2e-`);
const app = await createWebApp({ mode: 'demo', origin: 'http://127.0.0.1:43822', dataDir });
app.server.listen(43822, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close());
