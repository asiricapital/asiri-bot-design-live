import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.8.9 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const appPath = new URL('./app.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');

const configLine = "state.config = await fetch('/api/config', { cache: 'no-store' }).then((r) => r.json());";
const timedConfig = `state.config = await Promise.race([
    fetch('/api/config?runtime=6890', { cache: 'no-store' }).then(async (r) => {
      const payload = await r.json();
      if (!r.ok) throw new Error(payload.error || \`تعذر تحميل إعدادات الاتصال (\${r.status})\`);
      return payload;
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة تحميل إعدادات Supabase')), 10000))
  ]);`;
if (!app.includes('runtime=6890')) app = replaceRequired(app, configLine, timedConfig, 'timed Supabase config');

const loadAllLine = "await Promise.all([loadPortfolio(), loadWatchlist(), loadTrades(), loadClosedPositions(), loadAlerts(), loadNotificationStatus(), loadPositionPlans(), loadDecisionJournal(), loadReconciliations(), loadPlannedOrders()]);";
const settledLoad = `const startupResults = await Promise.allSettled([loadPortfolio(), loadWatchlist(), loadTrades(), loadClosedPositions(), loadAlerts(), loadNotificationStatus(), loadPositionPlans(), loadDecisionJournal(), loadReconciliations(), loadPlannedOrders()]);
  const startupFailures = startupResults.filter((item) => item.status === 'rejected');
  if (startupFailures.length) {
    console.warn('asiri-partial-startup-v689', startupFailures.map((item) => item.reason?.message || String(item.reason)));
    $('#connection').title = \`تم الاتصال مع \${startupFailures.length} تحذير تحميل جزئي\`;
  }`;
if (!app.includes('asiri-partial-startup-v689')) app = replaceRequired(app, loadAllLine, settledLoad, 'fault-tolerant startup loading');

const oldStartup = `applySettings();
try {
  await refreshMarket();
  const es = new EventSource('/api/events'); es.addEventListener('market', (e) => { state.market = JSON.parse(e.data); renderMarket(); renderPortfolio(); });
  await setupAuth();
} catch (e) {
  $('#connection').textContent = e.message; $('#connection').className = 'pill down'; console.error(e);
}`;
const newStartup = `applySettings();
const connectionNodeV689 = $('#connection');
if (connectionNodeV689) {
  connectionNodeV689.textContent = 'جارٍ توثيق الحساب…';
  connectionNodeV689.className = 'pill';
}

try {
  await setupAuth();
} catch (error) {
  if (connectionNodeV689) {
    connectionNodeV689.textContent = \`تعذر Supabase: \${error.message}\`;
    connectionNodeV689.className = 'pill down';
  }
  console.error('asiri-auth-startup-v689', error);
}

try {
  await Promise.race([
    refreshMarket(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة تحديث السوق')), 12000))
  ]);
  const es = new EventSource('/api/events');
  es.addEventListener('market', (event) => {
    try {
      state.market = JSON.parse(event.data);
      renderMarket();
      renderPortfolio();
    } catch (error) {
      console.warn('asiri-market-event-v689', error);
    }
  });
  es.onerror = () => console.warn('asiri-market-stream-v689', 'SSE disconnected; polling remains available');
} catch (marketError) {
  console.warn('asiri-market-startup-v689', marketError.message);
  if (connectionNodeV689?.classList.contains('up')) connectionNodeV689.title = \`الحساب متصل، لكن السوق متأخر: \${marketError.message}\`;
}`;
if (!app.includes('asiri-auth-startup-v689')) app = replaceRequired(app, oldStartup, newStartup, 'auth-first startup');

const reportTail = `$('#testCloseReport').onclick = () => sendReportTest('close');
$('#testPreMarketReport').onclick = () => sendReportTest('premarket');
$('#refreshReportStatus').onclick = loadReportStatus;
loadReportStatus();`;
const safeReportTail = `$('#testCloseReport')?.addEventListener('click', () => sendReportTest('close'));
$('#testPreMarketReport')?.addEventListener('click', () => sendReportTest('premarket'));
$('#refreshReportStatus')?.addEventListener('click', loadReportStatus);
loadReportStatus().catch?.((error) => console.warn('report-status-v689', error));`;
if (!app.includes('report-status-v689')) app = replaceRequired(app, reportTail, safeReportTail, 'safe report listeners');

await fs.writeFile(appPath, app, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.8.8';", "const VERSION = '6.8.9';");

const navAssetAnchor = `if (!index.includes('/navigation-v688.js')) index = index.replace('</body>', '<script src="/navigation-v688.js?v=6880" defer></script></body>'); // ASIRI_STANDALONE_NAV_V688`;
if (!bootstrap.includes('ASIRI_RUNTIME_GUARD_V689')) {
  bootstrap = replaceRequired(
    bootstrap,
    navAssetAnchor,
    `${navAssetAnchor}\nif (!index.includes('/runtime-guard-v689.js')) index = index.replace('</head>', '<script src="/runtime-guard-v689.js?v=6890" defer></script></head>'); // ASIRI_RUNTIME_GUARD_V689`,
    'runtime guard asset'
  );
}

const routeAnchor = "app.get('/v683.css', (_req, res) => res.sendFile(path.join(root, 'v683.css')));";
if (!bootstrap.includes("app.get('/runtime-guard-v689.js'")) {
  bootstrap = replaceRequired(
    bootstrap,
    routeAnchor,
    `${routeAnchor}\napp.get('/runtime-guard-v689.js', (_req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  res.sendFile(path.join(root, 'runtime-guard-v689.js'));\n});`,
    'runtime guard route'
  );
}

const cacheAnchor = "index = index.replace('/app.js?v=6820', '/app.js?v=6870');";
if (!bootstrap.includes('ASIRI_APP_CACHE_V689')) {
  bootstrap = replaceRequired(
    bootstrap,
    cacheAnchor,
    `${cacheAnchor}\nindex = index.replace('/app.js?v=6870', '/app.js?v=6890'); // ASIRI_APP_CACHE_V689`,
    'application cache version'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('runtime-startup-v6.8.9', { authFirst: true, marketNonBlocking: true, partialFailuresAllowed: true, visibleRuntimeErrors: true, appCache: 6890 });
