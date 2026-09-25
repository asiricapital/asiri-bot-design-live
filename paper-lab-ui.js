// paperOnly=true · executionAllowed=false · tradingEnabled=false
(() => {
  const API = 'https://asiri-bot.onrender.com/api/paper-lab';
  const MARKET_API = 'https://asiri-bot.onrender.com/api/analyze';
  const key = 'asiri_favorite_symbols_v1';
  const defaultUniverse = ['SNAP', 'MVIS', 'SG', 'RKLB', 'CHPT', 'BLNK', 'HUMA', 'AGEN', 'ENSC', 'TMCI', 'AMPL', 'RDW', 'INO', 'LASE'];
  const $ = (id) => document.getElementById(id);
  const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '—';
  const pct = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : '—';
  const price = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(3)}` : '—';
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));
  const observed = (value) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('ar-SA') : 'غير متوفر'; };
  function renderSourceHealth() {
    const node = $('paper-lab-source-health');
    if (!node) return;
    node.innerHTML = '<span class="paper-lab-source-primary"><b>Yahoo Finance</b><small>المصدر الأساسي</small></span><span class="paper-lab-source-fallback"><b>Twelve Data</b><small>احتياطي داخلي عند 429</small></span><span class="paper-lab-source-integrity"><b>لا سعر اصطناعي</b><small>المصدر والوقت محفوظان</small></span>';
  }
  function renderOpenPosition(position, quote) {
    const card = $('paper-lab-open-position');
    if (!card) return;
    if (!position) { card.hidden = true; card.innerHTML = ''; return; }
    const current = Number(quote?.price);
    const entry = Number(position.entryPrice);
    const quantity = Number(position.quantity);
    const marketValue = Number.isFinite(current) ? current * quantity : NaN;
    const unrealized = Number.isFinite(current) ? (current - entry) * quantity - Number(position.fees || 0) : NaN;
    const returnPct = Number.isFinite(unrealized) && entry > 0 ? (unrealized / (entry * quantity)) * 100 : NaN;
    const tone = Number.isFinite(unrealized) && unrealized < 0 ? 'loss' : 'gain';
    card.hidden = false;
    card.dataset.state = tone;
    card.innerHTML = `<div class="paper-lab-position-head"><div><span class="paper-lab-position-kicker">OPEN PAPER POSITION · ${escapeHtml(position.symbol)}</span><h4>المركز المفتوح الحالي</h4></div><span class="paper-lab-position-status">مراقبة تلقائية</span></div><div class="paper-lab-position-grid"><div><small>الكمية</small><b>${Number.isFinite(quantity) ? quantity.toFixed(4) : '—'}</b></div><div><small>سعر الدخول</small><b>${price(entry)}</b></div><div><small>السعر الحالي</small><b>${price(current)}</b></div><div><small>القيمة الحالية</small><b>${money(marketValue)}</b></div><div><small>الربح/الخسارة العائمة</small><b class="paper-lab-position-pnl">${money(unrealized)} · ${pct(returnPct)}</b></div><div><small>الرسوم</small><b>${money(position.fees)}</b></div></div><div class="paper-lab-position-levels"><span>وقف الخسارة <b>${price(position.stopLoss)}</b></span><span>جني الأرباح <b>${price(position.target)}</b></span></div><div class="paper-lab-position-source">المصدر: ${escapeHtml(quote?.source || 'بانتظار السعر')} · آخر قراءة: ${observed(quote?.observedAt || quote?.updatedAt)} · لا تنفيذ حقيقي</div>`;
  }
  async function refreshOpenPositions(data) {
    const position = Array.isArray(data?.positions) ? data.positions[0] : null;
    if (!position) return renderOpenPosition(null);
    try {
      const quote = await callMarket(`/${encodeURIComponent(position.symbol)}`);
      renderOpenPosition(position, quote);
    } catch (error) {
      renderOpenPosition(position, null);
      $('paper-lab-position-source')?.replaceChildren(document.createTextNode(`تعذر تحديث السعر الحالي: ${error.message}`));
    }
  }
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
    renderSourceHealth();
    $('paper-lab-start').textContent = data.startedAt ? 'استمرار التجربة' : 'بدء تجربة 1,000 دولار';
    const decisions = $('paper-lab-decisions');
    if (decisions) {
      const rows = Array.isArray(data.decisionAudit) ? data.decisionAudit : [];
      decisions.innerHTML = rows.length ? rows.map((row) => `<article class="paper-lab-decision" data-state="${row.eligible ? 'ready' : 'wait'}"><div><strong>${row.symbol}</strong><span>${row.eligible ? 'مؤهل للمراجعة' : 'انتظار'}</span></div><small>السعر: ${price(row.price)} · الدخول: ${price(row.entry)} · وقف: ${price(row.stop)} · الهدف: ${price(row.target)}</small><small class="paper-lab-decision-source">المصدر: ${escapeHtml(row.source || 'غير محدد')} · الملاحظة: ${observed(row.observedAt || row.updatedAt)}</small><p>${row.reason || 'لم يصل تفسير القرار بعد.'}</p></article>`).join('') : '<div class="paper-lab-empty">لم يكتمل فحص بعد. اضغط «تحديث المحاكاة» لبدء دورة القراءة.</div>';
    }
  }
  async function callMarket(path) { const response = await fetch(`${MARKET_API}${path}`, { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'تعذر تحديث السعر الحالي'); return data; }
  async function call(path, options = {}) { const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'تعذر الاتصال بمختبر المحاكاة'); return data; }
  async function refresh() { try { const data = await call('/status'); render(data); await refreshOpenPositions(data); } catch (error) { $('paper-lab-status').textContent = `تعذر التحديث: ${error.message}`; } }
  async function start() { const symbols = favorites(); $('paper-lab-status').textContent = 'جارٍ تشغيل أول دورة بالمصادر الموثقة…'; try { render(await call('/start', { method: 'POST', body: JSON.stringify({ symbols }) })); } catch (error) { $('paper-lab-status').textContent = `تعذر البدء: ${error.message}`; } }
  async function run() { $('paper-lab-status').textContent = 'جارٍ تحديث المحفظة الورقية…'; try { render(await call('/run', { method: 'POST', body: JSON.stringify({ symbols: favorites() }) })); } catch (error) { $('paper-lab-status').textContent = `تعذر الفحص: ${error.message}`; } }
  window.addEventListener('DOMContentLoaded', () => { renderSourceHealth(); $('paper-lab-start')?.addEventListener('click', start); $('paper-lab-run')?.addEventListener('click', run); $('paper-lab-refresh')?.addEventListener('click', refresh); refresh(); window.setInterval(refresh, 60000); });
})();
