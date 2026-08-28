/* ASIRI Smart Decision Lens · static v27 UI layer · read-only. */
(() => {
  'use strict';

  const LENS_ID = 'asiri-smart-decision-lens-static';
  const safe = (value, fallback = '—') => String(value ?? '').trim() || fallback;
  const text = (value) => String(value ?? '').replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[char]));

  function marketItem(symbol) {
    try {
      if (typeof stockMarketData !== 'undefined' && stockMarketData?.[symbol]) return stockMarketData[symbol];
    } catch (_) { /* Use DOM fallback when the host keeps data private. */ }
    const row = document.getElementById(`row-${symbol}`);
    return {
      symbol,
      price: row?.querySelector('.stock-col-price')?.textContent?.trim() || null,
      source: row?.querySelector('.stock-col-name .name')?.textContent?.trim() || 'Asiri Market Engine',
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

  function stage(label, state, current) {
    return `<li class="lens-stage ${state}${current ? ' is-current' : ''}"><span class="lens-stage-dot" aria-hidden="true"></span><span>${text(label)}</span></li>`;
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
    const normalized = safe(symbol, '').toUpperCase();
    if (!normalized) return;
    const lens = lensRoot();
    const item = marketItem(normalized);
    const view = decisionView(item);
    const source = safe(item?.source, 'Asiri Market Engine');
    const observedAt = readingTime(item?.time || item?.updatedAt || item?.observedAt);
    const price = Number(item?.price);
    const priceDisplay = Number.isFinite(price) ? `$${price.toFixed(2)}` : safe(item?.price, 'بانتظار قراءة موثقة');
    const isReady = view.tone === 'ready';
    const isAttention = view.tone === 'attention';

    const content = lens.querySelector('#smart-lens-content');
    content.innerHTML = `
      <div class="smart-lens-symbol-row">
        <div><span class="smart-lens-symbol">${text(normalized)}</span><span class="smart-lens-price">${text(priceDisplay)}</span></div>
        <span class="smart-lens-state ${view.tone}">${text(view.label)}</span>
      </div>
      <section class="smart-lens-primary" aria-label="حالة القرار">
        <p class="smart-lens-eyebrow">الحالة الآن</p>
        <h3>${text(view.label)}</h3>
        <p>${text(view.reason)}</p>
      </section>
      <div class="smart-lens-grid">
        <section class="smart-lens-block"><h3>ثقة البيانات</h3><dl><div><dt>المصدر</dt><dd>${text(source)}</dd></div><div><dt>وقت القراءة</dt><dd>${text(observedAt)}</dd></div><div><dt>الحالة</dt><dd>${item?.isFresh === true ? 'موثقة الآن' : 'تحتاج تحديثًا'}</dd></div></dl></section>
        <section class="smart-lens-block"><h3>ما الذي ننتظره؟</h3><p>${text(view.next)}</p><span class="smart-lens-next">${isReady ? 'المراجعة البشرية هي الخطوة التالية' : isAttention ? 'التحديث الموثق هو الخطوة التالية' : 'اكتمال بوابات المراجعة هو الخطوة التالية'}</span></section>
      </div>
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
    event.stopImmediatePropagation();
    openLens(trigger.dataset.symbol || trigger.getAttribute('data-symbol'));
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLens();
  });

  window.asiriSmartDecisionLens = Object.freeze({ open: openLens, close: closeLens });
})();
