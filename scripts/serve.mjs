import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { understand } from './assistant.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv.includes('--dist') ? resolve(root, 'dist') : root;
const rootAssets = new Set(['index.html', 'manifest.json', 'sw.js']);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const appExtensions = new Set(['.mjs', '.css', '.svg', '.png', '.webp']);

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'POST' && request.url === '/api/assistant') return assistant(request, response);
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    return response.end();
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const asset = pathname === '/' ? 'index.html' : pathname.slice(1);
    const segments = asset.split('/');
    const allowed = rootAssets.has(asset) || (asset.startsWith('src/studyflow/') && appExtensions.has(extname(asset)));
    if (!allowed || asset.includes('\\') || segments.some(part => !part || part.startsWith('.'))) {
      response.writeHead(404);
      return response.end('Not found');
    }
    const file = await realpath(resolve(base, asset));
    const canonicalBase = await realpath(base);
    if (!file.startsWith(`${canonicalBase}${sep}`)) throw new Error('Outside asset root');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(asset)] || 'application/octet-stream' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});
// The AI helper: accepts a short JSON request from the app page only, and answers with planner items.
async function assistant(request, response) {
  const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
  if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) return send(403, { error: 'forbidden' });
  let raw = '';
  for await (const chunk of request) { raw += chunk; if (raw.length > 8000) return send(413, { error: 'too-long' }); }
  let input;
  try { input = JSON.parse(raw); } catch { return send(400, { error: 'bad-request' }); }
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, 2000) : '';
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(input.today) || typeof input.weekday !== 'string') return send(400, { error: 'bad-request' });
  try {
    const { status, body } = await understand(root, { text, today: input.today, weekday: input.weekday.slice(0, 20) });
    send(status, body);
  } catch (error) {
    console.error('AI helper failed:', error);
    send(500, { error: 'failed' });
  }
}

server.listen(4174, '127.0.0.1', () => console.log('StudyFlow preview: http://127.0.0.1:4174'));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
