/* Read-only evidence card. Reads the existing local watchlist and quote snapshot. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { FRESH: 'حديثة وفق المصدر', DELAYED: 'متأخرة أو السوق مغلق', STALE: 'قديمة للمرجع', UNAVAILABLE: 'غير متاحة' };
  const formatTime = value => {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime()) ? 'غير متاح' : date.toLocaleString('ar-SA', { dateStyle: 'medium', timeStyle: 'medium' });
  };
  function render() {
    const select = $('evidence-symbol');
    if (!select || typeof watchlist === 'undefined' || typeof stockMarketData === 'undefined') return;
    const symbols = [...watchlist];
    const previous = select.value;
    if (select.dataset.symbols !== JSON.stringify(symbols)) {
      select.replaceChildren();
      if (!symbols.length) {
        const option = document.createElement('option'); option.value = ''; option.textContent = 'لا توجد رموز'; select.append(option);
      }
      symbols.forEach(symbol => { const option = document.createElement('option'); option.value = symbol; option.textContent = symbol; select.append(option); });
      select.dataset.symbols = JSON.stringify(symbols);
      if (symbols.includes(previous)) select.value = previous;
    }
    const symbol = select.value;
    const item = stockMarketData[symbol] || {};
    const health = window.asiriQuoteDataHealth?.classifyQuote(item);
    let state = health?.state || 'UNAVAILABLE';
    // A recently observed response can still contain an old market quote.
    if (state === 'FRESH' && (!Number.isFinite(health.quoteAgeMs) || health.quoteAgeMs > 120000)) state = 'STALE';
    const price = item.price == null || item.price === '' ? NaN : Number(item.price);
    $('evidence-ticker').textContent = symbol || '—';
    $('evidence-price').textContent = Number.isFinite(price) && price > 0 ? price.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
    $('evidence-state').textContent = labels[state];
    $('evidence-state').dataset.state = state;
    $('evidence-source').textContent = item.source || 'غير متاح';
    $('evidence-time').textContent = formatTime(item.updatedAt || item.time);
    $('evidence-session').textContent = item.sessionLabel || item.session || 'غير متاحة';
    $('evidence-next').textContent = state === 'FRESH' ? 'تحقّق من التحليل والمخاطر قبل إعداد أي خطة.' : 'انتظر قراءة صالحة أو راجع حالة السوق قبل التحليل.';
    $('evidence-data-step').textContent = state === 'FRESH' ? 'قابلة للمراجعة' : 'تحتاج مراجعة';
    $('evidence-data-step').dataset.state = state;
  }
  function init() {
    if (!$('evidence-symbol')) return;
    $('evidence-symbol').addEventListener('change', render);
    render();
    window.setInterval(() => { if (!document.hidden) render(); }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
