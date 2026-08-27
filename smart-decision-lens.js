/* ASIRI Smart Decision Lens — presentation-only layer for the live design workspace. */
(() => {
  'use strict';

  const LENS_ID = 'asiriSmartDecisionLens';
  const STALE_AFTER_MS = 15 * 60 * 1000;
  const $ = (selector, root = document) => root.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function money(value) {
    const parsed = number(value);
    return parsed == null ? '—' : `$${parsed.toFixed(2)}`;
  }

  function age(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp)) return 'وقت القراءة غير متاح';
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
    if (minutes < 1) return 'آخر قراءة الآن';
    if (minutes < 60) return `آخر قراءة منذ ${minutes} دقيقة`;
    if (minutes < 1_440) return `آخر قراءة منذ ${Math.floor(minutes / 60)} ساعة`;
    return `آخر قراءة منذ ${Math.floor(minutes / 1_440)} يوم`;
  }

  function quoteFor(symbol) {
    try {
      return typeof quotes !== 'undefined' && quotes?.get ? quotes.get(symbol) : null;
    } catch (_error) {
      return null;
    }
  }

  function isStale(quote) {
    const timestamp = Date.parse(quote?.updatedAt || '');
    return Number.isFinite(timestamp) && Date.now() - timestamp > STALE_AFTER_MS;
  }

  function buildState(quote) {
    if (!quote || quote.error || number(quote.price) == null) {
      return {
        key: 'unavailable', label: 'بانتظار قراءة موثقة', title: 'البيانات غير جاهزة للمراجعة',
        reason: 'لا توجد قراءة سعر صالحة مع مصدر ووقت يمكن الاعتماد عليهما داخل النسخة الحالية.',
        next: 'انتظر وصول تحديث موثق من محرك السوق.', stage: 0, confidence: 'غير متاح', tone: 'wait'
      };
    }
    const change = number(quote.changePercent) ?? 0;
    const volume = number(quote.volume) ?? 0;
    const averageVolume = number(quote.averageVolume) ?? 0;
    const rvol = averageVolume > 0 ? volume / averageVolume : null;
    if (isStale(quote)) {
      return {
        key: 'stale', label: 'القراءة تحتاج تحديثًا', title: 'لا تعتمد على القراءة كبيانات مباشرة',
        reason: 'القراءة متاحة، لكن عمرها يتجاوز نافذة المتابعة التصميمية. لا توصف كبث حي.',
        next: 'انتظر قراءة أحدث من المصدر المعلن قبل أي مراجعة.', stage: 1, confidence: 'معلّقة', tone: 'wait', rvol
      };
    }
    if (quote.isLiveSession !== true) {
      return {
        key: 'latest', label: 'قراءة موثقة خارج الجلسة', title: 'المتابعة مستمرة، لكن السوق ليس في جلسة حية',
        reason: 'السعر المعروض هو آخر قراءة موثقة متاحة. لا يعامل على أنه بث مباشر.',
        next: 'تُعاد المراجعة عند وصول جلسة أو قراءة أحدث.', stage: 1, confidence: 'موثق', tone: 'watch', rvol
      };
    }
    if (rvol != null && rvol >= 1.5 && change > 0) {
      return {
        key: 'review', label: 'جاهز للمراجعة البشرية', title: 'اكتملت إشارة المتابعة الأساسية',
        reason: 'القراءة حية، والحجم النسبي فوق الحد التصميمي، والحركة اليومية إيجابية. هذا ليس أمر شراء.',
        next: 'راجع التفاصيل والتحقق الداخلي قبل أي قرار يدوي.', stage: 3, confidence: 'قراءة حية', tone: 'ready', rvol
      };
    }
    if (rvol == null || rvol < 1.5) {
      return {
        key: 'watch', label: 'تحت المراقبة', title: 'البيانات موجودة لكن شرط النشاط لم يكتمل',
        reason: rvol == null ? 'قراءة الحجم النسبي غير متاحة بعد.' : `الحجم النسبي الحالي ${rvol.toFixed(2)}x، وهو دون حد المتابعة التصميمي 1.50x.`,
        next: 'انتظر ارتفاع الحجم النسبي إلى 1.50x على الأقل، ثم أعد المراجعة.', stage: 1, confidence: 'قراءة حية', tone: 'watch', rvol
      };
    }
    return {
      key: 'conditions', label: 'شروط المتابعة قيد التحقق', title: 'تحتاج الحركة إلى تأكيد إضافي',
      reason: 'النشاط متاح، لكن الحركة اليومية لا تؤكد مسار المتابعة بعد.',
      next: 'أعد المراجعة بعد تحقق الزخم وتأكيد المصدر.', stage: 2, confidence: 'قراءة حية', tone: 'watch', rvol
    };
  }

  function rail(stage) {
    const steps = [
      ['رُصدت', 'وُجد رمز للمتابعة'],
      ['مراقبة', 'ننتظر نشاطًا أو تحديثًا'],
      ['شروط مكتملة', 'القياسات الأساسية متاحة'],
      ['مراجعة بشرية', 'لا تنفيذ تلقائي']
    ];
    return `<ol class="adl-rail" aria-label="مسار متابعة السهم">${steps.map(([name, hint], index) => {
      const status = index < stage ? 'done' : index === stage ? 'current' : 'future';
      const tag = status === 'done' ? 'مكتملة' : status === 'current' ? 'الآن' : 'لاحقًا';
      return `<li data-state="${status}"><span>${index + 1}</span><div><b>${name}</b><small>${hint}</small><em>${tag}</em></div></li>`;
    }).join('')}</ol>`;
  }

  function ensureLens() {
    let lens = document.getElementById(LENS_ID);
    if (lens) return lens;
    lens = document.createElement('section');
    lens.id = LENS_ID;
    lens.className = 'asiri-decision-lens';
    lens.setAttribute('aria-hidden', 'true');
    lens.innerHTML = '<div class="adl-backdrop" data-adl-close></div><div class="adl-sheet" role="dialog" aria-modal="true" aria-labelledby="adl-title"></div>';
    lens.addEventListener('click', (event) => {
      if (event.target.closest('[data-adl-close]')) close();
    });
    document.body.appendChild(lens);
    return lens;
  }

  function close() {
    const lens = document.getElementById(LENS_ID);
    if (!lens) return;
    lens.classList.remove('is-open');
    lens.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('adl-open');
  }

  function render(symbol) {
    const lens = ensureLens();
    const quote = quoteFor(symbol);
    const state = buildState(quote);
    const change = number(quote?.changePercent);
    const quoteLabel = quote?.isLiveSession === true && !isStale(quote) ? 'LIVE · قراءة حية' : quote ? 'LATEST · آخر قراءة موثقة' : 'UNAVAILABLE · بانتظار المصدر';
    const quality = quote ? `${escapeHtml(quote?.source || 'المصدر المعلن')} · ${escapeHtml(age(quote?.updatedAt))}` : 'لا يوجد مصدر ووقت صالحان للعرض';
    const sheet = $('.adl-sheet', lens);
    sheet.dataset.tone = state.tone;
    sheet.innerHTML = `
      <header class="adl-head">
        <div><span class="adl-kicker">ASIRI · DECISION LENS</span><h2 id="adl-title">عدسة القرار الذكية</h2><p>${escapeHtml(symbol)} · ${escapeHtml(quote?.name || 'متابعة أصل')}</p></div>
        <button type="button" class="adl-close" data-adl-close aria-label="إغلاق العدسة">×</button>
      </header>
      <section class="adl-hero"><div><span class="adl-state">${escapeHtml(state.label)}</span><h3>${escapeHtml(state.title)}</h3><p>${escapeHtml(state.reason)}</p></div><div class="adl-price"><small>${escapeHtml(quoteLabel)}</small><strong>${money(quote?.price)}</strong><b class="${change != null && change < 0 ? 'is-negative' : 'is-positive'}">${change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</b></div></section>
      <section class="adl-trust"><div><span>ثقة البيانات</span><strong>${escapeHtml(state.confidence)}</strong></div><div><span>المصدر والوقت</span><strong>${quality}</strong></div><div><span>الحجم النسبي</span><strong>${state.rvol == null ? 'غير متاح' : `${state.rvol.toFixed(2)}x`}</strong></div></section>
      ${rail(state.stage)}
      <section class="adl-next"><span>ما الذي ننتظره الآن؟</span><strong>${escapeHtml(state.next)}</strong></section>
      <footer class="adl-footer"><span>قراءة وشرح فقط</span><span>مراجعة بشرية إلزامية</span><span>لا تنفيذ آلي</span></footer>`;
    lens.classList.add('is-open');
    lens.setAttribute('aria-hidden', 'false');
    document.body.classList.add('adl-open');
    $('.adl-close', lens)?.focus();
  }

  function symbolFromButton(button) {
    const title = button.getAttribute('title') || button.getAttribute('aria-label') || '';
    const fromTitle = title.match(/(?:لـ|for)\s*([A-Z0-9.\-]+)/i)?.[1];
    if (fromTitle) return fromTitle.toUpperCase();
    return $('.sym', button.closest('.stock'))?.textContent?.trim().toUpperCase() || '';
  }

  function isLensButton(button) {
    const text = `${button.getAttribute('title') || ''} ${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`;
    return /ملخص\s*ذكي|smart\s*summary/i.test(text);
  }

  let lastLensOpenAt = 0;
  function interceptLensTrigger(event) {
    const button = event.target.closest?.('button');
    if (!button || !isLensButton(button)) return;
    const symbol = symbolFromButton(button);
    if (!symbol) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = Date.now();
    if (now - lastLensOpenAt < 350) return;
    lastLensOpenAt = now;
    render(symbol);
  }

  document.addEventListener('pointerup', interceptLensTrigger, true);
  document.addEventListener('click', interceptLensTrigger, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
})();
