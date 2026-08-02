import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.8.6 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const appPath = new URL('./app.js', import.meta.url);
const centerPath = new URL('./decision-center-v683.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');
const centerSource = await fs.readFile(centerPath, 'utf8');

if (!app.includes('ASIRI_RUNTIME_V683')) {
  const anchor = "const fmt = (v, d = 2) =>";
  app = replaceRequired(
    app,
    anchor,
    "window.AsiriRuntimeV683 = { state, showPage, refreshAnalysis, loadPositionPlans, loadPortfolio }; // ASIRI_RUNTIME_V683\n\n" + anchor,
    'runtime bridge'
  );
}

if (!app.includes('ASIRI_DECISION_CENTER_EMBED_V686')) {
  app += `\n\n// ASIRI_DECISION_CENTER_EMBED_V686\n${centerSource}\n`;
}
await fs.writeFile(appPath, app, 'utf8');

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');

if (!index.includes('id="dcNavV683"')) {
  index = replaceRequired(
    index,
    '<button class="active" data-page="dashboard"><span>⌂</span> لوحة القيادة</button>',
    '<button class="active" data-page="dashboard"><span>⌂</span> لوحة القيادة</button><button id="dcNavV683" data-page="decisioncenter"><span>🎯</span> القرار التنفيذي</button>',
    'decision navigation'
  );
}

const decisionPage = `<section id="decisioncenter" class="page dc-page-v683">
  <div class="page-title dc-head-v683"><div><span class="eyebrow">EXECUTIVE DECISION CENTER · v6.8.6</span><h2>القرار التنفيذي لكل سهم</h2><p class="muted">قرار عملي مرتب حسب الأولوية مع تحقق جودة السعر.</p></div><button id="dcRefreshV683">تحديث القرارات</button></div>
  <section class="dc-summary-v683"><div><span>المراكز</span><strong id="dcCountV683">—</strong></div><div><span>إجراءات عاجلة</span><strong id="dcUrgentV683">—</strong></div><div><span>مراكز رابحة</span><strong id="dcProfitV683">—</strong></div><div><span>LIVE حديث</span><strong id="dcLiveV683">—</strong></div><div><span>آخر تحديث</span><strong id="dcUpdatedV683">—</strong></div></section>
  <section class="panel dc-toolbar-v683"><div><span class="eyebrow">ترتيب تنفيذي</span><h3>الأكثر أهمية يظهر أولًا</h3></div><div class="dc-filters-v683"><button class="ghost active" data-dc-filter="ALL">الكل</button><button class="ghost" data-dc-filter="URGENT">عاجل</button><button class="ghost" data-dc-filter="PROFIT">أرباح</button><button class="ghost" data-dc-filter="WATCH">احتفاظ/مراقبة</button><button class="ghost" data-dc-filter="LIVE">LIVE فقط</button></div></section>
  <p id="dcStatusV683" class="status">جارٍ تشغيل محرك القرارات…</p><div id="dcListV683" class="dc-list-v683"></div>
  <p class="dashboard-disclaimer">لا يرسل أوامر تداول. التنفيذ بعد التحقق من سعر LIVE والسيولة والتوافق الشرعي.</p>
</section>`;
if (!index.includes('id="decisioncenter"')) {
  index = replaceRequired(index, '<section id="dashboard" class="page active">', `${decisionPage}\n<section id="dashboard" class="page active">`, 'decision page');
}

const dashboardStrip = `<section id="dcTopV683" class="panel dc-top-v683">
  <div class="dc-top-head-v683"><div><span class="eyebrow">EXECUTIVE POSITIONS · v6.8.6</span><h3>القرار التنفيذي للمراكز</h3><p>ملخص سريع لأهم إجراء لكل سهم.</p></div><button id="dcOpenV683" class="secondary">فتح مركز القرار</button></div>
  <div id="dcTopRowsV683" class="dc-top-rows-v683"><p class="muted">جارٍ تحميل قرارات AMPL وCRDL…</p></div>
</section>`;
if (!index.includes('id="dcTopV683"')) {
  const dashboardTitle = '<div class="page-title"><div><span class="eyebrow">MARKET INTELLIGENCE & TRADING DECISION</span><h2>Asiri Capital Dashboard</h2><p class="muted">السوق · الفرص · المخاطر · القرار التنفيذي</p></div><button id="refreshAll">تحديث الآن</button></div>';
  index = replaceRequired(index, dashboardTitle, `${dashboardTitle}\n${dashboardStrip}`, 'dashboard decision strip');
}

// Do not rewrite app.js here. bootstrap-v65 owns the application script bundle.
// Rewriting it before bootstrap caused: "application script anchor not found".
index = index.replace(/<script src="\/decision-center-v683\.js[^\"]*"><\/script>/g, '');
if (!index.includes('/v683.css')) index = index.replace('</head>', '<link rel="stylesheet" href="/v683.css?v=6860"></head>');
else index = index.replace(/\/v683\.css\?v=\d+/, '/v683.css?v=6860');
await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
for (const version of ['6.8.2', '6.8.3', '6.8.4', '6.8.5']) {
  bootstrap = bootstrap.replace(`const VERSION = '${version}';`, "const VERSION = '6.8.6';");
}

const staticAnchor = "app.get('/v682.css', (_req, res) => res.sendFile(path.join(root, 'v682.css')));";
if (!bootstrap.includes("app.get('/v683.css'")) {
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/v683.css', (_req, res) => res.sendFile(path.join(root, 'v683.css')));`,
    'decision center stylesheet route'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('executive-decision-center-v6.8.6', { embeddedInMainApp: true, bootstrapAnchorConflictFixed: true, serverRendered: true, dashboardStrip: true, dedicatedPage: true, sourceTruth: true, tradingEnabled: false });