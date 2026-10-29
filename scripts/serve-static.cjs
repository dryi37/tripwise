const http = require('http');
const fs = require('fs');
const path = require('path');

const rootArgument = process.argv[2];
const port = Number(process.argv[3]);
const host = process.argv[4];
if (!rootArgument || !Number.isInteger(port) || port < 1 || port > 65535 || !host) {
  throw new Error('Usage: node scripts/serve-static.cjs <root> <port> <host>');
}
const root = path.resolve(rootArgument);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(content);
  });
}).listen(port, host, () => console.log(`Static frontend listening on ${host}:${port}`));

