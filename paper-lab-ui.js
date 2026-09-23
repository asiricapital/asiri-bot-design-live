// paperOnly=true · executionAllowed=false · tradingEnabled=false
(() => {
  const API = 'https://asiri-bot.onrender.com/api/paper-lab';
  const key = 'asiri_favorite_symbols_v1';
  const defaultUniverse = ['SNAP', 'MVIS', 'SG', 'RKLB', 'CHPT', 'BLNK', 'HUMA', 'AGEN', 'ENSC', 'TMCI', 'AMPL', 'RDW', 'INO', 'LASE'];
  const $ = (id) => document.getElementById(id);
  const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '—';
  const pct = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : '—';
  // The paper experiment must remain reproducible: browser favorites may contain
  // an older universe, so the approved 14-symbol experiment is authoritative.
  function favorites() { return defaultUniverse; }
  function render(data) {
    if (!data) return;
    $('paper-lab-mode').textContent = data.paperOnly ? 'محاكاة فقط · لا تنفيذ' : 'غير متاح';
    $('paper-lab-equity').textContent = money(data.equity);
    $('paper-lab-pnl').textContent = `${money(data.netPnl)} · ${pct(data.netReturnPct)}`;
    $('paper-lab-cash').textContent = money(data.cash);
    $('paper-lab-trades').textContent = `${data.closedTrades || 0} مغلقة · ${data.openPositions || 0} مفتوحة`;
    const count = Array.isArray(data.symbols) ? data.symbols.length : 0;
    $('paper-lab-status').textContent = data.lastRunAt ? `آخر فحص: ${new Date(data.lastRunAt).toLocaleString('ar-SA')} · فحص ${count} سهمًا` : `المحفظة جاهزة للبدء · نطاق المراقبة ${count || defaultUniverse.length} سهمًا`;
    $('paper-lab-start').textContent = data.startedAt ? 'استمرار التجربة' : 'بدء تجربة 1,000 دولار';
  }
  async function call(path, options = {}) { const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'تعذر الاتصال بمختبر المحاكاة'); return data; }
  async function refresh() { try { render(await call('/status')); } catch (error) { $('paper-lab-status').textContent = `تعذر التحديث: ${error.message}`; } }
  async function start() { const symbols = favorites(); $('paper-lab-status').textContent = 'جارٍ تشغيل أول دورة بالمصادر الموثقة…'; try { render(await call('/start', { method: 'POST', body: JSON.stringify({ symbols }) })); } catch (error) { $('paper-lab-status').textContent = `تعذر البدء: ${error.message}`; } }
  async function run() { $('paper-lab-status').textContent = 'جارٍ تحديث المحفظة الورقية…'; try { render(await call('/run', { method: 'POST', body: JSON.stringify({ symbols: favorites() }) })); } catch (error) { $('paper-lab-status').textContent = `تعذر الفحص: ${error.message}`; } }
  window.addEventListener('DOMContentLoaded', () => { $('paper-lab-start')?.addEventListener('click', start); $('paper-lab-run')?.addEventListener('click', run); $('paper-lab-refresh')?.addEventListener('click', refresh); refresh(); window.setInterval(refresh, 60000); });
})();
