import fs from 'node:fs/promises';

const marker = 'ASIRI_BROKER_EXPERIENCE_V2_721';
const uiPath = new URL('./ui-pages-v64.js', import.meta.url);
const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);

const brokerGatewayPageV721 = String.raw`
<section id="brokergateway" class="page broker-v2-page" data-broker-ui="v721">
  <!-- ASIRI_BROKER_EXPERIENCE_V2_721 -->
  <header class="broker-v2-header">
    <div class="broker-v2-header-copy">
      <span class="broker-v2-kicker">BROKER CONNECTION CENTER</span>
      <h2>ربط الوسطاء</h2>
      <p>إدارة اتصال Saxo بصورة آمنة وواضحة، مع قراءة الحساب والمراكز فقط دون تنفيذ أي أمر تداول.</p>
    </div>
    <div class="broker-v2-header-badges" aria-label="ضوابط الاتصال">
      <span class="broker-v2-badge broker-v2-badge-safe"><i></i> قراءة فقط</span>
      <span class="broker-v2-badge">SIM</span>
    </div>
  </header>

  <div class="broker62-shell broker-v2-shell">
    <div class="broker62-hero broker-v2-hero">
      <section class="panel broker-v2-connection-card" aria-labelledby="brokerV2ProviderTitle">
        <div class="broker-v2-provider-head">
          <div class="broker-v2-provider-brand">
            <div class="broker-v2-provider-mark" aria-hidden="true">S</div>
            <div>
              <span class="broker-v2-overline">SAXO OPENAPI</span>
              <h3 id="brokerV2ProviderTitle">Saxo Gateway</h3>
              <p>اتصال مشفّر ومخصص لقراءة بيانات حسابك الفعلي.</p>
            </div>
          </div>
          <span class="broker-v2-live-chip"><i></i><b id="broker62Connected">جارٍ الفحص…</b></span>
        </div>

        <div class="broker62-summary broker62-summary-six broker-v2-summary" aria-label="تفاصيل اتصال الوسيط">
          <div><span>البيئة</span><b id="broker62Env">SIM</b></div>
          <div><span>نوع الوصول</span><b id="broker62Mode">قراءة فقط</b></div>
          <div><span>التخزين</span><b id="broker62Storage">—</b></div>
          <div><span>آخر مزامنة</span><b id="broker62Last">—</b></div>
          <div><span>انتهاء الرمز</span><b id="broker62Token">—</b></div>
          <div><span>مصدر البيانات</span><b id="broker62Source">—</b></div>
        </div>

        <div class="broker-v2-system-note">
          <span class="broker-v2-system-icon" aria-hidden="true">✓</span>
          <p id="broker62ConfigState" class="status">جارٍ التحقق من OAuth والتخزين المشفّر…</p>
        </div>
        <p id="broker62StorageWarning" class="status down broker62-hidden broker-v2-warning"></p>

        <div class="broker62-actions broker-v2-actions" aria-label="إجراءات ربط الوسيط">
          <button id="broker62Connect" class="broker-v2-primary" type="button">ربط Saxo SIM</button>
          <button id="broker62Snapshot" class="broker-v2-secondary" type="button">قراءة حساب Saxo</button>
          <button id="broker62RefreshStatus" class="broker-v2-tertiary" type="button">تحديث الحالة</button>
          <button id="broker62Developer" class="broker-v2-tertiary" type="button">حساب Developer</button>
          <button id="broker62Disconnect" class="broker-v2-danger" type="button">قطع الاتصال</button>
        </div>

        <div id="broker62ActionStatus" class="status broker-v2-action-status" role="status" aria-live="polite">
          الاتصال في وضع القراءة فقط، ولا يستطيع إرسال أوامر شراء أو بيع.
        </div>
      </section>

      <aside class="broker62-status broker-v2-security-card" aria-label="حماية الاتصال">
        <div class="broker-v2-security-icon" aria-hidden="true">⌾</div>
        <span class="broker-v2-overline">SECURITY & GOVERNANCE</span>
        <h3>اتصال محكوم وآمن</h3>
        <p>تم تصميم بوابة الوسيط لتفصل قراءة الحساب عن محرك القرار والتنفيذ.</p>
        <div class="broker-v2-security-list">
          <div><i>✓</i><span><b>OAuth + PKCE</b><small>تفويض آمن دون حفظ كلمة مرور Saxo.</small></span></div>
          <div><i>✓</i><span><b>Supabase مشفّر</b><small>الرموز الحساسة مخزنة بصورة مشفّرة.</small></span></div>
          <div><i>✓</i><span><b>قائمة سماح</b><small>الوصول محصور في بيانات Portfolio المسموحة.</small></span></div>
          <div><i>✓</i><span><b>التداول مغلق</b><small>SAXO_ALLOW_TRADING = false</small></span></div>
        </div>
        <div class="broker62-notice broker-v2-security-notice">أي محاولة لتفعيل التداول المباشر يجب أن تُرفض من الخادم.</div>
      </aside>
    </div>

    <section class="panel broker62-mock-panel broker-v2-lab">
      <div class="section-head broker-v2-section-head">
        <div><span class="broker-v2-overline">SHADOW LAB</span><h3>اختبار آمن قبل البيانات الفعلية</h3><p>شغّل سيناريو تجريبيًا لمراجعة المطابقة دون التأثير على المحفظة.</p></div>
        <span class="broker-v2-badge">لا يحتاج App Key</span>
      </div>
      <div class="broker62-mock-controls broker-v2-lab-controls">
        <label><span>سيناريو الاختبار</span><select id="broker62MockScenario"><option value="matched">محفظة مطابقة: AMPL + CRDL</option><option value="variance">فروقات: كمية CRDL + سهم RKLB جديد</option><option value="empty">استجابة صفر مراكز لاختبار الحماية</option></select></label>
        <button id="broker62RunMock" type="button">تشغيل Shadow Test</button>
      </div>
    </section>

    <details class="panel broker-v2-roadmap">
      <summary><span><b>التشخيص وخطة التفعيل</b><small>اعرض التفاصيل الفنية والخطوات من 2 إلى 9</small></span><i aria-hidden="true">⌄</i></summary>
      <div id="broker62Steps" class="broker62-steps"></div>
    </details>

    <div id="broker62SnapshotEmpty" class="panel broker-v2-empty-state">
      <div class="broker-v2-empty-icon" aria-hidden="true">↻</div>
      <div><h3>جاهز لأول قراءة</h3><p>اضغط «قراءة حساب Saxo» عند اكتمال التفويض، أو استخدم Shadow Test الآن لمراجعة تجربة المطابقة.</p></div>
      <code>https://asiri-bot.onrender.com/api/broker/saxo/callback</code>
    </div>

    <div id="broker62SnapshotContent" class="broker-v2-snapshot broker62-hidden">
      <section class="panel broker-v2-snapshot-overview">
        <div class="section-head broker-v2-section-head"><div><span class="broker-v2-overline">ACCOUNT SNAPSHOT</span><h3>ملخص الحساب المقروء</h3></div><span class="broker-v2-badge">المصدر: <b id="broker62SnapshotSource">—</b></span></div>
        <div class="broker62-summary broker-v2-summary broker-v2-summary-four">
          <div><span>الرصيد النقدي</span><b id="broker62Cash">—</b></div>
          <div><span>المتاح للتداول</span><b id="broker62Available">—</b></div>
          <div><span>إجمالي الحساب</span><b id="broker62Total">—</b></div>
          <div><span>عدد المراكز</span><b id="broker62PositionCount">0</b></div>
        </div>
        <div id="broker62Warnings" class="broker62-warnings"></div>
      </section>

      <div class="broker62-grid broker-v2-data-grid">
        <section class="panel"><div class="broker-v2-panel-title"><span>مراكز Saxo</span><small>بيانات المصدر كما تمت قراءتها</small></div><div id="broker62SaxoPositions" class="trade-list"></div></section>
        <section class="panel"><div class="broker-v2-panel-title"><span>نتيجة المطابقة</span><small>مقارنة Saxo مع محفظة Asiri</small></div><div class="broker62-summary broker-v2-match-summary"><div><span>متطابق</span><b id="broker62Match">0</b></div><div><span>جديد</span><b id="broker62New">0</b></div><div><span>مختلف</span><b id="broker62Change">0</b></div><div><span>مفقود</span><b id="broker62Missing">0</b></div></div></section>
      </div>

      <section class="panel broker-v2-diff-panel"><div class="broker-v2-panel-title"><span>تفاصيل الفروقات</span><small>لا يتم تطبيق أي تعديل تلقائي على المحفظة</small></div><div id="broker62DiffTable" class="table-wrap"></div></section>
    </div>
  </div>
</section>`;

let uiSource = await fs.readFile(uiPath, 'utf8');
if (!uiSource.includes(marker)) {
  const pattern = /export const brokerGatewayPage = `[\s\S]*?`;\n\nexport const investmentCommitteePage/;
  if (!pattern.test(uiSource)) throw new Error('v7.2.1 broker UI patch failed: broker page export anchor not found');
  uiSource = uiSource.replace(
    pattern,
    'export const brokerGatewayPage = `' + brokerGatewayPageV721 + '`;\n\nexport const investmentCommitteePage'
  );
  await fs.writeFile(uiPath, uiSource, 'utf8');
}

let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes('/broker-ui-v721.css')) {
  const stylePattern = /const extraStyles = '([^']*)';/;
  const styleMatch = bootstrap.match(stylePattern);
  if (!styleMatch) throw new Error('v7.2.1 broker UI patch failed: stylesheet anchor not found');
  bootstrap = bootstrap.replace(
    stylePattern,
    `const extraStyles = '${styleMatch[1]}<link rel="stylesheet" href="/broker-ui-v721.css?v=7210">';`
  );

  const staticAnchor = "app.get('/v65.css', (_req, res) => res.sendFile(path.join(root, 'v65.css')));";
  if (!bootstrap.includes(staticAnchor)) throw new Error('v7.2.1 broker UI patch failed: static route anchor not found');
  bootstrap = bootstrap.replace(
    staticAnchor,
    `${staticAnchor}\napp.get('/broker-ui-v721.css', (_req, res) => res.sendFile(path.join(root, 'broker-ui-v721.css')));`
  );
  await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
}

console.log('broker-experience-v7.2.1', {
  applied: true,
  arabicFirst: true,
  mobileFirst: true,
  tradingEnabled: false,
  executionAllowed: false
});
