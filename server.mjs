import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT || 3000);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/simulation.js', ['simulation.js', 'text/javascript; charset=utf-8']],
  ['/simulation.mjs', ['simulation.mjs', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const entry = files.get(pathname);
  if (!entry) { response.writeHead(404); response.end('Not found'); return; }
  try {
    const contents = await readFile(fileURLToPath(new URL(entry[0], import.meta.url)));
    response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache' });
    response.end(request.method === 'HEAD' ? undefined : contents);
  } catch {
    response.writeHead(500); response.end('Could not load the game file.');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Set PORT to another port and run npm start again.` : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Blobby Life is ready at http://localhost:${port}`));
