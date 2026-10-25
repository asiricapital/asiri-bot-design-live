/* ASIRI Trading Mission Control V1 — decision workflow, quote-quality ranking, paper-only actions. */
(() => {
  'use strict';
  const state = { quotes: new Map(), rendered: false, observedAt: null };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const priceOf = (q) => Number(q?.mid ?? q?.last ?? q?.price ?? q?.ask ?? q?.bid);
  const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';
  const ageSeconds = (value) => { const t = Date.parse(value || ''); return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 1000) : Infinity; };
  const quoteStatus = (q) => String(q?.status || '').toUpperCase();
  const statusText = (q) => ({ LIVE:'بيانات LIVE', DELAYED:'متأخرة', STALE:'قديمة', UNAVAILABLE:'غير متاحة' }[quoteStatus(q)] || 'بانتظار البيانات');
  const rowFor = (symbol) => document.querySelector(`#stocks-list-wrapper [data-symbol="${CSS.escape(symbol)}"], #stocks-list-wrapper #row-${CSS.escape(symbol)}`);

  function collectRows() {
    const rows = [...document.querySelectorAll('#stocks-list-wrapper [data-symbol], #stocks-list-wrapper [id^="row-"]')];
    for (const row of rows) {
      const symbol = String(row.dataset.symbol || row.id.replace(/^row-/, '')).toUpperCase();
      if (!symbol || state.quotes.has(symbol)) continue;
      const text = row.textContent || ''; const raw = row.querySelector('.stock-col-price')?.textContent || '';
      const p = Number(String(raw).replace(/[$,\s]/g, ''));
      if (Number.isFinite(p)) state.quotes.set(symbol, { symbol, price:p, status:/موثق الآن|حديثة|LIVE/i.test(text) ? 'LIVE' : 'DELAYED', source:'قائمة ASIRI', observedAt:null });
    }
  }
  function score(q) {
    const status = quoteStatus(q); const p = priceOf(q); let total = 0;
    if (status === 'LIVE') total += 45; else if (status === 'DELAYED') total += 25; else if (status === 'STALE') total += 8;
    if (Number.isFinite(p) && p > 0) total += 25;
    const bid = Number(q?.bid), ask = Number(q?.ask); const spread = bid > 0 && ask > bid ? (ask - bid) / ((ask + bid) / 2) * 100 : null;
    if (spread !== null) total += spread <= .15 ? 20 : spread <= .5 ? 10 : 2;
    if (ageSeconds(q?.observedAt || q?.updatedAt) <= 60) total += 10;
    return { total: Math.min(100,total), spread };
  }
  function candidates() { collectRows(); return [...state.quotes.values()].map((q) => ({ q, metrics:score(q) })).sort((a,b) => b.metrics.total - a.metrics.total).slice(0,3); }
  function missionState(items) { const live = items.filter(({q}) => quoteStatus(q) === 'LIVE' && Number.isFinite(priceOf(q))).length; if (!items.length) return { title:'ابدأ بإضافة أصل إلى قائمة المراقبة', detail:'لا يمكن بناء قرار قبل وجود أصل وبيانات موثقة.', current:0 }; if (!live) return { title:'اربط جلسة Saxo أو انتظر البيانات الموثقة', detail:'لا توجد قراءة LIVE صالحة لاتخاذ قرار بحثي الآن.', current:1 }; return { title:`ابدأ بتحليل ${items[0].q.symbol} ثم جهّز خطة ورقية`, detail:`أفضل جودة بيانات حاليًا: ${statusText(items[0].q)} · درجة موثوقية القراءة ${items[0].metrics.total}/100. هذا ترشيح للمراجعة وليس إشارة شراء.`, current:2 }; }
  function render() {
    const host = $('decision-mission-control-v1'); if (!host) return;
    const items = candidates(); const mission = missionState(items); const avg = items.length ? Math.round(items.reduce((sum,x)=>sum+x.metrics.total,0)/items.length) : 0; const reliability = Math.max(0,Math.min(100,avg));
    $('dmcReliability').innerHTML = `<span>موثوقية البيانات</span><b>${reliability}%</b>`; $('dmcReliability').className = `dmc-reliability ${reliability >= 70 ? 'good' : ''}`; $('dmcNext').innerHTML = `<b>${esc(mission.title)}</b><br><span>${esc(mission.detail)}</span>`;
    const steps = [['تحقق البيانات',mission.current>=1],['راجع التحليل',mission.current>=2],['أنشئ خطة ورقية',mission.current>=3],['مراجعة بشرية قبل أي قرار',false]]; $('dmcSteps').innerHTML = steps.map(([label,done],i) => `<div class="dmc-step ${done?'done':''} ${i===mission.current?'current':''}"><i>${done?'✓':i+1}</i><span>${esc(label)}</span></div>`).join('');
    $('dmcCards').innerHTML = items.length ? items.map(({q,metrics},index) => { const symbol=String(q.symbol||'').toUpperCase(); const p=priceOf(q); const spread=metrics.spread===null?'—':`${metrics.spread.toFixed(2)}%`; const status=quoteStatus(q); return `<article class="dmc-card"><div class="dmc-card-top"><span class="dmc-card-symbol">${esc(symbol)}</span><span class="dmc-card-rank">#${index+1}</span></div><div class="dmc-card-price">${esc(money(p))}</div><div class="dmc-card-meta"><span class="dmc-card-status ${status==='LIVE'?'':'wait'}">${esc(statusText(q))}</span><span>جودة القراءة: <b>${metrics.total}/100</b></span><span>الفرق Bid/Ask: ${esc(spread)}</span><span>المصدر: ${esc(q.source || 'Saxo OpenAPI')}</span></div><div class="dmc-card-actions"><button type="button" data-dmc-action="analysis" data-symbol="${esc(symbol)}">افتح التحليل</button><button type="button" class="secondary" data-dmc-action="paper" data-symbol="${esc(symbol)}">خطة ورقية</button></div></article>`; }).join('') : '<div class="dmc-empty">لم تصل بيانات قابلة للاستخدام بعد. افتح ربط Saxo في صفحة الوسيط، ثم اضغط تحديث قائمة المراقبة.</div>';
    $('dmcUpdated').textContent = state.observedAt ? `آخر رصد: ${new Date(state.observedAt).toLocaleTimeString('ar-SA')}` : 'بانتظار أول رصد من المصدر'; state.rendered = true;
  }
  function scrollToDesk(symbol, mode) { const desk=$('order-readiness-desk-v1'); if (!desk) return; desk.scrollIntoView({ behavior:'smooth', block:'start' }); const select=$('ordSymbol'); if (select && [...select.options].some((o)=>o.value===symbol)) { select.value=symbol; if (mode==='paper') $('ordUseQuote')?.click(); } }
  function openAnalysis(symbol) { const row=rowFor(symbol); const button=row?.querySelector('.smart-summary-btn'); if (button) { button.click(); return; } scrollToDesk(symbol,'analysis'); }
  function mount() { if ($('decision-mission-control-v1')) return; const strip=document.querySelector('.command-center-strip'); if (!strip?.parentNode) return; const wrapper=document.createElement('section'); wrapper.id='decision-mission-control-v1'; wrapper.className='decision-mission-control'; wrapper.innerHTML=`<div class="dmc-shell"><div class="dmc-head"><div><span class="dmc-kicker">TRADING MISSION CONTROL · V1</span><h2>ماذا أفعل الآن؟</h2><p>مركز يومي يحوّل السعر الموثق إلى خطوة مراجعة واضحة، بدل عرض مؤشرات منفصلة.</p></div><div id="dmcReliability" class="dmc-reliability"><span>موثوقية البيانات</span><b>—</b></div></div><div class="dmc-body"><section class="dmc-mission"><h3>مهمتي الحالية</h3><div id="dmcNext" class="dmc-next">جارٍ قراءة قائمة المراقبة…</div><div id="dmcSteps" class="dmc-steps"></div></section><section class="dmc-focus"><div class="dmc-focus-head"><h3>الأولوية للمراجعة</h3><small id="dmcUpdated">—</small></div><div id="dmcCards" class="dmc-cards"></div></section></div><div class="dmc-footer"><span>الترتيب مبني على جودة السعر وحداثته واتساع الفارق فقط، وليس توصية استثمارية.</span><button type="button" id="dmcRefresh">تحديث المهمة</button></div><div class="dmc-disclaimer">وضع القراءة والتحليل الورقي فقط. لا يوجد إرسال Saxo ولا تنفيذ تلقائي من هذا المركز.</div></div>`; strip.parentNode.insertBefore(wrapper,strip.nextSibling); $('dmcRefresh')?.addEventListener('click',render); $('dmcCards')?.addEventListener('click',(event)=>{ const b=event.target.closest('[data-dmc-action]'); if(!b)return; const s=b.dataset.symbol; b.dataset.dmcAction==='analysis'?openAnalysis(s):scrollToDesk(s,'paper'); }); }
  function init() { mount(); render(); const observer=new MutationObserver(()=>{ if(state.rendered) render(); }); const list=$('stocks-list-wrapper'); if(list) observer.observe(list,{childList:true,subtree:true}); window.addEventListener('asiri:saxo-watchlist-quotes',(event)=>{ state.quotes.clear(); for(const q of event.detail?.quotes||[]) { const symbol=String(q.symbol||'').toUpperCase(); if(symbol) state.quotes.set(symbol,{...q,symbol}); } state.observedAt=event.detail?.observedAt||new Date().toISOString(); render(); }); window.addEventListener('storage',render); }
  window.asiriDecisionMissionControl = Object.freeze({ readOnly:true, paperOnly:true, render });
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
