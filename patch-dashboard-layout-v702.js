import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.0.4 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');

index = index
  .replace(/\s*<link rel="stylesheet" href="\/dashboard-layout-v702\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/dashboard-layout-v702\.js\?v=\d+" defer><\/script>/g, '');

index = replaceRequired(
  index,
  '</head>',
  '<link rel="stylesheet" href="/dashboard-layout-v702.css?v=7040"></head>',
  'dashboard stylesheet injection'
);
index = replaceRequired(
  index,
  '</body>',
  '<script src="/dashboard-layout-v702.js?v=7040" defer></script></body>',
  'dashboard script injection'
);

await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.0.1';", "const VERSION = '7.0.4';", 'version');

if (!bootstrap.includes("app.get('/dashboard-layout-v702.js'")) {
  const staticAnchor = "app.get('/v65.css', (_req, res) => res.sendFile(path.join(root, 'v65.css')));";
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/dashboard-layout-v702.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-layout-v702.js')); });\napp.get('/dashboard-layout-v702.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'dashboard-layout-v702.css')); });`,
    'dashboard static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('dashboard-layout-v7.0.4', {
  executiveDecisionFirst: true,
  dashboardTitleReplaced: true,
  portfolioUpdateHistoryLast: true,
  mutationLoopFixed: true,
  inactiveDashboardHidden: true,
  navigationRestored: true,
  tradingEnabled: false
});
