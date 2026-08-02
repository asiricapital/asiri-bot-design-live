import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.1.0 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const cockpitPath = new URL('./decision-cockpit-v710.js', import.meta.url);
let cockpit = await fs.readFile(cockpitPath, 'utf8');
const unsafeSymbolInitialization = "symbol: sanitize(localStorage.getItem(SYMBOL_KEY) || 'AMPL') || 'AMPL',";
const safeSymbolInitialization = "symbol: String(localStorage.getItem(SYMBOL_KEY) || 'AMPL').trim().toUpperCase().replace(/[^A-Z0-9.\\-]/g, '').slice(0, 12) || 'AMPL',";
if (cockpit.includes(unsafeSymbolInitialization)) {
  cockpit = replaceRequired(cockpit, unsafeSymbolInitialization, safeSymbolInitialization, 'safe symbol initialization');
} else if (!cockpit.includes(safeSymbolInitialization)) {
  throw new Error('v7.1.0 failed: Decision Cockpit symbol initialization marker not found');
}
await fs.writeFile(cockpitPath, cockpit, 'utf8');

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');
index = index
  .replace(/\s*<link rel="stylesheet" href="\/decision-cockpit-v710\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/decision-cockpit-v710\.js\?v=\d+" defer><\/script>/g, '');
index = replaceRequired(index, '</head>', '<link rel="stylesheet" href="/decision-cockpit-v710.css?v=7100"></head>', 'Decision Cockpit stylesheet');
index = replaceRequired(index, '</body>', '<script src="/decision-cockpit-v710.js?v=7100" defer></script></body>', 'Decision Cockpit script');
await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.0.6';", "const VERSION = '7.1.0';", 'version');

if (!bootstrap.includes("app.get('/decision-cockpit-v710.js'")) {
  const anchor = "app.get('/watch-return-v706.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'watch-return-v706.css')); });";
  bootstrap = replaceRequired(
    bootstrap,
    anchor,
    `${anchor}\napp.get('/decision-cockpit-v710.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v710.js')); });\napp.get('/decision-cockpit-v710.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v710.css')); });`,
    'Decision Cockpit static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('asiri-decision-cockpit-v7.1.0', {
  realMarketData: true,
  investmentCommittee: true,
  marketReplay: true,
  goldenGate: true,
  positionSizingSar: true,
  localDecisionJournal: true,
  initializationOrderFixed: true,
  tradingEnabled: false
});
