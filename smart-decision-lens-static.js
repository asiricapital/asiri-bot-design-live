/* ASIRI Quote Quality Lens · static v27 UI layer · local, explainable and read-only. */
(() => {
  'use strict';

  const LENS_ID = 'asiri-smart-decision-lens-static';
  const safe = (value, fallback = '—') => String(value ?? '').trim() || fallback;
  const text = (value) => String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[char]));
  function numericPrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
    if (normalized === '') return null;
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  const SCENARIOS = Object.freeze({
    current: Object.freeze({
      label: 'القراءة الحالية',
      description: 'تعرض بيانات البطاقة الحالية كما هي، من دون أي محاكاة.'
    }),
    delayed: Object.freeze({
      label: 'قراءة متأخرة',
      description: 'محاكاة محلية: المصدر متصل والحقول مكتملة، لكنه لا يعلن السعر الحالي كقراءة لحظية حديثة.',
      quoteAgeMs: 6 * 60 * 1000,
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', isFresh: false, isLiveSession: true, session: 'REGULAR', error: false })
    }),
    stale: Object.freeze({
      label: 'قراءة قديمة',
      description: 'محاكاة محلية: آخر قراءة محفوظة ظاهرة للمرجع فقط بعد فشل التحديث الأخير.',
      quoteAgeMs: 45 * 60 * 1000,
      observedAgeMs: 25 * 60 * 1000,
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', isFresh: false, isLiveSession: true, session: 'REGULAR', error: true })
    }),
    unavailable: Object.freeze({
      label: 'قراءة ناقصة',
      description: 'محاكاة محلية: يوجد سعر ومصدر، لكن وقت القراءة مفقود؛ لذلك لا تُعرض كقراءة مكتملة.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: null, isFresh: true, error: false })
    }),
    fresh: Object.freeze({
      label: 'قراءة حديثة',
      description: 'محاكاة محلية: المصدر متصل ويعلن قراءة مكتملة وحديثة؛ تبقى بوابة التوصية متوقفة.',
      quoteAgeMs: 20 * 1000,
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', isFresh: true, isLiveSession: true, session: 'REGULAR', error: false })
    })
  });
  let activeScenario = 'current';
  let returnFocus = null;

  function scenarioFor(key) {
    return SCENARIOS[key] || SCENARIOS.current;
  }

  function scenarioItem(item) {
    const scenario = scenarioFor(activeScenario);
    if (!scenario.item) return { ...item, simulation: false };
    const now = Date.now();
    const quoteTime = scenario.item.time === null
      ? null
      : new Date(now - (scenario.quoteAgeMs || 30 * 1000)).toISOString();
    const observedAt = scenario.item.observedAt === null
      ? null
      : new Date(now - (scenario.observedAgeMs || 10 * 1000)).toISOString();
    return { ...item, ...scenario.item, time: quoteTime, updatedAt: quoteTime, observedAt, simulation: true, fromSnapshot: false };
  }

  function marketItem(symbol) {
    try {
      if (typeof stockMarketData !== 'undefined' && stockMarketData?.[symbol]) return stockMarketData[symbol];
    } catch (_) { /* Use DOM fallback when the host keeps data private. */ }
    const row = document.getElementById(`row-${symbol}`);
    return {
      symbol,
      price: row?.querySelector('.stock-col-price')?.textContent?.trim() || null,
      source: null,
      time: null,
      isFresh: /موثق الآن/.test(row?.textContent || ''),
      error: /تعذر التحديث/.test(row?.textContent || '')
    };
  }

  function readingTime(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'غير متاح' : date.toLocaleString('ar-SA');
  }

  function dataView(item) {
    const health = window.asiriQuoteDataHealth.classifyQuote(item);
    const described = window.asiriQuoteDataHealth.describeQuote(health);
    const next = health.state === 'FRESH'
      ? 'القراءة السعرية صالحة الآن؛ يلزم استكمال الأدلة التحليلية قبل أي مراجعة قرار.'
      : health.state === 'DELAYED'
        ? 'راجع سياق الجلسة وانتظر قراءة لحظية إذا كنت تحتاج سعرًا جاريًا.'
        : health.state === 'STALE'
          ? 'استخدم القيمة للمرجع فقط وانتظر نجاح تحديث جديد.'
          : 'انتظر اكتمال السعر والمصدر ووقتَي السوق والرصد.';
    return { ...described, health, next };
  }

  function dataCompleteness(item, view) {
    const health = view?.health || window.asiriQuoteDataHealth.classifyQuote(item);
    const checks = health.checks;
    const availableCount = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    const state = health.state;
    if (state === 'FRESH') return {
      state, tone: 'fresh', label: 'مكتملة وحديثة', summary: `${availableCount} حقول موثقة`, availableCount, total, checks,
      reason: 'السعر والمصدر ووقت حركة السعر ووقت رصد المصدر مكتملة وحديثة.'
    };
    if (state === 'DELAYED') return {
      state, tone: 'delayed', label: 'مكتملة ومتأخرة', summary: `${availableCount} حقول متاحة`, availableCount, total, checks,
      reason: 'الحقول مكتملة والمصدر متصل، لكن السعر غير معلن كقراءة لحظية حديثة.'
    };
    if (state === 'STALE') return {
      state, tone: 'stale', label: 'مكتملة وقديمة', summary: `${availableCount} حقول متاحة للمرجع`, availableCount, total, checks,
      reason: 'القيمة محفوظة بوقتها الأصلي ولا تُعامل كسعر حالي.'
    };
    return {
      state: 'UNAVAILABLE', tone: 'unavailable', label: 'غير مكتملة',
      summary: `${availableCount} من ${total} حقول صالحة`, availableCount, total, checks,
      reason: 'لا تُعرض قراءة موثقة حتى تكتمل حقول السعر والمصدر ووقتَي السوق والرصد.'
    };
  }

  function completenessField(label, available, detail) {
    return `<li class="${available ? 'available' : 'missing'}"><span class="smart-lens-field-icon" aria-hidden="true">${available ? '✓' : '—'}</span><div><b>${text(label)}</b><small>${text(detail)}</small></div><strong>${available ? 'متوفر' : 'غير متوفر'}</strong></li>`;
  }

  function stage(label, state, current) {
    return `<li class="lens-stage ${state}${current ? ' is-current' : ''}"><span class="lens-stage-dot" aria-hidden="true"></span><span>${text(label)}</span></li>`;
  }

  function gate(label, passed, detail, required = true) {
    const state = passed ? 'passed' : (required ? 'blocked' : 'required');
    const marker = passed ? 'مكتمل' : (required ? 'غير مكتمل' : 'مراجعة بشرية');
    return `<li class="smart-lens-gate ${state}"><span aria-hidden="true">${passed ? '✓' : required ? '!' : '•'}</span><div><b>${text(label)}</b><small>${text(detail)}</small></div><em>${marker}</em></li>`;
  }

  function qualityChecks(item) {
    const health = window.asiriQuoteDataHealth.classifyQuote(item);
    const priceAvailable = health.checks.price;
    const sourceKnown = health.checks.source;
    const timeKnown = health.checks.time;
    const sourceRecent = health.checks.observation && item?.error !== true && item?.fromSnapshot !== true
      && Number.isFinite(health.sourceAgeMs) && health.sourceAgeMs <= window.asiriQuoteDataHealth.LIMITS.sourceRecentMs;
    return [
      gate('السعر', priceAvailable, priceAvailable ? 'قيمة رقمية متاحة.' : 'لا توجد قيمة سعر رقمية.'),
      gate('المصدر', sourceKnown, sourceKnown ? 'اسم المصدر ظاهر.' : 'المصدر غير متاح.'),
      gate('وقت حركة السعر', timeKnown, timeKnown ? 'وقت سوق صالح وقابل للتتبع.' : 'وقت حركة السعر مفقود أو غير صالح.'),
      gate('اتصال المصدر', sourceRecent, sourceRecent ? health.sourceStatus : health.sourceStatus)
    ].join('');
  }

  function scenarioControls() {
    const current = scenarioFor(activeScenario);
    const controls = Object.entries(SCENARIOS).map(([key, scenario]) => `<button type="button" data-lens-scenario="${key}" aria-pressed="${key === activeScenario ? 'true' : 'false'}">${text(scenario.label)}</button>`).join('');
    return `<details class="smart-lens-simulator" aria-label="مختبر حالات جودة القراءة"><summary>اختبار القراءة الحالية والحالات الأربع</summary><div class="smart-lens-simulator-body"><div class="smart-lens-simulator-head"><div><p class="smart-lens-eyebrow">DATA QUALITY SCENARIOS · LOCAL ONLY</p><h3>مختبر حالات جودة القراءة</h3></div><span>محاكاة محلية</span></div><p>تغيّر هذه الأزرار ما يظهر داخل النافذة فقط؛ لا تُعدّل بيانات السوق أو حالة السهم أو التنبيهات.</p><div class="smart-lens-scenario-buttons" role="group" aria-label="اختر القراءة الحالية أو حالة محاكية">${controls}</div><p class="smart-lens-scenario-note"><b>${text(current.label)}:</b> ${text(current.description)}</p></div></details>`;
  }

  function createLens() {
    const lens = document.createElement('section');
    lens.id = LENS_ID;
    lens.className = 'smart-decision-lens-static';
    lens.hidden = true;
    lens.setAttribute('role', 'dialog');
    lens.setAttribute('aria-modal', 'true');
    lens.setAttribute('aria-labelledby', 'smart-lens-title');
    lens.innerHTML = `
      <div class="smart-lens-backdrop" data-lens-close="true"></div>
      <article class="smart-lens-sheet" dir="rtl">
        <header class="smart-lens-head">
          <div>
            <p class="smart-lens-kicker">DATA QUALITY LENS · READ ONLY</p>
            <h2 id="smart-lens-title">تفاصيل جودة القراءة</h2>
          </div>
          <button type="button" class="smart-lens-close" data-lens-close="true" aria-label="إغلاق تفاصيل القراءة">إغلاق</button>
        </header>
        <div class="smart-lens-content" id="smart-lens-content"></div>
      </article>`;
    lens.addEventListener('click', (event) => {
      const scenarioButton = event.target.closest('[data-lens-scenario]');
      if (scenarioButton) {
        const keepSimulatorOpen = Boolean(scenarioButton.closest('details')?.open);
        activeScenario = scenarioButton.dataset.lensScenario in SCENARIOS ? scenarioButton.dataset.lensScenario : 'current';
        renderLens(lens.dataset.symbol || '');
        const simulator = lens.querySelector('.smart-lens-simulator');
        if (simulator && keepSimulatorOpen) simulator.open = true;
        lens.querySelector(`[data-lens-scenario="${activeScenario}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-lens-close="true"]')) closeLens();
    });
    lens.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...lens.querySelectorAll('button:not([disabled]), summary')].filter((element) => {
        if (element.getAttribute('aria-hidden') === 'true') return false;
        const closedDetails = element.closest('details:not([open])');
        return !closedDetails || element.tagName === 'SUMMARY';
      });
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.body.appendChild(lens);
    return lens;
  }

  function lensRoot() {
    return document.getElementById(LENS_ID) || createLens();
  }

  function closeLens() {
    const lens = document.getElementById(LENS_ID);
    if (!lens) return;
    lens.hidden = true;
    document.body.classList.remove('smart-lens-open');
    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget && focusTarget.isConnected !== false && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true });
  }

  function openLens(symbol, trigger = document.activeElement) {
    returnFocus = trigger && typeof trigger.focus === 'function' ? trigger : null;
    activeScenario = 'current';
    renderLens(symbol);
  }

  function renderLens(symbol) {
    const normalized = safe(symbol, '').toUpperCase();
    if (!normalized) return;
    const lens = lensRoot();
    lens.dataset.symbol = normalized;
    const item = scenarioItem(marketItem(normalized));
    const view = dataView(item);
    const health = view.health;
    const completeness = dataCompleteness(item, view);
    const analysis = window.asiriQuoteDataHealth.analysisGate(item);
    const source = safe(item?.source, 'غير متاح');
    const marketUpdatedAt = readingTime(item?.updatedAt || item?.time);
    const sourceObservedAt = readingTime(item?.observedAt || item?.receivedAt || item?.checkedAt);
    const quoteAge = window.asiriQuoteDataHealth.relativeAge(health.quoteAgeMs);
    const price = numericPrice(item?.price);
    const priceDisplay = view.state === 'UNAVAILABLE' || price === null ? 'غير متاح' : `$${price.toFixed(2)}`;
    const isFresh = view.state === 'FRESH';
    const isDelayed = view.state === 'DELAYED';
    const isStale = view.state === 'STALE';

    const content = lens.querySelector('#smart-lens-content');
    content.innerHTML = `
      <div class="smart-lens-symbol-row">
        <div><span class="smart-lens-symbol">${text(normalized)}</span><span class="smart-lens-price">${text(priceDisplay)}</span></div>
        <span class="smart-lens-state ${view.tone}">${text(view.label)}</span>
      </div>
      <p class="smart-lens-local-note">قراءة تفسيرية محلية من البيانات الظاهرة · لا تستخدم نموذج ذكاء اصطناعي ولا تجري اتصالًا شبكيًا.</p>
      <section class="smart-lens-primary" aria-label="حالة جودة القراءة">
        <p class="smart-lens-eyebrow">الحالة الآن</p>
        <h3>${text(view.label)}</h3>
        <p>${text(view.reason)}</p>
      </section>
      <section class="smart-lens-completeness ${completeness.tone}" aria-label="اكتمال بيانات السعر">
        <div class="smart-lens-completeness-head"><div><p class="smart-lens-eyebrow">QUOTE DATA CHECK · VERIFIED FIELDS</p><h3>اكتمال بيانات السعر</h3></div><span class="smart-lens-completeness-badge">${text(completeness.label)}</span></div>
        <div class="smart-lens-completeness-summary"><strong>${text(completeness.summary)}</strong><span>${text(completeness.reason)}</span></div>
        <ul class="smart-lens-field-grid" aria-label="حقول قراءة السعر">
          ${completenessField('السعر', completeness.checks.price, completeness.checks.price ? 'قيمة رقمية صالحة' : 'القيمة مفقودة أو غير صالحة')}
          ${completenessField('المصدر', completeness.checks.source, completeness.checks.source ? 'هوية المصدر ظاهرة' : 'اسم المصدر غير متاح')}
          ${completenessField('وقت حركة السعر', completeness.checks.time, completeness.checks.time ? 'وقت سوق صالح وقابل للتتبع' : 'وقت السوق مفقود أو غير صالح')}
          ${completenessField('وقت رصد المصدر', completeness.checks.observation, completeness.checks.observation ? 'نبضة مصدر مستقلة وصالحة' : 'وقت الرصد مفقود أو غير صالح')}
        </ul>
        <aside class="smart-lens-analysis-status" aria-label="حالة جودة التحليل"><div><p class="smart-lens-eyebrow">ANALYSIS QUALITY</p><h4>جودة التحليل</h4></div><span>${analysis.state === 'REVIEW_READY' ? 'مكتملة للمراجعة' : 'غير محسوبة'}</span><p>${analysis.state === 'REVIEW_READY' ? 'اكتملت طبقات الدليل المطلوبة للمراجعة البشرية، من دون إصدار قرار آلي.' : 'هذه البطاقة تتحقق من قراءة السعر فقط، ولا تجمع وحدها سجلًا تاريخيًا وسيولة وأخبارًا ومخاطر تكفي لإنتاج تقييم تحليلي.'}</p><div class="smart-lens-analysis-lock ${analysis.state === 'REVIEW_READY' ? 'review-ready' : 'blocked'}"><b>بوابة التوصية: ${text(analysis.label)}</b><small>${analysis.availableCount} من ${analysis.total} أدلة تحليلية مكتملة</small><em>${text(analysis.reason)}</em></div></aside>
        <p class="smart-lens-completeness-disclaimer"><b>هذا فحص لنقل البيانات فقط.</b> لا يقيس قوة السهم أو احتمال الربح ولا يصدر توصية.</p>
      </section>
      <div class="smart-lens-grid">
        <section class="smart-lens-block smart-lens-trace"><h3>بيانات التتبع</h3><dl><div><dt>المصدر</dt><dd>${text(source)}</dd></div><div><dt>حالة المصدر</dt><dd>${text(health.sourceStatus)}</dd></div><div><dt>آخر حركة سعر</dt><dd><bdi dir="ltr">${text(marketUpdatedAt)}</bdi> · ${text(quoteAge)}</dd></div><div><dt>وقت رصد المصدر</dt><dd><bdi dir="ltr">${text(sourceObservedAt)}</bdi></dd></div><div><dt>الجلسة</dt><dd>${text(item?.sessionLabel || item?.session || 'غير محددة')}</dd></div></dl></section>
        <section class="smart-lens-block"><h3>الخطوة التالية</h3><p>${text(view.next)}</p><span class="smart-lens-next">${isFresh ? 'استكمال الأدلة التحليلية هو الخطوة التالية' : isDelayed ? 'انتظار قراءة لحظية هو الخطوة التالية' : isStale ? 'نجاح تحديث جديد هو الخطوة التالية' : 'اكتمال حقول القراءة هو الخطوة التالية'}</span></section>
      </div>
      ${scenarioControls()}
      <section class="smart-lens-review-gates" aria-label="فحوص اكتمال القراءة"><div class="smart-lens-journey-head"><h3>فحوص اكتمال القراءة</h3><span>تفسير للبيانات لا توصية</span></div><ul>${qualityChecks(item)}</ul></section>
      <section class="smart-lens-journey" aria-label="مسار حالة القراءة">
        <div class="smart-lens-journey-head"><h3>مسار حالة القراءة</h3><span>شرح الحالة لا توصية تنفيذ</span></div>
        <ol>
          ${stage('استلام السعر', numericPrice(item?.price) !== null ? 'complete' : 'attention', numericPrice(item?.price) === null)}
          ${stage('توثيق المصدر', String(item?.source || '').trim() ? 'complete' : 'pending', !String(item?.source || '').trim())}
          ${stage('توثيق وقت السوق', health.checks.time ? 'complete' : 'pending', !health.checks.time)}
          ${stage('اتصال المصدر', health.checks.observation && item?.error !== true && item?.fromSnapshot !== true && Number.isFinite(health.sourceAgeMs) && health.sourceAgeMs <= window.asiriQuoteDataHealth.LIMITS.sourceRecentMs ? 'complete' : 'pending', health.state === 'STALE')}
          ${stage('قراءة حديثة', isFresh ? 'ready' : health.state === 'DELAYED' ? 'attention' : 'pending', isFresh || health.state === 'DELAYED')}
        </ol>
      </section>
      <p class="smart-lens-safety"><b>حدود الأمان:</b> فحص جودة وشرح فقط · لا توصية · لا تنفيذ آلي · لا أمر وسيط.</p>`;
    lens.hidden = false;
    document.body.classList.add('smart-lens-open');
    lens.querySelector('.smart-lens-close')?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.smart-summary-btn');
    if (!trigger) return;
    event.preventDefault();
    openLens(trigger.dataset.symbol || trigger.getAttribute('data-symbol'), trigger);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLens();
  });

  const publicApi = Object.freeze({ open: openLens, close: closeLens });
  window.asiriQuoteQualityLens = publicApi;
  window.asiriSmartDecisionLens = publicApi; // Temporary compatibility alias for existing external consumers.
})();
