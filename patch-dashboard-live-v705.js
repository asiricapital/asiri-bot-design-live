import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.0.5 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');
index = index
  .replace(/\s*<link rel="stylesheet" href="\/dashboard-live-portfolio-v705\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/dashboard-live-portfolio-v705\.js\?v=\d+" defer><\/script>/g, '')
  .replace(/\/v700-realtime\.js\?v=\d+/g, '/v700-realtime.js?v=7050')
  .replace(/\/v700-realtime\.css\?v=\d+/g, '/v700-realtime.css?v=7050');
index = replaceRequired(
  index,
  '</head>',
  '<link rel="stylesheet" href="/dashboard-live-portfolio-v705.css?v=7050"></head>',
  'live portfolio stylesheet'
);
index = replaceRequired(
  index,
  '</body>',
  '<script src="/dashboard-live-portfolio-v705.js?v=7050" defer></script></body>',
  'live portfolio script'
);
await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.0.4';", "const VERSION = '7.0.5';", 'version');
bootstrap = bootstrap
  .replaceAll('/v700-realtime.js?v=7000', '/v700-realtime.js?v=7050')
  .replaceAll('/v700-realtime.css?v=7000', '/v700-realtime.css?v=7050');

if (!bootstrap.includes("app.get('/dashboard-live-portfolio-v705.js'")) {
  const staticAnchor = "app.get('/dashboard-layout-v702.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-layout-v702.css')); });";
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/dashboard-live-portfolio-v705.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-live-portfolio-v705.js')); });\napp.get('/dashboard-live-portfolio-v705.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-live-portfolio-v705.css')); });`,
    'live portfolio static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('dashboard-live-portfolio-v7.0.5', {
  dashboardSource: 'Asiri Market Engine',
  pollingMs: 10000,
  saxoDiagnosticsMoved: true,
  saxoAutoStart: false,
  saxoAssetCacheVersion: 7050,
  bootstrapCacheUpdated: true,
  readOnly: true,
  tradingEnabled: false
});
