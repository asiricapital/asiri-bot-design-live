/* One watchlist snapshot for home, portfolio and quote details; no new provider reads. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const set = (id, value) => { const node = $(id); if (node && node.textContent !== String(value)) node.textContent = value; };
  const snapshots = () => typeof watchlist === 'undefined' || typeof stockMarketData === 'undefined' ? [] : watchlist.map(symbol => ({ ...stockMarketData[symbol], symbol }));
  const health = item => window.asiriQuoteDataHealth.classifyQuote(item);
  window.asiriMarketView = Object.freeze({ snapshots, health, readOnly: true });
  const foldingSelectors = ['.command-center-strip','.command-ticker','#practical-dashboard','.command-kpi-deck','.cc-topology','#operational-trust-panel','#unified-control-dashboard','#saxo-watchlist-bridge-v1'];
  function foldDetails() {
    const body = $('home-details-body'); if (!body) return;
    foldingSelectors.forEach(selector => { document.querySelectorAll(selector).forEach(node => { if (!body.contains(node)) body.append(node); }); });
  }
  function render() {
    const rows = snapshots(); const select = $('home-symbol'); if (!select) return;
    const symbols = rows.map(row => row.symbol); const key = JSON.stringify(symbols); const selected = select.value;
    if (select.dataset.symbols !== key) {
      select.replaceChildren(); select.dataset.symbols = key;
      const values = symbols.length ? symbols : [''];
      values.forEach(symbol => { const option = document.createElement('option'); option.value = symbol; option.textContent = symbol || 'لا توجد رموز'; select.append(option); });
      if (symbols.includes(selected)) select.value = selected;
    }
    const item = rows.find(row => row.symbol === select.value) || {};
    const current = health(item); const described = window.asiriQuoteDataHealth.describeQuote(current);
    const fresh = rows.filter(row => health(row).state === 'FRESH').length;
    set('home-total', rows.length); set('home-fresh', fresh); set('home-review', rows.length - fresh);
    set('home-ticker', item.symbol || '—');
    const price = item.price == null || item.price === '' ? NaN : Number(item.price);
    set('home-price', Number.isFinite(price) && price > 0 ? price.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—');
    set('home-state', described.label); $('home-state').dataset.state = current.state;
    set('home-source', item.source || 'غير متاح');
    const quoteTime = new Date(item.updatedAt || item.time || '');
    set('home-time', Number.isNaN(quoteTime.getTime()) ? 'غير متاح' : quoteTime.toLocaleString('ar-SA'));
    set('home-next', current.state === 'FRESH' ? 'الخطوة التالية: راجع الأدلة الفنية، ثم المخاطر. حداثة السعر لا تعني اكتمال التحليل.' : 'الخطوة التالية: راجع حالة السوق وانتظر قراءة صالحة. لا تعامل السعر المحفوظ كقراءة جديدة.');
    $('home-open-analysis').disabled = !item.symbol;
    const quality = document.querySelector('.command-center-strip .cc-status:last-child b');
    if (quality) quality.textContent = `${fresh}/${rows.length} حديثة`;
    foldDetails();
  }
  function init() {
    $('home-symbol')?.addEventListener('change', render);
    $('home-open-analysis')?.addEventListener('click', () => {
      const select = $('technicals-symbol'); if (select) select.value = $('home-symbol').value;
      if (typeof switchMainTab === 'function') switchMainTab('technicals');
      if (typeof refreshTechnicalAnalysis === 'function') refreshTechnicalAnalysis();
      $('sec-technicals')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('home-open-portfolio')?.addEventListener('click', () => {
      if (typeof switchMainTab === 'function') switchMainTab('portfolio');
      $('sec-portfolio')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('home-details')?.addEventListener('toggle', () => window.dispatchEvent(new Event('resize')));
    render();
    window.setInterval(() => { if (!document.hidden) render(); }, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    window.addEventListener('pageshow', render);
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
