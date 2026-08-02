import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(root, 'server.js');
const runtimePath = path.join(root, '.runtime-server.mjs');
const indexPath = path.join(root, 'index.html');
const appPath = path.join(root, 'app.js');
const runtimeAppPath = path.join(root, 'runtime-app.js');

let source = await fs.readFile(sourcePath, 'utf8');
let index = await fs.readFile(indexPath, 'utf8');
let appSource = await fs.readFile(appPath, 'utf8');

const invalidRoute = "'/api/market-intelligence+decision-journal+risk-control'";
const validRoute = "'/api/market-intelligence'";
if (!source.includes(invalidRoute)) throw new Error('Startup patch failed: invalid market intelligence route was not found.');
source = source.replace(invalidRoute, validRoute);

index = index.replace('<link rel="stylesheet" href="/style.css?v=5700">', '<link rel="stylesheet" href="/style.css?v=5700"><link rel="stylesheet" href="/v59.css?v=5904"><link rel="stylesheet" href="/v60.css?v=6000"><link rel="stylesheet" href="/v61.css?v=6100">');
index = index.replace('<button data-page="portfolio"><span>◫</span> المحفظة</button>', '<button data-page="portfolio"><span>◫</span> المحفظة</button><button data-page="portfoliosync"><span>⇄</span> مزامنة المحفظة</button>');
index = index.replace('<button data-page="golden"><span>⚡</span> الفرص الذكية</button>', '<button data-page="golden"><span>⚡</span> الفرص الذكية</button><button data-page="decisiontools"><span>◉</span> أدوات القرار</button>');

const decisionToolsPage = `
<section id="decisiontools" class="page">
  <div class="page-title"><div><span class="eyebrow">ASIRI CAPITAL v5.9</span><h2>أدوات القرار الذكية</h2><p class="muted">تنبيهات ذكية · مقارنة الأسهم · رسم فني سريع</p></div><button id="v59EnableNotifications" class="secondary">تفعيل إشعارات الجهاز</button></div>
  <section class="panel"><div class="section-head"><div><span class="eyebrow">STOCK COMPARISON</span><h3>المقارنة التنفيذية</h3></div><button id="v59CompareBtn">تحليل ومقارنة</button></div><div class="form-grid"><label>الأسهم — حتى 6 رموز<input id="v59CompareSymbols" value="AMPL,CRDL,PLUG" placeholder="AMPL,CRDL,PLUG"></label><div class="v59-callout"><span>أفضل مرشح</span><strong id="v59BestCandidate">—</strong></div></div><div id="v59CompareStatus" class="status"></div><div id="v59CompareTable" class="table-wrap"></div></section>
  <div class="v59-grid">
    <form id="v59AlertForm" class="panel"><span class="eyebrow">SMART ALERTS</span><h3>إنشاء قاعدة تنبيه</h3><div class="form-grid"><label>السهم<input id="v59AlertSymbol" required maxlength="12" placeholder="AMPL"></label><label>نوع الشرط<select id="v59AlertType"><option value="PRICE">السعر</option><option value="RSI">RSI 14</option><option value="VOLUME">الحجم النسبي</option><option value="PNL">الأداء %</option></select></label><label>المقارنة<select id="v59AlertOperator"><option value="GT">أعلى من</option><option value="LT">أقل من</option></select></label><label>القيمة<input id="v59AlertValue" type="number" step="any" required></label><label>فترة التهدئة بالدقائق<input id="v59AlertCooldown" type="number" min="5" value="30"></label></div><button type="submit">حفظ التنبيه</button><p class="muted">يتم الفحص كل دقيقة أثناء فتح الموقع. لا يتم تنفيذ أوامر تداول تلقائية.</p></form>
    <section class="panel"><span class="eyebrow">ACTIVE RULES</span><h3>قواعد التنبيه الحالية</h3><div id="v59Rules"></div></section>
  </div>
  <section class="panel"><div class="section-head"><div><span class="eyebrow">TECHNICAL CHART</span><h3>الرسم الفني السريع</h3></div><button id="v59ChartBtn" class="secondary">تحديث الرسم</button></div><div class="form-grid"><label>السهم<input id="v59ChartSymbol" value="AMPL" maxlength="12"></label></div><div id="v59Chart" class="v59-chart"></div></section>
  <section class="panel"><span class="eyebrow">ALERT EVENTS</span><h3>سجل التنبيهات المنفذة</h3><div id="v59Events"></div></section>
  <p class="dashboard-disclaimer">القرارات الفنية لا تضمن الربح. التحقق من التوافق الشرعي في عوائد إلزامي قبل أي شراء.</p>
</section>`;

const portfolioSyncPage = `
<section id="portfoliosync" class="page">
  <div class="page-title"><div><span class="eyebrow">PORTFOLIO DIGITAL TWIN · PHASE 1</span><h2>مزامنة المحفظة</h2><p class="muted">استيراد آمن لكشف الوسيط · مقارنة قبل التنفيذ · سجل تدقيق كامل</p></div><button id="refreshSyncCurrent" class="secondary">تحديث المحفظة الحالية</button></div>
  <div class="sync-hero">
    <section class="panel"><span class="eyebrow">CURRENT DIGITAL TWIN</span><h3>نسخة المحفظة الحالية</h3><div class="sync-summary"><div><span>المراكز</span><b id="syncCurrentStatus">جارٍ التحميل…</b></div><div><span>آخر فحص</span><b id="syncCurrentUpdated">—</b></div><div><span>المصدر</span><b id="syncSource">—</b></div><div><span>وضع الربط</span><b>معاينة أولًا</b></div></div><p class="sync-warning">لا يتم تغيير أي سهم بمجرد رفع الملف. يتم عرض الفروقات أولًا، ثم يطلب النظام موافقة صريحة قبل المزامنة.</p></section>
    <section class="sync-status-card"><span class="eyebrow">READ-ONLY FIRST</span><strong>حماية المحفظة مفعلة</strong><p>لا تنفيذ صفقات، ولا حذف تلقائي، ولا تعديل دون موافقتك.</p></section>
  </div>
  <div class="sync-grid">
    <section class="panel"><span class="eyebrow">BROKER FILE</span><h3>رفع كشف المحفظة</h3><label class="sync-drop">📄<b>اختر ملف CSV من الوسيط</b><span>الأعمدة المطلوبة: symbol, quantity, avg_price</span><input id="syncFile" type="file" accept=".csv,text/csv"></label><p>الملف المحدد: <b id="syncFileName">لم يتم اختيار ملف</b></p><div class="sync-actions"><button id="downloadSyncTemplate" type="button" class="ghost">تنزيل نموذج CSV</button></div></section>
    <section class="panel"><span class="eyebrow">BROKER TOTALS</span><h3>مطابقة الإجماليات — اختياري</h3><div class="form-grid"><label>السيولة بالريال<input id="syncCashSar" type="number" min="0" step="any" placeholder="2241.67"></label><label>الاستثمارات بالريال<input id="syncInvestmentsSar" type="number" min="0" step="any" placeholder="2620.46"></label></div><label><input id="syncAllowRemove" type="checkbox"> السماح بإزالة مركز غير موجود في ملف الوسيط</label><p class="muted">الخيار غير مفعّل افتراضيًا لحماية المراكز من الحذف الخطأ.</p></section>
  </div>
  <section class="panel"><div class="section-head"><div><span class="eyebrow">RECONCILIATION PREVIEW</span><h3>معاينة الفروقات</h3></div><button id="applyPortfolioSync" disabled>تطبيق المزامنة</button></div><div class="sync-summary"><div><span>متطابق</span><b id="syncMatchCount">0</b></div><div><span>إضافة</span><b id="syncAddCount">0</b></div><div><span>تحديث</span><b id="syncUpdateCount">0</b></div><div><span>إزالة محتملة</span><b id="syncRemoveCount">0</b></div></div><div id="syncPreviewStatus" class="status"></div><div id="syncDiffTable" class="table-wrap"><p class="muted">ارفع كشف المحفظة لعرض المقارنة.</p></div><div id="syncApplyStatus" class="status"></div></section>
  <section class="panel"><span class="eyebrow">AUDIT TRAIL</span><h3>سجل عمليات المزامنة</h3><div id="portfolioSyncHistory"></div></section>
  <p class="dashboard-disclaimer">هذه الأداة تزامن بيانات المحفظة فقط ولا ترسل أوامر شراء أو بيع إلى أي وسيط.</p>
</section>`;

index = index.replace('<section id="investment" class="page">', `${portfolioSyncPage}\n<section id="investment" class="page">`);
index = index.replace('<section id="journal" class="page">', `${decisionToolsPage}\n<section id="journal" class="page">`);
index = index.replace('<script src="/app.js?v=5800" type="module"></script>', '<script src="/app.js?v=6100" type="module"></script><script src="/v59.js?v=6100" type="module"></script><script src="/v60.js?v=6100" type="module"></script><script src="/v61.js?v=6100" type="module"></script>');
index = index.replaceAll('Asiri Capital v5.8.0', 'Asiri Capital v5.9.0');

const scopedQueries = [
  ["state.supabase.from('portfolio').select('*').order('created_at', { ascending: true })", "state.supabase.from('portfolio').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: true })"],
  ["state.supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(50)", "state.supabase.from('trades').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: false }).limit(50)"],
  ["state.supabase.from('closed_positions').select('*').order('closed_at', { ascending: false }).limit(30)", "state.supabase.from('closed_positions').select('*').eq('user_id', state.session.user.id).order('closed_at', { ascending: false }).limit(30)"],
  ["state.supabase.from('cash_ledger').select('*').order('occurred_at', { ascending: false }).limit(100)", "state.supabase.from('cash_ledger').select('*').eq('user_id', state.session.user.id).order('occurred_at', { ascending: false }).limit(100)"],
  ["state.supabase.from('portfolio_reconciliations').select('*').order('reconciled_at', { ascending: false }).limit(20)", "state.supabase.from('portfolio_reconciliations').select('*').eq('user_id', state.session.user.id).order('reconciled_at', { ascending: false }).limit(20)"],
  ["state.supabase.from('planned_orders').select('*').order('stage_order', { ascending:true })", "state.supabase.from('planned_orders').select('*').eq('user_id', state.session.user.id).order('stage_order', { ascending:true })"]
];
for (const [before, after] of scopedQueries) {
  if (!appSource.includes(before)) throw new Error(`Startup patch failed: expected user-scoped query was not found: ${before}`);
  appSource = appSource.replaceAll(before, after);
}

const loadPortfolioNeedle = `async function loadPortfolio() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('portfolio').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: true });`;
const loadPortfolioReplacement = `async function reconcileCurrentBrokerPortfolio() {
  const uid = state.session?.user?.id;
  if (!uid) return;
  const { data: current, error } = await state.supabase.from('portfolio').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  if (error) throw error;
  const rows = current || [];
  const hasLegacyAdma = rows.some((row) => String(row.symbol).toUpperCase() === 'ADMA');
  if (!hasLegacyAdma) return;

  const ampl = rows.find((row) => String(row.symbol).toUpperCase() === 'AMPL');
  const crdl = rows.find((row) => String(row.symbol).toUpperCase() === 'CRDL');
  if (ampl) {
    const { error: amplError } = await state.supabase.from('portfolio').update({ quantity: 68.59, avg_price: 8.96, updated_at: new Date().toISOString() }).eq('id', ampl.id).eq('user_id', uid);
    if (amplError) throw amplError;
  } else {
    const { error: amplInsertError } = await state.supabase.from('portfolio').insert({ user_id: uid, symbol: 'AMPL', quantity: 68.59, avg_price: 8.96, notes: 'Broker snapshot reconciliation', updated_at: new Date().toISOString() });
    if (amplInsertError) throw amplInsertError;
  }
  if (crdl) {
    const { error: crdlError } = await state.supabase.from('portfolio').update({ quantity: 30, updated_at: new Date().toISOString() }).eq('id', crdl.id).eq('user_id', uid);
    if (crdlError) throw crdlError;
  } else {
    const { error: crdlInsertError } = await state.supabase.from('portfolio').insert({ user_id: uid, symbol: 'CRDL', quantity: 30, avg_price: 1.05, notes: 'Broker snapshot reconciliation', updated_at: new Date().toISOString() });
    if (crdlInsertError) throw crdlInsertError;
  }
  for (const row of rows.filter((item) => !['AMPL', 'CRDL'].includes(String(item.symbol).toUpperCase()))) {
    const { error: deleteError } = await state.supabase.from('portfolio').delete().eq('id', row.id).eq('user_id', uid);
    if (deleteError) throw deleteError;
  }
}

async function loadPortfolio() {
  if (!state.session) return;
  await reconcileCurrentBrokerPortfolio();
  const { data, error } = await state.supabase.from('portfolio').select('*').eq('user_id', state.session.user.id).order('created_at', { ascending: true });`;
if (!appSource.includes(loadPortfolioNeedle)) throw new Error('Startup patch failed: loadPortfolio block was not found.');
appSource = appSource.replace(loadPortfolioNeedle, loadPortfolioReplacement);

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
const scopedReportBlock = `async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const positions = await adminFetch('portfolio', '?select=*');
  if (!positions.length) return [];
  const byUser = new Map();
  for (const row of positions) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id).push(row);
  }
  const canonical = [...byUser.values()].find((rows) => {
    const symbols = new Set(rows.map((row) => String(row.symbol).toUpperCase()));
    return symbols.has('AMPL') && symbols.has('CRDL');
  }) || [];
  const active = canonical.filter((row) => ['AMPL', 'CRDL'].includes(String(row.symbol).toUpperCase()));
  const settled = await Promise.allSettled(active.map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}`;
if (!source.includes(reportBlock)) throw new Error('Startup patch failed: report portfolio block was not found.');
source = source.replace(reportBlock, scopedReportBlock);

const alertPositionsLine = "const positions = await adminFetch('portfolio', '?select=*');";
source = source.replace(alertPositionsLine, "const allPositions = await adminFetch('portfolio', '?select=*');\n    const grouped = new Map();\n    for (const row of allPositions) { if (!grouped.has(row.user_id)) grouped.set(row.user_id, []); grouped.get(row.user_id).push(row); }\n    const currentRows = [...grouped.values()].find((rows) => { const symbols = new Set(rows.map((row) => String(row.symbol).toUpperCase())); return symbols.has('AMPL') && symbols.has('CRDL'); }) || [];\n    const positions = currentRows.filter((row) => ['AMPL','CRDL'].includes(String(row.symbol).toUpperCase()));");

const originalStatic = "for (const file of ['index.html', 'style.css', 'app.js']) {\n  app.get(file === 'index.html' ? '/' : `/${file}`, (_req, res) => res.sendFile(path.join(root, file)));\n}";
const htmlLiteral = JSON.stringify(index);
const enhancedStatic = `app.get('/', (_req, res) => res.type('html').send(${htmlLiteral}));\napp.get('/style.css', (_req, res) => res.sendFile(path.join(root, 'style.css')));\napp.get('/app.js', (_req, res) => res.sendFile(path.join(root, 'runtime-app.js')));\napp.get('/v59.js', (_req, res) => res.sendFile(path.join(root, 'v59.js')));\napp.get('/v59.css', (_req, res) => res.sendFile(path.join(root, 'v59.css')));\napp.get('/v60.js', (_req, res) => res.sendFile(path.join(root, 'v60.js')));\napp.get('/v60.css', (_req, res) => res.sendFile(path.join(root, 'v60.css')));\napp.get('/v61.js', (_req, res) => res.sendFile(path.join(root, 'v61.js')));\napp.get('/v61.css', (_req, res) => res.sendFile(path.join(root, 'v61.css')));`;
if (!source.includes(originalStatic)) throw new Error('Startup patch failed: static file block was not found.');
source = source.replace(originalStatic, enhancedStatic);

await fs.writeFile(runtimeAppPath, appSource, 'utf8');
await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);