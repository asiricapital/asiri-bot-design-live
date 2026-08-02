import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.0.6 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

function injectAssets(html) {
  let output = html
    .replace(/\s*<link rel="stylesheet" href="\/watch-return-v706\.css\?v=\d+">/g, '')
    .replace(/\s*<script src="\/watch-return-v706\.js\?v=\d+" defer><\/script>/g, '');
  output = replaceRequired(output, '</head>', '<link rel="stylesheet" href="/watch-return-v706.css?v=7060"></head>', 'watch return stylesheet');
  output = replaceRequired(output, '</body>', '<script src="/watch-return-v706.js?v=7060" defer></script></body>', 'watch return script');
  return output;
}

const indexPath = new URL('./index.html', import.meta.url);
const watchPagePath = new URL('./binance-tradfi-lab.html', import.meta.url);
await fs.writeFile(indexPath, injectAssets(await fs.readFile(indexPath, 'utf8')), 'utf8');
await fs.writeFile(watchPagePath, injectAssets(await fs.readFile(watchPagePath, 'utf8')), 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.0.5';", "const VERSION = '7.0.6';", 'version');

if (!bootstrap.includes("app.get('/watch-return-v706.js'")) {
  const anchor = "app.get('/dashboard-live-portfolio-v705.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-live-portfolio-v705.css')); });";
  bootstrap = replaceRequired(
    bootstrap,
    anchor,
    `${anchor}\napp.get('/watch-return-v706.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'watch-return-v706.js')); });\napp.get('/watch-return-v706.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'watch-return-v706.css')); });`,
    'watch return static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('watch-return-v7.0.6', {
  dashboardButtonIntercepted: true,
  watchPageReturnBar: true,
  historyFallback: true,
  watchlistPreserved: true,
  tradingEnabled: false
});
