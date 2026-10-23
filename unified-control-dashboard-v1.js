/* ASIRI UNIFIED CONTROL DASHBOARD V1 — read-only bridge; no broker or portfolio writes */
(() => {
  'use strict';
  const ALERT_KEY = 'asiri_live_alerts_v1';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const text = (id) => $(id)?.textContent?.trim() || '—';
  const safeNumber = (value) => { const n = Number(String(value ?? '').replace(/[^0-9.+-]/g, '')); return Number.isFinite(n) ? n : null; };
  const stateLabel = (item) => {
    try { return window.asiriQuoteDataHealth?.describeQuote?.(window.asiriQuoteDataHealth.classifyQuote(item)).label || 'مراجعة'; } catch (_) { return item?.isFresh ? 'حديثة' : 'مراجعة'; }
  };
  const stateTone = (item) => {
    try { const state = window.asiriQuoteDataHealth.classifyQuote(item).state; return state === 'FRESH' ? 'good' : state === 'UNAVAILABLE' ? 'bad' : 'warn'; } catch (_) { return item?.isFresh ? 'good' : 'warn'; }
  };
  const watchState = () => {
    try {
      const symbols = Array.isArray(watchlist) ? watchlist : [];
      const data = typeof stockMarketData === 'object' && stockMarketData ? stockMarketData : {};
      return { symbols, data };
    } catch (_) { return { symbols: [], data: {} }; }
  };
  const alertsState = () => {
    try { const saved = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}'); return saved && typeof saved === 'object' ? saved : {}; } catch (_) { return {}; }
  };
  function renderWatchlist() {
    const host = $('unified-watchlist'); if (!host) return;
    const { symbols, data } = watchState();
    const rows = symbols.slice(0, 8).map((symbol) => {
      const item = data[symbol] || { symbol };
      const tone = stateTone(item); const state = stateLabel(item); const price = Number.isFinite(Number(item.price)) ? `$${Number(item.price).toFixed(2)}` : 'غير متاح';
      const hasAlert = Boolean(alertsState()[symbol]);
      return `<article class="unified-watch-row"><div class="unified-watch-symbol"><strong dir="ltr">${esc(symbol)}</strong><small>${esc(item.name || 'قائمة المراقبة')}</small></div><div class="unified-watch-price"><strong>${esc(price)}</strong><small>${esc(item.changePercent == null ? 'لا تغيّر موثق' : `${Number(item.changePercent) >= 0 ? '+' : ''}${Number(item.changePercent).toFixed(2)}%`)}</small></div><div class="unified-watch-state ${tone}">${esc(state)}<br><small>${esc(item.source || 'مصدر غير متاح')}</small></div><span class="unified-watch-alert${hasAlert ? '' : ' empty'}" title="${hasAlert ? 'تنبيه محفوظ' : 'لا يوجد تنبيه'}">${hasAlert ? '🔔' : '—'}</span></article>`;
    });
    host.innerHTML = rows.length ? rows.join('') : '<div class="unified-alert-empty">قائمة المراقبة فارغة. أضف رمزًا من قسم الأسعار.</div>';
    const count = $('unified-watch-count'); if (count) count.textContent = String(symbols.length);
    const fresh = symbols.filter((symbol) => stateTone(data[symbol] || {}) === 'good').length;
    const review = Math.max(0, symbols.length - fresh);
    if ($('unified-watch-fresh')) $('unified-watch-fresh').textContent = String(fresh);
    if ($('unified-watch-review')) $('unified-watch-review').textContent = String(review);
  }
  function renderPaper() {
    const values = { equity: text('paper-lab-equity'), pnl: text('paper-lab-pnl'), cash: text('paper-lab-cash'), trades: text('paper-lab-trades'), sharpe: text('paper-lab-sharpe'), dd: text('paper-lab-max-dd') };
    const map = { 'unified-paper-equity': values.equity, 'unified-paper-pnl': values.pnl, 'unified-paper-cash': values.cash, 'unified-paper-trades': values.trades, 'unified-paper-sharpe': values.sharpe, 'unified-paper-dd': values.dd };
    Object.entries(map).forEach(([id, value]) => { if ($(id)) $(id).textContent = value; });
    if ($('unified-paper-status')) $('unified-paper-status').textContent = text('paper-lab-status');
  }
  function renderAlerts() {
    const host = $('unified-alert-list'); if (!host) return;
    const alerts = alertsState(); const rows = Object.entries(alerts).slice(0, 8).map(([symbol, rule]) => { const levels = [rule?.high ? `صعود ${Number(rule.high).toFixed(2)}` : '', rule?.low ? `هبوط ${Number(rule.low).toFixed(2)}` : ''].filter(Boolean).join(' · '); return `<article class="unified-alert-row"><strong dir="ltr">${esc(symbol)}</strong><span>${esc(levels || 'عتبة غير مكتملة')}</span></article>`; });
    host.innerHTML = rows.length ? rows.join('') : '<div class="unified-alert-empty">لا توجد تنبيهات سعرية محفوظة على هذا الجهاز.</div>';
    if ($('unified-alert-count')) $('unified-alert-count').textContent = String(Object.keys(alerts).length);
  }
  function render() {
    renderWatchlist(); renderPaper(); renderAlerts();
    const updated = $('unified-control-updated'); if (updated) updated.textContent = `آخر تجميع محلي: ${new Date().toLocaleTimeString('ar-SA')}`;
  }
  function go(id, tab) {
    const button = document.querySelector(`[data-tab="${tab}"]`); if (typeof window.switchMainTab === 'function') window.switchMainTab(tab, button);
    $(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function init() {
    if (!$('unified-control-dashboard')) return;
    $('unified-open-watchlist')?.addEventListener('click', () => go('sec-tools', 'tools'));
    $('unified-open-paper')?.addEventListener('click', () => go('paper-lab-title', 'tools'));
    $('unified-open-alerts')?.addEventListener('click', () => go('sec-alerts', 'alerts'));
    const observer = new MutationObserver(render);
    ['stocks-list-wrapper', 'paper-lab-equity', 'paper-lab-pnl', 'paper-lab-cash', 'paper-lab-trades', 'paper-lab-status', 'paper-lab-sharpe', 'paper-lab-max-dd'].map($).filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true, characterData: true }));
    render(); window.setInterval(render, 5000);
  }
  window.asiriUnifiedControlDashboard = Object.freeze({ render, readOnly: true });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
