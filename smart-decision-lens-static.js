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
    stale: Object.freeze({
      label: 'قراءة متأخرة',
      description: 'محاكاة محلية: السعر والمصدر والوقت متاحة، لكن القراءة ليست حديثة؛ تُقيَّد الثقة تحت 40.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: '2026-08-28T08:00:00Z', updatedAt: null, observedAt: null, isFresh: false, error: false })
    }),
    failedSource: Object.freeze({
      label: 'فشل المصدر',
      description: 'محاكاة محلية: لا سعر ولا مصدر ولا وقت قابل للتحقق؛ تصبح القراءة غير متاحة.',
      item: Object.freeze({ price: null, source: null, time: null, updatedAt: null, observedAt: null, isFresh: false, error: true })
    }),
    incompleteEvidence: Object.freeze({
      label: 'أدلة غير مكتملة',
      description: 'محاكاة محلية: يوجد سعر ومصدر، لكن وقت القراءة مفقود؛ لذلك لا تُعرض كقراءة مكتملة.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: null, isFresh: true, error: false })
    }),
    completeEvidence: Object.freeze({
      label: 'قراءة مكتملة',
      description: 'محاكاة محلية: السعر والمصدر والوقت مكتملة وحديثة؛ يصلح السجل للعرض والمراجعة فقط.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: '2026-08-28T12:00:00Z', updatedAt: null, observedAt: null, isFresh: true, error: false })
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
    return { ...item, ...scenario.item, simulation: true };
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
    const priceAvailable = numericPrice(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const timeKnown = Number.isFinite(new Date(item?.time || item?.updatedAt || item?.observedAt || '').getTime());
    const complete = priceAvailable && sourceKnown && timeKnown;
    const fresh = complete && item?.isFresh === true && item?.error !== true;
    if (fresh) {
      return {
        state: 'FRESH', tone: 'ready', label: 'قراءة مكتملة وحديثة',
        reason: 'السعر والمصدر ووقت القراءة مكتملة، والخدمة تعلن أن القراءة حديثة بلا خطأ.',
        next: 'يمكن مراجعة السياق الفني والمصدر الأصلي؛ هذه الحالة لا تمثل توصية استثمارية.'
      };
    }
    if (complete) {
      return {
        state: 'CACHED', tone: 'cached', label: 'قراءة محفوظة تحتاج تحديثًا',
        reason: 'السعر والمصدر والوقت مكتملة، لكن القراءة ليست حديثة أو تعذر التحديث الأخير.',
        next: 'استخدمها كآخر قراءة ظاهرة فقط وانتظر تحديثًا موثقًا قبل الاعتماد على حداثتها.'
      };
    }
    return {
      state: 'UNAVAILABLE', tone: 'unavailable', label: 'بيانات غير مكتملة',
      reason: 'ينقص السعر أو المصدر أو وقت القراءة، لذلك لا توجد قراءة مكتملة قابلة للتحقق.',
      next: 'انتظر اكتمال السعر والمصدر والوقت من الخدمة ثم أعد فتح التفاصيل.'
    };
  }

  function dataCompleteness(item, view) {
    const priceAvailable = numericPrice(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const timeKnown = Number.isFinite(new Date(item?.time || item?.updatedAt || item?.observedAt || '').getTime());
    const checks = { price: priceAvailable, source: sourceKnown, time: timeKnown };
    const availableCount = Object.values(checks).filter(Boolean).length;
    const state = view?.state || dataView(item).state;
    if (state === 'FRESH') return {
      state, tone: 'ready', label: 'مكتملة الآن', summary: '3 حقول موثقة', availableCount, total: 3, checks,
      reason: 'السعر والمصدر ووقت القراءة متاحة، والخدمة تعلن أن القراءة حديثة.'
    };
    if (state === 'CACHED') return {
      state, tone: 'cached', label: 'مكتملة ومحفوظة', summary: '3 حقول متاحة', availableCount, total: 3, checks,
      reason: 'الحقول الأساسية مكتملة، لكن القراءة تحتاج تحديثًا قبل اعتبارها حديثة.'
    };
    return {
      state: 'UNAVAILABLE', tone: 'unavailable', label: 'غير مكتملة',
      summary: `${availableCount} من 3 حقول متاحة`, availableCount, total: 3, checks,
      reason: 'لا تُعرض قراءة موثقة حتى تكتمل حقول السعر والمصدر والوقت.'
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
    const priceAvailable = numericPrice(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const timeKnown = Number.isFinite(new Date(item?.time || item?.updatedAt || item?.observedAt || '').getTime());
    const noError = item?.error !== true;
    const complete = priceAvailable && sourceKnown && timeKnown;
    const fresh = complete && item?.isFresh === true && noError;
    const freshnessDetail = !complete
      ? 'لا يمكن تقييم الحداثة قبل اكتمال السعر والمصدر والوقت.'
      : !noError
        ? 'القراءة مكتملة، لكن التحديث الأخير تعذر.'
        : item?.isFresh !== true
          ? 'القراءة مكتملة، لكنها غير مصنفة كحديثة.'
          : 'قراءة مكتملة وحديثة بلا خطأ معلن.';
    return [
      gate('السعر', priceAvailable, priceAvailable ? 'قيمة رقمية متاحة.' : 'لا توجد قيمة سعر رقمية.'),
      gate('المصدر', sourceKnown, sourceKnown ? 'اسم المصدر ظاهر.' : 'المصدر غير متاح.'),
      gate('وقت القراءة', timeKnown, timeKnown ? 'وقت صالح وقابل للعرض.' : 'وقت القراءة مفقود أو غير صالح.'),
      gate('الحداثة', fresh, freshnessDetail)
    ].join('');
  }

  function scenarioControls() {
    const current = scenarioFor(activeScenario);
    const controls = Object.entries(SCENARIOS).map(([key, scenario]) => `<button type="button" data-lens-scenario="${key}" aria-pressed="${key === activeScenario ? 'true' : 'false'}">${text(scenario.label)}</button>`).join('');
    return `<section class="smart-lens-simulator" aria-label="مختبر حالات جودة القراءة"><div class="smart-lens-simulator-head"><div><p class="smart-lens-eyebrow">DATA QUALITY SCENARIOS · LOCAL ONLY</p><h3>مختبر حالات جودة القراءة</h3></div><span>محاكاة محلية</span></div><p>تغيّر هذه الأزرار ما يظهر داخل النافذة فقط؛ لا تُعدّل بيانات السوق أو حالة السهم أو التنبيهات.</p><div class="smart-lens-scenario-buttons" role="group" aria-label="اختر حالة بيانات محاكية">${controls}</div><p class="smart-lens-scenario-note"><b>${text(current.label)}:</b> ${text(current.description)}</p></section>`;
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
        activeScenario = scenarioButton.dataset.lensScenario in SCENARIOS ? scenarioButton.dataset.lensScenario : 'current';
        renderLens(lens.dataset.symbol || '');
        lens.querySelector(`[data-lens-scenario="${activeScenario}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('[data-lens-close="true"]')) closeLens();
    });
    lens.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...lens.querySelectorAll('button:not([disabled]), summary')].filter((element) => element.getAttribute('aria-hidden') !== 'true');
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
    const completeness = dataCompleteness(item, view);
    const source = safe(item?.source, 'غير متاح');
    const observedAt = readingTime(item?.time || item?.updatedAt || item?.observedAt);
    const price = numericPrice(item?.price);
    const priceDisplay = view.state === 'UNAVAILABLE' || price === null ? 'غير متاح' : `$${price.toFixed(2)}`;
    const isFresh = view.state === 'FRESH';
    const isCached = view.state === 'CACHED';

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
          ${completenessField('وقت القراءة', completeness.checks.time, completeness.checks.time ? 'وقت صالح وقابل للتتبع' : 'وقت القراءة مفقود')}
        </ul>
        <aside class="smart-lens-analysis-status" aria-label="حالة جودة التحليل"><div><p class="smart-lens-eyebrow">ANALYSIS QUALITY</p><h4>جودة التحليل</h4></div><span>غير محسوبة</span><p>تحتاج سجلًا سعريًا وسيولة ومؤشرات فنية وأخبارًا ومخاطر؛ لذلك لا نعرض درجة تقديرية من بيانات السعر وحدها.</p></aside>
        <p class="smart-lens-completeness-disclaimer"><b>هذا فحص لنقل البيانات فقط.</b> لا يقيس قوة السهم أو احتمال الربح ولا يصدر توصية.</p>
      </section>
      <div class="smart-lens-grid">
        <section class="smart-lens-block"><h3>ثقة البيانات</h3><dl><div><dt>المصدر</dt><dd>${text(source)}</dd></div><div><dt>وقت القراءة</dt><dd>${text(observedAt)}</dd></div><div><dt>الحالة</dt><dd>${view.state === 'FRESH' ? 'موثقة الآن' : view.state === 'CACHED' ? 'آخر قراءة' : 'غير متاحة'}</dd></div></dl></section>
        <section class="smart-lens-block"><h3>الخطوة التالية</h3><p>${text(view.next)}</p><span class="smart-lens-next">${isFresh ? 'مراجعة المصدر والسياق هي الخطوة التالية' : isCached ? 'التحديث الموثق هو الخطوة التالية' : 'اكتمال حقول القراءة هو الخطوة التالية'}</span></section>
      </div>
      ${scenarioControls()}
      <section class="smart-lens-review-gates" aria-label="فحوص اكتمال القراءة"><div class="smart-lens-journey-head"><h3>فحوص اكتمال القراءة</h3><span>تفسير للبيانات لا توصية</span></div><ul>${qualityChecks(item)}</ul></section>
      <section class="smart-lens-journey" aria-label="مسار حالة القراءة">
        <div class="smart-lens-journey-head"><h3>مسار حالة القراءة</h3><span>شرح الحالة لا توصية تنفيذ</span></div>
        <ol>
          ${stage('استلام السعر', numericPrice(item?.price) !== null ? 'complete' : 'attention', numericPrice(item?.price) === null)}
          ${stage('توثيق المصدر', String(item?.source || '').trim() ? 'complete' : 'pending', !String(item?.source || '').trim())}
          ${stage('توثيق الوقت', readingTime(item?.time || item?.updatedAt || item?.observedAt) !== 'غير متاح' ? 'complete' : 'pending', readingTime(item?.time || item?.updatedAt || item?.observedAt) === 'غير متاح')}
          ${stage('قراءة حديثة', isFresh ? 'ready' : 'pending', isFresh)}
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
