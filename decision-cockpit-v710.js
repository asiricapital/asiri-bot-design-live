(() => {
  'use strict';
  if (window.__asiriDecisionCockpitV710) return;
  window.__asiriDecisionCockpitV710 = true;

  const PROFILE_KEY = 'asiri_dc710_profile';
  const CAPITAL_KEY = 'asiri_dc710_capital_sar';
  const SYMBOL_KEY = 'asiri_dc710_symbol';
  const JOURNAL_KEY = 'asiri_dc710_local_journal';
  const SAR_RATE = 3.75;
  const RISK_PROFILES = {
    conservative: { label: 'محافظ', riskPercent: 0.5, scoreFloor: 82 },
    balanced: { label: 'متوازن', riskPercent: 0.75, scoreFloor: 75 },
    aggressive: { label: 'مضاربي', riskPercent: 1.0, scoreFloor: 68 }
  };

  const state = {
    initialized: false,
    loaded: false,
    loading: false,
    symbol: sanitize(localStorage.getItem(SYMBOL_KEY) || 'AMPL') || 'AMPL',
    profile: localStorage.getItem(PROFILE_KEY) || 'balanced',
    capitalSar: Math.max(0, Number(localStorage.getItem(CAPITAL_KEY) || 5000)),
    analyze: null,
    committee: null,
    market: null,
    history: [],
    replayIndex: 0,
    replayTimer: null,
    journal: [],
    shariaApproved: false,
    lastRisk: null
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '—').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
  const sanitize = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
  const number = (value, digits = 2) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
  const moneyUsd = (value) => Number.isFinite(Number(value)) ? `$${number(value, 2)}` : '—';
  const moneySar = (value) => Number.isFinite(Number(value)) ? `${number(value, 2)} ر.س` : '—';
  const percent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${number(value, 2)}%` : '—';
  const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  function page() { return q('#investmentcommittee'); }

  function markup() {
    return `
      <div class="dc710-titlebar">
        <div>
          <span class="eyebrow">ASIRI DECISION COCKPIT · v7.1</span>
          <h2>قمرة القرار الاستثماري</h2>
          <p class="muted">نبض السوق · Asiri Score · لجنة الاستثمار · بوابات القرار · حجم الصفقة — في مسار واحد</p>
        </div>
        <div class="dc710-title-actions">
          <span class="dc710-readonly">🔒 تحليل ومراجعة فقط</span>
          <div class="dc710-search">
            <input id="dc710Symbol" value="${esc(state.symbol)}" maxlength="12" aria-label="رمز السهم" />
            <button id="dc710Run" type="button">تحليل السهم</button>
          </div>
        </div>
      </div>

      <div id="dc710Status" class="dc710-status">افتح الصفحة أو اضغط تحليل السهم لبدء قمرة القرار.</div>

      <section class="dc710-hero-grid">
        <article class="panel dc710-market-panel">
          <div class="dc710-section-head"><div><span class="eyebrow">MARKET PULSE</span><h3 id="dc710MarketRegime">—</h3></div><div class="dc710-orbit"><span></span></div></div>
          <p id="dc710MarketNote" class="muted">جارٍ قراءة حالة السوق…</p>
          <div id="dc710MarketMetrics" class="dc710-pulse-grid"></div>
        </article>

        <article class="panel dc710-selected-panel">
          <div class="dc710-selected-topline">
            <div><span class="eyebrow">EXECUTIVE DECISION</span><div class="dc710-symbol-line"><h3 id="dc710SelectedSymbol">—</h3><span id="dc710SelectedName">—</span></div></div>
            <div class="dc710-selected-price"><strong id="dc710SelectedPrice">—</strong><span id="dc710SelectedChange">—</span></div>
          </div>
          <div class="dc710-decision-layout">
            <div id="dc710ScoreRing" class="dc710-score-ring" data-tone="neutral"><div><strong id="dc710Score">0</strong><span>Asiri Score</span></div></div>
            <div class="dc710-decision-copy">
              <span id="dc710DecisionBadge" class="dc710-decision-badge tone-neutral">—</span>
              <h3 id="dc710Decision">—</h3>
              <p id="dc710DecisionReason" class="muted">—</p>
              <div class="dc710-hero-actions"><button id="dc710CopyPlan" type="button" class="secondary">نسخ خطة القرار</button><button id="dc710SaveDecision" type="button" class="ghost">حفظ قرار تجريبي</button></div>
            </div>
          </div>
          <div id="dc710Levels" class="dc710-trade-levels"></div>
        </article>
      </section>

      <section class="dc710-workspace-grid">
        <aside class="panel dc710-radar-panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow">OPPORTUNITY RADAR</span><h3>أفضل الفرص الحالية</h3></div><span id="dc710RadarCount" class="pill">0</span></div>
          <div id="dc710Profiles" class="dc710-profile-switcher"></div>
          <div id="dc710Radar" class="dc710-radar-list"><p class="muted">جارٍ تحميل الرادار…</p></div>
        </aside>

        <section class="panel dc710-chart-panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow">REAL MARKET REPLAY</span><h3>إعادة السوق دون معرفة المستقبل</h3></div><button id="dc710Replay" type="button" class="secondary">تشغيل الإعادة</button></div>
          <div class="dc710-chart-wrap"><canvas id="dc710Chart" aria-label="رسم شموع تاريخي فعلي"></canvas></div>
          <div class="dc710-chart-footer"><span><i class="dot up"></i> صاعدة</span><span><i class="dot down"></i> هابطة</span><span id="dc710ReplayState">بيانات تاريخية فعلية · عرض أولي</span></div>
        </section>

        <aside class="panel dc710-golden-panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow gold">GOLDEN ALERT GATE</span><h3>بوابة الإشارة الذهبية</h3></div><strong id="dc710GoldenState" class="dc710-golden-state">—</strong></div>
          <label class="dc710-sharia-check"><input id="dc710Sharia" type="checkbox" /><span>تم التحقق الشرعي يدويًا في تطبيق عوائد لهذا السهم</span></label>
          <ul id="dc710GoldenChecks" class="dc710-golden-checks"></ul>
        </aside>
      </section>

      <section class="dc710-analysis-grid">
        <article class="panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow">WHY THIS DECISION?</span><h3>صندوق الأدلة</h3></div></div>
          <div id="dc710Evidence" class="dc710-evidence-list"></div>
        </article>
        <article class="panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow">SCORE ANATOMY</span><h3>تشريح النتيجة</h3></div></div>
          <div id="dc710Factors" class="dc710-factor-bars"></div>
        </article>
        <article class="panel dc710-risk-panel">
          <div class="dc710-section-head compact"><div><span class="eyebrow">RISK ENGINE</span><h3>حجم الصفقة المنضبط</h3></div></div>
          <label class="dc710-field"><span>رأس المال المتاح بالريال</span><input id="dc710Capital" type="number" min="0" step="100" value="${esc(state.capitalSar)}" /></label>
          <div id="dc710RiskSummary" class="dc710-risk-summary"></div>
          <p id="dc710RiskNote" class="muted dc710-small-note">لا يتم إرسال أي أمر تداول.</p>
        </article>
      </section>

      <section class="panel dc710-committee-panel">
        <div class="dc710-section-head compact"><div><span class="eyebrow">INVESTMENT COMMITTEE</span><h3>أصوات اللجنة والاعتراضات</h3></div><span id="dc710Consensus" class="pill">—</span></div>
        <div id="dc710Members" class="dc710-members"></div>
      </section>

      <section class="panel dc710-journal-panel">
        <div class="dc710-section-head compact"><div><span class="eyebrow">LOCAL DECISION JOURNAL</span><h3>سجل القرارات التجريبية</h3></div><div class="dc710-journal-stats"><span>القرارات <b id="dc710JournalCount">0</b></span><button id="dc710ClearJournal" type="button" class="ghost">مسح المحلي</button></div></div>
        <div id="dc710Journal" class="dc710-journal"></div>
      </section>

      <p class="dashboard-disclaimer">البيانات تحليلية وقد تكون متأخرة. التحقق الشرعي والموافقة البشرية وإدارة المخاطر شروط إلزامية. لا تنفذ قمرة القرار أي عملية شراء أو بيع.</p>`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `تعذر الاتصال (${response.status})`);
    return payload;
  }

  async function loadMarket(symbol) {
    try {
      return await fetchJson(`/api/market-intelligence?symbols=${encodeURIComponent(symbol)}&t=${Date.now()}`);
    } catch {
      const pulse = await fetchJson(`/api/market?t=${Date.now()}`);
      return { market: pulse, top3: [], rows: [], note: 'تم استخدام نبض السوق المباشر كبديل.' };
    }
  }

  function setStatus(text, mode = '') {
    const node = q('#dc710Status');
    if (!node) return;
    node.textContent = text;
    node.className = `dc710-status ${mode}`;
  }

  function decisionTone() {
    const code = String(state.committee?.consensus?.decisionCode || '').toUpperCase();
    const candidate = state.analyze?.candidateAnalysis || {};
    if (candidate.goldenQualified) return 'gold';
    if (code === 'CONDITIONAL_ENTRY') return 'success';
    if (code === 'AVOID') return 'danger';
    if (code === 'WATCH') return 'warning';
    return 'neutral';
  }

  function renderMarket() {
    const market = state.market?.market || state.market || {};
    const metrics = [
      ['اتجاه السوق', market.trend ?? market.score],
      ['شهية المخاطرة', market.riskAppetite ?? market.score],
      ['الأسهم الصغيرة', market.smallCap ?? market.score],
      ['السيولة', market.liquidity ?? market.score]
    ];
    q('#dc710MarketRegime').textContent = market.regime || 'غير محدد';
    q('#dc710MarketNote').textContent = state.market?.note || `درجة السوق ${number(market.score, 0)}/100.`;
    q('#dc710MarketMetrics').innerHTML = metrics.map(([label, raw]) => {
      const value = clamp(raw ?? 50);
      return `<div class="dc710-metric"><div><span>${esc(label)}</span><strong>${number(value, 0)}</strong></div><div class="dc710-track"><i style="width:${value}%"></i></div></div>`;
    }).join('');
  }

  function renderHero() {
    const analyze = state.analyze || {};
    const candidate = analyze.candidateAnalysis || {};
    const consensus = state.committee?.consensus || {};
    const score = clamp(candidate.confidence ?? candidate.asiriScore ?? consensus.confidence ?? 0);
    const tone = decisionTone();
    const change = Number(analyze.changePercent);
    const decision = consensus.decision || candidate.decision || 'انتظار';
    const manager = (state.committee?.members || []).find((member) => member.role === 'PORTFOLIO_MANAGER');
    const risk = (state.committee?.members || []).find((member) => member.role === 'RISK_OFFICER');
    const reason = risk?.veto
      ? `اعتراض مدير المخاطر: ${(risk.vetoReasons || risk.reasons || []).join(' · ')}`
      : candidate.reason || manager?.reasons?.at(-1) || 'القرار يحتاج مراجعة بشرية.';

    q('#dc710SelectedSymbol').textContent = analyze.symbol || state.symbol;
    q('#dc710SelectedName').textContent = analyze.name || analyze.shortName || '—';
    q('#dc710SelectedPrice').textContent = moneyUsd(analyze.price);
    const changeNode = q('#dc710SelectedChange');
    changeNode.textContent = percent(change);
    changeNode.className = change > 0 ? 'up' : change < 0 ? 'down' : '';
    const ring = q('#dc710ScoreRing');
    ring.style.setProperty('--dc-score', `${score * 3.6}deg`);
    ring.dataset.tone = tone;
    q('#dc710Score').textContent = number(score, 0);
    const badge = q('#dc710DecisionBadge');
    badge.textContent = candidate.goldenQualified ? 'Golden Alert — فنيًا' : decision;
    badge.className = `dc710-decision-badge tone-${tone}`;
    q('#dc710Decision').textContent = decision;
    q('#dc710DecisionReason').textContent = reason;

    const values = [
      ['الدخول', candidate.entryLow != null && candidate.entryHigh != null ? `${moneyUsd(candidate.entryLow)} – ${moneyUsd(candidate.entryHigh)}` : '—'],
      ['وقف الخسارة', moneyUsd(candidate.stopLoss)],
      ['الهدف 1', moneyUsd(candidate.target1)],
      ['الهدف 2', moneyUsd(candidate.target2)],
      ['R/R', candidate.riskReward != null ? `${number(candidate.riskReward, 1)} : 1` : '—'],
      ['RVol', candidate.volumeRatio != null ? `${number(candidate.volumeRatio, 1)}x` : '—']
    ];
    q('#dc710Levels').innerHTML = values.map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }

  function renderProfiles() {
    q('#dc710Profiles').innerHTML = Object.entries(RISK_PROFILES).map(([key, profile]) => `<button type="button" class="dc710-profile ${state.profile === key ? 'active' : ''}" data-dc-profile="${key}">${profile.label}<small>مخاطرة ${profile.riskPercent}%</small></button>`).join('');
    qa('[data-dc-profile]').forEach((button) => button.addEventListener('click', () => {
      state.profile = button.dataset.dcProfile;
      localStorage.setItem(PROFILE_KEY, state.profile);
      renderProfiles();
      renderRisk();
    }));
  }

  function renderRadar() {
    const rows = Array.isArray(state.market?.top3) && state.market.top3.length
      ? state.market.top3
      : Array.isArray(state.market?.rows) ? state.market.rows.slice(0, 3) : [];
    q('#dc710RadarCount').textContent = rows.length;
    q('#dc710Radar').innerHTML = rows.length ? rows.map((row) => {
      const score = clamp(row.score ?? row.candidateAnalysis?.confidence ?? 0);
      return `<button type="button" class="dc710-radar-row ${sanitize(row.symbol) === state.symbol ? 'active' : ''}" data-dc-symbol="${esc(sanitize(row.symbol))}"><div><strong>${esc(row.symbol)}</strong><span>${esc(row.name || row.decision || 'فرصة تحت المراقبة')}</span></div><div><b>${moneyUsd(row.price)}</b><small>${percent(row.changePercent)}</small></div><em>${number(score, 0)}</em></button>`;
    }).join('') : '<p class="muted">لا توجد فرص جاهزة من الرادار الآن.</p>';
    qa('[data-dc-symbol]').forEach((button) => button.addEventListener('click', () => {
      q('#dc710Symbol').value = button.dataset.dcSymbol;
      analyzeSymbol(button.dataset.dcSymbol);
    }));
  }

  function goldenChecks() {
    const candidate = state.analyze?.candidateAnalysis || {};
    const marketScore = Number(state.market?.market?.score ?? state.market?.score ?? 50);
    const risk = (state.committee?.members || []).find((member) => member.role === 'RISK_OFFICER') || {};
    const score = Number(candidate.confidence ?? candidate.asiriScore ?? 0);
    return [
      { label: 'Asiri Score ≥ 88', passed: score >= 88 },
      { label: 'اختراق فني مؤكد', passed: Boolean(candidate.confirmedBreakout) },
      { label: 'الحجم النسبي ≥ 1.15x', passed: Number(candidate.volumeRatio) >= 1.15 },
      { label: 'العائد إلى المخاطرة ≥ 1.8', passed: Number(candidate.riskReward) >= 1.8 },
      { label: 'السيولة اجتازت الحد الأدنى', passed: candidate.liquidityOk !== false },
      { label: 'نبض السوق ≥ 42', passed: marketScore >= 42 },
      { label: 'لا يوجد اعتراض نافذ من مدير المخاطر', passed: !risk.veto },
      { label: 'التحقق الشرعي اليدوي في عوائد', passed: state.shariaApproved, manual: true }
    ];
  }

  function renderGolden() {
    const checks = goldenChecks();
    const complete = checks.every((check) => check.passed);
    const technicalComplete = checks.filter((check) => !check.manual).every((check) => check.passed);
    const stateNode = q('#dc710GoldenState');
    stateNode.textContent = complete ? 'مكتمل للمراجعة' : technicalComplete ? 'بانتظار الشرعي' : 'غير مكتمل';
    stateNode.className = `dc710-golden-state ${complete ? 'active' : technicalComplete ? 'pending' : ''}`;
    q('#dc710GoldenChecks').innerHTML = checks.map((check) => `<li class="${check.passed ? 'passed' : 'failed'}"><span>${check.passed ? '✓' : '×'}</span><b>${esc(check.label)}</b></li>`).join('');
    const checkbox = q('#dc710Sharia');
    if (checkbox) checkbox.checked = state.shariaApproved;
  }

  function componentScore(key, value) {
    const ranges = {
      trend: [-32, 32], momentum: [-24, 24], volume: [-7, 14], breakout: [-5, 14], risk: [-10, 7], market: [-10, 7], quality: [-8, 8]
    };
    const [min, max] = ranges[key] || [-10, 10];
    return clamp(((Number(value || 0) - min) / (max - min)) * 100);
  }

  function renderEvidenceAndFactors() {
    const candidate = state.analyze?.candidateAnalysis || {};
    const members = state.committee?.members || [];
    const evidence = [];
    (candidate.reasons || []).forEach((reason) => evidence.push(['محرك الفرصة', reason]));
    members.forEach((member) => (member.reasons || []).slice(0, 2).forEach((reason) => evidence.push([member.label || member.role, reason])));
    const unique = [];
    const seen = new Set();
    for (const row of evidence) {
      if (!row[1] || seen.has(row[1])) continue;
      seen.add(row[1]);
      unique.push(row);
      if (unique.length >= 9) break;
    }
    q('#dc710Evidence').innerHTML = unique.length
      ? unique.map(([source, text]) => `<div class="dc710-evidence-row"><span>${esc(source)}</span><strong>${esc(text)}</strong></div>`).join('')
      : '<p class="muted">لا توجد أدلة كافية بعد.</p>';

    const labels = { trend: 'الاتجاه', momentum: 'الزخم', volume: 'الحجم', breakout: 'الاختراق', risk: 'المخاطر', market: 'السوق', quality: 'جودة البيانات' };
    q('#dc710Factors').innerHTML = Object.entries(candidate.components || {}).map(([key, value]) => {
      const normalized = componentScore(key, value);
      return `<div class="dc710-factor-row"><span>${esc(labels[key] || key)}</span><div class="dc710-track"><i style="width:${normalized}%"></i></div><strong>${number(normalized, 0)}</strong></div>`;
    }).join('') || '<p class="muted">تشريح النتيجة غير متاح.</p>';
  }

  function calculateRisk() {
    const candidate = state.analyze?.candidateAnalysis || {};
    const profile = RISK_PROFILES[state.profile] || RISK_PROFILES.balanced;
    const entry = Number(candidate.entryHigh ?? state.analyze?.price);
    const stop = Number(candidate.stopLoss);
    const capitalSar = Math.max(0, Number(state.capitalSar) || 0);
    const capitalUsd = capitalSar / SAR_RATE;
    const riskPerShare = entry > stop && stop > 0 ? entry - stop : 0;
    const riskBudgetUsd = capitalUsd * profile.riskPercent / 100;
    const riskQuantity = riskPerShare > 0 ? Math.floor(riskBudgetUsd / riskPerShare) : 0;
    const capitalQuantity = entry > 0 ? Math.floor(capitalUsd / entry) : 0;
    const maxPositionPct = Number(state.committee?.consensus?.maxPositionPct || 100);
    const maxPositionUsd = capitalUsd * Math.min(100, Math.max(0, maxPositionPct)) / 100;
    const maxPositionQuantity = entry > 0 ? Math.floor(maxPositionUsd / entry) : 0;
    const quantity = Math.max(0, Math.min(riskQuantity || 0, capitalQuantity || 0, maxPositionQuantity || 0));
    const positionUsd = quantity * (entry || 0);
    const actualRiskUsd = quantity * riskPerShare;
    return { profile, entry, stop, capitalSar, capitalUsd, riskPerShare, riskBudgetUsd, quantity, positionUsd, positionSar: positionUsd * SAR_RATE, actualRiskSar: actualRiskUsd * SAR_RATE, maxPositionPct };
  }

  function renderRisk() {
    const risk = calculateRisk();
    state.lastRisk = risk;
    q('#dc710RiskSummary').innerHTML = [
      ['نسبة المخاطرة', `${risk.profile.riskPercent}%`],
      ['الكمية المقترحة', risk.quantity ? `${number(risk.quantity, 0)} سهم` : '—'],
      ['قيمة المركز', risk.quantity ? moneySar(risk.positionSar) : '—'],
      ['ميزانية الخطر', moneySar(risk.riskBudgetUsd * SAR_RATE)],
      ['الخطر الفعلي', risk.quantity ? moneySar(risk.actualRiskSar) : '—'],
      ['حد اللجنة للمركز', `${number(risk.maxPositionPct, 0)}%`]
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    q('#dc710RiskNote').textContent = risk.quantity
      ? `الاحتساب يستخدم دخول ${moneyUsd(risk.entry)} ووقف ${moneyUsd(risk.stop)}، ويطبق حد المخاطرة وحد اللجنة معًا.`
      : 'تعذر احتساب الكمية: تحقق من رأس المال ومنطقة الدخول ووقف الخسارة.';
  }

  function voteLabel(vote) {
    return ({ SUPPORT: 'مؤيد', OPPOSE: 'معترض', CAUTION: 'حذر', WAIT: 'انتظار', WATCH: 'مراقبة', CONDITIONAL_ENTRY: 'دخول مشروط', AVOID: 'تجنب' })[vote] || vote || '—';
  }

  function renderCommittee() {
    const members = state.committee?.members || [];
    const consensus = state.committee?.consensus || {};
    q('#dc710Consensus').textContent = `${consensus.decision || '—'} · ${number(consensus.confidence, 0)}/100`;
    q('#dc710Members').innerHTML = members.length ? members.map((member) => `<article class="dc710-member ${member.veto ? 'veto' : ''}"><div><span>${esc(member.role)}</span><h4>${esc(member.label)}</h4></div><div class="dc710-member-score">${number(member.score, 0)}<small>/100</small></div><b class="dc710-vote">${esc(voteLabel(member.vote))}</b>${member.veto ? '<em>اعتراض نافذ</em>' : ''}<ul>${(member.reasons || []).slice(0, 4).map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul></article>`).join('') : '<p class="muted">لم تصل نتيجة اللجنة بعد.</p>';
  }

  function normalizeHistory(rows) {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      time: row.date || row.time || row.timestamp || row.datetime,
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close)
    })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
      .sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0))
      .slice(-80);
  }

  function drawChart() {
    const canvas = q('#dc710Chart');
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const data = state.history.slice(0, Math.max(1, state.replayIndex));
    if (!data.length) {
      context.fillStyle = '#8ea0b9';
      context.font = '13px system-ui';
      context.fillText('لا توجد بيانات تاريخية للرسم.', 18, 34);
      return;
    }
    const padding = { top: 18, right: 18, bottom: 28, left: 54 };
    const min = Math.min(...data.map((row) => row.low)) * 0.995;
    const max = Math.max(...data.map((row) => row.high)) * 1.005;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const xStep = chartWidth / Math.max(data.length, 1);
    const candleWidth = Math.max(3, Math.min(10, xStep * 0.58));
    const y = (price) => padding.top + ((max - price) / (max - min || 1)) * chartHeight;
    context.strokeStyle = 'rgba(148,163,184,.13)';
    context.fillStyle = '#8192aa';
    context.font = '10px system-ui';
    for (let line = 0; line <= 4; line += 1) {
      const yy = padding.top + chartHeight / 4 * line;
      context.beginPath(); context.moveTo(padding.left, yy); context.lineTo(width - padding.right, yy); context.stroke();
      context.fillText((max - (max - min) / 4 * line).toFixed(2), 6, yy + 4);
    }
    data.forEach((row, index) => {
      const x = padding.left + xStep * index + xStep / 2;
      const rising = row.close >= row.open;
      const color = rising ? '#2dd4a7' : '#fb7185';
      context.strokeStyle = color; context.fillStyle = color;
      context.beginPath(); context.moveTo(x, y(row.high)); context.lineTo(x, y(row.low)); context.stroke();
      const top = Math.min(y(row.open), y(row.close));
      context.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(2, Math.abs(y(row.open) - y(row.close))));
    });
    const last = data.at(-1);
    q('#dc710ReplayState').textContent = `${state.replayIndex}/${state.history.length} جلسة · آخر إغلاق ${moneyUsd(last.close)}`;
  }

  function startReplay() {
    if (!state.history.length || state.replayTimer) return;
    q('#dc710Replay').textContent = 'إيقاف الإعادة';
    state.replayTimer = window.setInterval(() => {
      if (state.replayIndex >= state.history.length) {
        stopReplay();
        return;
      }
      state.replayIndex += 1;
      drawChart();
    }, 420);
  }

  function stopReplay() {
    if (state.replayTimer) window.clearInterval(state.replayTimer);
    state.replayTimer = null;
    const button = q('#dc710Replay');
    if (button) button.textContent = state.replayIndex >= state.history.length ? 'إعادة من البداية' : 'تشغيل الإعادة';
  }

  function loadJournal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]');
      state.journal = Array.isArray(parsed) ? parsed.slice(0, 20) : [];
    } catch { state.journal = []; }
  }

  function renderJournal() {
    q('#dc710JournalCount').textContent = state.journal.length;
    q('#dc710Journal').innerHTML = state.journal.length ? state.journal.map((item) => `<article><div><strong>${esc(item.symbol)}</strong><span>${esc(item.decision)}</span></div><div><b>${number(item.score, 0)}/100</b><small>${item.quantity ? `${number(item.quantity, 0)} سهم · ${moneySar(item.positionSar)}` : 'بدون كمية'}</small></div><time>${esc(dateTime(item.at))}</time></article>`).join('') : '<p class="muted">لا توجد قرارات تجريبية محفوظة محليًا.</p>';
  }

  function saveDecision() {
    if (!state.analyze || !state.committee) return showToast('حلل السهم أولًا.');
    const candidate = state.analyze.candidateAnalysis || {};
    const risk = state.lastRisk || calculateRisk();
    state.journal.unshift({
      symbol: state.symbol,
      decision: state.committee.consensus?.decision || candidate.decision || 'مراجعة',
      score: candidate.confidence ?? candidate.asiriScore ?? state.committee.consensus?.confidence ?? 0,
      quantity: risk.quantity,
      positionSar: risk.positionSar,
      at: new Date().toISOString(),
      localOnly: true
    });
    state.journal = state.journal.slice(0, 20);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(state.journal));
    renderJournal();
    showToast('تم حفظ القرار محليًا دون تنفيذ أي صفقة.');
  }

  async function copyPlan() {
    if (!state.analyze || !state.committee) return showToast('حلل السهم أولًا.');
    const candidate = state.analyze.candidateAnalysis || {};
    const checks = goldenChecks();
    const text = [
      `Asiri Decision Cockpit — ${state.symbol}`,
      `القرار: ${state.committee.consensus?.decision || candidate.decision || '—'}`,
      `النتيجة: ${number(candidate.confidence ?? candidate.asiriScore ?? state.committee.consensus?.confidence, 0)}/100`,
      `السعر: ${moneyUsd(state.analyze.price)}`,
      `الدخول: ${moneyUsd(candidate.entryLow)} – ${moneyUsd(candidate.entryHigh)}`,
      `الوقف: ${moneyUsd(candidate.stopLoss)}`,
      `الهدف 1: ${moneyUsd(candidate.target1)}`,
      `الهدف 2: ${moneyUsd(candidate.target2)}`,
      `R/R: ${number(candidate.riskReward, 1)}:1`,
      `الكمية المقترحة: ${state.lastRisk?.quantity || 0} سهم`,
      `Golden Gate: ${checks.filter((item) => item.passed).length}/${checks.length}`,
      'تنبيه: تحليل فقط؛ تحقق من عوائد ووافق بشريًا قبل أي تنفيذ.'
    ].join('\n');
    try { await navigator.clipboard.writeText(text); showToast('تم نسخ خطة القرار.'); }
    catch { window.prompt('انسخ خطة القرار:', text); }
  }

  function showToast(message) {
    let toast = q('#dc710Toast');
    if (!toast) {
      toast = document.createElement('div'); toast.id = 'dc710Toast'; toast.className = 'dc710-toast'; document.body.appendChild(toast);
    }
    toast.textContent = message; toast.classList.add('show');
    clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function renderAll() {
    renderMarket(); renderHero(); renderProfiles(); renderRadar(); renderGolden(); renderEvidenceAndFactors(); renderRisk(); renderCommittee(); renderJournal();
    requestAnimationFrame(drawChart);
  }

  async function analyzeSymbol(raw) {
    const symbol = sanitize(raw || q('#dc710Symbol')?.value || state.symbol);
    if (!symbol || state.loading) return;
    state.loading = true; state.symbol = symbol; localStorage.setItem(SYMBOL_KEY, symbol); q('#dc710Symbol').value = symbol;
    state.shariaApproved = sessionStorage.getItem(`asiri_dc710_sharia_${symbol}`) === 'true';
    stopReplay();
    setStatus(`جارٍ جمع بيانات ${symbol} وعقد لجنة الاستثمار…`, 'loading');
    q('#dc710Run').disabled = true;
    try {
      const [analyzeResult, committeeResult, historyResult, marketResult] = await Promise.allSettled([
        fetchJson(`/api/analyze/${encodeURIComponent(symbol)}?t=${Date.now()}`),
        fetchJson(`/api/investment-committee/${encodeURIComponent(symbol)}?t=${Date.now()}`),
        fetchJson(`/api/history/${encodeURIComponent(symbol)}?days=150&t=${Date.now()}`),
        loadMarket(symbol)
      ]);
      if (analyzeResult.status !== 'fulfilled') throw analyzeResult.reason;
      if (committeeResult.status !== 'fulfilled') throw committeeResult.reason;
      state.analyze = analyzeResult.value;
      state.committee = committeeResult.value;
      state.market = marketResult.status === 'fulfilled' ? marketResult.value : { market: { regime: 'غير متاح', score: 50 }, top3: [] };
      state.history = historyResult.status === 'fulfilled' ? normalizeHistory(historyResult.value) : [];
      state.replayIndex = Math.min(state.history.length, Math.max(12, Math.min(24, state.history.length)));
      state.loaded = true;
      renderAll();
      setStatus(`اكتمل تحليل ${symbol}. القرار استشاري والإنسان صاحب التنفيذ.`, 'success');
    } catch (error) {
      setStatus(error?.message || 'تعذر تشغيل قمرة القرار.', 'error');
    } finally {
      state.loading = false; q('#dc710Run').disabled = false;
    }
  }

  function bindEvents() {
    q('#dc710Run').addEventListener('click', () => analyzeSymbol());
    q('#dc710Symbol').addEventListener('keydown', (event) => { if (event.key === 'Enter') analyzeSymbol(); });
    q('#dc710Replay').addEventListener('click', () => {
      if (state.replayTimer) stopReplay();
      else {
        if (state.replayIndex >= state.history.length) state.replayIndex = Math.min(12, state.history.length);
        startReplay();
      }
    });
    q('#dc710Sharia').addEventListener('change', (event) => {
      state.shariaApproved = Boolean(event.target.checked);
      sessionStorage.setItem(`asiri_dc710_sharia_${state.symbol}`, String(state.shariaApproved));
      renderGolden();
    });
    q('#dc710Capital').addEventListener('input', (event) => {
      state.capitalSar = Math.max(0, Number(event.target.value) || 0);
      localStorage.setItem(CAPITAL_KEY, String(state.capitalSar));
      renderRisk();
    });
    q('#dc710CopyPlan').addEventListener('click', copyPlan);
    q('#dc710SaveDecision').addEventListener('click', saveDecision);
    q('#dc710ClearJournal').addEventListener('click', () => {
      state.journal = []; localStorage.removeItem(JOURNAL_KEY); renderJournal(); showToast('تم مسح السجل المحلي.');
    });
    window.addEventListener('resize', () => requestAnimationFrame(drawChart));
  }

  function initialize() {
    if (state.initialized) return;
    const root = page();
    if (!root) return;
    state.initialized = true;
    root.classList.add('dc710-page');
    root.innerHTML = markup();
    const nav = q('.main-nav [data-page="investmentcommittee"]');
    if (nav) nav.innerHTML = '<span>⌁</span> قمرة القرار';
    loadJournal(); bindEvents(); renderProfiles(); renderJournal();
    if (root.classList.contains('active')) analyzeSymbol(state.symbol);
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest?.('[data-page="investmentcommittee"]');
    if (!nav) return;
    setTimeout(() => {
      initialize();
      if (!state.loaded && !state.loading) analyzeSymbol(state.symbol);
    }, 0);
  }, true);

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', initialize, { once: true })
    : initialize();
})();
