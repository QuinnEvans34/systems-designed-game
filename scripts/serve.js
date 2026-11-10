const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { buildConfig, CONFIG_PATH } = require('./config.js');
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.yaml': 'text/yaml; charset=utf-8' };

// Turn game_config.yaml into game/config.js now, and again whenever the file is saved.
function rebuild(reason) {
  const result = buildConfig();
  if (result.ok) console.log(`✓ ${reason}: game_config.yaml loaded. Refresh the browser to play with it.`);
  else console.error(`✗ ${reason}: ${result.error}\n  The game keeps the last good settings until this is fixed.`);
}
rebuild('Start');
fs.watchFile(CONFIG_PATH, { interval: 400 }, (now, before) => { if (now.mtimeMs !== before.mtimeMs) rebuild('Saved'); });

http.createServer((req, res) => {
  let file;
  try { file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (file === root) file = path.join(root, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Moo-ving Violations: http://localhost:${PORT}  (edit game_config.yaml any time)`));
