const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  market: { rows: [], score: null, regime: '—' },
  positions: [],
  values: new Map(),
  watchlist: [],
  watchValues: new Map(),
  supabase: null,
  session: null,
  config: null,
  refreshTimer: null,
  currentReport: 'close',
  opportunities: [],
  trades: [],
  closedPositions: [],
  cashLedger: [],
  reconciliations: [],
  plannedOrders: [],
  sarPerUsd: Number(localStorage.getItem('asiri_sar_per_usd') || 3.75),
  replacements: [],
  marketIntelligence: null,
  marketIntelligenceFilter: 'ALL',
  decisionJournal: [],
  positionPlans: [],
  alertsDb: [],
  notificationStatus: { telegramEnabled: false, backgroundAlertsEnabled: false },
  settings: {
    pollMs: Number(localStorage.getItem('asiri_poll_ms') || 10000),
    confirmDelete: localStorage.getItem('asiri_confirm_delete') !== 'false',
    compactMode: localStorage.getItem('asiri_compact_mode') === 'true'
  }
};

const fmt = (v, d = 2) => v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const cls = (v) => v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
const safe = (v, d = 2, suffix = '') => v == null ? '—' : `${fmt(v, d)}${suffix}`;
const lastSeen = new Map();

function flashPrice(symbol, price) {
  const prev = lastSeen.get(symbol);
  lastSeen.set(symbol, price);
  if (prev == null || price == null || prev === price) return '';
  return price > prev ? ' tick-up' : ' tick-down';
}

function spark(points = []) {
  if (points.length < 2) return '';
  const vals = points.map((x) => x.close);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const path = vals.map((v, i) => `${i ? 'L' : 'M'} ${(i / (vals.length - 1)) * 300} ${58 - ((v - min) / range) * 52}`).join(' ');
  return `<svg class="spark" viewBox="0 0 300 64" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="currentColor" stroke-width="3"/></svg>`;
}

function showPage(page) {
  $$('.main-nav button,.page').forEach((x) => x.classList.remove('active'));
  $(`.main-nav button[data-page="${page}"]`)?.classList.add('active');
  $(`#${page}`)?.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'dashboard') loadMarketIntelligence();
  if (page === 'journal') loadDecisionJournal();
  if (page === 'reports') { renderReport(); loadReportStatus(); loadReportHistory(); }
  if (page === 'investment') loadInvestmentLedger();
  if (page === 'portfolio') loadPositionPlans();
  if (page === 'golden') loadOpportunities();
  if (page === 'admin') renderAdmin();
}

$$('.main-nav button').forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));


function miLabel(b){return b==='BUY'?'شراء':b==='AVOID'?'تجنب':'انتظار'}function miClass(b){return b==='BUY'?'up':b==='AVOID'?'down':'flat'}
function renderMarketIntelligence(){const d=state.marketIntelligence;if(!d)return;const m=d.market||{},g=d.golden||{},rows=(d.rows||[]).filter(x=>state.marketIntelligenceFilter==='ALL'||x.bucket===state.marketIntelligenceFilter);$('#miMarketRegime').textContent=m.regime||'—';$('#miUpdatedAt').textContent=d.updatedAt?new Date(d.updatedAt).toLocaleTimeString('ar-SA'):'—';$('#miMarketScore').textContent=`${m.score??'—'}/100`;$('#miTrendScore').textContent=`${m.trend??'—'}/100`;$('#miRiskScore').textContent=`${m.riskAppetite??'—'}/100`;$('#miSmallCapScore').textContent=`${m.smallCap??'—'}/100`;$('#miLiquidityScore').textContent=`${m.liquidity??'—'}/100`;$('#miGoldenStatus').textContent=g.status||'WAIT';$('#miGoldenStatus').className=miClass(g.status);$('#miGoldenHeadline').textContent=g.status==='BUY'?'BUY — توجد إشارة شراء مكتملة وفق المحرك':g.status==='AVOID'?'AVOID — البيئة الحالية دفاعية':'WAIT — لا توجد إشارة شراء مكتملة حتى الآن';$('#miGoldenClosest').textContent=`الأقرب للإشارة: ${g.closest?.symbol||'لا يوجد'}`;$('#miGoldenRequirement').textContent=`المطلوب: ${g.requirement||'اختراق مؤكد + Volume قوي + ثبات فوق المقاومة.'}`;$('#miBestScore').textContent=g.closest?.score??'—';$('#miBestSymbol').textContent=g.closest?`${g.closest.symbol} — ${g.closest.decision||miLabel(g.closest.bucket)}`:'—';$('#miHighQuality').textContent=d.counts?.highQuality??0;const medals=['🥇','🥈','🥉'];$('#miTop3').innerHTML=(d.top3||[]).length?(d.top3||[]).map((x,i)=>`<article class="mi-opportunity-card"><div class="mi-rank">${medals[i]} المركز ${i+1}</div><div class="mi-opportunity-head"><div><strong>${x.symbol}</strong><small>${x.decision||miLabel(x.bucket)}</small></div><div class="mi-score">${x.score??'—'}</div></div><div class="mi-opportunity-meta"><span>السعر<b>$${fmt(x.price)}</b></span><span>التغير<b class="${cls(x.changePercent)}">${safe(x.changePercent,2,'%')}</b></span><span>الزخم<b>${x.momentum||'—'}</b></span><span>السيولة<b>${x.liquidity||'—'}</b></span></div></article>`).join(''):'<p class="muted">لا توجد فرص مكتملة.</p>';$('#miWatchTable').innerHTML=`<table class="technical-table"><thead><tr><th>السهم</th><th>السعر</th><th>التغير</th><th>الزخم</th><th>السيولة</th><th>الدعم / المقاومة</th><th>النتيجة</th><th>القرار</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${x.symbol}</b></td><td>$${fmt(x.price)}</td><td class="${cls(x.changePercent)}">${safe(x.changePercent,2,'%')}</td><td>${x.momentum||'—'}</td><td>${x.liquidity||'—'}</td><td>$${fmt(x.support)} / $${fmt(x.resistance)}</td><td><b>${x.score??'—'}</b></td><td><span class="mi-decision ${String(x.bucket||'').toLowerCase()}">${x.decision||miLabel(x.bucket)}</span></td></tr>`).join('')}</tbody></table>`;$('#miShariaWatch').innerHTML=(d.shariaWatch||[]).map(x=>`<div class="sharia-watch-item"><b>${x.symbol}</b><span>${x.priority}</span></div>`).join('')||'<p class="muted">لا توجد أسهم مرشحة.</p>'}
async function loadMarketIntelligence(force=false){try{const symbols=[...new Set([...state.positions.map(x=>x.symbol),...state.watchlist.map(x=>x.symbol)])].join(',');const r=await fetch(`/api/market-intelligence?symbols=${encodeURIComponent(symbols)}${force?`&t=${Date.now()}`:''}`,{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تحميل ذكاء السوق');state.marketIntelligence=d;renderMarketIntelligence()}catch(e){console.error(e);$('#miGoldenHeadline').textContent=`تعذر تحديث لوحة ذكاء السوق: ${e.message}`}}
function renderMarket() {
  $('#marketRegime').textContent = state.market.regime || '—';
  $('#marketScore').textContent = state.market.score ?? '—';
  $('#indices').innerHTML = (state.market.rows || []).map((x) => `<div class="index"><b>${x.label}</b><small class="${cls(x.changePercent)}">${x.changePercent == null ? '—' : `${x.changePercent >= 0 ? '+' : ''}${fmt(x.changePercent)}%`}</small></div>`).join('');
}

function portfolioStats() {
  const list = [...state.values.values()];
  const marketValue = list.reduce((a, x) => a + (x.analysis?.marketValue || 0), 0);
  const costValue = list.reduce((a, x) => a + (x.analysis?.costValue || 0), 0);
  const pnl = marketValue - costValue;
  const alerts = list.flatMap((x) => (x.analysis?.alerts || []).map((a) => ({ ...a, symbol: x.symbol })));
  const winners = list.filter((x) => Number(x.changePercent) > 0).length;
  return { list, marketValue, costValue, pnl, alerts, winners };
}

function cardHtml(q) {
  const p = q.position || {}, a = q.analysis || {}, t = q.technicals || {};
  return `<article class="card">
    <div class="top"><div><div class="symbol">${q.symbol}</div><div class="name">${q.name || ''}</div></div><div class="pill">${q.marketState || '—'}</div></div>
    <div class="price${flashPrice(q.symbol, q.price)}">$${fmt(q.price)}</div>
    <div class="change ${cls(q.changePercent)}">${q.changePercent == null ? '—' : `${q.changePercent >= 0 ? '+' : ''}${fmt(q.changePercent)}%`}</div>
    ${spark(t.sparkline)}
    <div class="decision"><b>${a.decision || 'جارٍ التحليل'}</b><span>${a.reason || ''}</span><div class="scorebar"><i style="width:${a.asiriScore || 0}%"></i></div></div>
    <div class="details">
      <div><span>الكمية</span><b>${fmt(p.quantity, 2)}</b></div><div><span>متوسط الشراء</span><b>$${fmt(p.avgPrice)}</b></div>
      <div><span>Asiri Score</span><b>${a.asiriScore ?? '—'}/100</b></div><div><span>الاتجاه</span><b>${t.trendLabel || '—'}</b></div>
      <div><span>RSI 14</span><b>${safe(t.rsi14, 1)}</b></div><div><span>ربح المركز</span><b class="${cls(a.pnlPct)}">${safe(a.pnlPct, 2, '%')}</b></div>
      <div><span>وقف الخسارة</span><b>${p.stopLoss == null ? '—' : '$' + fmt(p.stopLoss)}</b></div><div><span>المسافة عن الوقف</span><b>${safe(a.stopDistancePct, 2, '%')}</b></div>
      <div><span>الهدف الأول</span><b>${p.target1 == null ? '—' : '$' + fmt(p.target1)}</b></div><div><span>الحجم/المتوسط</span><b>${safe(a.volumeRatio, 2, '×')}</b></div>
      <div><span>عائد/مخاطرة</span><b>${safe(a.riskRewardToTarget1, 2)}</b></div>
    </div>
    <div class="position-actions"><button data-buy-position="${p.id}">➕ شراء كمية</button><button class="secondary" data-sell-position="${p.id}">➖ بيع كمية</button><button class="ghost" data-edit-position="${p.id}">✏️ تعديل</button><button class="ghost" data-plan-position="${p.id}">🧭 الخطة</button></div>
    <div class="foot"><span>${q.source || '—'}</span><span>${q.updatedAt ? new Date(q.updatedAt).toLocaleTimeString('ar-SA') : '—'}</span></div>
    ${q.error ? `<p class="down">${q.error}</p>` : ''}
  </article>`;
}

function renderPortfolio() {
  const { list, marketValue, costValue, pnl, alerts, winners } = portfolioStats();
  $('#emptyPortfolio').classList.toggle('hidden', state.positions.length > 0);
  $('#cards').innerHTML = list.map(cardHtml).join('');
  $('#marketValue').textContent = marketValue ? `$${fmt(marketValue)}` : '—';
  $('#portfolioPnl').textContent = costValue ? `${pnl >= 0 ? '+' : ''}$${fmt(pnl)} (${fmt((pnl / costValue) * 100)}%)` : '—';
  $('#portfolioPnl').className = cls(pnl);
  $('#winners').textContent = winners;
  $('#alertCount').textContent = alerts.length;
  $('#alerts').innerHTML = alerts.length ? alerts.slice(0, 6).map((a) => `<div class="alert ${a.level || ''}"><b>${a.symbol}</b> — ${a.text}</div>`).join('') : '<div class="alert">لا توجد تنبيهات حرجة حاليًا.</div>';

  const ranked = [...list].sort((a, b) => (b.analysis?.asiriScore || 0) - (a.analysis?.asiriScore || 0));
  $('#dashboardPositions').innerHTML = ranked.length ? ranked.map((q) => `<div class="compact-row"><div><b>${q.symbol}</b><small>${q.analysis?.decision || '—'}</small></div><div><b>${q.analysis?.asiriScore ?? '—'}/100</b><small class="${cls(q.analysis?.pnlPct)}">${safe(q.analysis?.pnlPct, 2, '%')}</small></div></div>`).join('') : '<p class="muted">لا توجد مراكز.</p>';

  let daily = '🟡 انتظار وانتقاء';
  if ((state.market.score || 0) >= 70 && ranked.some((q) => (q.analysis?.asiriScore || 0) >= 85)) daily = '🟢 البيئة تسمح بالمراقبة التنفيذية للفرص عالية الجودة';
  if ((state.market.score || 0) < 45) daily = '🔴 دفاعي: حماية رأس المال وعدم فتح مراكز جديدة';
  $('#dailyDecision').textContent = daily;

  $('#technicalTable').innerHTML = `<table class="technical-table"><thead><tr><th>السهم</th><th>السعر</th><th>SMA20</th><th>SMA50</th><th>SMA200</th><th>RSI</th><th>زخم 20 يوم</th><th>ATR%</th><th>قمة 20 يوم</th><th>قاع 20 يوم</th></tr></thead><tbody>${list.map((q) => { const t = q.technicals || {}; return `<tr><td><b>${q.symbol}</b></td><td>$${fmt(q.price)}</td><td>${fmt(t.sma20)}</td><td>${fmt(t.sma50)}</td><td>${fmt(t.sma200)}</td><td>${safe(t.rsi14, 1)}</td><td class="${cls(t.momentum20)}">${safe(t.momentum20, 2, '%')}</td><td>${safe(t.atrPct, 2, '%')}</td><td>${fmt(t.high20)}</td><td>${fmt(t.low20)}</td></tr>`; }).join('')}</tbody></table>`;
  renderPositionsTable();
  $$('[data-buy-position]').forEach((b) => b.onclick = () => openTradeDialog(b.dataset.buyPosition, 'BUY'));
  $$('[data-sell-position]').forEach((b) => b.onclick = () => openTradeDialog(b.dataset.sellPosition, 'SELL'));
  $$('[data-edit-position]').forEach((b) => b.onclick = () => editPosition(b.dataset.editPosition));
  $$('[data-plan-position]').forEach((b) => b.onclick = () => openPlanDialog(b.dataset.planPosition));
}

function renderPositionsTable() {
  $('#positionsTable').innerHTML = state.positions.length ? `<div class="position-list">${state.positions.map((p) => `<div class="position-row"><div><b>${p.symbol}</b><small>${fmt(p.quantity, 2)} سهم · متوسط $${fmt(p.avg_price)}</small></div><div class="row-actions"><button data-row-buy="${p.id}">شراء</button><button class="secondary" data-row-sell="${p.id}">بيع</button><button class="ghost" data-edit="${p.id}">تعديل</button><button class="danger" data-delete="${p.id}">حذف إداري</button></div></div>`).join('')}</div>` : '<p class="muted">لا توجد مراكز محفوظة.</p>';
  $$('[data-row-buy]').forEach((b) => b.onclick = () => openTradeDialog(b.dataset.rowBuy, 'BUY'));
  $$('[data-row-sell]').forEach((b) => b.onclick = () => openTradeDialog(b.dataset.rowSell, 'SELL'));
  $$('[data-edit]').forEach((b) => b.onclick = () => editPosition(b.dataset.edit));
  $$('[data-delete]').forEach((b) => b.onclick = () => deletePosition(b.dataset.delete));
}

async function loadPortfolio() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('portfolio').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  state.positions = data || [];
  await refreshAnalysis();
  await Promise.all([loadTrades(), loadClosedPositions()]);
  if ($('#investment')?.classList.contains('active')) await loadInvestmentLedger();
}

async function refreshAnalysis() {
  if (!state.positions.length) { state.values.clear(); renderPortfolio(); return; }
  const r = await fetch('/api/portfolio-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions: state.positions }) });
  const rows = await r.json();
  if (!r.ok) throw new Error(rows.error || 'تعذر تحديث المحفظة');
  state.values.clear(); rows.forEach((q) => state.values.set(q.symbol, q)); renderPortfolio(); renderUrgentActions();
}

function resetForm() { $('#positionForm').reset(); $('#positionId').value = ''; $('#formTitle').textContent = 'إضافة مركز'; }
function editPosition(id) {
  const p = state.positions.find((x) => x.id === id); if (!p) return;
  $('#positionId').value = p.id; $('#symbol').value = p.symbol; $('#quantity').value = p.quantity; $('#avgPrice').value = p.avg_price;
  $('#stopLoss').value = p.stop_loss ?? ''; $('#target1').value = p.target1 ?? ''; $('#target2').value = p.target2 ?? ''; $('#notes').value = p.notes ?? '';
  $('#formTitle').textContent = `تعديل ${p.symbol}`; showPage('portfolio'); $('#positionForm').scrollIntoView({ behavior: 'smooth' });
}
async function deletePosition(id) {
  const p = state.positions.find((x) => x.id === id); if (!p) return;
  if (!confirm(`حذف إداري لمركز ${p.symbol} بدون تسجيل بيع؟ استخدم زر بيع للإغلاق الطبيعي.`)) return;
  const { error } = await state.supabase.from('portfolio').delete().eq('id', id); if (error) return alert(error.message);
  await loadPortfolio();
}

$('#positionForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const id = $('#positionId').value;
  const payload = { user_id: state.session.user.id, symbol: $('#symbol').value.trim().toUpperCase(), quantity: Number($('#quantity').value), avg_price: Number($('#avgPrice').value), stop_loss: $('#stopLoss').value ? Number($('#stopLoss').value) : null, target1: $('#target1').value ? Number($('#target1').value) : null, target2: $('#target2').value ? Number($('#target2').value) : null, notes: $('#notes').value.trim(), updated_at: new Date().toISOString() };
  $('#managerStatus').textContent = 'جارٍ الحفظ…';
  let error; if (id) ({ error } = await state.supabase.from('portfolio').update(payload).eq('id', id)); else ({ error } = await state.supabase.from('portfolio').insert(payload));
  if (error) { $('#managerStatus').textContent = error.message; return; }
  if (!id) {
    await state.supabase.from('trades').insert({ user_id: state.session.user.id, symbol: payload.symbol, action: 'BUY', quantity: payload.quantity, price: payload.avg_price, notes: payload.notes, reason: 'فتح مركز جديد', position_id: null });
  } else {
    await state.supabase.from('portfolio_adjustments').insert({ user_id: state.session.user.id, position_id: id, symbol: payload.symbol, adjusted_quantity: payload.quantity, adjusted_avg_price: payload.avg_price, reason: 'تعديل إداري لبيانات المركز', notes: payload.notes });
  }
  resetForm(); $('#managerStatus').textContent = 'تم الحفظ بنجاح'; await loadPortfolio();
});
$('#cancelEdit').onclick = resetForm;
$('#newPositionBtn').onclick = () => { resetForm(); showPage('portfolio'); $('#positionForm').scrollIntoView({ behavior: 'smooth' }); };



function openTradeDialog(id, action) {
  const p = state.positions.find((x) => x.id === id); if (!p) return;
  $('#tradePositionId').value = id;
  $('#tradeAction').value = action;
  $('#tradeTitle').textContent = `${action === 'BUY' ? 'شراء كمية إضافية' : 'بيع كمية'} — ${p.symbol}`;
  $('#tradeQuantity').value = action === 'SELL' ? p.quantity : '';
  $('#tradeQuantity').max = action === 'SELL' ? p.quantity : '';
  const live = state.values.get(p.symbol)?.price;
  $('#tradePrice').value = live ? Number(live).toFixed(2) : '';
  $('#tradeReason').value = action === 'BUY' ? 'شراء إضافي' : 'بيع يدوي';
  $('#tradeReasonWrap').classList.toggle('hidden', false);
  $('#tradeNotes').value = '';
  $('#tradeFee').value = '0';
  $('#tradeFxRate').value = state.sarPerUsd.toFixed(4);
  $('#tradeStatus').textContent = '';
  updateTradePreview();
  $('#tradeDialog').showModal();
}

function updateTradePreview() {
  const id = $('#tradePositionId').value;
  const p = state.positions.find((x) => x.id === id); if (!p) return;
  const action = $('#tradeAction').value;
  const qty = Number($('#tradeQuantity').value || 0);
  const price = Number($('#tradePrice').value || 0);
  const fee = Number($('#tradeFee')?.value || 0);
  if (!qty || !price) { $('#tradePreview').innerHTML = ''; return; }
  if (action === 'BUY') {
    const newQty = Number(p.quantity) + qty;
    const newAvg = ((Number(p.quantity) * Number(p.avg_price)) + (qty * price) + fee) / newQty;
    $('#tradePreview').innerHTML = `<b>المتوسط الجديد:</b> $${fmt(newAvg)} · <b>الكمية الجديدة:</b> ${fmt(newQty, 2)}`;
  } else {
    const remaining = Number(p.quantity) - qty;
    const pnl = ((price - Number(p.avg_price)) * qty) - fee;
    const pnlPct = Number(p.avg_price) ? ((price / Number(p.avg_price)) - 1) * 100 : 0;
    $('#tradePreview').innerHTML = `<b>الكمية المتبقية:</b> ${fmt(Math.max(remaining, 0), 2)} · <b>الربح/الخسارة المحققة:</b> <span class="${cls(pnl)}">${pnl >= 0 ? '+' : ''}$${fmt(pnl)} (${fmt(pnlPct)}%)</span>`;
  }
}
$('#tradeQuantity').addEventListener('input', updateTradePreview);
$('#tradePrice').addEventListener('input', updateTradePreview);
$('#tradeFee')?.addEventListener('input', updateTradePreview);
$('#closeTradeDialog').onclick = () => $('#tradeDialog').close();
$('#cancelTrade').onclick = () => $('#tradeDialog').close();

$('#tradeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#tradePositionId').value;
  const action = $('#tradeAction').value;
  const p = state.positions.find((x) => x.id === id); if (!p) return;
  const qty = Number($('#tradeQuantity').value);
  const price = Number($('#tradePrice').value);
  const reason = $('#tradeReason').value;
  const notes = $('#tradeNotes').value.trim();
  const fee = Math.max(0, Number($('#tradeFee').value || 0));
  const exchangeRate = Math.max(0.0001, Number($('#tradeFxRate').value || state.sarPerUsd || 3.75));
  state.sarPerUsd = exchangeRate;
  localStorage.setItem('asiri_sar_per_usd', String(exchangeRate));
  if (!(qty > 0) || !(price > 0)) return $('#tradeStatus').textContent = 'أدخل كمية وسعر تنفيذ صحيحين.';
  if (action === 'SELL' && qty > Number(p.quantity) + 1e-9) return $('#tradeStatus').textContent = 'كمية البيع أكبر من الكمية المملوكة.';
  $('#tradeStatus').textContent = 'جارٍ تنفيذ العملية وحفظها…';
  try {
    if (action === 'BUY') {
      const newQty = Number(p.quantity) + qty;
      const newAvg = ((Number(p.quantity) * Number(p.avg_price)) + (qty * price) + fee) / newQty;
      const { error: updateError } = await state.supabase.from('portfolio').update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() }).eq('id', id);
      if (updateError) throw updateError;
      const { error: tradeError } = await state.supabase.from('trades').insert({ user_id: state.session.user.id, position_id: id, symbol: p.symbol, action: 'BUY', quantity: qty, price, reason, notes, fees_usd: fee, exchange_rate_sar_per_usd: exchangeRate, gross_amount_usd: qty * price, gross_amount_sar: (qty * price + fee) * exchangeRate });
      if (tradeError) throw tradeError;
    } else {
      const remaining = Number(p.quantity) - qty;
      const realizedPnl = ((price - Number(p.avg_price)) * qty) - fee;
      const realizedPnlPct = Number(p.avg_price) ? ((price / Number(p.avg_price)) - 1) * 100 : 0;
      const { error: tradeError } = await state.supabase.from('trades').insert({ user_id: state.session.user.id, position_id: id, symbol: p.symbol, action: remaining <= 1e-9 ? 'CLOSE' : 'SELL', quantity: qty, price, reason, notes, realized_pnl: realizedPnl, fees_usd: fee, exchange_rate_sar_per_usd: exchangeRate, gross_amount_usd: qty * price, gross_amount_sar: (qty * price - fee) * exchangeRate });
      if (tradeError) throw tradeError;
      if (remaining <= 1e-9) {
        const { error: closedError } = await state.supabase.from('closed_positions').insert({ user_id: state.session.user.id, symbol: p.symbol, quantity: p.quantity, avg_price: p.avg_price, exit_price: price, realized_pnl: realizedPnl, realized_pnl_pct: realizedPnlPct, close_reason: reason, notes, opened_at: p.created_at });
        if (closedError) throw closedError;
        const { error: deleteError } = await state.supabase.from('portfolio').delete().eq('id', id);
        if (deleteError) throw deleteError;
        await loadReplacements(p.symbol, reason);
      } else {
        const { error: updateError } = await state.supabase.from('portfolio').update({ quantity: remaining, updated_at: new Date().toISOString() }).eq('id', id);
        if (updateError) throw updateError;
      }
    }
    $('#tradeDialog').close();
    await loadPortfolio();
  } catch (error) { $('#tradeStatus').textContent = error.message; }
});

async function loadTrades() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('trades').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { $('#tradeHistory').innerHTML = `<p class="down">${error.message}</p>`; return; }
  state.trades = data || [];
  $('#tradeHistory').innerHTML = state.trades.length ? `<div class="trade-list">${state.trades.map((t) => `<div class="trade-row"><div><b>${t.symbol} · ${tradeActionArabic(t.action)}</b><small>${new Date(t.created_at).toLocaleString('ar-SA')} · ${fmt(t.quantity, 2)} سهم بسعر $${fmt(t.price)}</small></div><div><b class="${cls(t.realized_pnl)}">${t.realized_pnl == null ? '' : `${t.realized_pnl >= 0 ? '+' : ''}$${fmt(t.realized_pnl)}`}</b><small>${t.reason || t.notes || ''}${Number(t.fees_usd) ? ` · رسوم $${fmt(t.fees_usd)}` : ''}</small></div></div>`).join('')}</div>` : '<p class="muted">لا توجد عمليات مسجلة.</p>';
}
function tradeActionArabic(action) { return ({ BUY:'شراء', SELL:'بيع جزئي', CLOSE:'إغلاق كامل', UPDATE:'تعديل' })[action] || action; }

async function loadClosedPositions() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('closed_positions').select('*').order('closed_at', { ascending: false }).limit(30);
  if (error) { $('#closedPositions').innerHTML = `<p class="down">${error.message}</p>`; return; }
  state.closedPositions = data || [];
  $('#closedPositions').innerHTML = state.closedPositions.length ? `<div class="trade-list">${state.closedPositions.map((c) => `<div class="trade-row"><div><b>${c.symbol}</b><small>دخول $${fmt(c.avg_price)} · خروج $${fmt(c.exit_price)} · ${new Date(c.closed_at).toLocaleDateString('ar-SA')}</small></div><div><b class="${cls(c.realized_pnl)}">${c.realized_pnl >= 0 ? '+' : ''}$${fmt(c.realized_pnl)}</b><small>${safe(c.realized_pnl_pct, 2, '%')} · ${c.close_reason || ''}</small></div></div>`).join('')}</div>` : '<p class="muted">لا توجد صفقات مغلقة.</p>';
}
$('#refreshTrades').onclick = loadTrades;
$('#refreshClosed').onclick = loadClosedPositions;


function cashMovementSign(type) {
  return ['DEPOSIT', 'DIVIDEND', 'FX_GAIN'].includes(type) ? 1 : -1;
}
function cashMovementArabic(type) {
  return ({ DEPOSIT:'إيداع', WITHDRAWAL:'سحب', DIVIDEND:'توزيعات', FEE:'رسوم', FX_GAIN:'تسوية موجبة', FX_LOSS:'تسوية سالبة' })[type] || type;
}
async function loadCashLedger() {
  if (!state.session) return [];
  const { data, error } = await state.supabase.from('cash_ledger').select('*').order('occurred_at', { ascending: false }).limit(100);
  if (error) throw error;
  state.cashLedger = data || [];
  return state.cashLedger;
}
function investmentMetrics() {
  const { marketValue, costValue, pnl: unrealized } = portfolioStats();
  const realized = state.trades.reduce((sum, t) => sum + (Number(t.realized_pnl) || 0), 0);
  const fees = state.trades.reduce((sum, t) => sum + (Number(t.fees_usd) || 0), 0);
  const fx = state.sarPerUsd || 3.75;
  const ledgerCashSar = state.cashLedger.reduce((sum, row) => sum + cashMovementSign(row.movement_type) * Number(row.amount_sar || 0), 0);
  const tradeCashSar = state.trades.reduce((sum, t) => {
    if (!['BUY','SELL','CLOSE'].includes(t.action)) return sum;
    const rate = Number(t.exchange_rate_sar_per_usd || fx);
    const gross = Number(t.quantity || 0) * Number(t.price || 0);
    const fee = Number(t.fees_usd || 0);
    return sum + (t.action === 'BUY' ? -(gross + fee) * rate : (gross - fee) * rate);
  }, 0);
  const availableCashSar = ledgerCashSar + tradeCashSar;
  const netPnl = unrealized + realized;
  return { marketValue, costValue, unrealized, realized, fees, netPnl, availableCashSar, fx };
}
function renderInvestmentLedger() {
  const m = investmentMetrics();
  $('#investmentMarketValue').textContent = `$${fmt(m.marketValue)} / ${fmt(m.marketValue*m.fx)} ر.س`;
  $('#investmentCost').textContent = `$${fmt(m.costValue)} / ${fmt(m.costValue*m.fx)} ر.س`;
  $('#investmentUnrealized').textContent = `${m.unrealized>=0?'+':''}$${fmt(m.unrealized)} / ${fmt(m.unrealized*m.fx)} ر.س`;
  $('#investmentUnrealized').className = cls(m.unrealized);
  $('#investmentRealized').textContent = `${m.realized>=0?'+':''}$${fmt(m.realized)} / ${fmt(m.realized*m.fx)} ر.س`;
  $('#investmentRealized').className = cls(m.realized);
  $('#investmentFees').textContent = `$${fmt(m.fees)} / ${fmt(m.fees*m.fx)} ر.س`;
  $('#investmentNetPnl').textContent = `${m.netPnl>=0?'+':''}$${fmt(m.netPnl)} / ${fmt(m.netPnl*m.fx)} ر.س`;
  $('#investmentNetPnl').className = cls(m.netPnl);
  $('#investmentCash').textContent = `${fmt(m.availableCashSar)} ر.س`;
  $('#investmentFx').textContent = `${fmt(m.fx,4)} ر.س/$`;
  $('#cashLedgerList').innerHTML = state.cashLedger.length ? `<div class="trade-list">${state.cashLedger.map(x=>`<div class="trade-row"><div><b>${cashMovementArabic(x.movement_type)}</b><small>${new Date(x.occurred_at).toLocaleString('ar-SA')} · ${x.notes||''}</small></div><div><b class="${cashMovementSign(x.movement_type)>0?'up':'down'}">${cashMovementSign(x.movement_type)>0?'+':'-'}${fmt(x.amount_sar)} ر.س</b><small>${x.amount_usd?`$${fmt(x.amount_usd)}`:''}</small></div></div>`).join('')}</div>` : '<p class="muted">لا توجد حركات نقدية مسجلة.</p>';
}
async function loadInvestmentLedger() {
  try {
    await Promise.all([loadTrades(), loadCashLedger(), loadReconciliations(), loadPlannedOrders()]);
    renderInvestmentLedger();
    renderReconciliation();
    $('#investmentStatus').textContent = 'تم تحديث سجل الاستثمار.';
  } catch (error) { $('#investmentStatus').textContent = error.message; }
}
$('#cashLedgerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type=$('#cashMovementType').value;
  const amountSar=Number($('#cashAmountSar').value);
  const rate=Number($('#cashFxRate').value || state.sarPerUsd || 3.75);
  if (!(amountSar>0)) return $('#investmentStatus').textContent='أدخل مبلغًا صحيحًا.';
  state.sarPerUsd=rate; localStorage.setItem('asiri_sar_per_usd',String(rate));
  const { error }=await state.supabase.from('cash_ledger').insert({user_id:state.session.user.id,movement_type:type,amount_sar:amountSar,amount_usd:amountSar/rate,exchange_rate_sar_per_usd:rate,notes:$('#cashNotes').value.trim(),occurred_at:new Date().toISOString()});
  if(error) return $('#investmentStatus').textContent=error.message;
  e.target.reset(); $('#cashFxRate').value=rate; await loadInvestmentLedger();
});
$('#refreshInvestment')?.addEventListener('click', loadInvestmentLedger);


function latestReconciliation() {
  return state.reconciliations[0] || null;
}
async function loadReconciliations() {
  if (!state.session) return [];
  const { data, error } = await state.supabase.from('portfolio_reconciliations').select('*').order('reconciled_at', { ascending: false }).limit(20);
  if (error) throw error;
  state.reconciliations = data || [];
  return state.reconciliations;
}
function reconciliationMetrics() {
  const m = investmentMetrics();
  const r = latestReconciliation();
  const actualCash = r ? Number(r.actual_cash_sar || 0) : null;
  const actualInvestments = r ? Number(r.actual_investments_sar || 0) : null;
  const actualTotal = r ? Number(r.actual_total_sar || (actualCash + actualInvestments)) : null;
  const systemInvestments = m.marketValue * m.fx;
  const systemTotal = m.availableCashSar + systemInvestments;
  return { ...m, r, actualCash, actualInvestments, actualTotal, systemInvestments, systemTotal,
    cashDiff: actualCash == null ? null : actualCash - m.availableCashSar,
    investmentsDiff: actualInvestments == null ? null : actualInvestments - systemInvestments,
    totalDiff: actualTotal == null ? null : actualTotal - systemTotal };
}
function renderReconciliation() {
  const x = reconciliationMetrics();
  const r = x.r;
  $('#reconciliationStatusBadge').textContent = !r ? 'لم تتم المطابقة' : Math.abs(x.totalDiff) < 1 ? 'مطابق' : 'يحتاج تسوية';
  $('#reconciliationStatusBadge').className = Math.abs(x.totalDiff || 0) < 1 && r ? 'pill up' : 'pill down';
  $('#actualPortfolioTotal').textContent = r ? `${fmt(x.actualTotal)} ر.س` : '—';
  $('#systemPortfolioTotal').textContent = `${fmt(x.systemTotal)} ر.س`;
  $('#portfolioDifference').textContent = r ? `${x.totalDiff>=0?'+':''}${fmt(x.totalDiff)} ر.س` : '—';
  $('#portfolioDifference').className = cls(-(Math.abs(x.totalDiff || 0)));
  $('#reconciliationLastAt').textContent = r ? new Date(r.reconciled_at).toLocaleString('ar-SA') : '—';
  $('#reconciliationHistory').innerHTML = state.reconciliations.length ? `<div class="trade-list">${state.reconciliations.map(z=>`<div class="trade-row"><div><b>مطابقة المحفظة</b><small>${new Date(z.reconciled_at).toLocaleString('ar-SA')} · ${z.notes||''}</small></div><div><b>${fmt(z.actual_total_sar)} ر.س</b><small>سيولة ${fmt(z.actual_cash_sar)} · استثمارات ${fmt(z.actual_investments_sar)}</small></div></div>`).join('')}</div>` : '<p class="muted">لا توجد مطابقات محفوظة.</p>';
  const base = Number(localStorage.getItem('asiri_recovery_base_sar') || 5010);
  const current = r ? x.actualTotal : x.systemTotal;
  const gap = Math.max(0, base-current);
  const pct = current>0 ? gap/current*100 : 0;
  $('#recoveryBase').textContent = `${fmt(base)} ر.س`;
  $('#recoveryCurrent').textContent = `${fmt(current)} ر.س`;
  $('#recoveryGap').textContent = `${fmt(gap)} ر.س`;
  $('#recoveryPct').textContent = `${fmt(pct)}%`;
  $('#recoveryProgress').style.width = `${Math.max(0,Math.min(100,current/base*100))}%`;
}
async function loadPlannedOrders() {
  if (!state.session) return [];
  const { data, error } = await state.supabase.from('planned_orders').select('*').order('stage_order', { ascending:true });
  if (error) throw error;
  state.plannedOrders = data || [];
  renderPlannedOrders();
  return state.plannedOrders;
}
function orderStatusArabic(s){return ({PENDING:'معلّق',EXECUTED:'منفذ',CANCELLED:'ملغي',EXPIRED:'منتهي'})[s]||s;}
function renderPlannedOrders(){
  const rows=state.plannedOrders;
  $('#plannedOrdersList').innerHTML=rows.length?`<div class="trade-list">${rows.map(o=>`<div class="trade-row"><div><b>${o.symbol} · ${o.side==='SELL'?'بيع':'شراء'} · المرحلة ${o.stage_order||'—'}</b><small>${fmt(o.quantity,2)} سهم عند $${fmt(o.target_price_usd)} · ${orderStatusArabic(o.status)}</small></div><div class="row-actions">${o.status==='PENDING'?`<button data-execute-order="${o.id}">تنفيذ</button><button class="danger" data-cancel-order="${o.id}">إلغاء</button>`:''}</div></div>`).join('')}</div>`:'<p class="muted">لا توجد أوامر مجدولة.</p>';
  $$('[data-cancel-order]').forEach(b=>b.onclick=()=>updatePlannedOrderStatus(b.dataset.cancelOrder,'CANCELLED'));
  $$('[data-execute-order]').forEach(b=>b.onclick=()=>executePlannedOrder(b.dataset.executeOrder));
}
async function updatePlannedOrderStatus(id,status){
  const {error}=await state.supabase.from('planned_orders').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error) return alert(error.message); await loadPlannedOrders();
}
async function executePlannedOrder(id){
  const o=state.plannedOrders.find(x=>x.id===id); if(!o)return;
  const p=state.positions.find(x=>x.symbol===o.symbol); if(!p)return alert('المركز غير موجود في المحفظة.');
  const price=Number(prompt('سعر التنفيذ الفعلي',o.target_price_usd)); if(!(price>0))return;
  const fee=Number(prompt('الرسوم بالدولار','0')||0);
  if(o.side==='SELL' && Number(o.quantity)>Number(p.quantity)+1e-9)return alert('كمية الأمر أكبر من الكمية المملوكة.');
  const remaining=Number(p.quantity)-Number(o.quantity);
  const realized=((price-Number(p.avg_price))*Number(o.quantity))-fee;
  const {error:tradeError}=await state.supabase.from('trades').insert({user_id:state.session.user.id,position_id:p.id,symbol:o.symbol,action:remaining<=1e-9?'CLOSE':'SELL',quantity:o.quantity,price,fees_usd:fee,exchange_rate_sar_per_usd:state.sarPerUsd,realized_pnl:realized,reason:'تنفيذ أمر مجدول',notes:o.notes||''});
  if(tradeError)return alert(tradeError.message);
  const portfolioResult=remaining<=1e-9?await state.supabase.from('portfolio').delete().eq('id',p.id):await state.supabase.from('portfolio').update({quantity:remaining,updated_at:new Date().toISOString()}).eq('id',p.id);
  if(portfolioResult.error)return alert(portfolioResult.error.message);
  const {error:orderError}=await state.supabase.from('planned_orders').update({status:'EXECUTED',actual_price_usd:price,fees_usd:fee,executed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);
  if(orderError)return alert(orderError.message);
  await loadPortfolio(); await loadPlannedOrders();
}
$('#reconciliationForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const cash=Number($('#actualCashSar').value), inv=Number($('#actualInvestmentsSar').value), base=Number($('#recoveryBaseInput').value||5010);
  if(!(cash>=0)||!(inv>=0))return $('#reconciliationFormStatus').textContent='أدخل قيمًا صحيحة.';
  localStorage.setItem('asiri_recovery_base_sar',String(base));
  const {error}=await state.supabase.from('portfolio_reconciliations').insert({user_id:state.session.user.id,actual_cash_sar:cash,actual_investments_sar:inv,actual_total_sar:cash+inv,exchange_rate_sar_per_usd:Number($('#reconciliationFx').value||state.sarPerUsd||3.75),notes:$('#reconciliationNotes').value.trim(),reconciled_at:new Date().toISOString()});
  if(error)return $('#reconciliationFormStatus').textContent=error.message;
  $('#reconciliationFormStatus').textContent='تم حفظ المطابقة الفعلية.'; await loadInvestmentLedger();
});
$('#plannedOrderForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const symbol=$('#plannedOrderSymbol').value.trim().toUpperCase(), qty=Number($('#plannedOrderQty').value), price=Number($('#plannedOrderPrice').value), stage=Number($('#plannedOrderStage').value||1);
  const p=state.positions.find(x=>x.symbol===symbol); if(!p)return $('#plannedOrderStatus').textContent='السهم غير موجود في المحفظة.';
  const pending=state.plannedOrders.filter(x=>x.symbol===symbol&&x.side==='SELL'&&x.status==='PENDING').reduce((s,x)=>s+Number(x.quantity),0);
  if(pending+qty>Number(p.quantity)+1e-9)return $('#plannedOrderStatus').textContent='إجمالي أوامر البيع يتجاوز الكمية المملوكة.';
  const {error}=await state.supabase.from('planned_orders').insert({user_id:state.session.user.id,position_id:p.id,symbol,side:'SELL',quantity:qty,target_price_usd:price,status:'PENDING',stage_order:stage,notes:$('#plannedOrderNotes').value.trim()});
  if(error)return $('#plannedOrderStatus').textContent=error.message; e.target.reset(); $('#plannedOrderStatus').textContent='تم حفظ الأمر المجدول.'; await loadPlannedOrders();
});

async function loadReplacements(closedSymbol, reason) {
  const exclude = [...new Set([...state.positions.map((x) => x.symbol), closedSymbol])].join(',');
  $('#replacementPanel').classList.remove('hidden');
  $('#replacementStatus').textContent = `تم إغلاق ${closedSymbol} بسبب: ${reason}. جارٍ البحث عن أفضل 3 بدائل…`;
  try {
    const r = await fetch(`/api/replacements?exclude=${encodeURIComponent(exclude)}`, { cache: 'no-store' });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || 'تعذر البحث عن البدائل');
    state.replacements = data.rows || [];
    $('#replacementStatus').textContent = `تم فحص ${data.scanned || 0} سهمًا. تحقق من التوافق الشرعي في عوائد قبل التنفيذ.`;
    $('#replacementResults').innerHTML = state.replacements.length ? state.replacements.map((q) => replacementCard(q)).join('') : '<p>لا يوجد بديل عالي الجودة حاليًا؛ الأفضل الاحتفاظ بالسيولة.</p>';
    $$('[data-repl-watch]').forEach((b) => b.onclick = () => addOpportunityToWatch(b.dataset.replWatch, b.dataset.score));
    $$('[data-repl-portfolio]').forEach((b) => b.onclick = () => { const q = state.replacements.find((x) => x.symbol === b.dataset.replPortfolio); if (q) prepareOpportunityPosition(q); });
  } catch (error) { $('#replacementStatus').textContent = error.message; }
}
function replacementCard(q) {
  const a = q.candidateAnalysis || {};
  return `<article class="golden-card"><div class="opportunity-head"><div><strong>${q.symbol}</strong><small>${q.name || ''}</small></div><div class="confidence"><span>الثقة</span><b>${a.confidence ?? a.asiriScore ?? '—'}/100</b></div></div><div class="opportunity-grid"><div><span>السعر</span><b>$${fmt(q.price)}</b></div><div><span>الدخول</span><b>$${fmt(a.entryLow)} – $${fmt(a.entryHigh)}</b></div><div><span>الوقف</span><b>$${fmt(a.stopLoss)}</b></div><div><span>الهدف 1</span><b>$${fmt(a.target1)}</b></div></div><div class="opportunity-actions"><button data-repl-portfolio="${q.symbol}">إضافة للمحفظة</button><button class="secondary" data-repl-watch="${q.symbol}" data-score="${a.confidence ?? a.asiriScore ?? 0}">إضافة للمراقبة</button></div></article>`;
}
$('#closeReplacement').onclick = () => $('#replacementPanel').classList.add('hidden');

async function loadWatchlist() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('watchlist').select('*').order('created_at', { ascending: true });
  if (error) { $('#watchStatus').textContent = error.message; return; }
  state.watchlist = data || []; await analyzeWatchlist();
}
async function analyzeWatchlist() {
  state.watchValues.clear();
  await Promise.all(state.watchlist.slice(0, 20).map(async (w) => {
    try { const r = await fetch(`/api/analyze/${encodeURIComponent(w.symbol)}`, { cache: 'no-store' }); const q = await r.json(); if (r.ok) state.watchValues.set(w.symbol, q); }
    catch { /* keep row */ }
  }));
  renderWatchlist();
}
function renderWatchlist() {
  $('#watchRows').innerHTML = state.watchlist.length ? state.watchlist.map((w) => { const q = state.watchValues.get(w.symbol), a = q?.candidateAnalysis || {}; return `<article class="watch-card"><div><b>${w.symbol}</b><small>${w.notes || 'بدون ملاحظة'}</small><p>${q ? `$${fmt(q.price)} · ${a.decision || '—'} · ${a.asiriScore ?? '—'}/100` : 'جارٍ التحليل أو البيانات غير متاحة'}</p></div><div class="actions"><button data-watch-analyze="${w.symbol}">تحليل</button><button class="danger" data-watch-delete="${w.id}">حذف</button></div></article>`; }).join('') : '<p class="muted">قائمة المراقبة فارغة.</p>';
  $$('[data-watch-analyze]').forEach((b) => b.onclick = () => { showPage('analysis'); $('#stockQuery').value = b.dataset.watchAnalyze; analyzeSymbol(b.dataset.watchAnalyze); });
  $$('[data-watch-delete]').forEach((b) => b.onclick = async () => { const { error } = await state.supabase.from('watchlist').delete().eq('id', b.dataset.watchDelete); if (error) return alert(error.message); await loadWatchlist(); });
}
$('#watchForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const symbol = $('#watchSymbol').value.trim().toUpperCase();
  const { error } = await state.supabase.from('watchlist').upsert({ user_id: state.session.user.id, symbol, notes: $('#watchNotes').value.trim() }, { onConflict: 'user_id,symbol' });
  $('#watchStatus').textContent = error ? error.message : 'تمت الإضافة'; if (!error) { e.target.reset(); await loadWatchlist(); }
});

const searchStatus = $('#searchStatus'), searchResults = $('#searchResults'), stockAnalysis = $('#stockAnalysis');
function renderCandidate(q) {
  const t = q.technicals || {}, a = q.candidateAnalysis || {};
  stockAnalysis.innerHTML = `<article class="analysis-card"><div class="analysis-hero"><div><h3>${q.symbol}</h3><div class="name">${q.name || ''} · ${q.exchange || ''}</div></div><div><div class="analysis-price">$${fmt(q.price)}</div><div class="${cls(q.changePercent)}">${q.changePercent == null ? '—' : `${q.changePercent >= 0 ? '+' : ''}${fmt(q.changePercent)}%`}</div></div></div>${spark(t.sparkline)}<div class="analysis-decision"><b>${a.decision || '—'} · Asiri Score ${a.asiriScore ?? '—'}/100</b><div>${a.reason || ''}</div></div><div class="analysis-grid"><div><span>الاتجاه</span><b>${t.trendLabel || '—'}</b></div><div><span>RSI 14</span><b>${safe(t.rsi14, 1)}</b></div><div><span>زخم 20 جلسة</span><b class="${cls(t.momentum20)}">${safe(t.momentum20, 2, '%')}</b></div><div><span>الحجم/المتوسط</span><b>${safe(a.volumeRatio, 2, '×')}</b></div><div><span>الدعم التقريبي</span><b>$${fmt(a.support)}</b></div><div><span>المقاومة التقريبية</span><b>$${fmt(a.resistance)}</b></div><div><span>وقف فني إرشادي</span><b>$${fmt(a.stopLoss)}</b></div><div><span>الهدف الإرشادي الأول</span><b>$${fmt(a.target1)}</b></div></div><div class="form-actions"><button id="addAnalyzed">إضافة للمحفظة</button><button id="watchAnalyzed" class="secondary">إضافة للمراقبة</button></div><p class="analysis-note">التحليل آلي وفني، وليس تحققًا شرعيًا أو ضمانًا للربح.</p></article>`;
  $('#addAnalyzed').onclick = () => { $('#symbol').value = q.symbol; $('#stopLoss').value = a.stopLoss ?? ''; $('#target1').value = a.target1 ?? ''; showPage('portfolio'); $('#positionForm').scrollIntoView({ behavior: 'smooth' }); };
  $('#watchAnalyzed').onclick = async () => { const { error } = await state.supabase.from('watchlist').upsert({ user_id: state.session.user.id, symbol: q.symbol, notes: `Asiri Score ${a.asiriScore ?? '—'}` }, { onConflict: 'user_id,symbol' }); if (error) alert(error.message); else { await loadWatchlist(); alert('تمت الإضافة إلى المراقبة'); } };
}
async function analyzeSymbol(symbol) {
  searchStatus.textContent = `جارٍ تحليل ${symbol}…`; stockAnalysis.innerHTML = '';
  try { const r = await fetch(`/api/analyze/${encodeURIComponent(symbol)}`, { cache: 'no-store' }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'تعذر التحليل'); renderCandidate(data); searchStatus.textContent = `تم التحديث: ${new Date().toLocaleTimeString('ar-SA')}`; }
  catch (e) { searchStatus.textContent = e.message; }
}
$('#stockSearch').addEventListener('submit', async (e) => {
  e.preventDefault(); const term = $('#stockQuery').value.trim(); if (!term) return;
  searchStatus.textContent = 'جارٍ البحث…'; searchResults.innerHTML = ''; stockAnalysis.innerHTML = '';
  try { const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: 'no-store' }); const rows = await r.json(); if (!r.ok) throw new Error(rows.error || 'تعذر البحث'); searchStatus.textContent = rows.length ? `تم العثور على ${rows.length} نتيجة` : 'لا توجد نتائج'; searchResults.innerHTML = rows.map((x) => `<div class="result-row"><div><b>${x.symbol} — ${x.name}</b><small>${x.exchange || 'سوق أمريكي'}${x.industry ? ` · ${x.industry}` : ''}</small></div><button data-symbol="${x.symbol}">تحليل</button></div>`).join(''); $$('button[data-symbol]').forEach((b) => b.onclick = () => analyzeSymbol(b.dataset.symbol)); }
  catch (e) { searchStatus.textContent = e.message; }
});

async function addOpportunityToWatch(symbol, score) {
  if (!state.session) return alert('قاعدة البيانات غير جاهزة بعد.');
  const { error } = await state.supabase.from('watchlist').upsert({
    user_id: state.session.user.id,
    symbol,
    notes: `فرصة ذكية — ثقة ${score}/100`
  }, { onConflict: 'user_id,symbol' });
  if (error) return alert(error.message);
  await loadWatchlist();
  alert(`تمت إضافة ${symbol} إلى قائمة المراقبة`);
}

function prepareOpportunityPosition(q) {
  const a = q.candidateAnalysis || {};
  const blockers = [];
  if (Number(q.changePercent || 0) > 12) blockers.push('ارتفاع يومي أكبر من 12% — خطر مطاردة سعرية');
  if (Number(a.riskReward || 0) > 0 && Number(a.riskReward) < 1.8) blockers.push('العائد إلى المخاطرة أقل من 1.8');
  if (a.goldenQualified === false) blockers.push('لم يكتمل تأهيل Golden Alert');
  if (blockers.length) {
    alert(`🚫 ممنوع تجهيز الشراء لـ ${q.symbol}:\n• ${blockers.join('\n• ')}\n\nسجّل الحالة في سجل القرارات للمراجعة.`);
    return;
  }
  $('#symbol').value = q.symbol;
  $('#avgPrice').value = a.entryLow ?? q.price ?? '';
  $('#stopLoss').value = a.stopLoss ?? '';
  $('#target1').value = a.target1 ?? '';
  $('#target2').value = a.target2 ?? '';
  $('#notes').value = `فرصة ذكية — ثقة ${a.confidence ?? a.asiriScore ?? '—'}/100. تحقق شرعيًا في عوائد قبل التنفيذ.`;
  showPage('portfolio');
  $('#positionForm').scrollIntoView({ behavior: 'smooth' });
  $('#managerStatus').textContent = 'تم تجهيز بيانات السهم. أدخل الكمية وراجع الأرقام قبل الحفظ.';
}

function renderGolden() {
  const rows = state.opportunities || [];
  $('#goldenResults').innerHTML = rows.length ? rows.map((q) => {
    const a = q.candidateAnalysis || {};
    const reasons = Array.isArray(a.reasons) ? a.reasons : [a.reason].filter(Boolean);
    return `<article class="golden-card opportunity-card">
      <div class="opportunity-head"><div><strong>${q.symbol}</strong><small>${q.name || ''}</small></div><div class="confidence"><span>نسبة الثقة</span><b>${a.confidence ?? a.asiriScore ?? '—'}/100</b></div></div>
      <div class="opportunity-price"><span>السعر الحالي</span><b>$${fmt(q.price)}</b><small class="${cls(q.changePercent)}">${q.changePercent == null ? '—' : `${q.changePercent >= 0 ? '+' : ''}${fmt(q.changePercent)}%`}</small></div>
      <div class="opportunity-grid">
        <div><span>منطقة الدخول المقترحة</span><b>$${fmt(a.entryLow)} – $${fmt(a.entryHigh)}</b></div>
        <div><span>وقف الخسارة</span><b>$${fmt(a.stopLoss)}</b></div>
        <div><span>الهدف الأول</span><b>$${fmt(a.target1)}</b></div>
        <div><span>الهدف الثاني</span><b>$${fmt(a.target2)}</b></div>
        <div><span>العائد/المخاطرة</span><b>${safe(a.riskReward, 2)}</b></div>
        <div><span>القرار</span><b>${a.decision || 'مراقبة'}</b></div>
      </div>
      <div class="opportunity-reasons"><b>سبب الترشيح</b><ul>${reasons.map((r) => `<li>${r}</li>`).join('')}</ul></div>
      <p class="sharia-note">⚠️ ${a.shariaStatus || 'يجب التحقق من التوافق الشرعي في عوائد قبل الشراء.'}</p>
      <div class="opportunity-actions"><button data-op-portfolio="${q.symbol}">إضافة للمحفظة</button><button class="secondary" data-op-watch="${q.symbol}" data-score="${a.confidence ?? a.asiriScore ?? 0}">إضافة للمراقبة</button><button class="ghost" data-op-analysis="${q.symbol}">فتح التحليل</button></div>
    </article>`;
  }).join('') : '<section class="panel"><h3>لا توجد فرصة مكتملة حاليًا</h3><p>عدم ظهور مرشح قوي يعني الانتظار والمحافظة على رأس المال، وليس البحث عن صفقة ضعيفة.</p></section>';
  $$('[data-op-portfolio]').forEach((b) => b.onclick = () => { const q = state.opportunities.find((x) => x.symbol === b.dataset.opPortfolio); if (q) prepareOpportunityPosition(q); });
  $$('[data-op-watch]').forEach((b) => b.onclick = () => addOpportunityToWatch(b.dataset.opWatch, b.dataset.score));
  $$('[data-op-analysis]').forEach((b) => b.onclick = () => { showPage('analysis'); $('#stockQuery').value = b.dataset.opAnalysis; analyzeSymbol(b.dataset.opAnalysis); });
}

async function loadOpportunities(force = false) {
  const status = $('#opportunityStatus');
  status.textContent = force ? 'جارٍ إعادة فحص المرشحين…' : 'جارٍ تحميل الفرص الذكية…';
  try {
    const symbols = [...new Set([...state.positions.map((x) => x.symbol), ...state.watchlist.map((x) => x.symbol)])].join(',');
    const r = await fetch(`/api/opportunities?symbols=${encodeURIComponent(symbols)}`, { cache: 'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'تعذر تحميل الفرص');
    state.opportunities = data.rows || [];
    setTimeout(() => persistDerivedAlerts().catch(console.error), 0);
    status.textContent = `تم فحص ${data.scanned || 0} سهمًا — آخر تحديث ${new Date(data.updatedAt).toLocaleTimeString('ar-SA')}`;
    renderGolden();
  } catch (error) {
    status.textContent = error.message;
    state.opportunities = [];
    renderGolden();
  }
}
$('#scanGolden').onclick = () => loadOpportunities(true);


function deriveLiveAlerts() {
  const day = new Date().toISOString().slice(0, 10);
  const alerts = [];
  const add = (symbol, type, severity, message, triggerPrice = null, payload = {}) => alerts.push({ symbol, alert_type: type, severity, message, trigger_price: triggerPrice, rule_key: `${symbol}:${type}:${day}`, payload, status: 'unread', is_active: true });
  for (const p of state.positions) {
    const q = state.values.get(p.symbol); if (!q || q.error) continue;
    const price = Number(q.price || 0); const stop = Number(p.stop_loss || 0); const t1 = Number(p.target1 || 0); const t2 = Number(p.target2 || 0); const vol = Number(q.technicals?.volumeRatio || 0);
    if (stop && price <= stop) add(p.symbol, 'STOP_HIT', 'critical', `كسر ${p.symbol} وقف الخسارة عند $${fmt(stop)}. راجع التنفيذ فورًا.`, stop, { price });
    else if (stop && ((price / stop) - 1) * 100 <= 3) add(p.symbol, 'STOP_NEAR', 'high', `${p.symbol} يبعد أقل من 3% عن وقف الخسارة.`, stop, { price });
    if (t2 && price >= t2) add(p.symbol, 'TARGET2_HIT', 'golden', `${p.symbol} بلغ الهدف الثاني $${fmt(t2)}.`, t2, { price });
    else if (t1 && price >= t1) add(p.symbol, 'TARGET1_HIT', 'golden', `${p.symbol} بلغ الهدف الأول $${fmt(t1)}.`, t1, { price });
    if (vol >= 1.8) add(p.symbol, 'VOLUME_SPIKE', 'high', `حجم تداول ${p.symbol} بلغ ${fmt(vol,1)}× من المتوسط.`, null, { price, volRatio: vol });
  }
  for (const q of state.opportunities || []) {
    const a = q.candidateAnalysis || {}; const confidence = Number(a.confidence || a.asiriScore || 0);
    if (confidence >= 85) add(q.symbol, 'GOLDEN_ALERT', 'golden', `${q.symbol}: ${a.decision || 'فرصة قوية'} بثقة ${confidence}/100.`, a.entryLow || q.price, { confidence, entryLow: a.entryLow, entryHigh: a.entryHigh, stopLoss: a.stopLoss, target1: a.target1, target2: a.target2 });
  }
  return alerts;
}

async function persistDerivedAlerts() {
  if (!state.session || !state.supabase) return;
  const rows = deriveLiveAlerts().map((a) => ({ ...a, user_id: state.session.user.id }));
  if (!rows.length) return;
  const { data, error } = await state.supabase.from('alerts').upsert(rows, { onConflict: 'user_id,rule_key', ignoreDuplicates: true }).select();
  if (error) { console.warn('alerts-upsert', error.message); return; }
  if (data?.length) {
    for (const alert of data) notifyDevice(alert);
    await loadAlerts();
  }
}

function alertIcon(a) { return a.alert_type === 'GOLDEN_ALERT' ? '⚡' : a.alert_type?.includes('STOP') ? '🛑' : a.alert_type?.includes('TARGET') ? '🎯' : a.alert_type === 'VOLUME_SPIKE' ? '📊' : '🔔'; }
function alertCategory(a) { return a.alert_type === 'GOLDEN_ALERT' ? 'golden' : a.alert_type?.includes('STOP') || a.alert_type?.includes('TARGET') || a.alert_type === 'VOLUME_SPIKE' ? 'portfolio' : 'other'; }
function renderAlertCenter() {
  const filter = $('#alertFilter')?.value || 'all';
  const rows = state.alertsDb.filter((a) => filter === 'all' || (filter === 'unread' && a.status !== 'read') || (filter === 'critical' && a.severity === 'critical') || (filter === 'golden' && a.alert_type === 'GOLDEN_ALERT') || (filter === 'portfolio' && alertCategory(a) === 'portfolio'));
  const unread = state.alertsDb.filter((a) => a.status !== 'read').length;
  const critical = state.alertsDb.filter((a) => a.severity === 'critical' && a.status !== 'read').length;
  const golden = state.alertsDb.filter((a) => a.alert_type === 'GOLDEN_ALERT' && a.status !== 'read').length;
  $('#unreadAlerts').textContent = unread; $('#criticalAlerts').textContent = critical; $('#goldenAlertCount').textContent = golden;
  $('#telegramStatus').textContent = state.notificationStatus.telegramEnabled ? 'مفعّل' : 'غير مفعّل';
  $('#navAlertBadge').textContent = unread; $('#navAlertBadge').classList.toggle('hidden', !unread);
  $('#alertCenterList').innerHTML = rows.length ? rows.map((a) => `<article class="alert-item ${a.status !== 'read' ? 'unread' : ''} ${a.severity || ''} ${a.alert_type === 'GOLDEN_ALERT' ? 'golden' : ''}"><div class="alert-icon">${alertIcon(a)}</div><div class="alert-body"><h4>${a.symbol || 'السوق'} — ${a.alert_type?.replaceAll('_',' ') || 'تنبيه'}</h4><p>${a.message}</p><div class="alert-meta"><span class="severity-pill">${a.severity || 'info'}</span><span>${new Date(a.created_at).toLocaleString('ar-SA')}</span>${a.trigger_price ? `<span>السعر المرجعي $${fmt(a.trigger_price)}</span>` : ''}</div></div><div class="alert-actions">${a.status !== 'read' ? `<button class="ghost" data-read-alert="${a.id}">تمت القراءة</button>` : ''}<button class="danger" data-delete-alert="${a.id}">حذف</button></div></article>`).join('') : '<div class="empty-alerts">لا توجد تنبيهات مطابقة.</div>';
  $$('[data-read-alert]').forEach((b) => b.onclick = () => markAlertRead(b.dataset.readAlert));
  $$('[data-delete-alert]').forEach((b) => b.onclick = () => deleteAlert(b.dataset.deleteAlert));
  renderMissionControl();
}
async function loadAlerts() {
  if (!state.session) return;
  const { data, error } = await state.supabase.from('alerts').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) { $('#alertCenterStatus').textContent = error.message; return; }
  state.alertsDb = data || []; renderAlertCenter();
}
async function markAlertRead(id) { const { error } = await state.supabase.from('alerts').update({ status: 'read', updated_at: new Date().toISOString() }).eq('id', id); if (!error) await loadAlerts(); }
async function deleteAlert(id) { const { error } = await state.supabase.from('alerts').delete().eq('id', id); if (!error) await loadAlerts(); }
async function markAllRead() { const ids = state.alertsDb.filter((a) => a.status !== 'read').map((a) => a.id); if (!ids.length) return; const { error } = await state.supabase.from('alerts').update({ status: 'read', updated_at: new Date().toISOString() }).in('id', ids); if (!error) await loadAlerts(); }
function notifyDevice(alert) { if ('Notification' in window && Notification.permission === 'granted') new Notification(`Asiri Capital — ${alert.symbol || 'تنبيه'}`, { body: alert.message, icon: '/icon.svg' }); }
async function enableDeviceNotifications() { if (!('Notification' in window)) return alert('هذا المتصفح لا يدعم إشعارات الجهاز.'); const p = await Notification.requestPermission(); $('#alertCenterStatus').textContent = p === 'granted' ? 'تم تفعيل إشعارات الجهاز أثناء فتح المنصة.' : 'لم يتم منح صلاحية الإشعارات.'; }
async function loadNotificationStatus() { state.notificationStatus = await fetch('/api/notifications/status', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ telegramEnabled: false, backgroundAlertsEnabled: false })); renderAlertCenter(); }
async function testTelegram() {
  const button = $('#testTelegram');
  const result = $('#telegramTestResult') || $('#alertCenterStatus');
  if (!button || !result) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'جارٍ إرسال Golden Alert…';
  result.textContent = 'جارٍ إرسال رسالة Golden Alert التفصيلية إلى تيليجرام…';
  result.className = 'status';

  try {
    const statusResponse = await fetch('/api/notifications/status', { cache: 'no-store' });
    const statusData = await statusResponse.json();
    if (!statusResponse.ok) throw new Error(statusData.error || 'تعذر قراءة حالة التنبيهات.');
    if (!statusData.telegramEnabled) {
      throw new Error('تيليجرام غير مفعّل في Render. تحقق من TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID ثم أعد النشر.');
    }

    const response = await fetch('/api/notifications/telegram-golden-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إرسال التنبيه التجريبي.');

    result.textContent = '✅ تم إرسال Golden Alert التفصيلي بنجاح. افتح تيليجرام وتحقق من القالب الكامل.';
    result.className = 'status up';
    state.notificationStatus.telegramEnabled = true;
    renderAlertCenter();
  } catch (error) {
    result.textContent = `❌ ${error.message}`;
    result.className = 'status down';
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
function renderMissionControl() {
  const opp = [...(state.opportunities || [])].sort((a,b) => Number(b.candidateAnalysis?.confidence||0)-Number(a.candidateAnalysis?.confidence||0))[0];
  $('#bestOpportunity').innerHTML = opp ? `<b>${opp.symbol}</b><br><small>ثقة ${opp.candidateAnalysis?.confidence ?? '—'}/100</small>` : 'لا توجد فرصة مكتملة';
  const stops = state.positions.map((p) => { const q=state.values.get(p.symbol); if(!q?.price || !p.stop_loss) return null; return {symbol:p.symbol, pct:((Number(q.price)/Number(p.stop_loss))-1)*100}; }).filter(Boolean).sort((a,b)=>a.pct-b.pct);
  $('#nearestStop').innerHTML = stops[0] ? `<b>${stops[0].symbol}</b><br><small>${fmt(stops[0].pct)}% فوق الوقف</small>` : 'لا يوجد وقف مسجل';
  const g = state.alertsDb.find((a)=>a.alert_type==='GOLDEN_ALERT'); $('#latestGolden').innerHTML = g ? `<b>${g.symbol}</b><br><small>${g.message}</small>` : 'لا يوجد';
}

$('#openAlertCenter').onclick = () => showPage('alertcenter');
$('#refreshAlerts').onclick = async () => { await persistDerivedAlerts(); await loadAlerts(); };
$('#alertFilter').onchange = renderAlertCenter;
$('#markAllRead').onclick = markAllRead;
$('#enableDeviceNotifications').onclick = enableDeviceNotifications;
$('#testTelegram').onclick = testTelegram;


async function loadReportStatus() {
  const result = $('#reportTestResult');
  try {
    const response = await fetch('/api/reports/status', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر قراءة حالة التقارير.');
    $('#reportsEnabled').textContent = data.enabled ? 'مفعّلة' : 'غير مفعّلة';
    $('#closeSchedule').textContent = `${data.closeSchedule || '—'} نيويورك`;
    $('#preMarketSchedule').textContent = `${data.preMarketSchedule || '—'} نيويورك`;
    $('#reportsLastError').textContent = data.lastError || 'لا يوجد';
    const today = data.today || {};
    $('#marketDayStatus').textContent = today.status === 'closed' ? 'مغلق' : today.status === 'early-close' ? 'إغلاق مبكر' : 'جلسة كاملة';
    $('#marketDayReason').textContent = today.reason || 'لا يوجد';
    const next = data.nextCalendarEvent;
    $('#nextMarketEvent').textContent = next ? `${next.date} — ${next.reason}` : '—';
    if (result) { result.textContent = '✅ تم تحديث حالة التقارير.'; result.className = 'status up'; }
  } catch (error) {
    if (result) { result.textContent = `❌ ${error.message}`; result.className = 'status down'; }
  }
}
async function sendReportTest(type) {
  const button = type === 'close' ? $('#testCloseReport') : $('#testPreMarketReport');
  const result = $('#reportTestResult');
  if (!button || !result) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'جارٍ الإرسال…';
  result.textContent = type === 'close' ? 'جارٍ إنشاء تقرير الإغلاق وإرساله إلى تيليجرام…' : 'جارٍ إنشاء تقرير ما قبل الافتتاح وإرساله إلى تيليجرام…';
  result.className = 'status';
  try {
    const endpoint = type === 'close' ? '/api/reports/market-close-test' : '/api/reports/pre-market-test';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر إرسال التقرير التجريبي.');
    result.textContent = type === 'close' ? '✅ تم إرسال تقرير الإغلاق التجريبي إلى تيليجرام.' : '✅ تم إرسال تقرير ما قبل الافتتاح التجريبي إلى تيليجرام.';
    result.className = 'status up';
    await loadReportStatus();
  } catch (error) {
    result.textContent = `❌ ${error.message}`;
    result.className = 'status down';
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function reportHistoryDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
}
function reportTypeLabel(type) {
  return type === 'close' ? '📊 تقرير الإغلاق' : type === 'sunday-futures' ? '🌙 موجز العقود الأسبوعي' : '🌅 ما قبل الافتتاح';
}
async function loadReportHistory() {
  const list = $('#reportHistoryList');
  const status = $('#reportHistoryStatus');
  if (!list || !status) return;
  status.textContent = 'جارٍ تحميل سجل التقارير…';
  status.className = 'status';
  const filter = $('#reportHistoryFilter')?.value || 'all';
  try {
    const query = filter === 'all' ? '?limit=20' : `?limit=20&type=${encodeURIComponent(filter)}`;
    const response = await fetch(`/api/reports/history${query}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل سجل التقارير.');
    const rows = data.rows || [];
    $('#lastSavedReport').textContent = rows[0] ? `${reportTypeLabel(rows[0].report_type)} — ${rows[0].market_date}` : 'لا يوجد';
    list.innerHTML = rows.length ? rows.map((row) => {
      const safeText = String(row.report_text || 'لا يوجد نص محفوظ').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
      return `<article class="alert-card severity-${row.report_type === 'close' ? 'golden' : 'info'}"><div class="alert-card-head"><div><span class="alert-type">${reportTypeLabel(row.report_type)}</span><h3>${row.market_date}</h3></div><time>${reportHistoryDate(row.sent_at || row.created_at)}</time></div><details><summary>عرض التقرير الكامل</summary><pre style="white-space:pre-wrap;direction:rtl;text-align:right">${safeText}</pre></details></article>`;
    }).join('') : '<div class="empty-alerts">لا توجد تقارير مرسلة محفوظة حتى الآن.</div>';
    status.textContent = `تم تحميل ${rows.length} تقريرًا.`;
    status.className = 'status up';
  } catch (error) {
    status.textContent = `❌ ${error.message}`;
    status.className = 'status down';
  }
}

function reportData() {
  const { list, marketValue, costValue, pnl, alerts } = portfolioStats();
  const ranked = [...list].sort((a, b) => (b.analysis?.asiriScore || 0) - (a.analysis?.asiriScore || 0));
  return { list, ranked, marketValue, costValue, pnl, alerts };
}
function renderReport() {
  const d = reportData(); const date = new Date().toLocaleString('ar-SA');
  let title = 'تقرير الإغلاق';
  let intro = `نبض السوق: ${state.market.regime} (${state.market.score ?? '—'}/100).`;
  if (state.currentReport === 'premarket') { title = 'تقرير ما قبل الافتتاح'; intro = 'خطة الجلسة: راقب قوة المؤشرات، ولا تنفذ إلا بعد تأكيد السعر والحجم.'; }
  if (state.currentReport === 'weekly') { title = 'التقرير الأسبوعي'; intro = 'مراجعة جودة المراكز وترتيبها من الأقوى إلى الأضعف.'; }
  $('#reportOutput').innerHTML = `<span class="eyebrow">Asiri Capital REPORT</span><h2>${title}</h2><p>${date}</p><h3>ملخص السوق</h3><p>${intro}</p><h3>المحفظة</h3><p>القيمة: $${fmt(d.marketValue)} · الربح/الخسارة: ${d.costValue ? `${d.pnl >= 0 ? '+' : ''}$${fmt(d.pnl)} (${fmt(d.pnl / d.costValue * 100)}%)` : '—'}.</p><h3>ترتيب المراكز</h3>${d.ranked.length ? `<ol>${d.ranked.map((q) => `<li><b>${q.symbol}</b> — ${q.analysis?.decision || '—'} — ${q.analysis?.asiriScore ?? '—'}/100</li>`).join('')}</ol>` : '<p>لا توجد مراكز.</p>'}<h3>التنبيهات</h3>${d.alerts.length ? `<ul>${d.alerts.map((a) => `<li>${a.symbol}: ${a.text}</li>`).join('')}</ul>` : '<p>لا توجد تنبيهات حرجة.</p>'}<h3>القرار التنفيذي</h3><p>${state.market.score < 45 ? 'حماية رأس المال وعدم فتح مراكز جديدة.' : 'الالتزام بالمراكز عالية الجودة فقط، والانتظار عند غياب التأكيد.'}</p>`;
}
$$('[data-report]').forEach((b) => b.onclick = () => { $$('[data-report]').forEach((x) => x.classList.remove('active')); b.classList.add('active'); state.currentReport = b.dataset.report; renderReport(); });
const generateReportButton = $('#generateReport');
if (generateReportButton) {
  generateReportButton.onclick = () => {
    renderReport();
    const output = $('#reportOutput');
    if (output) {
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      output.setAttribute('tabindex', '-1');
      setTimeout(() => output.focus({ preventScroll: true }), 450);
    }
  };
}

const refreshReportStatusButton = $('#refreshReportStatus');
if (refreshReportStatusButton) refreshReportStatusButton.onclick = loadReportStatus;

const testCloseReportButton = $('#testCloseReport');
if (testCloseReportButton) testCloseReportButton.onclick = () => sendReportTest('close');

const testPreMarketReportButton = $('#testPreMarketReport');
if (testPreMarketReportButton) testPreMarketReportButton.onclick = () => sendReportTest('premarket');

const refreshReportHistoryButton = $('#refreshReportHistory');
if (refreshReportHistoryButton) {
  refreshReportHistoryButton.onclick = async () => {
    refreshReportHistoryButton.disabled = true;
    const original = refreshReportHistoryButton.textContent;
    refreshReportHistoryButton.textContent = 'جارٍ التحديث…';
    try {
      await loadReportHistory();
      const history = $('#reportHistoryStatus');
      if (history) history.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      refreshReportHistoryButton.disabled = false;
      refreshReportHistoryButton.textContent = original;
    }
  };
}

const reportHistoryFilter = $('#reportHistoryFilter');
if (reportHistoryFilter) reportHistoryFilter.onchange = loadReportHistory;

$$('[data-mi-filter]').forEach(b=>b.onclick=()=>{$$('[data-mi-filter]').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.marketIntelligenceFilter=b.dataset.miFilter;renderMarketIntelligence()});
$('#miOpenGolden')?.addEventListener('click',()=>showPage('golden'));
$('#miOpenPortfolio')?.addEventListener('click',()=>showPage('portfolio'));


function riskArabic(v){return ({LOW:'منخفض',MEDIUM:'متوسط',HIGH:'مرتفع',CRITICAL:'حرج'})[v]||v}
function planStatusArabic(v){return ({HOLD:'احتفاظ',WATCH:'مراقبة',REDUCE:'تخفيف',EXIT:'خروج'})[v]||v}
function sourceArabic(v){return ({ASIRI:'Asiri Capital',EXTERNAL:'توصية خارجية',PERSONAL:'قرار شخصي'})[v]||v}
function outcomeArabic(v){return ({OPEN:'تحت المراجعة',WIN:'ناجحة',LOSS:'خاسرة',CANCELLED:'ملغاة'})[v]||v}

async function loadPositionPlans(){
  if(!state.session)return;
  const {data,error}=await state.supabase.from('position_plans').select('*').order('updated_at',{ascending:false});
  if(error){$('#positionPlansList').innerHTML=`<p class="down">${error.message}</p>`;return}
  state.positionPlans=data||[]; renderPositionPlans(); renderUrgentActions();
}
function renderPositionPlans(){
  const rows=state.positions.map(p=>({p,plan:state.positionPlans.find(x=>x.position_id===p.id)}));
  $('#positionPlansList').innerHTML=rows.length?rows.map(({p,plan})=>`<article class="plan-card ${String(plan?.risk_level||'MEDIUM').toLowerCase()}"><div class="section-head"><div><b>${p.symbol}</b><small>${plan?planStatusArabic(plan.status):'لم توثق الخطة'}</small></div><button class="ghost" data-open-plan="${p.id}">${plan?'تعديل الخطة':'إنشاء خطة'}</button></div><div class="plan-meta"><span>المصدر <b>${sourceArabic(plan?.decision_source||'PERSONAL')}</b></span><span>المخاطرة <b>${riskArabic(plan?.risk_level||'MEDIUM')}</b></span><span>التعزيز <b>${plan?.block_adding?'ممنوع':'مشروط'}</b></span><span>المراجعة <b>${plan?.next_review_date||'—'}</b></span></div><p>${plan?.management_notes||plan?.entry_reason||'أضف سبب الدخول وخطة الإدارة.'}</p></article>`).join(''):'<p class="muted">لا توجد مراكز.</p>';
  $$('[data-open-plan]').forEach(b=>b.onclick=()=>openPlanDialog(b.dataset.openPlan));
}
function openPlanDialog(positionId){
  const p=state.positions.find(x=>x.id===positionId);if(!p)return;
  const plan=state.positionPlans.find(x=>x.position_id===positionId);
  $('#planPositionId').value=positionId;$('#planTitle').textContent=`خطة إدارة ${p.symbol}`;
  $('#planStatus').value=plan?.status||'WATCH';$('#planSource').value=plan?.decision_source||'PERSONAL';$('#planRisk').value=plan?.risk_level||'MEDIUM';$('#planBlockAdd').value=String(Boolean(plan?.block_adding));$('#planReviewDate').value=plan?.next_review_date||'';$('#planAddCondition').value=plan?.add_condition||'';$('#planEntryReason').value=plan?.entry_reason||'';$('#planNotes').value=plan?.management_notes||'';$('#planFormStatus').textContent='';$('#planDialog').showModal();
}
$('#closePlanDialog')?.addEventListener('click',()=>$('#planDialog').close());$('#cancelPlan')?.addEventListener('click',()=>$('#planDialog').close());
$('#planForm')?.addEventListener('submit',async e=>{e.preventDefault();const positionId=$('#planPositionId').value;const p=state.positions.find(x=>x.id===positionId);if(!p)return;const payload={user_id:state.session.user.id,position_id:positionId,symbol:p.symbol,status:$('#planStatus').value,decision_source:$('#planSource').value,risk_level:$('#planRisk').value,block_adding:$('#planBlockAdd').value==='true',next_review_date:$('#planReviewDate').value||null,add_condition:$('#planAddCondition').value.trim(),entry_reason:$('#planEntryReason').value.trim(),management_notes:$('#planNotes').value.trim(),updated_at:new Date().toISOString()};const {error}=await state.supabase.from('position_plans').upsert(payload,{onConflict:'user_id,position_id'});if(error)return $('#planFormStatus').textContent=error.message;await state.supabase.from('decision_journal').insert({user_id:state.session.user.id,symbol:p.symbol,decision_type:payload.status,decision_source:payload.decision_source,reason:payload.management_notes||payload.entry_reason,outcome_status:'OPEN',is_blocked:payload.block_adding,metadata:{riskLevel:payload.risk_level,addCondition:payload.add_condition,positionId}});$('#planDialog').close();await Promise.all([loadPositionPlans(),loadDecisionJournal()]);});
$('#refreshPositionPlans')?.addEventListener('click',loadPositionPlans);

function renderUrgentActions(){
  const actions=[];
  for(const p of state.positions){const q=state.values.get(p.symbol),plan=state.positionPlans.find(x=>x.position_id===p.id);const pnl=Number(q?.analysis?.pnlPct);if(plan?.risk_level==='CRITICAL'||plan?.status==='EXIT')actions.push({symbol:p.symbol,level:'critical',text:'مراجعة عاجلة / خروج'});else if(plan?.block_adding||pnl<=-7)actions.push({symbol:p.symbol,level:'high',text:'ممنوع التعزيز — مراجعة المخاطر'});else if(pnl>0)actions.push({symbol:p.symbol,level:'good',text:'احتفاظ وحماية الربح'});else actions.push({symbol:p.symbol,level:'watch',text:'احتفاظ ومراقبة'});}
  $('#urgentActions').innerHTML=actions.length?actions.map(a=>`<div class="urgent-item ${a.level}"><b>${a.symbol}</b><span>${a.text}</span></div>`).join(''):'<p class="muted">لا توجد إجراءات عاجلة.</p>';
}

async function loadDecisionJournal(){
  if(!state.session)return;const {data,error}=await state.supabase.from('decision_journal').select('*').order('decision_at',{ascending:false}).limit(200);if(error){$('#journalStatus').textContent=error.message;return}state.decisionJournal=data||[];renderDecisionJournal();
}
function renderDecisionJournal(){
  const filter=$('#journalFilter')?.value||'ALL';const rows=state.decisionJournal.filter(x=>filter==='ALL'||x.outcome_status===filter||x.decision_type===filter);$('#journalTotal').textContent=state.decisionJournal.length;$('#journalWins').textContent=state.decisionJournal.filter(x=>x.outcome_status==='WIN').length;$('#journalOpen').textContent=state.decisionJournal.filter(x=>x.outcome_status==='OPEN').length;$('#journalBlocked').textContent=state.decisionJournal.filter(x=>x.is_blocked||x.decision_type==='BLOCK').length;$('#journalList').innerHTML=rows.length?rows.map(x=>`<article class="journal-card ${x.is_blocked?'blocked':''}"><div class="section-head"><div><b>${x.symbol}</b><small>${x.decision_type} · ${sourceArabic(x.decision_source)}</small></div><span class="journal-outcome">${outcomeArabic(x.outcome_status)}</span></div><div class="journal-meta"><span>السعر <b>${x.decision_price?'$'+fmt(x.decision_price):'—'}</b></span><span>الثقة <b>${x.confidence??'—'}</b></span><span>الوقف <b>${x.stop_loss?'$'+fmt(x.stop_loss):'—'}</b></span><span>الهدف <b>${x.target1?'$'+fmt(x.target1):'—'}</b></span></div><p>${x.reason||'—'}</p>${x.lesson?`<p class="lesson">الدرس: ${x.lesson}</p>`:''}<small>${new Date(x.decision_at).toLocaleString('ar-SA')}</small></article>`).join(''):'<p class="muted">لا توجد قرارات موثقة.</p>';
}
$('#journalForm')?.addEventListener('submit',async e=>{e.preventDefault();const payload={user_id:state.session.user.id,symbol:$('#journalSymbol').value.trim().toUpperCase(),decision_type:$('#journalDecision').value,decision_source:$('#journalSource').value,decision_price:$('#journalPrice').value?Number($('#journalPrice').value):null,confidence:$('#journalConfidence').value?Number($('#journalConfidence').value):null,stop_loss:$('#journalStop').value?Number($('#journalStop').value):null,target1:$('#journalTarget1').value?Number($('#journalTarget1').value):null,outcome_status:$('#journalOutcome').value,reason:$('#journalReason').value.trim(),lesson:$('#journalLesson').value.trim(),is_blocked:$('#journalDecision').value==='BLOCK'};const {error}=await state.supabase.from('decision_journal').insert(payload);if(error)return $('#journalStatus').textContent=error.message;e.target.reset();$('#journalStatus').textContent='تم توثيق القرار.';await loadDecisionJournal();});
$('#refreshJournal')?.addEventListener('click',loadDecisionJournal);$('#journalFilter')?.addEventListener('change',renderDecisionJournal);$('#openDecisionJournal')?.addEventListener('click',()=>showPage('journal'));

function applySettings() {
  $('#pollSetting').value = String(state.settings.pollMs); $('#confirmDelete').checked = state.settings.confirmDelete; $('#compactMode').checked = state.settings.compactMode;
  document.body.classList.toggle('compact', state.settings.compactMode);
}
$('#settingsForm').addEventListener('submit', (e) => {
  e.preventDefault(); state.settings.pollMs = Number($('#pollSetting').value); state.settings.confirmDelete = $('#confirmDelete').checked; state.settings.compactMode = $('#compactMode').checked;
  localStorage.setItem('asiri_poll_ms', String(state.settings.pollMs)); localStorage.setItem('asiri_confirm_delete', String(state.settings.confirmDelete)); localStorage.setItem('asiri_compact_mode', String(state.settings.compactMode));
  applySettings(); startPolling(); $('#settingsStatus').textContent = 'تم حفظ الإعدادات على هذا الجهاز.';
});

async function renderAdmin() {
  const health = await fetch('/health', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ ok: false }));
  $('#diagnostics').innerHTML = `<p>الخادم: <b class="${health.ok ? 'up' : 'down'}">${health.ok ? 'يعمل' : 'متعطل'}</b></p><p>السوق: <b>${health.marketPulse || '—'}</b></p><p>ذاكرة التحليل: <b>${health.technicalCache ?? '—'}</b></p>`;
  $('#accountInfo').innerHTML = state.session ? `<p>الوضع: <b>جلسة شخصية تلقائية</b></p><p>معرّف الجهاز: <small>${state.session.user.id}</small></p>` : '<p>الجلسة غير جاهزة.</p>';
  $('#dbInfo').innerHTML = `<p>Supabase: <b class="${state.config?.supabase?.enabled ? 'up' : 'down'}">${state.config?.supabase?.enabled ? 'متصل' : 'غير متصل'}</b></p><p>المراكز: <b>${state.positions.length}</b></p><p>قائمة المراقبة: <b>${state.watchlist.length}</b></p>`;
}
$('#runDiagnostics').onclick = renderAdmin;

function startPolling() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (state.session) state.refreshTimer = setInterval(async () => { await refreshAnalysis().catch(console.error); await persistDerivedAlerts().catch(console.error); }, state.settings.pollMs);
}
$('#refreshAll').onclick = async () => { await Promise.all([refreshAnalysis(), loadWatchlist(), refreshMarket(), loadMarketIntelligence(true)]); };
async function refreshMarket() { state.market = await fetch('/api/market', { cache: 'no-store' }).then((r) => r.json()); renderMarket(); renderPortfolio(); }

async function setupAuth() {
  state.config = await fetch('/api/config', { cache: 'no-store' }).then((r) => r.json());
  if (!state.config.supabase?.enabled) throw new Error('إعدادات Supabase غير مكتملة في Render');
  state.supabase = window.supabase.createClient(state.config.supabase.url, state.config.supabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  let { data, error } = await state.supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const anonymous = await state.supabase.auth.signInAnonymously();
    if (anonymous.error) throw new Error(`فعّل Anonymous Sign-ins في Supabase: ${anonymous.error.message}`);
    data = { session: anonymous.data.session };
  }
  state.session = data.session;
  $('#connection').textContent = 'Supabase متصل تلقائيًا';
  $('#connection').className = 'pill up';
  await Promise.all([loadPortfolio(), loadWatchlist(), loadTrades(), loadClosedPositions(), loadAlerts(), loadNotificationStatus(), loadPositionPlans(), loadDecisionJournal(), loadReconciliations(), loadPlannedOrders()]);
  startPolling();
  await loadOpportunities().catch(console.error);
  await loadMarketIntelligence().catch(console.error);
  await persistDerivedAlerts().catch(console.error);
}

applySettings();
try {
  await refreshMarket();
  const es = new EventSource('/api/events'); es.addEventListener('market', (e) => { state.market = JSON.parse(e.data); renderMarket(); renderPortfolio(); });
  await setupAuth();
} catch (e) {
  $('#connection').textContent = e.message; $('#connection').className = 'pill down'; console.error(e);
}

$('#testCloseReport').onclick = () => sendReportTest('close');
$('#testPreMarketReport').onclick = () => sendReportTest('premarket');
$('#refreshReportStatus').onclick = loadReportStatus;
loadReportStatus();
