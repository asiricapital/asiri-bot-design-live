/* ASIRI Order Readiness Desk V1 — paper preview only; no broker submission path. */
(() => {
  'use strict';
  const STORAGE_KEY = 'asiri.order-readiness.paper-tickets.v1';
  const $ = (id) => document.getElementById(id);
  const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
  const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const state = { quotes: new Map(), lastObservedAt: null, result: null };

  function readTickets() { try { const x = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(x) ? x.slice(0, 20) : []; } catch { return []; } }
  function saveTickets(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20))); }
  function latestQuote(symbol) { return state.quotes.get(String(symbol || '').toUpperCase()) || null; }
  function symbols() {
    const fromRows = [...document.querySelectorAll('#stocks-list-wrapper [data-symbol], #stocks-list-wrapper [id^="row-"]')].map((x) => String(x.dataset.symbol || x.id.replace(/^row-/, '')).toUpperCase()).filter(Boolean);
    return [...new Set([...state.quotes.keys(), ...fromRows])].slice(0, 80);
  }

  function ensurePanel() {
    if ($('order-readiness-desk-v1')) return;
    const anchor = $('stocks-list-wrapper');
    if (!anchor?.parentNode) return;
    const panel = document.createElement('section');
    panel.id = 'order-readiness-desk-v1';
    panel.className = 'order-readiness-desk';
    panel.innerHTML = `<div class="order-readiness-head"><div><span class="eyebrow">ORDER READINESS DESK · PAPER ONLY</span><h3>جهّز الأمر قبل أي قرار</h3><p>احسب الكمية والمخاطرة وافحص البوابات، ثم أنشئ تذكرة تجريبية قابلة للمراجعة.</p></div><span class="order-readiness-lock">LIVE مقفول · لا إرسال</span></div><div class="order-readiness-grid"><div class="order-readiness-form"><div class="order-readiness-fields"><label>الأصل<select id="ordSymbol"></select></label><label>الاتجاه<select id="ordSide"><option value="BUY">شراء</option><option value="SELL">بيع</option></select></label><label>رأس المال<input id="ordCapital" type="number" min="0" step="100" value="1000"></label><label>المخاطرة %<input id="ordRiskPct" type="number" min="0.1" max="5" step="0.1" value="1"></label><label>سعر الدخول<input id="ordEntry" type="number" min="0" step="0.0001" placeholder="من Saxo أو أدخل يدويًا"></label><label>وقف الخسارة<input id="ordStop" type="number" min="0" step="0.0001"></label><label>الهدف الأول<input id="ordTarget" type="number" min="0" step="0.0001"></label><label>الانزلاق المتوقع %<input id="ordSlippage" type="number" min="0" max="5" step="0.05" value="0.15"></label></div><p id="ordDirty" class="order-readiness-dirty"></p><div class="order-readiness-actions"><button id="ordUseQuote" class="secondary" type="button">استخدم سعر Saxo</button><button id="ordPreview" class="primary" type="button">فحص ومعاينة الأمر</button><button id="ordReset" class="secondary" type="button">مسح</button></div><p class="order-readiness-note">المعادلة: مبلغ المخاطرة ÷ مسافة وقف الخسارة = الكمية المقترحة. لا توجد رافعة ولا إرسال للوسيط.</p></div><div class="order-readiness-result"><div id="ordResultEmpty" class="order-readiness-empty">أدخل الأسعار ثم شغّل الفحص لرؤية الكمية والبوابات.</div><div id="ordResult" hidden><div class="order-readiness-kpis"><div class="order-readiness-kpi"><span>الكمية المقترحة</span><b id="ordQty">—</b></div><div class="order-readiness-kpi"><span>قيمة المركز</span><b id="ordNotional">—</b></div><div class="order-readiness-kpi"><span>أقصى خسارة</span><b id="ordMaxLoss">—</b></div><div id="ordRrrKpi" class="order-readiness-kpi"><span>العائد/المخاطرة</span><b id="ordRrr">—</b></div><div class="order-readiness-kpi"><span>الدخول</span><b id="ordEntryOut">—</b></div><div class="order-readiness-kpi"><span>الهدف</span><b id="ordTargetOut">—</b></div></div><div id="ordGates" class="order-readiness-gates"></div><div id="ordTicket" class="order-readiness-ticket"></div><div class="order-readiness-actions"><button id="ordPaperConfirm" class="primary" type="button" disabled>تأكيد تذكرة ورقية</button></div></div></div></div><div class="order-readiness-ledger"><h4>سجل التذاكر الورقية</h4><div id="ordLedger" class="order-readiness-ledger-list"></div></div>`;
    anchor.parentNode.insertBefore(panel, anchor);
    bind(); renderSymbols(); renderLedger();
  }

  function renderSymbols() {
    const select = $('ordSymbol'); if (!select) return;
    const current = select.value; const list = symbols();
    select.innerHTML = list.length ? list.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('') : '<option value="">أضف أصلًا أو انتظر القائمة</option>';
    if (list.includes(current)) select.value = current;
  }
  function useQuote() {
    const q = latestQuote($('ordSymbol')?.value); const price = q?.mid ?? q?.last ?? q?.ask ?? q?.bid;
    if (!Number.isFinite(Number(price))) { $('ordDirty').textContent = 'لا يوجد سعر Saxo صالح لهذا الأصل؛ أدخل السعر يدويًا.'; return; }
    const entry = Number(price); $('ordEntry').value = entry;
    const side = $('ordSide').value; const stop = side === 'BUY' ? entry * .97 : entry * 1.03; const target = side === 'BUY' ? entry * 1.06 : entry * .94;
    $('ordStop').value = stop.toFixed(4); $('ordTarget').value = target.toFixed(4); $('ordDirty').textContent = `تم استخدام سعر Saxo المرصود: ${money(entry)} · المصدر ${q.status || 'غير محدد'} · ${q.observedAt ? new Date(q.observedAt).toLocaleTimeString('ar-SA') : 'وقت غير متاح'}`;
  }
  function calculate() {
    const symbol = String($('ordSymbol')?.value || '').toUpperCase(); const side = $('ordSide')?.value || 'BUY'; const capital = num($('ordCapital')?.value); const riskPct = num($('ordRiskPct')?.value); const entry = num($('ordEntry')?.value); const stop = num($('ordStop')?.value); const target = num($('ordTarget')?.value); const slippage = num($('ordSlippage')?.value);
    const distance = Math.abs(entry - stop); const riskBudget = capital * riskPct / 100; const qty = distance > 0 ? Math.floor(riskBudget / distance) : 0; const notional = qty * entry; const maxLoss = qty * distance + notional * slippage / 100; const reward = qty * Math.abs(target - entry); const rrr = maxLoss > 0 ? reward / maxLoss : 0; const q = latestQuote(symbol); const status = String(q?.status || '').toUpperCase();
    const directional = side === 'BUY' ? stop < entry && target > entry : stop > entry && target < entry;
    const gates = [{ label:'الرمز محدد', pass:Boolean(symbol) }, { label:'سعر الدخول صالح', pass:entry > 0 }, { label:'وقف الخسارة باتجاه صحيح', pass:directional && stop > 0 }, { label:'الهدف باتجاه صحيح', pass:directional && target > 0 }, { label:'بيانات Saxo حديثة', pass:['LIVE','DELAYED'].includes(status) }, { label:'الكمية ضمن رأس المال', pass:qty > 0 && notional <= capital }, { label:'العائد/المخاطرة ≥ 2', pass:rrr >= 2 }, { label:'المختبر ورقي فقط', pass:true }];
    state.result = { symbol, side, capital, riskPct, entry, stop, target, slippage, qty, notional, maxLoss, reward, rrr, gates, observedAt: state.lastObservedAt || new Date().toISOString() };
    $('ordResultEmpty').hidden = true; $('ordResult').hidden = false; $('ordQty').textContent = qty ? qty.toLocaleString('en-US') : 'غير صالح'; $('ordNotional').textContent = money(notional); $('ordMaxLoss').textContent = money(maxLoss); $('ordRrr').textContent = rrr ? `${rrr.toFixed(2)}x` : '—'; $('ordEntryOut').textContent = money(entry); $('ordTargetOut').textContent = money(target);
    $('ordRrrKpi').className = `order-readiness-kpi ${rrr >= 2 ? 'good' : 'bad'}`;
    $('ordGates').innerHTML = gates.map((g) => `<div class="order-readiness-gate ${g.pass ? 'pass' : 'fail'}"><span>${esc(g.label)}</span><span>${g.pass ? '✓ يمر' : '✕ متوقف'}</span></div>`).join('');
    const passed = gates.every((g) => g.pass); $('ordPaperConfirm').disabled = !passed; $('ordTicket').textContent = passed ? 'كل بوابات المختبر تمر. يمكنك حفظ تذكرة ورقية للمراجعة فقط.' : 'لا تحفظ التذكرة بعد: أصلح البوابات المتوقفة أولًا.';
    $('ordDirty').textContent = `هذه معاينة ${side === 'BUY' ? 'شراء' : 'بيع'} وليست أمرًا مرسلًا · ${new Date().toLocaleTimeString('ar-SA')}`;
  }
  function confirmPaper() { if (!state.result || state.result.gates.some((g) => !g.pass)) return; const ticket = { ...state.result, id:`PAPER-${Date.now()}`, status:'PAPER_CONFIRMED', createdAt:new Date().toISOString() }; saveTickets([ticket, ...readTickets()]); renderLedger(); $('ordTicket').textContent = `تم حفظ ${ticket.id} كتذكرة ورقية فقط. لم يتم الاتصال بمسار أوامر Saxo.`; $('ordPaperConfirm').disabled = true; }
  function renderLedger() { const node = $('ordLedger'); if (!node) return; const rows = readTickets(); node.innerHTML = rows.length ? rows.map((t) => `<div class="order-readiness-ledger-item"><span><b>${esc(t.id)}</b> · ${esc(t.side)} ${esc(t.symbol)} · ${esc(String(t.qty))} سهم<br><small>${esc(new Date(t.createdAt).toLocaleString('ar-SA'))} · ${esc(t.status)}</small></span><b>${esc(money(t.entry))}</b></div>`).join('') : '<p class="order-readiness-empty">لا توجد تذاكر ورقية محفوظة على هذا الجهاز.</p>'; }
  function bind() { $('ordUseQuote')?.addEventListener('click', useQuote); $('ordPreview')?.addEventListener('click', calculate); $('ordPaperConfirm')?.addEventListener('click', confirmPaper); $('ordReset')?.addEventListener('click', () => { ['ordEntry','ordStop','ordTarget'].forEach((id) => { if ($(id)) $(id).value=''; }); $('ordResult').hidden=true; $('ordResultEmpty').hidden=false; $('ordDirty').textContent=''; state.result=null; }); $('ordSymbol')?.addEventListener('change', () => { const q=latestQuote($('ordSymbol').value); if(q) $('ordDirty').textContent=`سعر Saxo المتاح: ${money(q.mid ?? q.last ?? q.ask ?? q.bid)} · اضغط استخدام سعر Saxo.`; }); }
  function init() { ensurePanel(); window.addEventListener('asiri:saxo-watchlist-quotes', (event) => { state.quotes.clear(); for (const q of event.detail?.quotes || []) state.quotes.set(String(q.symbol || '').toUpperCase(), q); state.lastObservedAt=event.detail?.observedAt || null; renderSymbols(); }); const observer=new MutationObserver(renderSymbols); const anchor=$('stocks-list-wrapper'); if(anchor) observer.observe(anchor,{childList:true,subtree:true}); }
  window.asiriOrderReadinessDesk = Object.freeze({ paperOnly:true, executionAllowed:false, calculate });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once:true }) : init();
})();
