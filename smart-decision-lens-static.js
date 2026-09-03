/* ASIRI Smart Decision Lens · static v27 UI layer · local, explainable and read-only. */
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
    return Number.isFinite(number) ? number : null;
  }
  const SCENARIOS = Object.freeze({
    current: Object.freeze({
      label: 'القراءة الحالية',
      description: 'تعرض بيانات البطاقة الحالية كما هي، من دون أي محاكاة.'
    }),
    stale: Object.freeze({
      label: 'قراءة متأخرة',
      description: 'محاكاة محلية: المصدر معروف، لكن القراءة متأخرة؛ تُقيَّد الثقة تحت 39 ولا تصلح للمراجعة.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: '2026-08-28T08:00:00Z', isFresh: false, decision: 'BUY', error: false })
    }),
    failedSource: Object.freeze({
      label: 'فشل المصدر',
      description: 'محاكاة محلية: لا سعر موثّق ولا وقت قراءة؛ تتوقف بوابات المراجعة وتصبح الثقة صفرًا.',
      item: Object.freeze({ price: null, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: null, isFresh: false, decision: 'WAIT', error: true })
    }),
    gatesPending: Object.freeze({
      label: 'بوابات غير مكتملة',
      description: 'محاكاة محلية: البيانات قوية وحديثة، لكن حالة المراجعة لم تكتمل؛ لا تتحول إلى جاهز للمراجعة.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: '2026-08-28T12:00:00Z', isFresh: true, decision: 'WAIT', error: false })
    }),
    reviewReady: Object.freeze({
      label: 'جاهز للمراجعة',
      description: 'محاكاة محلية: اكتملت بيانات وبوابات القراءة؛ تبقى المراجعة البشرية إلزامية ولا يُنشأ أي إجراء.',
      item: Object.freeze({ price: 2.26, source: 'Asiri Market Engine — محاكاة', time: null, updatedAt: null, observedAt: '2026-08-28T12:00:00Z', isFresh: true, decision: 'BUY', error: false })
    })
  });
  let activeScenario = 'current';

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
      isFresh: /موثق الآن/.test(row?.textContent || ''),
      decision: /شراء/.test(row?.textContent || '') ? 'BUY' : 'WAIT'
    };
  }

  function readingTime(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'غير متاح' : date.toLocaleString('ar-SA');
  }

  function decisionView(item) {
    const fresh = item?.isFresh === true;
    const readyForReview = fresh && String(item?.decision || '').toUpperCase() === 'BUY';
    if (readyForReview) {
      return {
        tone: 'ready', label: 'جاهز للمراجعة البشرية',
        reason: 'تمت الإشارة إلى اكتمال حالة المتابعة، لكن القرار يحتاج تحققًا بشريًا مستقلاً قبل أي إجراء خارج المنصة.',
        next: 'تحقق من المصدر، وقت القراءة، والضوابط الاستثمارية قبل اتخاذ قرار يدوي.'
      };
    }
    if (!fresh) {
      return {
        tone: 'attention', label: 'القراءة بحاجة تحديث',
        reason: 'لا تُعامل القراءة المتأخرة كبث مباشر أو كأساس لمراجعة قرار جديد.',
        next: 'انتظر وصول قراءة موثقة وحديثة ثم افتح العدسة من جديد.'
      };
    }
    return {
      tone: 'watch', label: 'تحت المراقبة',
      reason: 'السعر موثق، لكن بوابات المراجعة لا تزال غير مكتملة؛ لا يعرض النظام توصية تنفيذية.',
      next: 'استكمل حداثة السجل الفني والأدلة المطلوبة قبل رفع الحالة إلى مراجعة بشرية.'
    };
  }

  function evidenceConfidence(item, view) {
    const priceAvailable = numericPrice(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const timeKnown = Boolean(String(item?.time || item?.updatedAt || item?.observedAt || '').trim());
    const fresh = item?.isFresh === true;
    const noError = item?.error !== true;
    const ready = view?.tone === 'ready';
    const components = {
      freshness: fresh ? 30 : 0,
      completeness: (priceAvailable ? 8 : 0) + (sourceKnown ? 6 : 0) + (timeKnown ? 3 : 0) + (noError ? 3 : 0),
      consistency: fresh && noError ? 20 : 0,
      reviewGates: ready ? 15 : 0,
      stability: fresh && noError ? 10 : 0,
      reviewability: fresh && priceAvailable ? 5 : 0
    };
    const rawScore = Object.values(components).reduce((total, value) => total + value, 0);
    const score = item?.error === true ? 0 : (fresh ? rawScore : Math.min(rawScore, 39));
    let band = 'UNAVAILABLE';
    let label = 'لا تعتمد القراءة الآن';
    let reason = 'الثقة غير مكتملة لأن القراءة لا تحمل أدلة موثقة وحديثة كافية.';
    if (ready && score >= 85) {
      band = 'REVIEWABLE';
      label = 'أدلة قوية للمراجعة';
      reason = 'جودة الأدلة مرتفعة، لكن المراجعة البشرية تبقى إلزامية قبل أي قرار يدوي.';
    } else if (score >= 85) {
      band = 'STRONG_INCOMPLETE';
      label = 'أدلة قوية لكن غير مكتملة';
      reason = 'جودة القراءة مرتفعة، لكن بوابة المراجعة الحالية لم تكتمل بعد.';
    } else if (score >= 65) {
      band = 'MONITORED';
      label = 'مراقبة موثوقة';
      reason = 'تتوفر أدلة مناسبة للمتابعة، لكنها لا تكفي وحدها لتغيير حالة السهم.';
    } else if (score >= 40) {
      band = 'PARTIAL';
      label = 'أدلة جزئية';
      reason = 'توجد معلومات قابلة للعرض، لكن جودة الأدلة لا تكفي لمراجعة قرار جديد.';
    }
    return { score, band, label, reason, components, isCalibrated: false };
  }

  function confidenceLine(label, score, max, detail) {
    return `<li><span>${text(label)}</span><strong>${score} / ${max}</strong><small>${text(detail)}</small></li>`;
  }

  function stage(label, state, current) {
    return `<li class="lens-stage ${state}${current ? ' is-current' : ''}"><span class="lens-stage-dot" aria-hidden="true"></span><span>${text(label)}</span></li>`;
  }

  function gate(label, passed, detail, required = true) {
    const state = passed ? 'passed' : (required ? 'blocked' : 'required');
    const marker = passed ? 'مكتمل' : (required ? 'غير مكتمل' : 'مراجعة بشرية');
    return `<li class="smart-lens-gate ${state}"><span aria-hidden="true">${passed ? '✓' : required ? '!' : '•'}</span><div><b>${text(label)}</b><small>${text(detail)}</small></div><em>${marker}</em></li>`;
  }

  function reviewGates(item, view) {
    const priceAvailable = numericPrice(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const fresh = item?.isFresh === true;
    const noError = item?.error !== true;
    const ready = view?.tone === 'ready';
    return [
      gate('حداثة القراءة', fresh, fresh ? 'القراءة معلنة كحديثة.' : 'القراءة متأخرة أو غير متاحة.'),
      gate('قابلية التحقق', priceAvailable && sourceKnown && noError, priceAvailable && sourceKnown && noError ? 'السعر والمصدر متاحان للعرض.' : 'السعر أو المصدر أو سلامة القراءة غير مكتملة.'),
      gate('بوابات المراجعة', ready, ready ? 'اكتملت شروط الرفع للمراجع البشري.' : 'لا تُرفع الحالة قبل اكتمال الحكم القائم.'),
      gate('قرار المراجع', false, 'هذه البوابة لا تُحاكى ولا تُتخذ من داخل العدسة.', false)
    ].join('');
  }

  function scenarioControls() {
    const current = scenarioFor(activeScenario);
    const controls = Object.entries(SCENARIOS).map(([key, scenario]) => `<button type="button" data-lens-scenario="${key}" aria-pressed="${key === activeScenario ? 'true' : 'false'}">${text(scenario.label)}</button>`).join('');
    return `<section class="smart-lens-simulator" aria-label="مختبر سيناريوهات الثقة"><div class="smart-lens-simulator-head"><div><p class="smart-lens-eyebrow">TEST SCENARIOS · LOCAL ONLY</p><h3>مختبر سيناريوهات الثقة</h3></div><span>محاكاة محلية</span></div><p>تغيّر هذه الأزرار ما يظهر داخل العدسة فقط؛ لا تُعدّل بيانات السوق أو حالة السهم أو التنبيهات.</p><div class="smart-lens-scenario-buttons" role="group" aria-label="اختر سيناريو محاكاة">${controls}</div><p class="smart-lens-scenario-note"><b>${text(current.label)}:</b> ${text(current.description)}</p></section>`;
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
            <p class="smart-lens-kicker">DECISION LENS · READ ONLY</p>
            <h2 id="smart-lens-title">عدسة القرار الذكية</h2>
          </div>
          <button type="button" class="smart-lens-close" data-lens-close="true" aria-label="إغلاق عدسة القرار">إغلاق</button>
        </header>
        <div class="smart-lens-content" id="smart-lens-content"></div>
      </article>`;
    lens.addEventListener('click', (event) => {
      const scenarioButton = event.target.closest('[data-lens-scenario]');
      if (scenarioButton) {
        activeScenario = scenarioButton.dataset.lensScenario in SCENARIOS ? scenarioButton.dataset.lensScenario : 'current';
        renderLens(lens.dataset.symbol || '');
        return;
      }
      if (event.target.closest('[data-lens-close="true"]')) closeLens();
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
  }

  function openLens(symbol) {
    activeScenario = 'current';
    renderLens(symbol);
  }

  function renderLens(symbol) {
    const normalized = safe(symbol, '').toUpperCase();
    if (!normalized) return;
    const lens = lensRoot();
    lens.dataset.symbol = normalized;
    const item = scenarioItem(marketItem(normalized));
    const view = decisionView(item);
    const confidence = evidenceConfidence(item, view);
    const source = safe(item?.source, 'غير متاح');
    const observedAt = readingTime(item?.time || item?.updatedAt || item?.observedAt);
    const price = numericPrice(item?.price);
    const priceDisplay = price === null ? 'بانتظار قراءة موثقة' : `$${price.toFixed(2)}`;
    const isReady = view.tone === 'ready';
    const isAttention = view.tone === 'attention';

    const content = lens.querySelector('#smart-lens-content');
    content.innerHTML = `
      <div class="smart-lens-symbol-row">
        <div><span class="smart-lens-symbol">${text(normalized)}</span><span class="smart-lens-price">${text(priceDisplay)}</span></div>
        <span class="smart-lens-state ${view.tone}">${text(view.label)}</span>
      </div>
      <p class="smart-lens-local-note">قراءة تفسيرية محلية من البيانات الظاهرة · لا تستخدم نموذج ذكاء اصطناعي ولا تجري اتصالًا شبكيًا.</p>
      <section class="smart-lens-primary" aria-label="حالة القرار">
        <p class="smart-lens-eyebrow">الحالة الآن</p>
        <h3>${text(view.label)}</h3>
        <p>${text(view.reason)}</p>
      </section>
      <section class="smart-lens-confidence ${confidence.band.toLowerCase()}" aria-label="مؤشر ثقة الأدلة">
        <div class="smart-lens-confidence-head"><div><p class="smart-lens-eyebrow">EVIDENCE CONFIDENCE · EXPLAINABLE</p><h3>مؤشر ثقة الأدلة</h3></div><div class="smart-lens-score"><strong>${confidence.score}</strong><span>/ 100</span></div></div>
        <div class="smart-lens-meter" role="progressbar" aria-label="درجة ثقة الأدلة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${confidence.score}"><span style="width:${confidence.score}%"></span></div>
        <p class="smart-lens-confidence-label">${text(confidence.label)}</p><p class="smart-lens-confidence-reason">${text(confidence.reason)}</p>
        <details class="smart-lens-confidence-details"><summary>عرض مكوّنات الدرجة</summary><ul>
          ${confidenceLine('حداثة القراءة', confidence.components.freshness, 30, item?.isFresh === true ? 'المصدر والقراءة معلنان كحديثين.' : 'القراءة المتأخرة لا تمنح نقاط حداثة.')}
          ${confidenceLine('اكتمال الأدلة', confidence.components.completeness, 20, 'سعر ومصدر ووقت وحالة قراءة متاحة.')}
          ${confidenceLine('اتساق القراءة', confidence.components.consistency, 20, 'لا تُمنح النقاط إلا للقراءة الحديثة الخالية من خطأ معلن.')}
          ${confidenceLine('بوابات المراجعة', confidence.components.reviewGates, 15, 'لا تُمنح إلا عند حالة جاهز للمراجعة البشرية.')}
          ${confidenceLine('استقرار القراءة', confidence.components.stability, 10, 'مؤشر عرضي لسلامة القراءة الحالية، لا توقع للسعر.')}
          ${confidenceLine('قابلية المراجعة', confidence.components.reviewability, 5, 'قراءة حديثة مع سعر قابل للتحقق.')}
        </ul></details>
        <p class="smart-lens-confidence-disclaimer">مقياس لجودة الأدلة الحالية فقط · <b>ليس احتمال ربح</b> · المعايرة الإحصائية غير مفعّلة.</p>
      </section>
      <div class="smart-lens-grid">
        <section class="smart-lens-block"><h3>ثقة البيانات</h3><dl><div><dt>المصدر</dt><dd>${text(source)}</dd></div><div><dt>وقت القراءة</dt><dd>${text(observedAt)}</dd></div><div><dt>الحالة</dt><dd>${item?.isFresh === true ? 'موثقة الآن' : 'تحتاج تحديثًا'}</dd></div></dl></section>
        <section class="smart-lens-block"><h3>ما الذي ننتظره؟</h3><p>${text(view.next)}</p><span class="smart-lens-next">${isReady ? 'المراجعة البشرية هي الخطوة التالية' : isAttention ? 'التحديث الموثق هو الخطوة التالية' : 'اكتمال بوابات المراجعة هو الخطوة التالية'}</span></section>
      </div>
      ${scenarioControls()}
      <section class="smart-lens-review-gates" aria-label="بوابات المراجعة"><div class="smart-lens-journey-head"><h3>بوابات المراجعة</h3><span>تفسير للحالة لا إنشاء لقرار</span></div><ul>${reviewGates(item, view)}</ul></section>
      <section class="smart-lens-journey" aria-label="رحلة السهم">
        <div class="smart-lens-journey-head"><h3>رحلة السهم</h3><span>شرح الحالة لا توصية تنفيذ</span></div>
        <ol>
          ${stage('رصد القراءة', item?.isFresh === true ? 'complete' : 'attention', item?.isFresh !== true)}
          ${stage('تحت المراقبة', isReady ? 'complete' : 'watch', !isReady && !isAttention)}
          ${stage('اكتمال البوابات', isReady ? 'complete' : 'pending', false)}
          ${stage('مراجعة بشرية', isReady ? 'ready' : 'pending', isReady)}
        </ol>
      </section>
      <p class="smart-lens-safety"><b>حدود الأمان:</b> قراءة وشرح فقط · لا تنفيذ آلي · لا أمر وسيط · المراجعة البشرية إلزامية.</p>`;
    lens.hidden = false;
    document.body.classList.add('smart-lens-open');
    lens.querySelector('.smart-lens-close')?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('.smart-summary-btn');
    if (!trigger) return;
    event.preventDefault();
    openLens(trigger.dataset.symbol || trigger.getAttribute('data-symbol'));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLens();
  });

  window.asiriSmartDecisionLens = Object.freeze({ open: openLens, close: closeLens });
})();
