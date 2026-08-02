export const portfolioCenterPage = `
<section id="portfoliocenter" class="page">
  <div class="page-title pc661-title">
    <div>
      <span class="eyebrow">ASIRI PORTFOLIO CENTER v6.6.1</span>
      <h2>مركز المحفظة الحقيقي</h2>
      <p class="muted">Saxo الفعلي · محفظة Asiri · المطابقة · الربح والخسارة · آخر مزامنة</p>
    </div>
    <div class="pc661-title-actions">
      <span class="broker62-readonly">🔒 قراءة فقط</span>
      <button id="pc661Refresh">تحديث البيانات</button>
    </div>
  </div>

  <section class="panel pc661-hero">
    <div>
      <span class="eyebrow">ACCOUNT OVERVIEW</span>
      <h3 id="pc661Headline">جارٍ تجهيز مركز المحفظة…</h3>
      <p id="pc661Status" class="status">يتم تحميل بيانات Saxo ومحفظة Asiri دون تنفيذ أي صفقة.</p>
    </div>
    <div class="pc661-guard">
      <b>SIM · READ ONLY · SHADOW MODE</b>
      <small>لا شراء، لا بيع، ولا تعديل تلقائي للمحفظة.</small>
    </div>
  </section>

  <section class="pc661-kpis">
    <article class="metric"><span>إجمالي حساب Saxo</span><strong id="pc661Total">—</strong><small id="pc661Currency">—</small></article>
    <article class="metric"><span>النقد المتاح</span><strong id="pc661Available">—</strong><small id="pc661Cash">الرصيد النقدي —</small></article>
    <article class="metric"><span>قيمة مراكز Saxo</span><strong id="pc661PositionsValue">—</strong><small id="pc661SaxoCount">0 مركز</small></article>
    <article class="metric"><span>الربح غير المحقق</span><strong id="pc661Pnl">—</strong><small>حسب آخر لقطة Saxo</small></article>
    <article class="metric"><span>تكلفة محفظة Asiri</span><strong id="pc661AsiriCost">—</strong><small id="pc661AsiriCount">0 مركز</small></article>
    <article class="metric"><span>حالة المطابقة</span><strong id="pc661MatchState">—</strong><small id="pc661MatchCounts">—</small></article>
    <article class="metric"><span>آخر مزامنة</span><strong id="pc661Updated">—</strong><small id="pc661Source">—</small></article>
    <article class="metric"><span>حالة الاتصال</span><strong id="pc661Connection">—</strong><small id="pc661Storage">—</small></article>
  </section>

  <div class="pc661-grid">
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">SAFE ALERTS</span><h3>تنبيهات المحفظة</h3></div></div>
      <div id="pc661Alerts" class="pc661-alerts"><p class="muted">جارٍ الفحص…</p></div>
    </section>
    <section class="panel">
      <div class="section-head"><div><span class="eyebrow">ACCOUNT DETAILS</span><h3>بيانات الحساب</h3></div></div>
      <div id="pc661Accounts" class="pc661-accounts"><p class="muted">جارٍ التحميل…</p></div>
    </section>
  </div>

  <section class="panel">
    <div class="section-head">
      <div><span class="eyebrow">LIVE RECONCILIATION</span><h3>المراكز والمطابقة</h3></div>
      <button id="pc661ReadSaxo" class="secondary">قراءة Saxo الفعلية</button>
    </div>
    <div id="pc661Table" class="table-wrap"><p class="muted">جارٍ تحميل المراكز…</p></div>
  </section>

  <p class="dashboard-disclaimer">مركز المحفظة للعرض والمطابقة فقط. التداول معطّل برمجيًا، وأي فروقات تحتاج مراجعة يدوية.</p>
</section>`;
