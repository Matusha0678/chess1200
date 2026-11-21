// Живой макет тренажёра дебютов по тем же адресам, что на сайте. Запуск: node docs/design/mockups/serve-openings.mjs → http://localhost:3562/openings/demo
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url)); const port = +(process.argv[2] || 3562);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '') || '/';
  if (p === '/openings') p = '/openings.html';
  else if (p === '/openings/demo' || p === '/openings/review') p = '/opening-trainer-live.html';
  else p = p.replace(/^\/openings\//, '/');
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log('serving', root, 'on', port));
