// Serves the E2E fixture page on localhost so you can click the extension's
// toolbar button against a page with awkward ESL comments. Usage: node e2e/serve.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, 'fixture.html'), 'utf8');
const PORT = 8234;

http
  .createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  })
  .listen(PORT, () => {
    console.log(`Fixture served at http://localhost:${PORT}/  (Ctrl+C to stop)`);
  });
