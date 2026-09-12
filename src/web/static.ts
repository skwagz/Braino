import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { samplePdf } from './sample-pdf.ts';

// Serve only Vite's entry point and flat, generated JS/CSS assets. API requests,
// credentials, source files and arbitrary filesystem paths never enter this route.
export async function serveDashboard(req: IncomingMessage, res: ServerResponse,
  pathname: string, directory = fileURLToPath(new URL('../../apps/dashboard/dist/', import.meta.url))): Promise<boolean> {
  if (pathname === '/sample.pdf' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Braino-sample.pdf"' });
    res.end(req.method === 'HEAD' ? undefined : samplePdf()); return true;
  }
  const entry = ['/', '/index.html', '/app', '/app/'].includes(pathname);
  const wikiSample = pathname === '/wiki-demo.json';
  const asset = /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.exec(pathname);
  if (pathname.startsWith('/assets/') && !asset) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Asset not found'); return true;
  }
  if (!entry && !asset && !wikiSample) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return true;
  }
  try {
    const content = await readFile(join(directory, entry ? 'index.html' : pathname.slice(1)));
    const type = entry ? 'text/html' : wikiSample ? 'application/json' : asset![1] === 'js' ? 'text/javascript' : 'text/css';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    res.writeHead(entry ? 503 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : entry
      ? 'Dashboard build missing. Run npm run build, then reload.' : 'Asset not found');
  }
  return true;
}
