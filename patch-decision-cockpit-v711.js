import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.1.1 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');
index = index
  .replace(/\s*<link rel="stylesheet" href="\/decision-cockpit-v710\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/decision-cockpit-v710\.js\?v=\d+" defer><\/script>/g, '')
  .replace(/\s*<link rel="stylesheet" href="\/decision-cockpit-v711\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/decision-cockpit-v711\.js\?v=\d+" defer><\/script>/g, '');
index = replaceRequired(index, '</head>', '<link rel="stylesheet" href="/decision-cockpit-v711.css?v=7110"></head>', 'Decision Cockpit v7.1.1 stylesheet');
index = replaceRequired(index, '</body>', '<script src="/decision-cockpit-v711.js?v=7110" defer></script></body>', 'Decision Cockpit v7.1.1 script');
await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.1.0';", "const VERSION = '7.1.1';", 'version');

if (!bootstrap.includes("app.get('/decision-cockpit-v711.js'")) {
  const anchor = "app.get('/decision-cockpit-v710.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v710.css')); });";
  bootstrap = replaceRequired(
    bootstrap,
    anchor,
    `${anchor}\napp.get('/decision-cockpit-v711.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v711.js')); });\napp.get('/decision-cockpit-v711.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v711.css')); });`,
    'Decision Cockpit v7.1.1 static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('asiri-decision-cockpit-v7.1.1', {
  executiveActionStrip: true,
  technicalScoreSeparated: true,
  executionReadiness: true,
  fomoGuard: true,
  mobileShariaCardFixed: true,
  rtlFormulaIsolation: true,
  localizedCommittee: true,
  chartMarginsImproved: true,
  assetCacheVersion: 7110,
  tradingEnabled: false
});
