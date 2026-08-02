(() => {
  'use strict';
  if (window.__asiriDecisionIntelligenceV720) return;
  window.__asiriDecisionIntelligenceV720 = true;

  const PENDING_KEY = 'asiri_di720_pending_decisions';
  const MAX_PENDING = 50;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '—').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const num = (value) => {
    const cleaned = String(value ?? '').replace(/[^0-9+\-.]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const fmt = (value, digits = 1) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
  const pct = (value, digits = 1) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${fmt(value, digits)}%` : '—';
  const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const state = {
    initialized: false,
    client: null,
    session: null,
    config: null,
    summary: null,
    syncing: false,
    lastSavedFingerprint: null,
    lastSavedAt: 0
  };

  function page() { return $('#investmentcommittee'); }

  function panelMarkup() {
    return `
      <section id="di720Panel" class="panel di720-panel">
        <div class="di720-head">
          <div>
            <span class="eyebrow">ASIRI DECISION INTELLIGENCE · v7.2</span>
            <h3>ذاكرة القرار وقياس الأداء</h3>
            <p class="muted">يحفظ القرار كما ظهر لحظة إصداره، ثم يقيس نتيجته بعد 1 و3 و7 جلسات دون تنفيذ أي صفقة.</p>
          </div>
          <div class="di720-actions">
            <span id="di720Storage" class="di720-storage">جارٍ الاتصال…</span>
            <button id="di720Refresh" type="button" class="secondary">تحديث النتائج</button>
          </div>
        </div>

        <div id="di720Notice" class="di720-notice">لم تُحفظ قرارات سحابية بعد. استخدم زر «حفظ ومتابعة الأداء» داخل القرار.</div>

        <div class="di720-kpis">
          <article><span>القرارات المحفوظة</span><strong id="di720Total">0</strong><small id="di720Evaluated">0 تم تقييمها</small></article>
          <article><span>إيجابية جلسة واحدة</span><strong id="di720OneDay">—</strong><small id="di720OneSamples">0 عينة</small></article>
          <article><span>إيجابية 3 جلسات</span><strong id="di720ThreeDay">—</strong><small id="di720ThreeSamples">0 عينة</small></article>
          <article><span>إيجابية 7 جلسات</span><strong id="di720SevenDay">—</strong><small id="di720SevenSamples">0 عينة</small></article>
          <article><span>متوسط عائد 7 جلسات</span><strong id="di720AvgReturn">—</strong><small>من القرارات المقاسة</small></article>
        </div>

        <div class="di720-grid">
          <article class="di720-subpanel">
            <div class="di720-subhead"><div><span class="eyebrow">SCORE CALIBRATION</span><h4>هل الدرجة تتنبأ بالنتيجة؟</h4></div></div>
            <div class="di720-calibration-head"><span>الجودة الفنية</span><span>جاهزية التنفيذ</span></div>
            <div id="di720Calibration" class="di720-calibration"></div>
          </article>

          <article class="di720-subpanel">
            <div class="di720-subhead"><div><span class="eyebrow">GATE IMPACT</span><h4>أكثر البوابات تأثيرًا</h4></div></div>
            <div id="di720GateImpact" class="di720-gates"><p class="muted">تحتاج البوابات إلى نتائج 7 جلسات للمقارنة.</p></div>
          </article>
        </div>

        <article class="di720-subpanel di720-recent-panel">
          <div class="di720-subhead"><div><span class="eyebrow">DECISION MEMORY</span><h4>آخر القرارات ونتائجها</h4></div><span id="di720Pending" class="pill">0 قيد المتابعة</span></div>
          <div id="di720Recent" class="di720-recent"><p class="muted">لا توجد قرارات محفوظة.</p></div>
        </article>

        <p class="di720-safety">🔒 الذاكرة تحليلية فقط. لا تغيّر المحفظة، ولا ترسل أوامر، ولا تسمح بالتنفيذ الآلي.</p>
      </section>`;
  }

  async function ensureSession() {
    if (state.session?.access_token) return state.session;
    state.config ||= await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json());
    if (!state.config?.supabase?.enabled || !window.supabase?.createClient) throw new Error('جلسة Supabase غير جاهزة.');
    state.client ||= window.supabase.createClient(state.config.supabase.url, state.config.supabase.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    const { data, error } = await state.client.auth.getSession();
    if (error) throw error;
    if (!data?.session) throw new Error('افتح المنصة بعد اكتمال تسجيل الجلسة التلقائية.');
    state.session = data.session;
    return state.session;
  }

  async function authFetch(url, options = {}) {
    const session = await ensureSession();
    const headers = { ...(options.headers || {}), authorization: `Bearer ${session.access_token}` };
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `تعذر الاتصال (${response.status})`);
    return payload;
  }

  function setNotice(message, mode = '') {
    const node = $('#di720Notice');
    if (!node) return;
    node.textContent = message;
    node.className = `di720-notice ${mode}`;
  }

  function localPending() {
    try {
      const rows = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
      return Array.isArray(rows) ? rows.slice(0, MAX_PENDING) : [];
    } catch { return []; }
  }

  function savePending(rows) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(rows.slice(0, MAX_PENDING)));
  }

  function queueSnapshot(snapshot) {
    const rows = localPending();
    if (!rows.some((row) => row.client_decision_id === snapshot.client_decision_id)) rows.unshift(snapshot);
    savePending(rows);
  }

  function removePending(clientDecisionId) {
    savePending(localPending().filter((row) => row.client_decision_id !== clientDecisionId));
  }

  function levelMap() {
    const result = {};
    $$('#dc711Levels > div').forEach((row) => {
      const label = row.querySelector('span')?.textContent?.trim();
      const value = row.querySelector('strong')?.textContent?.trim();
      if (label) result[label] = value;
    });
    return result;
  }

  function riskMap() {
    const result = {};
    $$('#dc711RiskSummary > div').forEach((row) => {
      const label = row.querySelector('span')?.textContent?.trim();
      const value = row.querySelector('strong')?.textContent?.trim();
      if (label) result[label] = value;
    });
    return result;
  }

  function gateResults() {
    return $$('#dc711GoldenChecks li').map((row, index) => ({
      key: ['score', 'breakout', 'volume', 'rr', 'liquidity', 'market', 'risk', 'price', 'sharia'][index] || `gate-${index + 1}`,
      label: row.textContent.replace(/^[✓×]\s*/, '').trim(),
      passed: row.classList.contains('passed'),
      manual: index === 8
    }));
  }

  function parsePrice(value) { return num(String(value || '').replace(/,/g, '')); }

  async function fetchSourceSnapshots(symbol) {
    const settled = await Promise.allSettled([
      fetch(`/api/analyze/${encodeURIComponent(symbol)}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('analyze'))),
      fetch(`/api/investment-committee/${encodeURIComponent(symbol)}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('committee'))),
      fetch(`/api/market-intelligence?symbols=${encodeURIComponent(symbol)}&t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.ok ? r.json() : Promise.reject(new Error('market')))
    ]);
    return {
      analyze: settled[0].status === 'fulfilled' ? settled[0].value : {},
      committee: settled[1].status === 'fulfilled' ? settled[1].value : {},
      market: settled[2].status === 'fulfilled' ? settled[2].value : {}
    };
  }

  async function captureSnapshot() {
    const symbol = String($('#dc711SelectedSymbol')?.textContent || $('#dc711Symbol')?.value || '').trim().toUpperCase();
    const decisionPrice = parsePrice($('#dc711SelectedPrice')?.textContent);
    if (!symbol || !(decisionPrice > 0)) throw new Error('حلل السهم أولًا قبل الحفظ.');
    const source = await fetchSourceSnapshots(symbol);
    const candidate = source.analyze?.candidateAnalysis || {};
    const riskOfficer = (source.committee?.members || []).find((member) => String(member.role).toUpperCase() === 'RISK_OFFICER') || {};
    const levels = levelMap();
    const risk = riskMap();
    const gates = gateResults();
    const clientId = crypto.randomUUID();
    return {
      client_decision_id: clientId,
      symbol,
      decision_at: new Date().toISOString(),
      decision_price: decisionPrice,
      technical_score: num($('#dc711TechnicalScore')?.textContent) || 0,
      execution_readiness: num($('#dc711ReadinessScore')?.textContent) || 0,
      decision_code: source.committee?.consensus?.decisionCode || null,
      decision_label: $('#dc711ExecutiveTitle')?.textContent?.trim() || $('#dc711Decision')?.textContent?.trim() || 'مراجعة',
      action_text: $('#dc711DecisionBadge')?.textContent?.trim() || null,
      reason: $('#dc711ExecutiveReason')?.textContent?.trim() || $('#dc711DecisionReason')?.textContent?.trim() || null,
      next_action: $('#dc711ExecutiveNext')?.textContent?.trim() || null,
      market_score: Number(source.market?.market?.score ?? source.market?.score) || null,
      market_regime: source.market?.market?.regime || source.market?.regime || $('#dc711MarketRegime')?.textContent?.trim() || null,
      entry_low: Number(candidate.entryLow) || parsePrice(String(levels['الدخول'] || '').split('–')[0]),
      entry_high: Number(candidate.entryHigh) || parsePrice(String(levels['الدخول'] || '').split('–')[1]),
      stop_loss: Number(candidate.stopLoss) || parsePrice(levels['وقف الخسارة']),
      target1: Number(candidate.target1) || parsePrice(levels['الهدف 1']),
      target2: Number(candidate.target2) || parsePrice(levels['الهدف 2']),
      risk_reward: Number(candidate.riskReward) || parsePrice(levels['R/R']),
      volume_ratio: Number(candidate.volumeRatio) || parsePrice(levels.RVol),
      breakout_confirmed: Boolean(candidate.confirmedBreakout),
      liquidity_ok: candidate.liquidityOk !== false,
      risk_veto: Boolean(riskOfficer.veto),
      sharia_verified: Boolean($('#dc711Sharia')?.checked),
      fomo_guard: !Boolean($('#dc711FomoGuard')?.hidden),
      gate_results: gates,
      candidate_snapshot: candidate,
      committee_snapshot: source.committee || {},
      market_snapshot: source.market || {},
      risk_snapshot: risk,
      source_version: '7.2.0',
      execution_allowed: false
    };
  }

  async function persistSnapshot(snapshot, { silent = false } = {}) {
    queueSnapshot(snapshot);
    try {
      const result = await authFetch('/api/decision-intelligence/decisions', {
        method: 'POST',
        body: JSON.stringify(snapshot)
      });
      if (result.persisted === 'supabase') removePending(snapshot.client_decision_id);
      if (!silent) setNotice(result.persisted === 'supabase'
        ? `تم حفظ قرار ${snapshot.symbol} وبدأت متابعة 1/3/7 جلسات.`
        : `تم حفظ قرار ${snapshot.symbol} محليًا مؤقتًا. طبّق Migration v7.2 لتفعيل الذاكرة السحابية.`, result.persisted === 'supabase' ? 'success' : 'warning');
      return result;
    } catch (error) {
      if (!silent) setNotice(`تم الاحتفاظ بقرار ${snapshot.symbol} محليًا وسيعاد إرساله تلقائيًا: ${error.message}`, 'warning');
      throw error;
    }
  }

  async function syncPending() {
    if (state.syncing) return;
    const rows = localPending();
    if (!rows.length) return;
    state.syncing = true;
    let synced = 0;
    try {
      for (const snapshot of rows) {
        try {
          const result = await persistSnapshot(snapshot, { silent: true });
          if (result.persisted === 'supabase') synced += 1;
        } catch { /* keep queued */ }
      }
      if (synced) setNotice(`تمت مزامنة ${synced} قرار محفوظ محليًا مع Supabase.`, 'success');
    } finally { state.syncing = false; }
  }

  function horizon(summary, value) {
    return (summary?.horizons || []).find((row) => Number(row.horizon) === value) || {};
  }

  function renderCalibration(summary) {
    const tech = summary?.calibration?.technicalScore || [];
    const readiness = summary?.calibration?.executionReadiness || [];
    const buckets = ['0–59', '60–74', '75–87', '88–100'];
    $('#di720Calibration').innerHTML = buckets.map((bucket) => {
      const technical = tech.find((row) => row.bucket === bucket) || {};
      const execution = readiness.find((row) => row.bucket === bucket) || {};
      const techWidth = Math.max(0, Math.min(100, Number(technical.positiveRate || 0)));
      const executionWidth = Math.max(0, Math.min(100, Number(execution.positiveRate || 0)));
      return `<div class="di720-calibration-row">
        <b><bdi dir="ltr">${bucket}</bdi></b>
        <div class="di720-cal-cell"><span style="width:${techWidth}%"></span><em>${technical.samples ? `${fmt(technical.positiveRate, 0)}% · ${technical.samples}` : '—'}</em></div>
        <div class="di720-cal-cell execution"><span style="width:${executionWidth}%"></span><em>${execution.samples ? `${fmt(execution.positiveRate, 0)}% · ${execution.samples}` : '—'}</em></div>
      </div>`;
    }).join('');
  }

  function renderGateImpact(summary) {
    const rows = summary?.gateImpact || [];
    $('#di720GateImpact').innerHTML = rows.length ? rows.slice(0, 8).map((row) => {
      const impact = Number(row.impactPct);
      const tone = impact > 0 ? 'positive' : impact < 0 ? 'negative' : 'neutral';
      return `<div class="di720-gate-row ${tone}">
        <div><strong>${esc(row.label)}</strong><small>${row.passedSamples} ناجحة الشرط مقابل ${row.failedSamples} بدونه</small></div>
        <b><bdi dir="ltr">${Number.isFinite(impact) ? pct(impact) : '—'}</bdi></b>
      </div>`;
    }).join('') : '<p class="muted">تحتاج البوابات إلى قرارات مكتملة بنتائج 7 جلسات للمقارنة.</p>';
  }

  function outcomeCell(outcomes, horizonValue) {
    const row = (outcomes || []).find((item) => Number(item.horizon_sessions) === horizonValue);
    if (!row) return '<span class="di720-pending">قيد القياس</span>';
    const tone = Number(row.return_pct) > 0 ? 'up' : Number(row.return_pct) < 0 ? 'down' : 'flat';
    return `<span class="${tone}"><bdi dir="ltr">${pct(row.return_pct)}</bdi><small>${esc(row.outcome_label)}</small></span>`;
  }

  function renderRecent(summary) {
    const rows = summary?.recent || [];
    $('#di720Recent').innerHTML = rows.length ? rows.map((row) => `<article class="di720-decision-card">
      <div class="di720-decision-main">
        <div><strong>${esc(row.symbol)}</strong><small>${esc(row.decision_label)}</small></div>
        <time>${dateTime(row.decision_at)}</time>
      </div>
      <div class="di720-decision-scores">
        <span>فني <b><bdi dir="ltr">${fmt(row.technical_score, 0)}</bdi></b></span>
        <span>جاهزية <b><bdi dir="ltr">${fmt(row.execution_readiness, 0)}</bdi></b></span>
        <span>السعر <b><bdi dir="ltr">$${fmt(row.decision_price, 2)}</bdi></b></span>
      </div>
      <div class="di720-outcome-grid">
        <div><label>1 جلسة</label>${outcomeCell(row.outcomes, 1)}</div>
        <div><label>3 جلسات</label>${outcomeCell(row.outcomes, 3)}</div>
        <div><label>7 جلسات</label>${outcomeCell(row.outcomes, 7)}</div>
      </div>
    </article>`).join('') : '<p class="muted">لا توجد قرارات محفوظة. احفظ قرارًا من أعلى القمرة لبدء الذاكرة.</p>';
  }

  function renderSummary(summary) {
    state.summary = summary;
    const one = horizon(summary, 1);
    const three = horizon(summary, 3);
    const seven = horizon(summary, 7);
    $('#di720Total').textContent = summary?.totals?.decisions ?? 0;
    $('#di720Evaluated').textContent = `${summary?.totals?.evaluatedDecisions ?? 0} تم تقييمها`;
    $('#di720OneDay').textContent = one.positiveRate == null ? '—' : `${fmt(one.positiveRate, 0)}%`;
    $('#di720OneSamples').textContent = `${one.samples || 0} عينة`;
    $('#di720ThreeDay').textContent = three.positiveRate == null ? '—' : `${fmt(three.positiveRate, 0)}%`;
    $('#di720ThreeSamples').textContent = `${three.samples || 0} عينة`;
    $('#di720SevenDay').textContent = seven.positiveRate == null ? '—' : `${fmt(seven.positiveRate, 0)}%`;
    $('#di720SevenSamples').textContent = `${seven.samples || 0} عينة`;
    $('#di720AvgReturn').textContent = seven.averageReturnPct == null ? '—' : pct(seven.averageReturnPct);
    $('#di720Pending').textContent = `${summary?.totals?.pendingDecisions ?? 0} قيد المتابعة`;
    const storage = $('#di720Storage');
    storage.textContent = summary.storage?.startsWith('supabase') ? 'Supabase + متابعة آلية' : 'ذاكرة محلية مؤقتة';
    storage.className = `di720-storage ${summary.storage?.startsWith('supabase') ? 'connected' : 'local'}`;
    renderCalibration(summary);
    renderGateImpact(summary);
    renderRecent(summary);
    if ((summary?.totals?.decisions || 0) > 0) setNotice(`الذاكرة تحتوي ${summary.totals.decisions} قرارًا، و${summary.totals.pendingDecisions} قرارًا ما زال قيد القياس.`, 'success');
  }

  async function loadSummary({ refresh = false } = {}) {
    try {
      const summary = await authFetch(`/api/decision-intelligence/summary${refresh ? '?refresh=1' : ''}`);
      renderSummary(summary);
    } catch (error) {
      $('#di720Storage').textContent = 'غير متصل';
      $('#di720Storage').className = 'di720-storage local';
      setNotice(`تعذر تحميل الذاكرة السحابية: ${error.message}`, 'warning');
    }
  }

  async function saveCurrentDecision() {
    const fingerprint = [$('#dc711SelectedSymbol')?.textContent, $('#dc711SelectedPrice')?.textContent, $('#dc711ReadinessScore')?.textContent].join('|');
    if (fingerprint === state.lastSavedFingerprint && Date.now() - state.lastSavedAt < 3000) return;
    state.lastSavedFingerprint = fingerprint;
    state.lastSavedAt = Date.now();
    setNotice('جارٍ حفظ لقطة القرار وبدء المتابعة…', 'loading');
    const snapshot = await captureSnapshot();
    await persistSnapshot(snapshot).catch(() => null);
    await loadSummary();
  }

  function bind() {
    document.addEventListener('click', (event) => {
      const save = event.target.closest?.('#dc711SaveDecision');
      if (save) setTimeout(() => saveCurrentDecision().catch((error) => setNotice(error.message, 'warning')), 0);
      const nav = event.target.closest?.('[data-page="investmentcommittee"]');
      if (nav) setTimeout(() => { initialize(); loadSummary(); }, 80);
    }, true);
    $('#di720Refresh')?.addEventListener('click', async () => {
      const button = $('#di720Refresh');
      button.disabled = true;
      button.textContent = 'جارٍ قياس النتائج…';
      setNotice('جارٍ قراءة التاريخ السعري وتحديث نتائج 1/3/7 جلسات…', 'loading');
      try {
        await authFetch('/api/decision-intelligence/evaluate', { method: 'POST' });
        await loadSummary();
      } catch (error) { setNotice(error.message, 'warning'); }
      finally { button.disabled = false; button.textContent = 'تحديث النتائج'; }
    });
  }

  function initialize() {
    const root = page();
    if (!root || $('#di720Panel')) return;
    const journal = root.querySelector('.dc711-journal-panel');
    if (!journal) {
      setTimeout(initialize, 250);
      return;
    }
    journal.insertAdjacentHTML('beforebegin', panelMarkup());
    const save = $('#dc711SaveDecision');
    if (save) save.textContent = 'حفظ ومتابعة الأداء';
    bind();
    syncPending().then(() => loadSummary()).catch(() => loadSummary());
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', initialize, { once: true })
    : initialize();
})();
