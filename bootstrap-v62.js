import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(root, 'server.js');
const indexPath = path.join(root, 'index.html');

let server = await fs.readFile(serverPath, 'utf8');
let index = await fs.readFile(indexPath, 'utf8');

if (!server.includes("from './broker-gateway.js'")) {
  const importNeedle = "import { analyzeCandidate } from './candidate.js';";
  if (!server.includes(importNeedle)) throw new Error('Broker bootstrap failed: server import anchor not found.');
  server = server.replace(importNeedle, `${importNeedle}\nimport { registerBrokerGateway } from './broker-gateway.js';`);
}

if (!server.includes('registerBrokerGateway(app);')) {
  const jsonNeedle = "app.use(express.json({ limit: '1mb' }));";
  if (!server.includes(jsonNeedle)) throw new Error('Broker bootstrap failed: Express JSON anchor not found.');
  server = server.replace(jsonNeedle, `${jsonNeedle}\nregisterBrokerGateway(app);\napp.get('/v62.js', (_req, res) => res.sendFile(path.join(root, 'v62.js')));\napp.get('/v62.css', (_req, res) => res.sendFile(path.join(root, 'v62.css')));`);
}

if (!index.includes('/v62.css')) {
  const styleNeedle = '<link rel="stylesheet" href="/style.css?v=5700">';
  if (!index.includes(styleNeedle)) throw new Error('Broker bootstrap failed: stylesheet anchor not found.');
  index = index.replace(styleNeedle, `${styleNeedle}<link rel="stylesheet" href="/v62.css?v=6300">`);
}

if (!index.includes('data-page="brokergateway"')) {
  const navNeedle = '<button data-page="watchlist"><span>◎</span> قائمة المراقبة</button>';
  if (!index.includes(navNeedle)) throw new Error('Broker bootstrap failed: navigation anchor not found.');
  index = index.replace(navNeedle, `${navNeedle}<button data-page="brokergateway"><span>🔗</span> ربط الوسطاء</button>`);
}

const brokerPage = `
<section id="brokergateway" class="page">
  <div class="page-title"><div><span class="eyebrow">ASIRI BROKER GATEWAY v6.3 · READ ONLY</span><h2>ربط الوسطاء وSaxo SIM</h2><p class="muted">OAuth + PKCE · تخزين مشفّر · Shadow Mode · واجهات المساعد</p></div><span class="broker62-readonly">🔒 التداول معطّل برمجيًا</span></div>
  <div class="broker62-shell">
    <div class="broker62-hero">
      <section class="panel"><span class="eyebrow">BROKER CONNECTION</span><h3>Saxo OpenAPI Gateway</h3><div class="broker62-summary broker62-summary-six"><div><span>الحالة</span><b id="broker62Connected">جارٍ الفحص…</b></div><div><span>البيئة</span><b id="broker62Env">SIM</b></div><div><span>الصلاحية</span><b id="broker62Mode">قراءة فقط</b></div><div><span>آخر لقطة</span><b id="broker62Last">—</b></div><div><span>التخزين</span><b id="broker62Storage">—</b></div><div><span>انتهاء الرمز</span><b id="broker62Token">—</b></div></div><p id="broker62ConfigState" class="status"></p><p id="broker62StorageWarning" class="status down broker62-hidden"></p><div class="broker62-actions"><button id="broker62Developer" class="secondary">إنشاء حساب Saxo Developer</button><button id="broker62Connect">ربط Saxo SIM</button><button id="broker62Snapshot" class="secondary">قراءة Saxo الفعلية</button><button id="broker62RefreshStatus" class="ghost">تحديث الحالة</button><button id="broker62Disconnect" class="ghost">قطع الاتصال</button></div><div id="broker62ActionStatus" class="status">يمكن بدء اختبار Shadow Mode الآن دون انتظار تفعيل حساب Saxo.</div></section>
      <aside class="broker62-status"><div class="broker62-lock">🛡️ <b>سياسة الأمان</b></div><strong>GET /port فقط</strong><p>كل طلب إلى Saxo يمر بقائمة سماح تقبل مسارات Portfolio فقط. لا توجد أي واجهة شراء أو بيع، ولا يكتب Shadow Mode في جدول المحفظة.</p><div class="broker62-notice">SAXO_ALLOW_TRADING يجب أن تبقى false، وإلا يرفض الخادم التشغيل.</div></aside>
    </div>

    <section class="panel broker62-mock-panel"><div class="section-head"><div><span class="eyebrow">PRE-ACTIVATION LAB</span><h3>اختبار Shadow Mode قبل تنشيط الحساب</h3></div><span class="pill">لا يحتاج App Key</span></div><p class="muted">اختر سيناريو ثم شغّل المطابقة على محفظتك الحالية. البيانات تجريبية ولا تغير AMPL أو CRDL.</p><div class="broker62-mock-controls"><select id="broker62MockScenario"><option value="matched">محفظة مطابقة: AMPL + CRDL</option><option value="variance">فروقات: كمية CRDL + سهم RKLB جديد</option><option value="empty">استجابة صفر مراكز لاختبار الحماية</option></select><button id="broker62RunMock">تشغيل الاختبار التجريبي</button></div></section>

    <section class="panel"><div class="section-head"><div><span class="eyebrow">IMPLEMENTATION ROADMAP</span><h3>حالة الخطوات من 2 إلى 9</h3></div></div><div id="broker62Steps" class="broker62-steps"></div></section>

    <div id="broker62SnapshotEmpty" class="panel"><h3>Shadow Mode جاهز للاختبار</h3><p class="muted">شغّل السيناريو التجريبي أعلاه الآن. وعند إنشاء تطبيق Saxo SIM استخدم Redirect URI التالي:</p><code>https://asiri-bot.onrender.com/api/broker/saxo/callback</code></div>

    <div id="broker62SnapshotContent" class="broker62-shell broker62-hidden">
      <section class="panel"><div class="section-head"><div><span class="eyebrow">BROKER SNAPSHOT</span><h3>الرصيد والمراكز المقروءة</h3></div><span class="pill">المصدر: <b id="broker62SnapshotSource">—</b></span></div><div class="broker62-summary"><div><span>الرصيد النقدي</span><b id="broker62Cash">—</b></div><div><span>المتاح للتداول</span><b id="broker62Available">—</b></div><div><span>إجمالي الحساب</span><b id="broker62Total">—</b></div><div><span>عدد المراكز</span><b id="broker62PositionCount">0</b></div></div><div id="broker62Warnings" class="broker62-warnings"></div></section>
      <div class="broker62-grid"><section class="panel"><h3>مراكز المصدر</h3><div id="broker62SaxoPositions" class="trade-list"></div></section><section class="panel"><h3>نتيجة المطابقة</h3><div class="broker62-summary"><div><span>متطابق</span><b id="broker62Match">0</b></div><div><span>جديد</span><b id="broker62New">0</b></div><div><span>مختلف</span><b id="broker62Change">0</b></div><div><span>غير موجود</span><b id="broker62Missing">0</b></div></div><p class="muted">المصدر الحالي: <b id="broker62Source">—</b></p></section></div>
      <section class="panel"><div class="section-head"><div><span class="eyebrow">SHADOW MODE DIFF</span><h3>مقارنة المصدر مع Asiri Capital</h3></div><span class="pill">معاينة فقط</span></div><div id="broker62DiffTable" class="table-wrap"></div></section>
    </div>
    <p class="dashboard-disclaimer">بيانات Mock وSaxo SIM للاختبار فقط. لا يتم إرسال أوامر تداول ولا تعديل المحفظة من هذه الصفحة.</p>
  </div>
</section>`;

if (!index.includes('id="brokergateway"')) {
  const pageNeedle = '<section id="settings" class="page">';
  if (!index.includes(pageNeedle)) throw new Error('Broker bootstrap failed: page anchor not found.');
  index = index.replace(pageNeedle, `${brokerPage}\n${pageNeedle}`);
}

if (!index.includes('/v62.js')) {
  const scriptNeedle = '<script src="/app.js?v=5800" type="module"></script>';
  if (!index.includes(scriptNeedle)) throw new Error('Broker bootstrap failed: script anchor not found.');
  index = index.replace(scriptNeedle, `${scriptNeedle}<script src="/v62.js?v=6300" type="module"></script>`);
}

index = index.replaceAll('Asiri Capital v5.8.0', 'Asiri Capital v6.3.0');

await fs.writeFile(serverPath, server, 'utf8');
await fs.writeFile(indexPath, index, 'utf8');
await import(pathToFileURL(path.join(root, 'start.js')).href + `?broker=${Date.now()}`);
