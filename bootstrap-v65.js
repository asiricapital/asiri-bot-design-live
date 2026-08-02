import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decisionToolsPage, portfolioSyncPage, brokerGatewayPage, investmentCommitteePage } from './ui-pages-v64.js';
import { intelligenceOsPage } from './ui-page-v65.js';

const VERSION = '6.5.1';
const root = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(root, 'server.js');
const runtimePath = path.join(root, '.runtime-server.mjs');
const indexPath = path.join(root, 'index.html');
const appPath = path.join(root, 'app.js');
const runtimeAppPath = path.join(root, 'runtime-app.js');

let source = await fs.readFile(sourcePath, 'utf8');
let index = await fs.readFile(indexPath, 'utf8');
let appSource = await fs.readFile(appPath, 'utf8');

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.5 bootstrap failed: ${label} anchor not found.`);
  return text.replace(before, after);
}

const envAliases = [
  ["const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\\/$/, '');", "const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\\/$/, '');"],
  ["const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');", "const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();"],
  ["const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');", "const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();"]
];
for (const [before, after] of envAliases) {
  if (source.includes(before)) source = source.replace(before, after);
  else if (!source.includes(after)) throw new Error(`v6.5 bootstrap failed: Supabase env anchor not found: ${before}`);
}

const invalidRoute = "'/api/market-intelligence+decision-journal+risk-control'";
const validRoute = "'/api/market-intelligence'";
if (source.includes(invalidRoute)) source = source.replace(invalidRoute, validRoute);
else if (!source.includes(validRoute)) throw new Error('v6.5 bootstrap failed: market intelligence route is missing.');

const importNeedle = "import { analyzeCandidate } from './candidate.js';";
if (!source.includes("from './broker-gateway.js'")) {
  source = replaceRequired(source, importNeedle, `${importNeedle}\nimport { registerBrokerGateway } from './broker-gateway.js';\nimport { runInvestmentCommittee } from './investment-committee.js';`, 'server import');
} else if (!source.includes("from './investment-committee.js'")) {
  source = source.replace("import { registerBrokerGateway } from './broker-gateway.js';", "import { registerBrokerGateway } from './broker-gateway.js';\nimport { runInvestmentCommittee } from './investment-committee.js';");
}

const jsonNeedle = "app.use(express.json({ limit: '1mb' }));";
if (!source.includes('registerBrokerGateway(app);')) source = replaceRequired(source, jsonNeedle, `${jsonNeedle}\nregisterBrokerGateway(app);`, 'Express JSON middleware');

const configNeedle = "app.get('/api/config', (_req, res) => res.json({";
if (!source.includes("app.get('/api/system/supabase-diagnostics'")) {
  const diagnosticsRoute = `app.get('/api/system/supabase-diagnostics', (_req, res) => {
  const presence = {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
    SUPABASE_PUBLISHABLE_KEY: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    BROKER_TOKEN_ENCRYPTION_KEY: Boolean(process.env.BROKER_TOKEN_ENCRYPTION_KEY)
  };
  const missing = Object.entries(presence).filter(([, ok]) => !ok).map(([name]) => name);
  res.json({
    ok: missing.length === 0,
    supabaseEnabled,
    backgroundAlertsEnabled,
    brokerPersistenceReady: presence.SUPABASE_SERVICE_ROLE_KEY && presence.BROKER_TOKEN_ENCRYPTION_KEY,
    presence,
    missing,
    note: 'Values are never returned by this endpoint.'
  });
});
console.log('supabase-config', {
  enabled: supabaseEnabled,
  backgroundAlertsEnabled,
  hasUrl: Boolean(supabaseUrl),
  hasPublishableKey: Boolean(supabasePublishableKey),
  hasServiceRoleKey: Boolean(supabaseServiceRoleKey),
  hasBrokerEncryptionKey: Boolean(process.env.BROKER_TOKEN_ENCRYPTION_KEY)
});

`;
  source = replaceRequired(source, configNeedle, `${diagnosticsRoute}${configNeedle}`, 'Supabase diagnostics route');
}

const historyNeedle = "app.get('/api/history/:symbol', async (req, res) => {";
if (!source.includes("app.get('/api/investment-committee/:symbol'")) {
  const committeeRoute = `app.get('/api/investment-committee/:symbol', async (req, res) => {
  const symbol = sanitizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  try {
    const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol, true)]);
    const candidate = analyzeCandidate(quote, technicals, marketPulse);
    res.json(runInvestmentCommittee({ symbol, quote, technicals, candidate, market: marketPulse }));
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

`;
  source = replaceRequired(source, historyNeedle, `${committeeRoute}${historyNeedle}`, 'history route');
}

source = source.replaceAll("version: '5.8.0'", `version: '${VERSION}'`);
source = source.replaceAll("version: '6.4.0'", `version: '${VERSION}'`);
source = source.replaceAll("version: '6.5.0'", `version: '${VERSION}'`);
source = source.replaceAll('Asiri Capital v5.7.0:', `Asiri Capital v${VERSION}:`);
source = source.replaceAll('Asiri Capital v6.4.0:', `Asiri Capital v${VERSION}:`);
source = source.replaceAll('Asiri Capital v6.5.0:', `Asiri Capital v${VERSION}:`);

const styleNeedle = '<link rel="stylesheet" href="/style.css?v=5700">';
const extraStyles = '<link rel="stylesheet" href="/v59.css?v=6501"><link rel="stylesheet" href="/v60.css?v=6501"><link rel="stylesheet" href="/v61.css?v=6501"><link rel="stylesheet" href="/v62.css?v=6501"><link rel="stylesheet" href="/v64.css?v=6501"><link rel="stylesheet" href="/v65.css?v=6501">';
if (!index.includes('/v65.css')) index = replaceRequired(index, styleNeedle, `${styleNeedle}${extraStyles}`, 'stylesheet');

if (!index.includes('data-page="intelligenceos"')) {
  const dashboardButton = '<button class="active" data-page="dashboard"><span>⌂</span> لوحة القيادة</button>';
  index = replaceRequired(index, dashboardButton, `${dashboardButton}<button data-page="intelligenceos"><span>✦</span> مركز القيادة</button>`, 'command center navigation');
}
if (!index.includes('data-page="portfoliosync"')) index = replaceRequired(index, '<button data-page="portfolio"><span>◫</span> المحفظة</button>', '<button data-page="portfolio"><span>◫</span> المحفظة</button><button data-page="portfoliosync"><span>⇄</span> مزامنة المحفظة</button>', 'portfolio navigation');
if (!index.includes('data-page="decisiontools"')) index = replaceRequired(index, '<button data-page="golden"><span>⚡</span> الفرص الذكية</button>', '<button data-page="golden"><span>⚡</span> الفرص الذكية</button><button data-page="decisiontools"><span>◉</span> أدوات القرار</button><button data-page="investmentcommittee"><span>⌁</span> لجنة الاستثمار</button>', 'decision navigation');
if (!index.includes('data-page="investmentcommittee"')) index = index.replace('<button data-page="decisiontools"><span>◉</span> أدوات القرار</button>', '<button data-page="decisiontools"><span>◉</span> أدوات القرار</button><button data-page="investmentcommittee"><span>⌁</span> لجنة الاستثمار</button>');
if (!index.includes('data-page="brokergateway"')) index = replaceRequired(index, '<button data-page="watchlist"><span>◎</span> قائمة المراقبة</button>', '<button data-page="watchlist"><span>◎</span> قائمة المراقبة</button><button data-page="brokergateway"><span>🔗</span> ربط الوسطاء</button>', 'broker navigation');

if (!index.includes('id="intelligenceos"')) index = replaceRequired(index, '<section id="dashboard" class="page active">', `${intelligenceOsPage}\n<section id="dashboard" class="page active">`, 'dashboard page');
if (!index.includes('id="portfoliosync"')) index = replaceRequired(index, '<section id="investment" class="page">', `${portfolioSyncPage}\n<section id="investment" class="page">`, 'investment page');
if (!index.includes('id="decisiontools"')) index = replaceRequired(index, '<section id="journal" class="page">', `${decisionToolsPage}\n<section id="journal" class="page">`, 'journal page');
if (!index.includes('id="brokergateway"')) index = replaceRequired(index, '<section id="settings" class="page">', `${brokerGatewayPage}\n<section id="settings" class="page">`, 'settings page');
if (!index.includes('id="investmentcommittee"')) index = replaceRequired(index, '<section id="settings" class="page">', `${investmentCommitteePage}\n<section id="settings" class="page">`, 'committee page');

const scriptNeedle = '<script src="/app.js?v=5800" type="module"></script>';
const scripts = '<script src="/app.js?v=6501" type="module"></script><script src="/v59.js?v=6501" type="module"></script><script src="/v60.js?v=6501" type="module"></script><script src="/v61.js?v=6501" type="module"></script><script src="/v62.js?v=6501" type="module"></script><script src="/v64.js?v=6501" type="module"></script><script src="/v65.js?v=6501" type="module"></script>';
if (!index.includes('/v65.js')) index = replaceRequired(index, scriptNeedle, scripts, 'application script');
index = index.replaceAll('Asiri Capital v5.8.0', `Asiri Capital v${VERSION}`);
index = index.replaceAll('Asiri Capital v5.9.0', `Asiri Capital v${VERSION}`);
index = index.replaceAll('Asiri Capital v6.3.0', `Asiri Capital v${VERSION}`);
index = index.replaceAll('Asiri Capital v6.4.0', `Asiri Capital v${VERSION}`);
index = index.replaceAll('Asiri Capital v6.5.0', `Asiri Capital v${VERSION}`);

const scopedQueries = [
  ["state.supabase.from('portfolio').select('*').order('created_at', { ascending: true })", "state.supabase.from('portfolio').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: true })"],
  ["state.supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(50)", "state.supabase.from('trades').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: false }).limit(50)"],
  ["state.supabase.from('closed_positions').select('*').order('closed_at', { ascending: false }).limit(30)", "state.supabase.from('closed_positions').select('*').eq('user_id', state.session.user.id).order('closed_at', { ascending: false }).limit(30)"],
  ["state.supabase.from('cash_ledger').select('*').order('occurred_at', { ascending: false }).limit(100)", "state.supabase.from('cash_ledger').select('*').eq('user_id', state.session.user.id).order('occurred_at', { ascending: false }).limit(100)"],
  ["state.supabase.from('portfolio_reconciliations').select('*').order('reconciled_at', { ascending: false }).limit(20)", "state.supabase.from('portfolio_reconciliations').select('*').eq('user_id', state.session.user.id).order('reconciled_at', { ascending: false }).limit(20)"],
  ["state.supabase.from('planned_orders').select('*').order('stage_order', { ascending:true })", "state.supabase.from('planned_orders').select('*').eq('user_id', state.session.user.id).order('stage_order', { ascending:true })"]
];
for (const [before, after] of scopedQueries) {
  if (appSource.includes(before)) appSource = appSource.replaceAll(before, after);
  else if (!appSource.includes(after)) throw new Error(`v6.5 bootstrap failed: missing user-scoped query anchor: ${before}`);
}
appSource = appSource
  .replaceAll(".from('portfolio').update(payload).eq('id', id)", ".from('portfolio').update(payload).eq('id', id).eq('user_id', state.session.user.id)")
  .replaceAll(".from('portfolio').delete().eq('id', id)", ".from('portfolio').delete().eq('id', id).eq('user_id', state.session.user.id)")
  .replaceAll(".from('portfolio').update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() }).eq('id', id)", ".from('portfolio').update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', state.session.user.id)")
  .replaceAll(".from('portfolio').update({ quantity: remaining, updated_at: new Date().toISOString() }).eq('id', id)", ".from('portfolio').update({ quantity: remaining, updated_at: new Date().toISOString() }).eq('id', id).eq('user_id', state.session.user.id)");

const reportBlock = `async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const positions = await adminFetch('portfolio', '?select=*');
  if (!positions.length) return [];
  const settled = await Promise.allSettled(positions.slice(0, 50).map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}`;
const hardenedReportBlock = `async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const positions = await adminFetch('portfolio', '?select=*');
  if (!positions.length) return [];
  const primaryUserId = String(process.env.ASIRI_PRIMARY_USER_ID || '').trim();
  const groups = new Map();
  for (const row of positions) {
    if (!groups.has(row.user_id)) groups.set(row.user_id, []);
    groups.get(row.user_id).push(row);
  }
  const selected = primaryUserId ? (groups.get(primaryUserId) || []) : (groups.size === 1 ? [...groups.values()][0] : []);
  if (!selected.length) {
    console.warn('report-portfolio: ASIRI_PRIMARY_USER_ID is required when multiple users exist.');
    return [];
  }
  const settled = await Promise.allSettled(selected.slice(0, 50).map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}`;
if (source.includes(reportBlock)) source = source.replace(reportBlock, hardenedReportBlock);
else if (!source.includes('ASIRI_PRIMARY_USER_ID')) throw new Error('v6.5 bootstrap failed: report portfolio block not found.');

const originalStatic = "for (const file of ['index.html', 'style.css', 'app.js']) {\n  app.get(file === 'index.html' ? '/' : `/${file}`, (_req, res) => res.sendFile(path.join(root, file)));\n}";
const htmlLiteral = JSON.stringify(index);
const staticRoutes = `app.get('/', (_req, res) => res.type('html').send(${htmlLiteral}));
app.get('/style.css', (_req, res) => res.sendFile(path.join(root, 'style.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(root, 'runtime-app.js')));
app.get('/v59.js', (_req, res) => res.sendFile(path.join(root, 'v59.js')));
app.get('/v59.css', (_req, res) => res.sendFile(path.join(root, 'v59.css')));
app.get('/v60.js', (_req, res) => res.sendFile(path.join(root, 'v60.js')));
app.get('/v60.css', (_req, res) => res.sendFile(path.join(root, 'v60.css')));
app.get('/v61.js', (_req, res) => res.sendFile(path.join(root, 'v61.js')));
app.get('/v61.css', (_req, res) => res.sendFile(path.join(root, 'v61.css')));
app.get('/v62.js', (_req, res) => res.sendFile(path.join(root, 'v62.js')));
app.get('/v62.css', (_req, res) => res.sendFile(path.join(root, 'v62.css')));
app.get('/v64.js', (_req, res) => res.sendFile(path.join(root, 'v64.js')));
app.get('/v64.css', (_req, res) => res.sendFile(path.join(root, 'v64.css')));
app.get('/v65.js', (_req, res) => res.sendFile(path.join(root, 'v65.js')));
app.get('/v65-data.js', (_req, res) => res.sendFile(path.join(root, 'v65-data.js')));
app.get('/v65.css', (_req, res) => res.sendFile(path.join(root, 'v65.css')));`;
source = replaceRequired(source, originalStatic, staticRoutes, 'static file block');

await fs.writeFile(runtimeAppPath, appSource, 'utf8');
await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href + `?v=${VERSION}-${Date.now()}`);
