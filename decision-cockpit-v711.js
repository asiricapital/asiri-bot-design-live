(() => {
  'use strict';
  if (window.__asiriDecisionCockpitV711) return;
  window.__asiriDecisionCockpitV711 = true;

  const PROFILE_KEY = 'asiri_dc711_profile';
  const CAPITAL_KEY = 'asiri_dc711_capital_sar';
  const SYMBOL_KEY = 'asiri_dc711_symbol';
  const JOURNAL_KEY = 'asiri_dc711_local_journal';
  const SAR_RATE = 3.75;
  const RISK_PROFILES = {
    conservative: { label: 'محافظ', riskPercent: 0.5, scoreFloor: 82 },
    balanced: { label: 'متوازن', riskPercent: 0.75, scoreFloor: 75 },
    aggressive: { label: 'مضاربي', riskPercent: 1.0, scoreFloor: 68 }
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sanitize = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
  const esc = (value) => String(value ?? '—').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
  const number = (value, digits = 2) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
  const moneyUsd = (value) => Number.isFinite(Number(value)) ? `$${number(value, 2)}` : '—';
  const moneySar = (value) => Number.isFinite(Number(value)) ? `${number(value, 2)} ر.س` : '—';
  const percent = (value) => Number.isFinite(Number(value)) ? `${Number(value) >= 0 ? '+' : ''}${number(value, 2)}%` : '—';
  const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const initialSymbol = sanitize(localStorage.getItem(SYMBOL_KEY) || localStorage.getItem('asiri_dc710_symbol') || 'AMPL') || 'AMPL';
  const state = {
    initialized: false,
    loaded: false,
    loading: false,
    symbol: initialSymbol,
    profile: localStorage.getItem(PROFILE_KEY) || localStorage.getItem('asiri_dc710_profile') || 'balanced',
    capitalSar: Math.max(0, Number(localStorage.getItem(CAPITAL_KEY) || localStorage.getItem('asiri_dc710_capital_sar') || 5000)),
    analyze: null,
    committee: null,
    market: null,
    history: [],
    replayIndex: 0,
    replayTimer: null,
    journal: [],
    shariaApproved: false,
    lastRisk: null,
    assessment: null
  };

  function page() { return q('#investmentcommittee'); }

  function markup() {
    return `
      <div class="dc711-titlebar">
        <div>
          <span class="eyebrow">ASIRI DECISION COCKPIT · v7.1.1</span>
          <h2>قمرة القرار الاستثماري</h2>
          <p class="muted">قرار تنفيذي واضح · جودة فنية · جاهزية فعلية · بوابات أمان · حجم صفقة منضبط</p>
        </div>
        <div class="dc711-title-actions">
          <span class="dc711-readonly">🔒 تحليل ومراجعة فقط</span>
          <div class="dc711-search">
            <input id="dc711Symbol" value="${esc(state.symbol)}" maxlength="12" aria-label="رمز السهم" />
            <button id="dc711Run" type="button">تحليل السهم</button>
          </div>
        </div>
      </div>

      <div id="dc711Status" class="dc711-status">افتح الصفحة أو اضغط تحليل السهم لبدء قمرة القرار.</div>

      <section id="dc711Executive" class="panel dc711-executive-strip tone-neutral">
        <div class="dc711-executive-heading">
          <span class="dc711-executive-icon" aria-hidden="true">⌁</span>
          <div><span class="eyebrow">EXECUTIVE ACTION</span><h3>القرار التنفيذي الآن</h3></div>
          <strong id="dc711ExecutiveReadiness" class="dc711-readiness-pill"><bdi dir="ltr">0/100</bdi></strong>
        </div>
        <div class="dc711-executive-body">
          <div class="dc711-executive-action"><span>الحالة</span><h2 id="dc711ExecutiveTitle">بانتظار التحليل</h2></div>
          <div><span>السبب</span><p id="dc711ExecutiveReason">شغّل تحليل السهم لقراءة البوابات.</p></div>
          <div><span>الإجراء القادم</span><p id="dc711ExecutiveNext">لا يوجد إجراء قبل اكتمال البيانات.</p></div>
        </div>
      </section>

      <section class="dc711-hero-grid">
        <article class="panel dc711-selected-panel">
          <div class="dc711-selected-topline">
            <div><span class="eyebrow">DECISION QUALITY</span><div class="dc711-symbol-line"><h3 id="dc711SelectedSymbol">—</h3><span id="dc711SelectedName">—</span></div></div>
            <div class="dc711-selected-price"><strong id="dc711SelectedPrice">—</strong><span id="dc711SelectedChange">—</span></div>
          </div>
          <div class="dc711-decision-layout">
            <div class="dc711-score-duo">
              <div id="dc711TechnicalRing" class="dc711-score-ring" data-tone="neutral"><div><strong id="dc711TechnicalScore">0</strong><span>الجودة الفنية</span></div></div>
              <div id="dc711ReadinessRing" class="dc711-score-ring readiness" data-tone="neutral"><div><strong id="dc711ReadinessScore">0</strong><span>جاهزية القرار</span></div></div>
            </div>
            <div class="dc711-decision-copy">
              <span id="dc711DecisionBadge" class="dc711-decision-badge tone-neutral">—</span>
              <h3 id="dc711Decision">—</h3>
              <p id="dc711DecisionReason" class="muted">—</p>
              <div id="dc711FomoGuard" class="dc711-fomo-guard" hidden></div>
              <div class="dc711-hero-actions"><button id="dc711CopyPlan" type="button" class="secondary">نسخ خطة القرار</button><button id="dc711SaveDecision" type="button" class="ghost">حفظ قرار تجريبي</button></div>
            </div>
          </div>
          <div id="dc711Levels" class="dc711-trade-levels"></div>
        </article>

        <article class="panel dc711-market-panel">
          <div class="dc711-section-head"><div><span class="eyebrow">MARKET PULSE</span><h3 id="dc711MarketRegime">—</h3></div><div class="dc711-orbit"><span></span></div></div>
          <p id="dc711MarketNote" class="muted">جارٍ قراءة حالة السوق…</p>
          <div id="dc711MarketMetrics" class="dc711-pulse-grid"></div>
        </article>
      </section>

      <section class="dc711-workspace-grid">
        <aside class="panel dc711-radar-panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow">OPPORTUNITY RADAR</span><h3>أفضل الفرص الحالية</h3></div><span id="dc711RadarCount" class="pill">0</span></div>
          <div id="dc711Profiles" class="dc711-profile-switcher"></div>
          <div id="dc711Radar" class="dc711-radar-list"><p class="muted">جارٍ تحميل الرادار…</p></div>
        </aside>

        <section class="panel dc711-chart-panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow">REAL MARKET REPLAY</span><h3>إعادة السوق دون معرفة المستقبل</h3></div><button id="dc711Replay" type="button" class="secondary">تشغيل الإعادة</button></div>
          <div class="dc711-chart-wrap"><canvas id="dc711Chart" aria-label="رسم شموع تاريخي فعلي"></canvas></div>
          <div class="dc711-chart-footer"><span><i class="dot up"></i> صاعدة</span><span><i class="dot down"></i> هابطة</span><span id="dc711ReplayState">بيانات تاريخية فعلية · عرض أولي</span></div>
        </section>

        <aside class="panel dc711-golden-panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow gold">GOLDEN ALERT GATE</span><h3>بوابة الإشارة الذهبية</h3></div><strong id="dc711GoldenState" class="dc711-golden-state">—</strong></div>
          <label class="dc711-sharia-check">
            <input id="dc711Sharia" type="checkbox" />
            <span class="dc711-checkmark" aria-hidden="true">✓</span>
            <span class="dc711-sharia-copy"><strong>التحقق الشرعي</strong><small>تم فحص هذا السهم يدويًا في تطبيق عوائد</small></span>
          </label>
          <ul id="dc711GoldenChecks" class="dc711-golden-checks"></ul>
        </aside>
      </section>

      <section class="dc711-analysis-grid">
        <article class="panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow">WHY THIS DECISION?</span><h3>صندوق الأدلة</h3></div></div>
          <div id="dc711Evidence" class="dc711-evidence-list"></div>
        </article>
        <article class="panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow">SCORE ANATOMY</span><h3>تشريح الجودة الفنية</h3></div></div>
          <div id="dc711Factors" class="dc711-factor-bars"></div>
        </article>
        <article class="panel dc711-risk-panel">
          <div class="dc711-section-head compact"><div><span class="eyebrow">RISK ENGINE</span><h3>حجم الصفقة المنضبط</h3></div></div>
          <label class="dc711-field"><span>رأس المال المتاح بالريال</span><input id="dc711Capital" type="number" min="0" step="100" value="${esc(state.capitalSar)}" /></label>
          <div id="dc711RiskSummary" class="dc711-risk-summary"></div>
          <p id="dc711RiskNote" class="muted dc711-small-note">لا يتم إرسال أي أمر تداول.</p>
        </article>
      </section>

      <section class="panel dc711-committee-panel">
        <div class="dc711-section-head compact"><div><span class="eyebrow">INVESTMENT COMMITTEE</span><h3>أصوات اللجنة والاعتراضات</h3></div><span id="dc711Consensus" class="pill">—</span></div>
        <div id="dc711Members" class="dc711-members"></div>
      </section>

      <section class="panel dc711-journal-panel">
        <div class="dc711-section-head compact"><div><span class="eyebrow">LOCAL DECISION JOURNAL</span><h3>سجل القرارات التجريبية</h3></div><div class="dc711-journal-stats"><span>القرارات <b id="dc711JournalCount">0</b></span><button id="dc711ClearJournal" type="button" class="ghost">مسح المحلي</button></div></div>
        <div id="dc711Journal" class="dc711-journal"></div>
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
    const node = q('#dc711Status');
    if (!node) return;
    node.textContent = text;
    node.className = `dc711-status ${mode}`;
  }

  function roleLabel(role, fallback = '') {
    return ({ TECHNICAL_ANALYST: 'المحلل الفني', RISK_OFFICER: 'مدير المخاطر', PORTFOLIO_MANAGER: 'مدير المحفظة' })[String(role || '').toUpperCase()] || fallback || 'عضو اللجنة';
  }

  function voteLabel(vote) {
    return ({ SUPPORT: 'مؤيد', OPPOSE: 'معترض', CAUTION: 'حذر', WAIT: 'انتظار', WATCH: 'مراقبة', CONDITIONAL_ENTRY: 'دخول مشروط', AVOID: 'تجنب' })[String(vote || '').toUpperCase()] || vote || '—';
  }

  function localizeReason(value) {
    return String(value || '')
      .replace(/\bTECHNICAL_ANALYST\b/g, 'المحلل الفني')
      .replace(/\bRISK_OFFICER\b/g, 'مدير المخاطر')
      .replace(/\bPORTFOLIO_MANAGER\b/g, 'مدير المحفظة')
      .replace(/\bCONDITIONAL_ENTRY\b/g, 'دخول مشروط')
      .replace(/\bSUPPORT\b/g, 'مؤيد')
      .replace(/\bOPPOSE\b/g, 'معترض')
      .replace(/\bCAUTION\b/g, 'حذر')
      .replace(/\bWATCH\b/g, 'مراقبة')
      .replace(/\bAVOID\b/g, 'تجنب');
  }

  function candidateData() { return state.analyze?.candidateAnalysis || {}; }
  function riskOfficer() { return (state.committee?.members || []).find((member) => String(member.role).toUpperCase() === 'RISK_OFFICER') || {}; }
  function marketScore() { return Number(state.market?.market?.score ?? state.market?.score ?? 50); }
  function technicalScore() { const candidate = candidateData(); return clamp(candidate.confidence ?? candidate.asiriScore ?? state.committee?.consensus?.confidence ?? 0); }

  function pricePosition() {
    const candidate = candidateData();
    const price = Number(state.analyze?.price);
    const low = Number(candidate.entryLow);
    const high = Number(candidate.entryHigh);
    if (![price, low, high].every(Number.isFinite) || low <= 0 || high <= 0) return { known: false, inZone: false, chaseBlocked: false, belowZone: false, price, low, high };
    const chaseThreshold = high * 1.02;
    const lowerTolerance = low * 0.98;
    return { known: true, inZone: price >= lowerTolerance && price <= chaseThreshold, chaseBlocked: price > chaseThreshold, belowZone: price < lowerTolerance, price, low, high, chaseThreshold };
  }

  function readinessAssessment() {
    const candidate = candidateData();
    const risk = riskOfficer();
    const price = pricePosition();
    const profile = RISK_PROFILES[state.profile] || RISK_PROFILES.balanced;
    const score = technicalScore();
    const checks = [
      { key: 'score', label: `الجودة الفنية ≥ ${profile.scoreFloor}`, formula: `Technical Score ≥ ${profile.scoreFloor}`, passed: score >= profile.scoreFloor, weight: 15 },
      { key: 'breakout', label: 'اختراق فني مؤكد', passed: Boolean(candidate.confirmedBreakout), weight: 18 },
      { key: 'volume', label: 'الحجم النسبي اجتاز الحد', formula: 'RVol ≥ 1.15×', passed: Number(candidate.volumeRatio) >= 1.15, weight: 15 },
      { key: 'rr', label: 'العائد إلى المخاطرة مناسب', formula: 'R/R ≥ 1.8', passed: Number(candidate.riskReward) >= 1.8, weight: 15 },
      { key: 'liquidity', label: 'السيولة اجتازت الحد الأدنى', passed: candidate.liquidityOk !== false, weight: 10 },
      { key: 'market', label: 'نبض السوق مناسب', formula: 'Market Pulse ≥ 42', passed: marketScore() >= 42, weight: 10 },
      { key: 'risk', label: 'لا يوجد اعتراض نافذ من مدير المخاطر', passed: !risk.veto, weight: 12 },
      { key: 'price', label: price.chaseBlocked ? 'السعر خارج منطقة الدخول' : price.belowZone ? 'السعر دون منطقة الدخول' : 'السعر داخل النطاق المقبول', passed: price.inZone || !price.known, weight: 5 }
    ];
    const readiness = clamp(checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0));
    const missing = checks.filter((check) => !check.passed);
    return { checks, readiness, missing, price, technicalScore: score, shariaApproved: state.shariaApproved, finalReady: readiness >= 85 && state.shariaApproved && !risk.veto && !price.chaseBlocked };
  }

  function executiveDecision() {
    const candidate = candidateData();
    const risk = riskOfficer();
    const assessment = state.assessment || readinessAssessment();
    const price = assessment.price;
    const missingLabels = assessment.missing.map((item) => item.formula || item.label);
    if (risk.veto) return { tone: 'danger', title: 'تجنب مؤقتًا', reason: `يوجد اعتراض نافذ من مدير المخاطر: ${localizeReason((risk.vetoReasons || risk.reasons || []).join(' · '))}`, next: 'لا تدخل قبل زوال سبب الاعتراض وإعادة التحليل.', badge: 'قرار محظور بالمخاطر' };
    if (price.chaseBlocked) return { tone: 'warning', title: 'انتظار تراجع — لا تطارد السعر', reason: `السعر الحالي ${moneyUsd(price.price)} أعلى من منطقة الدخول ${moneyUsd(price.low)} – ${moneyUsd(price.high)}.`, next: `انتظر إعادة اختبار منطقة ${moneyUsd(price.low)} – ${moneyUsd(price.high)} أو تكوّن إعداد جديد.`, badge: 'FOMO Guard مفعّل' };
    if (price.belowZone) return { tone: 'warning', title: 'انتظار استعادة منطقة الدخول', reason: `السعر الحالي ${moneyUsd(price.price)} دون منطقة الدخول المخططة.`, next: `انتظر عودة السعر إلى ${moneyUsd(price.low)} – ${moneyUsd(price.high)} مع تأكيد الحجم والاتجاه.`, badge: 'السعر دون الخطة' };
    if (assessment.readiness >= 85 && !state.shariaApproved) return { tone: 'gold', title: 'بانتظار التحقق الشرعي', reason: 'البوابات الفنية والمخاطر قريبة من الاكتمال، لكن الاعتماد الشرعي لهذا السهم غير مسجل.', next: 'تحقق من السهم في تطبيق عوائد ثم فعّل مربع التحقق الخاص بهذا الرمز.', badge: 'بوابة شرعية معلقة' };
    if (assessment.finalReady) return { tone: 'success', title: 'جاهز للمراجعة البشرية', reason: 'اكتملت بوابات الجودة والسعر والمخاطر والتحقق الشرعي.', next: 'راجع الخطة النهائية يدويًا، ولا تنفذ إلا والسعر داخل منطقة الدخول.', badge: 'جاهزية مرتفعة' };
    if (assessment.readiness >= 70) return { tone: 'warning', title: 'مراقبة عالية الأولوية', reason: missingLabels.length ? `الجودة مرتفعة لكن ينقصها: ${missingLabels.slice(0, 3).join(' · ')}.` : 'الإعداد قوي لكنه لم يكتمل بعد.', next: candidate.confirmedBreakout ? 'انتظر اكتمال الحجم وبقية البوابات قبل أي قرار.' : `انتظر اختراقًا مؤكدًا مع ${Number(candidate.volumeRatio) < 1.15 ? 'ارتفاع الحجم إلى RVol ≥ 1.15×' : 'ثبات الحجم فوق الحد المطلوب'}.`, badge: 'مراقبة مشروطة' };
    return { tone: 'neutral', title: 'انتظار', reason: missingLabels.length ? `البوابات غير المكتملة: ${missingLabels.slice(0, 4).join(' · ')}.` : 'لا توجد جاهزية كافية الآن.', next: 'لا تدخل. أعد التحليل بعد تحسن الاتجاه أو الحجم أو نبض السوق.', badge: 'غير جاهز' };
  }

  function setRing(node, score, tone) { if (!node) return; node.style.setProperty('--dc-score', `${clamp(score) * 3.6}deg`); node.dataset.tone = tone; }

  function renderExecutive() {
    const assessment = state.assessment || readinessAssessment();
    const decision = executiveDecision();
    const root = q('#dc711Executive');
    root.className = `panel dc711-executive-strip tone-${decision.tone}`;
    q('#dc711ExecutiveReadiness').innerHTML = `<bdi dir="ltr">${number(assessment.readiness, 0)}/100</bdi>`;
    q('#dc711ExecutiveTitle').textContent = decision.title;
    q('#dc711ExecutiveReason').textContent = decision.reason;
    q('#dc711ExecutiveNext').textContent = decision.next;
  }

  function renderMarket() {
    const market = state.market?.market || state.market || {};
    const metrics = [['اتجاه السوق', market.trend ?? market.score], ['شهية المخاطرة', market.riskAppetite ?? market.score], ['الأسهم الصغيرة', market.smallCap ?? market.score], ['السيولة', market.liquidity ?? market.score]];
    q('#dc711MarketRegime').textContent = market.regime || 'غير محدد';
    q('#dc711MarketNote').textContent = state.market?.note || `درجة السوق ${number(market.score, 0)}/100.`;
    q('#dc711MarketMetrics').innerHTML = metrics.map(([label, raw]) => { const value = clamp(raw ?? 50); return `<div class="dc711-metric"><div><span>${esc(label)}</span><strong><bdi dir="ltr">${number(value, 0)}</bdi></strong></div><div class="dc711-track"><i style="width:${value}%"></i></div></div>`; }).join('');
  }

  function renderHero() {
    const analyze = state.analyze || {};
    const candidate = candidateData();
    const assessment = state.assessment || readinessAssessment();
    const decision = executiveDecision();
    const change = Number(analyze.changePercent);
    q('#dc711SelectedSymbol').textContent = analyze.symbol || state.symbol;
    q('#dc711SelectedName').textContent = analyze.name || analyze.shortName || '—';
    q('#dc711SelectedPrice').textContent = moneyUsd(analyze.price);
    const changeNode = q('#dc711SelectedChange'); changeNode.textContent = percent(change); changeNode.className = change > 0 ? 'up' : change < 0 ? 'down' : '';
    setRing(q('#dc711TechnicalRing'), assessment.technicalScore, assessment.technicalScore >= 88 ? 'gold' : assessment.technicalScore >= 75 ? 'success' : assessment.technicalScore >= 60 ? 'warning' : 'danger');
    setRing(q('#dc711ReadinessRing'), assessment.readiness, decision.tone);
    q('#dc711TechnicalScore').textContent = number(assessment.technicalScore, 0);
    q('#dc711ReadinessScore').textContent = number(assessment.readiness, 0);
    const badge = q('#dc711DecisionBadge'); badge.textContent = decision.badge; badge.className = `dc711-decision-badge tone-${decision.tone}`;
    q('#dc711Decision').textContent = decision.title;
    q('#dc711DecisionReason').textContent = decision.reason;
    const fomo = q('#dc711FomoGuard');
    if (assessment.price.chaseBlocked) { fomo.hidden = false; fomo.innerHTML = '<strong>⚠️ مانع مطاردة السعر</strong><span>السعر خرج من منطقة الدخول. لا تطارد السهم؛ انتظر إعادة الاختبار أو فرصة جديدة.</span>'; }
    else { fomo.hidden = true; fomo.textContent = ''; }
    const values = [['الدخول', candidate.entryLow != null && candidate.entryHigh != null ? `${moneyUsd(candidate.entryLow)} – ${moneyUsd(candidate.entryHigh)}` : '—'], ['وقف الخسارة', moneyUsd(candidate.stopLoss)], ['الهدف 1', moneyUsd(candidate.target1)], ['الهدف 2', moneyUsd(candidate.target2)], ['R/R', candidate.riskReward != null ? `${number(candidate.riskReward, 1)} : 1` : '—'], ['RVol', candidate.volumeRatio != null ? `${number(candidate.volumeRatio, 2)}×` : '—']];
    q('#dc711Levels').innerHTML = values.map(([label, value]) => `<div><span>${esc(label)}</span><strong><bdi dir="ltr">${esc(value)}</bdi></strong></div>`).join('');
  }

  function renderProfiles() {
    q('#dc711Profiles').innerHTML = Object.entries(RISK_PROFILES).map(([key, profile]) => `<button type="button" class="dc711-profile ${state.profile === key ? 'active' : ''}" data-dc-profile="${key}">${profile.label}<small><bdi dir="ltr">${profile.riskPercent}%</bdi> مخاطرة</small></button>`).join('');
    qa('[data-dc-profile]').forEach((button) => button.addEventListener('click', () => { state.profile = button.dataset.dcProfile; localStorage.setItem(PROFILE_KEY, state.profile); state.assessment = readinessAssessment(); renderProfiles(); renderExecutive(); renderHero(); renderGolden(); renderRisk(); }));
  }

  function renderRadar() {
    const rows = Array.isArray(state.market?.top3) && state.market.top3.length ? state.market.top3 : Array.isArray(state.market?.rows) ? state.market.rows.slice(0, 3) : [];
    q('#dc711RadarCount').textContent = rows.length;
    q('#dc711Radar').innerHTML = rows.length ? rows.map((row) => { const score = clamp(row.score ?? row.candidateAnalysis?.confidence ?? 0); const change = Number(row.changePercent); return `<button type="button" class="dc711-radar-row ${sanitize(row.symbol) === state.symbol ? 'active' : ''}" data-dc-symbol="${esc(sanitize(row.symbol))}"><div><strong>${esc(row.symbol)}</strong><span>${esc(row.name || row.decision || 'فرصة تحت المراقبة')}</span></div><div><b><bdi dir="ltr">${moneyUsd(row.price)}</bdi></b><small class="${change < 0 ? 'down' : ''}"><bdi dir="ltr">${percent(change)}</bdi></small></div><em><bdi dir="ltr">${number(score, 0)}</bdi></em></button>`; }).join('') : '<p class="muted">لا توجد فرص جاهزة من الرادار الآن.</p>';
    qa('[data-dc-symbol]').forEach((button) => button.addEventListener('click', () => { q('#dc711Symbol').value = button.dataset.dcSymbol; analyzeSymbol(button.dataset.dcSymbol); }));
  }

  function goldenChecks() {
    const candidate = candidateData(); const assessment = state.assessment || readinessAssessment(); const risk = riskOfficer();
    return [
      { label: 'الجودة الفنية', formula: 'Technical Score ≥ 88', passed: assessment.technicalScore >= 88 },
      { label: 'اختراق فني مؤكد', passed: Boolean(candidate.confirmedBreakout) },
      { label: 'الحجم النسبي', formula: 'RVol ≥ 1.15×', passed: Number(candidate.volumeRatio) >= 1.15 },
      { label: 'العائد إلى المخاطرة', formula: 'R/R ≥ 1.8', passed: Number(candidate.riskReward) >= 1.8 },
      { label: 'السيولة اجتازت الحد الأدنى', passed: candidate.liquidityOk !== false },
      { label: 'نبض السوق', formula: 'Market Pulse ≥ 42', passed: marketScore() >= 42 },
      { label: 'لا يوجد اعتراض نافذ من مدير المخاطر', passed: !risk.veto },
      { label: 'السعر ليس في حالة مطاردة', passed: !assessment.price.chaseBlocked },
      { label: 'التحقق الشرعي اليدوي في عوائد', passed: state.shariaApproved, manual: true }
    ];
  }

  function renderGolden() {
    const checks = goldenChecks(); const complete = checks.every((check) => check.passed); const technicalComplete = checks.filter((check) => !check.manual).every((check) => check.passed); const stateNode = q('#dc711GoldenState');
    stateNode.textContent = complete ? 'مكتمل للمراجعة' : technicalComplete ? 'بانتظار الشرعي' : 'غير مكتمل'; stateNode.className = `dc711-golden-state ${complete ? 'active' : technicalComplete ? 'pending' : ''}`;
    q('#dc711GoldenChecks').innerHTML = checks.map((check) => `<li class="${check.passed ? 'passed' : 'failed'}"><span class="dc711-gate-icon">${check.passed ? '✓' : '×'}</span><b>${esc(check.label)}${check.formula ? ` <bdi class="dc711-ltr" dir="ltr">${esc(check.formula)}</bdi>` : ''}</b></li>`).join('');
    const checkbox = q('#dc711Sharia'); if (checkbox) checkbox.checked = state.shariaApproved;
  }

  function componentScore(key, value) { const ranges = { trend: [-32, 32], momentum: [-24, 24], volume: [-7, 14], breakout: [-5, 14], risk: [-10, 7], market: [-10, 7], quality: [-8, 8] }; const [min, max] = ranges[key] || [-10, 10]; return clamp(((Number(value || 0) - min) / (max - min)) * 100); }

  function renderEvidenceAndFactors() {
    const candidate = candidateData(); const members = state.committee?.members || []; const evidence = [];
    (candidate.reasons || []).forEach((reason) => evidence.push(['محرك الفرصة', localizeReason(reason)]));
    members.forEach((member) => (member.reasons || []).slice(0, 2).forEach((reason) => evidence.push([roleLabel(member.role, member.label), localizeReason(reason)])));
    const unique = []; const seen = new Set();
    for (const row of evidence) { if (!row[1] || seen.has(row[1])) continue; seen.add(row[1]); unique.push(row); if (unique.length >= 9) break; }
    q('#dc711Evidence').innerHTML = unique.length ? unique.map(([source, text]) => `<div class="dc711-evidence-row"><span>${esc(source)}</span><strong>${esc(text)}</strong></div>`).join('') : '<p class="muted">لا توجد أدلة كافية بعد.</p>';
    const labels = { trend: 'الاتجاه', momentum: 'الزخم', volume: 'الحجم', breakout: 'الاختراق', risk: 'المخاطر', market: 'السوق', quality: 'جودة البيانات' };
    q('#dc711Factors').innerHTML = Object.entries(candidate.components || {}).map(([key, value]) => { const normalized = componentScore(key, value); return `<div class="dc711-factor-row"><span>${esc(labels[key] || key)}</span><div class="dc711-track"><i style="width:${normalized}%"></i></div><strong><bdi dir="ltr">${number(normalized, 0)}</bdi></strong></div>`; }).join('') || '<p class="muted">تشريح النتيجة غير متاح.</p>';
  }

  function calculateRisk() {
    const candidate = candidateData(); const profile = RISK_PROFILES[state.profile] || RISK_PROFILES.balanced; const entry = Number(candidate.entryHigh ?? state.analyze?.price); const stop = Number(candidate.stopLoss); const capitalSar = Math.max(0, Number(state.capitalSar) || 0); const capitalUsd = capitalSar / SAR_RATE; const riskPerShare = entry > stop && stop > 0 ? entry - stop : 0; const riskBudgetUsd = capitalUsd * profile.riskPercent / 100; const riskQuantity = riskPerShare > 0 ? Math.floor(riskBudgetUsd / riskPerShare) : 0; const capitalQuantity = entry > 0 ? Math.floor(capitalUsd / entry) : 0; const maxPositionPct = Number(state.committee?.consensus?.maxPositionPct || 100); const maxPositionUsd = capitalUsd * Math.min(100, Math.max(0, maxPositionPct)) / 100; const maxPositionQuantity = entry > 0 ? Math.floor(maxPositionUsd / entry) : 0; const plannedQuantity = Math.max(0, Math.min(riskQuantity || 0, capitalQuantity || 0, maxPositionQuantity || 0)); const positionUsd = plannedQuantity * (entry || 0); const actualRiskUsd = plannedQuantity * riskPerShare; const blocked = Boolean((state.assessment || readinessAssessment()).price.chaseBlocked || riskOfficer().veto);
    return { profile, entry, stop, capitalSar, capitalUsd, riskPerShare, riskBudgetUsd, quantity: plannedQuantity, plannedQuantity, blocked, positionUsd, positionSar: positionUsd * SAR_RATE, actualRiskSar: actualRiskUsd * SAR_RATE, maxPositionPct };
  }

  function renderRisk() {
    const risk = calculateRisk(); state.lastRisk = risk;
    q('#dc711RiskSummary').innerHTML = [['نسبة المخاطرة', `${risk.profile.riskPercent}%`], [risk.blocked ? 'الكمية عند تحقق الشروط' : 'الكمية المقترحة', risk.quantity ? `${number(risk.quantity, 0)} سهم` : '—'], ['قيمة المركز المخططة', risk.quantity ? moneySar(risk.positionSar) : '—'], ['ميزانية الخطر', moneySar(risk.riskBudgetUsd * SAR_RATE)], ['الخطر الفعلي المخطط', risk.quantity ? moneySar(risk.actualRiskSar) : '—'], ['حد اللجنة للمركز', `${number(risk.maxPositionPct, 0)}%`]].map(([label, value]) => `<div><span>${esc(label)}</span><strong><bdi dir="ltr">${esc(value)}</bdi></strong></div>`).join('');
    q('#dc711RiskNote').textContent = risk.blocked ? 'الكمية للسيناريو المخطط فقط؛ التنفيذ غير مناسب الآن بسبب مانع السعر أو اعتراض المخاطر.' : risk.quantity ? `الاحتساب يستخدم دخول ${moneyUsd(risk.entry)} ووقف ${moneyUsd(risk.stop)}، ويطبق حد المخاطرة وحد اللجنة معًا.` : 'تعذر احتساب الكمية: تحقق من رأس المال ومنطقة الدخول ووقف الخسارة.';
  }

  function renderCommittee() {
    const members = state.committee?.members || []; const consensus = state.committee?.consensus || {};
    q('#dc711Consensus').textContent = `${localizeReason(consensus.decision || '—')} · ${number(consensus.confidence, 0)}/100`;
    q('#dc711Members').innerHTML = members.length ? members.map((member) => { const label = roleLabel(member.role, member.label); const reasons = (member.reasons || []).slice(0, 4).map((reason) => `<li>${esc(localizeReason(reason))}</li>`).join(''); return `<article class="dc711-member ${member.veto ? 'veto' : ''}"><div><span>عضو لجنة الاستثمار</span><h4>${esc(label)}</h4></div><div class="dc711-member-score"><bdi dir="ltr">${number(member.score, 0)}<small>/100</small></bdi></div><b class="dc711-vote">${esc(voteLabel(member.vote))}</b>${member.veto ? '<em>اعتراض نافذ</em>' : ''}<ul>${reasons}</ul></article>`; }).join('') : '<p class="muted">لم تصل نتيجة اللجنة بعد.</p>';
  }

  function normalizeHistory(rows) { return (Array.isArray(rows) ? rows : []).map((row) => ({ time: row.date || row.time || row.timestamp || row.datetime, open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close) })).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite)).sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0)).slice(-100); }

  function drawChart() {
    const canvas = q('#dc711Chart'); if (!canvas) return; const context = canvas.getContext('2d'); if (!context) return; const ratio = window.devicePixelRatio || 1; const bounds = canvas.getBoundingClientRect(); const width = Math.max(1, bounds.width); const height = Math.max(1, bounds.height); canvas.width = Math.floor(width * ratio); canvas.height = Math.floor(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height); context.direction = 'ltr';
    const revealed = state.history.slice(0, Math.max(1, state.replayIndex)); const maxVisible = width < 520 ? 42 : 72; const data = revealed.slice(-maxVisible);
    if (!data.length) { context.fillStyle = '#8ea0b9'; context.font = '13px system-ui'; context.textAlign = 'left'; context.fillText('لا توجد بيانات تاريخية للرسم.', 22, 38); return; }
    const padding = { top: 22, right: 20, bottom: 32, left: width < 520 ? 68 : 74 }; const min = Math.min(...data.map((row) => row.low)) * 0.992; const max = Math.max(...data.map((row) => row.high)) * 1.008; const chartWidth = Math.max(1, width - padding.left - padding.right); const chartHeight = Math.max(1, height - padding.top - padding.bottom); const xStep = chartWidth / Math.max(data.length, 1); const candleWidth = Math.max(3, Math.min(11, xStep * 0.58)); const y = (price) => padding.top + ((max - price) / (max - min || 1)) * chartHeight;
    context.strokeStyle = 'rgba(148,163,184,.13)'; context.fillStyle = '#8ea0b9'; context.font = '11px system-ui'; context.textAlign = 'left';
    for (let line = 0; line <= 4; line += 1) { const yy = padding.top + chartHeight / 4 * line; context.beginPath(); context.moveTo(padding.left, yy); context.lineTo(width - padding.right, yy); context.stroke(); context.fillText((max - (max - min) / 4 * line).toFixed(2), 12, yy + 4); }
    data.forEach((row, index) => { const x = padding.left + xStep * index + xStep / 2; const rising = row.close >= row.open; const color = rising ? '#2dd4a7' : '#fb7185'; context.strokeStyle = color; context.fillStyle = color; context.beginPath(); context.moveTo(x, y(row.high)); context.lineTo(x, y(row.low)); context.stroke(); const top = Math.min(y(row.open), y(row.close)); context.fillRect(x - candleWidth / 2, top, candleWidth, Math.max(2, Math.abs(y(row.open) - y(row.close)))); });
    const last = data.at(-1); q('#dc711ReplayState').innerHTML = `<bdi dir="ltr">${state.replayIndex}/${state.history.length}</bdi> جلسة · آخر إغلاق <bdi dir="ltr">${moneyUsd(last.close)}</bdi>`;
  }

  function startReplay() { if (!state.history.length || state.replayTimer) return; q('#dc711Replay').textContent = 'إيقاف الإعادة'; state.replayTimer = window.setInterval(() => { if (state.replayIndex >= state.history.length) { stopReplay(); return; } state.replayIndex += 1; drawChart(); }, 520); }
  function stopReplay() { if (state.replayTimer) window.clearInterval(state.replayTimer); state.replayTimer = null; const button = q('#dc711Replay'); if (button) button.textContent = state.replayIndex >= state.history.length ? 'إعادة من البداية' : 'تشغيل الإعادة'; }

  function loadJournal() { try { const current = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); const legacy = JSON.parse(localStorage.getItem('asiri_dc710_local_journal') || '[]'); const parsed = Array.isArray(current) && current.length ? current : legacy; state.journal = Array.isArray(parsed) ? parsed.slice(0, 20) : []; } catch { state.journal = []; } }
  function renderJournal() { q('#dc711JournalCount').textContent = state.journal.length; q('#dc711Journal').innerHTML = state.journal.length ? state.journal.map((item) => `<article><div><strong>${esc(item.symbol)}</strong><span>${esc(localizeReason(item.decision))}</span></div><div><b><bdi dir="ltr">${number(item.technicalScore ?? item.score, 0)}/100</bdi></b><small>فني · جاهزية <bdi dir="ltr">${number(item.readiness ?? 0, 0)}/100</bdi></small></div><time>${esc(dateTime(item.at))}</time></article>`).join('') : '<p class="muted">لا توجد قرارات تجريبية محفوظة محليًا.</p>'; }

  function saveDecision() { if (!state.analyze || !state.committee) return showToast('حلل السهم أولًا.'); const assessment = state.assessment || readinessAssessment(); const decision = executiveDecision(); const risk = state.lastRisk || calculateRisk(); state.journal.unshift({ symbol: state.symbol, decision: decision.title, technicalScore: assessment.technicalScore, readiness: assessment.readiness, quantity: risk.quantity, positionSar: risk.positionSar, at: new Date().toISOString(), localOnly: true }); state.journal = state.journal.slice(0, 20); localStorage.setItem(JOURNAL_KEY, JSON.stringify(state.journal)); renderJournal(); showToast('تم حفظ القرار محليًا دون تنفيذ أي صفقة.'); }

  async function copyPlan() {
    if (!state.analyze || !state.committee) return showToast('حلل السهم أولًا.'); const candidate = candidateData(); const assessment = state.assessment || readinessAssessment(); const decision = executiveDecision(); const checks = goldenChecks();
    const text = [`Asiri Decision Cockpit v7.1.1 — ${state.symbol}`, `القرار التنفيذي: ${decision.title}`, `السبب: ${decision.reason}`, `الإجراء القادم: ${decision.next}`, `الجودة الفنية: ${number(assessment.technicalScore, 0)}/100`, `جاهزية القرار: ${number(assessment.readiness, 0)}/100`, `السعر: ${moneyUsd(state.analyze.price)}`, `الدخول: ${moneyUsd(candidate.entryLow)} – ${moneyUsd(candidate.entryHigh)}`, `الوقف: ${moneyUsd(candidate.stopLoss)}`, `الهدف 1: ${moneyUsd(candidate.target1)}`, `الهدف 2: ${moneyUsd(candidate.target2)}`, `R/R: ${number(candidate.riskReward, 1)}:1`, `RVol: ${number(candidate.volumeRatio, 2)}×`, `الكمية المخططة: ${state.lastRisk?.quantity || 0} سهم`, `Golden Gate: ${checks.filter((item) => item.passed).length}/${checks.length}`, 'تنبيه: تحليل فقط؛ تحقق من عوائد ووافق بشريًا قبل أي تنفيذ.'].join('\n');
    try { await navigator.clipboard.writeText(text); showToast('تم نسخ خطة القرار.'); } catch { window.prompt('انسخ خطة القرار:', text); }
  }

  function showToast(message) { let toast = q('#dc711Toast'); if (!toast) { toast = document.createElement('div'); toast.id = 'dc711Toast'; toast.className = 'dc711-toast'; document.body.appendChild(toast); } toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600); }

  function renderAll() { state.assessment = readinessAssessment(); renderExecutive(); renderHero(); renderMarket(); renderProfiles(); renderRadar(); renderGolden(); renderEvidenceAndFactors(); renderRisk(); renderCommittee(); renderJournal(); requestAnimationFrame(drawChart); }

  async function analyzeSymbol(raw) {
    const symbol = sanitize(raw || q('#dc711Symbol')?.value || state.symbol); if (!symbol || state.loading) return; state.loading = true; state.symbol = symbol; localStorage.setItem(SYMBOL_KEY, symbol); q('#dc711Symbol').value = symbol;
    state.shariaApproved = sessionStorage.getItem(`asiri_dc711_sharia_${symbol}`) === 'true' || sessionStorage.getItem(`asiri_dc710_sharia_${symbol}`) === 'true'; stopReplay(); setStatus(`جارٍ جمع بيانات ${symbol} وعقد لجنة الاستثمار…`, 'loading'); q('#dc711Run').disabled = true;
    try {
      const [analyzeResult, committeeResult, historyResult, marketResult] = await Promise.allSettled([fetchJson(`/api/analyze/${encodeURIComponent(symbol)}?t=${Date.now()}`), fetchJson(`/api/investment-committee/${encodeURIComponent(symbol)}?t=${Date.now()}`), fetchJson(`/api/history/${encodeURIComponent(symbol)}?days=150&t=${Date.now()}`), loadMarket(symbol)]);
      if (analyzeResult.status !== 'fulfilled') throw analyzeResult.reason; if (committeeResult.status !== 'fulfilled') throw committeeResult.reason;
      state.analyze = analyzeResult.value; state.committee = committeeResult.value; state.market = marketResult.status === 'fulfilled' ? marketResult.value : { market: { regime: 'غير متاح', score: 50 }, top3: [] }; state.history = historyResult.status === 'fulfilled' ? normalizeHistory(historyResult.value) : []; state.replayIndex = Math.min(state.history.length, Math.max(12, Math.min(24, state.history.length))); state.loaded = true; renderAll(); setStatus(`اكتمل تحليل ${symbol}. القرار استشاري والإنسان صاحب التنفيذ.`, 'success');
    } catch (error) { setStatus(error?.message || 'تعذر تشغيل قمرة القرار.', 'error'); } finally { state.loading = false; q('#dc711Run').disabled = false; }
  }

  function centerActiveNav() { const nav = q('.main-nav [data-page="investmentcommittee"]'); if (!nav) return; try { nav.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch { /* keep current position */ } }

  function bindEvents() {
    q('#dc711Run').addEventListener('click', () => analyzeSymbol()); q('#dc711Symbol').addEventListener('keydown', (event) => { if (event.key === 'Enter') analyzeSymbol(); });
    q('#dc711Replay').addEventListener('click', () => { if (state.replayTimer) stopReplay(); else { if (state.replayIndex >= state.history.length) state.replayIndex = Math.min(12, state.history.length); startReplay(); } });
    q('#dc711Sharia').addEventListener('change', (event) => { state.shariaApproved = Boolean(event.target.checked); sessionStorage.setItem(`asiri_dc711_sharia_${state.symbol}`, String(state.shariaApproved)); state.assessment = readinessAssessment(); renderExecutive(); renderHero(); renderGolden(); renderRisk(); });
    q('#dc711Capital').addEventListener('input', (event) => { state.capitalSar = Math.max(0, Number(event.target.value) || 0); localStorage.setItem(CAPITAL_KEY, String(state.capitalSar)); renderRisk(); });
    q('#dc711CopyPlan').addEventListener('click', copyPlan); q('#dc711SaveDecision').addEventListener('click', saveDecision); q('#dc711ClearJournal').addEventListener('click', () => { state.journal = []; localStorage.removeItem(JOURNAL_KEY); renderJournal(); showToast('تم مسح السجل المحلي.'); }); window.addEventListener('resize', () => requestAnimationFrame(drawChart));
  }

  function initialize() {
    if (state.initialized) return; const root = page(); if (!root) return; state.initialized = true; root.classList.remove('dc710-page'); root.classList.add('dc711-page'); root.innerHTML = markup(); const nav = q('.main-nav [data-page="investmentcommittee"]'); if (nav) nav.innerHTML = '<span>⌁</span> قمرة القرار'; loadJournal(); bindEvents(); renderProfiles(); renderJournal(); centerActiveNav(); if (root.classList.contains('active')) analyzeSymbol(state.symbol);
  }

  document.addEventListener('click', (event) => { const nav = event.target.closest?.('[data-page="investmentcommittee"]'); if (!nav) return; setTimeout(() => { initialize(); centerActiveNav(); if (!state.loaded && !state.loading) analyzeSymbol(state.symbol); }, 0); }, true);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initialize, { once: true }) : initialize();
})();
