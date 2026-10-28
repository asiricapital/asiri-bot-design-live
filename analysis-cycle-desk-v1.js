/* ASIRI ANALYSIS CYCLE DESK V1 · multi-source read-only -> analysis -> paper plan -> paper run. */
(() => {
  'use strict';
  const MARKET_API_BASE = 'https://asiri-bot.onrender.com';
  const TICKET_KEY = 'asiri.order-readiness.paper-tickets.v1';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const priceOf = (q) => Number(q?.mid ?? q?.last ?? q?.price ?? q?.ask ?? q?.bid);
  const state = { quotes: [], symbol: '', observedAt: null, provider: '', analysisDone: false, paperDone: false };
  const providerLabel = (q) => { const p = String(q?.provider || q?.providerName || state.provider || '').toLowerCase(); return p === 'finnhub' ? 'Finnhub' : p === 'yahoo' ? 'Yahoo' : p === 'twelve' ? 'Twelve Data' : p === 'alpha' ? 'Alpha Vantage' : p.includes('saxo') ? 'Saxo' : state.provider || 'المصدر الموثق'; };
  const quoteStatus = (q) => String(q?.status || '').toUpperCase();
  const liveQuote = () => state.quotes.find((q) => Number.isFinite(priceOf(q)) && ['LIVE','DELAYED'].includes(quoteStatus(q))) || null;
  const symbolsForDirectRead = () => {
    const fromRows = [...document.querySelectorAll('#stocks-list-wrapper .stock-row')]
      .map((row) => String(row.dataset.symbol || row.id.replace(/^row-/, '')).trim().toUpperCase()).filter(Boolean);
    const fromOrderDesk = [...document.querySelectorAll('#ordSymbol option')]
      .map((option) => String(option.value || '').trim().toUpperCase()).filter(Boolean);
    return [...new Set([...fromRows, ...fromOrderDesk])].slice(0, 25);
  };
  async function refreshDirectQuote() {
    const symbols = symbolsForDirectRead();
    if (!symbols.length) return false;
    const response = await fetch(`${MARKET_API_BASE}/api/market-data?symbols=${encodeURIComponent(symbols.join(','))}&force=1`, { cache: 'no-store', headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || `تعذر جلب قراءة السوق (${response.status})`);
    state.quotes = payload.rows.map((row) => ({ ...row, status: row.isFresh === true ? 'LIVE' : row.dataQuality === 'STALE_TRUSTED' ? 'STALE' : 'DELAYED', providerName: row.provider, readOnly: true, paperOnly: true, executionAllowed: false, tradingEnabled: false }));
    state.provider = 'Asiri Multi-Source';
    state.observedAt = payload.updatedAt || new Date().toISOString();
    state.symbol = liveQuote()?.symbol || state.symbol;
    render();
    return true;
  }
  const tickets = () => { try { const x = JSON.parse(localStorage.getItem(TICKET_KEY) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  function findButton(text) { return [...document.querySelectorAll('button')].find((b) => String(b.textContent || '').trim().includes(text)); }
  function ensurePanel() {
    if ($('analysis-cycle-desk-v1')) return;
    const anchor = document.querySelector('.decision-mission-control') || document.querySelector('.command-center-strip');
    if (!anchor?.parentNode) return;
    const panel = document.createElement('section'); panel.id = 'analysis-cycle-desk-v1'; panel.className = 'analysis-cycle-desk';
    panel.innerHTML = `<div class="acd-shell"><div class="acd-head"><div><span class="acd-kicker">ASIRI DAILY ANALYSIS CYCLE · V1</span><h2>الدورة العملية من السعر إلى الخطة</h2><p>مسار واحد واضح: اقرأ السعر الموثق من Saxo أو Finnhub، افهم التحليل، جهّز خطة ورقية، ثم اختبرها في المحاكاة.</p></div><span class="acd-mode">قراءة وتحليل ورقي فقط</span></div><div class="acd-body"><section class="acd-next"><h3>ما الخطوة التالية؟</h3><div id="acdNext" class="acd-next-card">بانتظار قراءة مصدر موثق…</div><div id="acdQuote" class="acd-quote"><span class="acd-symbol">—</span><span class="acd-price">—</span><span class="acd-status warn">لم تصل بيانات بعد</span></div></section><section class="acd-steps" aria-label="مراحل دورة التحليل"><div class="acd-step current" data-acd-step="quote"><b>1. السعر <i>●</i></b><span>قراءة حديثة ومصدرها ظاهر</span></div><div class="acd-step" data-acd-step="analysis"><b>2. التحليل <i>○</i></b><span>RSI، الاتجاه، والسياق</span></div><div class="acd-step" data-acd-step="plan"><b>3. الخطة <i>○</i></b><span>وقف، هدف، ومخاطرة</span></div><div class="acd-step" data-acd-step="paper"><b>4. المحاكاة <i>○</i></b><span>اختبار بلا أموال حقيقية</span></div></section></div><div class="acd-actions"><button id="acdRefresh" class="primary" type="button">تحديث الأسعار</button><button id="acdAnalyze" class="secondary" type="button" disabled>افتح تحليل الأصل</button><button id="acdPlan" class="secondary" type="button" disabled>جهّز خطة ورقية</button><button id="acdRun" class="secondary" type="button">شغّل المحاكاة</button></div><div id="acdNote" class="acd-note"><strong>تنبيه مهم:</strong> لا يُنشئ هذا المركز أمرًا ولا يرسل شيئًا إلى Saxo. عند غياب السعر أو قدمه، يتوقف المسار تلقائيًا.</div></div>`;
    anchor.parentNode.insertBefore(panel, anchor);
    bind(); render();
  }
  function setStep(name, done, current = false) { const node = document.querySelector(`[data-acd-step="${name}"]`); if (!node) return; node.classList.toggle('done', done); node.classList.toggle('current', current); const mark = node.querySelector('i'); if (mark) mark.textContent = done ? '✓' : current ? '●' : '○'; }
  function render() {
    const q = liveQuote(); const status = q ? quoteStatus(q) : 'UNAVAILABLE'; const p = q ? priceOf(q) : NaN; const symbol = q?.symbol || state.symbol || '—';
    const source = providerLabel(q); const quote = $('acdQuote'); if (quote) quote.innerHTML = `<span class="acd-symbol">${esc(symbol)}</span><span class="acd-price">${Number.isFinite(p) ? `$${p.toFixed(4)}` : '—'}</span><span class="acd-status ${q ? '' : 'warn'}">${q ? `${esc(source)} ${esc(status)} · ${state.observedAt ? new Date(state.observedAt).toLocaleTimeString('ar-SA') : 'الوقت غير متاح'}` : 'السعر غير متاح'}</span>`;
    const next = $('acdNext'); const note = $('acdNote'); const hasTicket = tickets().length > 0;
    if (!q) { next.innerHTML = '<b>ابدأ بتحديث الأسعار</b><br><span>سنحاول Saxo أولًا ثم Finnhub والمصادر البديلة قبل الانتقال للتحليل.</span>'; note.innerHTML = '<strong>البيانات غير جاهزة:</strong> لم تصل قراءة موثقة من أي مصدر؛ لا نعرض سعرًا قديمًا كسعر حي.'; }
    else if (!state.analysisDone) { next.innerHTML = `<b>حلّل ${esc(symbol)} الآن</b><br><span>وصل سعر ${esc(status)} من ${esc(source)}؛ اضغط «افتح تحليل الأصل» لمراجعة السياق الفني قبل الخطة.</span>`; note.innerHTML = '<strong>الخطوة الآمنة:</strong> التحليل قراءة فقط، ولا يعني وجوده توصية شراء.'; }
    else if (!hasTicket) { next.innerHTML = '<b>حوّل التحليل إلى خطة ورقية</b><br><span>أدخل أو راجع وقف الخسارة والهدف، ثم شغّل فحص المخاطرة.</span>'; note.innerHTML = '<strong>الخطة الورقية:</strong> الكمية تُحسب من رأس المال ونسبة المخاطرة، ولا تُرسل إلى الوسيط.'; }
    else { next.innerHTML = '<b>شغّل دورة المحاكاة</b><br><span>تم حفظ تذكرة ورقية على هذا الجهاز. حدّث المحاكاة لرؤية أثر القواعد والرسوم.</span>'; note.innerHTML = '<strong>الحالة:</strong> توجد تذكرة ورقية محفوظة؛ راقب الربح والتراجع وعدد الصفقات قبل أي استنتاج.'; }
    $('acdAnalyze')?.toggleAttribute('disabled', !q); $('acdPlan')?.toggleAttribute('disabled', !q); $('acdRun')?.toggleAttribute('disabled', false);
    setStep('quote', Boolean(q), !q); setStep('analysis', state.analysisDone, Boolean(q) && !state.analysisDone); setStep('plan', hasTicket, Boolean(q) && state.analysisDone && !hasTicket); setStep('paper', state.paperDone, Boolean(q) && hasTicket && !state.paperDone);
  }
  function refresh() { const button = findButton('تحديث الآن'); if (button && button.id !== 'acdRefresh') button.click(); const own = findButton('تحديث قائمة المراقبة'); if (own && own.id !== 'acdRefresh') own.click(); window.asiriSaxoWatchlistUI?.refresh?.(); refreshDirectQuote().catch(() => {}); $('acdNote').textContent = 'جاري طلب قراءة جديدة من Saxo ثم Finnhub عند الحاجة…'; }
  function openAnalysis() { const q = liveQuote(); if (!q) return; state.symbol = String(q.symbol || '').toUpperCase(); const select = $('technicals-symbol'); if (select) { select.value = state.symbol; } if (typeof window.switchMainTab === 'function') window.switchMainTab('technicals'); if (typeof window.refreshTechnicalAnalysis === 'function') window.refreshTechnicalAnalysis(); state.analysisDone = true; render(); document.getElementById('sec-technicals')?.scrollIntoView({ behavior:'smooth', block:'start' }); }
  function openPlan() { const q = liveQuote(); if (!q) return; state.symbol = String(q.symbol || '').toUpperCase(); const desk = $('order-readiness-desk-v1'); desk?.scrollIntoView({ behavior:'smooth', block:'start' }); const select = $('ordSymbol'); if (select && [...select.options].some((o) => o.value === state.symbol)) select.value = state.symbol; $('ordUseQuote')?.click(); }
  function runPaper() { const run = $('paper-lab-run'); if (run) { run.click(); state.paperDone = true; render(); document.querySelector('.paper-lab-card')?.scrollIntoView({ behavior:'smooth', block:'start' }); } else { $('acdNote').textContent = 'لم يظهر زر المحاكاة بعد؛ مرّر إلى مختبر التداول التجريبي ثم حدّث الصفحة.'; } }
  function bind() { $('acdRefresh')?.addEventListener('click', refresh); $('acdAnalyze')?.addEventListener('click', openAnalysis); $('acdPlan')?.addEventListener('click', openPlan); $('acdRun')?.addEventListener('click', runPaper); window.addEventListener('asiri:saxo-watchlist-quotes', (event) => { state.quotes = Array.isArray(event.detail?.quotes) ? event.detail.quotes : []; state.provider = event.detail?.provider || ''; state.observedAt = event.detail?.observedAt || new Date().toISOString(); state.symbol = liveQuote()?.symbol || state.symbol; render(); }); window.addEventListener('storage', render); }
  function init() { ensurePanel(); window.setTimeout(() => { render(); refreshDirectQuote().catch(() => {}); }, 1200); }
  window.asiriAnalysisCycleDesk = Object.freeze({ readOnly:true, paperOnly:true, executionAllowed:false, render });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once:true }) : init();
})();
