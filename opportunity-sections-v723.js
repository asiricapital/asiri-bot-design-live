(() => {
  'use strict';
  if (window.__asiriOpportunitySectionsV723) return;
  window.__asiriOpportunitySectionsV723 = true;

  const state = { client: null, session: null, data: null, loadedAt: 0, loading: null };
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const fmt = (value, digits = 2) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
  const scoreOf = (row) => Number(row?.candidateAnalysis?.confidence ?? row?.candidateAnalysis?.asiriScore ?? 0);

  async function authContext() {
    if (!window.supabase?.createClient) return { portfolio: [], watchlist: [], userId: null };
    if (!state.client) {
      const response = await fetch('/api/config?op=7230', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.supabase?.enabled) return { portfolio: [], watchlist: [], userId: null };
      state.client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    state.session = (await state.client.auth.getSession()).data.session;
    if (!state.session?.user?.id) return { portfolio: [], watchlist: [], userId: null };
    const [portfolioResult, watchResult] = await Promise.all([
      state.client.from('portfolio').select('symbol'),
      state.client.from('watchlist').select('symbol')
    ]);
    return {
      portfolio: (portfolioResult.data || []).map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean),
      watchlist: (watchResult.data || []).map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean),
      userId: state.session.user.id
    };
  }

  async function loadSections(force = false) {
    if (!force && state.data && Date.now() - state.loadedAt < 60000) return state.data;
    if (state.loading) return state.loading;
    state.loading = (async () => {
      const context = await authContext();
      const params = new URLSearchParams({
        portfolio: [...new Set(context.portfolio)].join(','),
        watchlist: [...new Set(context.watchlist)].join(','),
        t: force ? String(Date.now()) : ''
      });
      const response = await fetch(`/api/opportunities?${params.toString()}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر تحديث الفرص الذكية.');
      state.data = { ...data, context };
      state.loadedAt = Date.now();
      return state.data;
    })();
    try { return await state.loading; }
    finally { state.loading = null; }
  }

  function decisionLabel(row, kind) {
    if (kind === 'holding') return 'مركز مملوك';
    if (kind === 'golden') return row.candidateAnalysis?.decision || 'Golden Alert مؤهل';
    if (kind === 'new') return row.candidateAnalysis?.decision || 'فرصة جديدة قوية';
    return row.candidateAnalysis?.decision || 'مرشح للمراقبة';
  }

  function card(row, kind) {
    const analysis = row.candidateAnalysis || {};
    const reasons = (Array.isArray(analysis.reasons) ? analysis.reasons : [analysis.reason]).filter(Boolean).slice(0, 4);
    const symbol = esc(row.symbol);
    const canPrepare = kind === 'golden' && analysis.goldenQualified === true;
    const actionButtons = [
      canPrepare ? `<button data-v723-prepare="${symbol}">تجهيز للمحفظة</button>` : '',
      kind !== 'holding' ? `<button class="secondary" data-v723-watch="${symbol}">إضافة للمراقبة</button>` : '',
      `<button class="ghost" data-v723-analysis="${symbol}">فتح التحليل</button>`
    ].filter(Boolean).join('');

    return `<article class="golden-card opportunity-card opportunity-v723-card" data-v723-symbol="${symbol}" data-v723-kind="${kind}">
      <div class="opportunity-head"><div><strong>${symbol}</strong><small>${esc(row.name || '')}</small></div><div class="confidence"><span>Asiri Score</span><b>${fmt(scoreOf(row), 0)}/100</b></div></div>
      <div class="opportunity-v723-label ${kind}">${esc(decisionLabel(row, kind))}</div>
      <div class="opportunity-price"><span>السعر الحالي</span><b>$${fmt(row.price)}</b><small>${Number.isFinite(Number(row.changePercent)) ? `${Number(row.changePercent) >= 0 ? '+' : ''}${fmt(row.changePercent)}%` : '—'}</small></div>
      <div class="opportunity-grid">
        <div><span>الدخول الإرشادي</span><b>$${fmt(analysis.entryLow)} – $${fmt(analysis.entryHigh)}</b></div>
        <div><span>وقف الخسارة</span><b>$${fmt(analysis.stopLoss)}</b></div>
        <div><span>الهدف الأول</span><b>$${fmt(analysis.target1)}</b></div>
        <div><span>العائد/المخاطرة</span><b>${fmt(analysis.riskReward, 1)}</b></div>
      </div>
      <div class="opportunity-reasons"><b>أسباب الترتيب</b><ul>${reasons.length ? reasons.map((reason) => `<li>${esc(reason)}</li>`).join('') : '<li>النتيجة مبنية على الاتجاه والزخم والحجم والمخاطرة.</li>'}</ul></div>
      <p class="sharia-note">⚠️ ${esc(analysis.shariaStatus || 'يجب التحقق من التوافق الشرعي في عوائد قبل التنفيذ.')}</p>
      <div class="opportunity-actions">${actionButtons}</div>
    </article>`;
  }

  function renderList(id, rows, kind, emptyTitle, emptyText) {
    const host = q(`#${id}`);
    if (!host) return;
    host.innerHTML = rows?.length
      ? rows.map((row) => card(row, kind)).join('')
      : `<div class="opportunity-v723-empty"><b>${esc(emptyTitle)}</b><p>${esc(emptyText)}</p></div>`;
  }

  function allRows(data = state.data) {
    return [
      ...(data?.strongestHoldings || []),
      ...(data?.goldenQualified || []),
      ...(data?.newOpportunities || []),
      ...(data?.watchCandidates || [])
    ];
  }

  function findRow(symbol) {
    return allRows().find((row) => row.symbol === symbol);
  }

  async function addToWatchlist(symbol) {
    const context = state.data?.context || await authContext();
    if (!state.client || !context.userId) return alert('سجل الدخول أولًا لإضافة السهم إلى قائمة المراقبة.');
    const row = findRow(symbol);
    const { error } = await state.client.from('watchlist').upsert({
      user_id: context.userId,
      symbol,
      notes: `فرصة خارج المحفظة — Asiri Score ${scoreOf(row)}/100`
    }, { onConflict: 'user_id,symbol' });
    if (error) return alert(error.message);
    state.loadedAt = 0;
    alert(`تمت إضافة ${symbol} إلى قائمة المراقبة، ولن يظهر بعد الآن كفرصة جديدة.`);
    await refresh(true);
  }

  function openAnalysis(symbol) {
    q('.main-nav button[data-page="analysis"]')?.click();
    setTimeout(() => {
      const input = q('#stockQuery');
      if (input) input.value = symbol;
      q('#stockSearch')?.requestSubmit();
    }, 150);
  }

  function preparePortfolio(symbol) {
    const row = findRow(symbol);
    const analysis = row?.candidateAnalysis || {};
    if (!row || analysis.goldenQualified !== true) return alert('لا يمكن تجهيز الشراء؛ السهم غير مؤهل كـ Golden Alert كامل.');
    q('.main-nav button[data-page="portfolio"]')?.click();
    setTimeout(() => {
      if (q('#symbol')) q('#symbol').value = symbol;
      if (q('#avgPrice')) q('#avgPrice').value = analysis.entryLow ?? row.price ?? '';
      if (q('#stopLoss')) q('#stopLoss').value = analysis.stopLoss ?? '';
      if (q('#target1')) q('#target1').value = analysis.target1 ?? '';
      if (q('#target2')) q('#target2').value = analysis.target2 ?? '';
      if (q('#notes')) q('#notes').value = `Golden Alert مؤهل — ثقة ${scoreOf(row)}/100. تحقق شرعيًا قبل التنفيذ.`;
      q('#positionForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }

  function bindActions() {
    qa('[data-v723-watch]').forEach((button) => { button.onclick = () => addToWatchlist(button.dataset.v723Watch); });
    qa('[data-v723-analysis]').forEach((button) => { button.onclick = () => openAnalysis(button.dataset.v723Analysis); });
    qa('[data-v723-prepare]').forEach((button) => { button.onclick = () => preparePortfolio(button.dataset.v723Prepare); });
  }

  function renderGoldenPage(data) {
    renderList('portfolioStrengthResults', data.strongestHoldings, 'holding', 'لا توجد مراكز مملوكة', 'أضف أو اربط محفظتك ليتم ترتيب مراكزها هنا.');
    renderList('goldenQualifiedResults', data.goldenQualified, 'golden', 'لا يوجد Golden Alert مكتمل', 'القرار الصحيح هو الانتظار؛ لن يملأ النظام المراكز الثلاثة بأسهم أقل جودة.');
    renderList('newOpportunityResults', data.newOpportunities, 'new', 'لا توجد فرصة جديدة قوية الآن', 'تم استبعاد أسهم محفظتك ومراقبتك، ولم يجتز سهم جديد مستوى الجودة المطلوب.');
    renderList('watchCandidateResults', data.watchCandidates, 'watch', 'لا يوجد مرشح مراقبة مناسب', 'لم تظهر إعدادات متوسطة الجودة تستحق الإضافة للمراقبة حاليًا.');
    const counts = data.counts || {};
    const countsHost = q('#opportunityCounts');
    if (countsHost) countsHost.innerHTML = `<span>المحفظة <b>${counts.holdings || 0}</b></span><span>Golden <b>${counts.golden || 0}</b></span><span>فرص جديدة <b>${counts.newOpportunities || 0}</b></span><span>مراقبة <b>${counts.watchCandidates || 0}</b></span>`;
    const status = q('#opportunityStatus');
    if (status) status.textContent = `تم فحص ${data.scanned || 0} سهمًا من ${data.universeSize || 0} — استُبعدت المحفظة والمراقبة من الفرص الجديدة — ${new Date(data.updatedAt).toLocaleTimeString('ar-SA')}`;
    bindActions();
  }

  function renderDashboard(data) {
    const host = q('#miTop3');
    if (!host) return;
    const rows = [...(data.goldenQualified || []), ...(data.newOpportunities || []), ...(data.watchCandidates || [])]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    host.innerHTML = rows.length ? rows.map((row, index) => `<article class="mi-opportunity-card" data-op-v723="true"><div class="mi-rank">${medals[index]} المركز ${index + 1}</div><div class="mi-opportunity-head"><div><strong>${esc(row.symbol)}</strong><small>فرصة جديدة خارج المحفظة</small></div><div class="mi-score">${fmt(scoreOf(row), 0)}</div></div><div class="mi-opportunity-meta"><span>السعر<b>$${fmt(row.price)}</b></span><span>القرار<b>${esc(row.candidateAnalysis?.decision || 'مراقبة')}</b></span><span>الحجم<b>${fmt(row.candidateAnalysis?.volumeRatio, 1)}×</b></span><span>التأهيل<b>${row.candidateAnalysis?.goldenQualified ? 'Golden' : 'انتظار'}</b></span></div></article>`).join('') : '<p class="muted" data-op-v723="true">لا توجد فرصة جديدة خارج المحفظة تستحق العرض حاليًا.</p>';
  }

  async function refresh(force = false) {
    try {
      const status = q('#opportunityStatus');
      if (status && q('#golden.active')) status.textContent = 'جارٍ فحص السوق واستبعاد المحفظة والمراقبة…';
      const data = await loadSections(force);
      if (q('#golden.active')) renderGoldenPage(data);
      renderDashboard(data);
    } catch (error) {
      const status = q('#opportunityStatus');
      if (status) status.textContent = error.message;
    }
  }

  function boot() {
    const scan = q('#scanGolden');
    if (scan) scan.onclick = (event) => { event.preventDefault(); refresh(true); };
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('.main-nav button[data-page]');
      if (!button) return;
      if (['golden', 'dashboard'].includes(button.dataset.page)) setTimeout(() => refresh(false), 120);
    });
    const top = q('#miTop3');
    if (top) {
      new MutationObserver(() => {
        if (!top.querySelector('[data-op-v723]')) setTimeout(() => state.data && renderDashboard(state.data), 50);
      }).observe(top, { childList: true });
    }
    setTimeout(() => refresh(false), 500);
    setInterval(() => {
      if (q('#golden.active') || q('#dashboard.active')) refresh(false);
    }, 120000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
