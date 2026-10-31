import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../extension/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = resolve(root, `.${pathname === '/' ? '/try.html' : pathname}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !types[extname(file)]) { res.writeHead(404).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).end(body);
  } catch { res.writeHead(404).end(); }
});
server.listen(4173, '127.0.0.1', () => console.log('LexiLoom preview: http://127.0.0.1:4173'));
