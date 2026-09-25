/* ASIRI mobile watchlist: local presentation preferences; no trading operations. */
(() => {
  'use strict';
  const PREF_KEY = 'asiri_watchlist_view_v1';
  const CHANGE_SORTS = ['change-desc','change-asc'];
  const sessionFormatter = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
  const safe = value => String(value ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
  const validSymbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(value);
  function preferences(raw) {
    const data = raw && typeof raw === 'object' ? raw : {};
    return { pins: Array.isArray(data.pins) ? [...new Set(data.pins.filter(validSymbol))].slice(0,80) : [], sort: ['name','recent','original',...CHANGE_SORTS].includes(data.sort) ? data.sort : 'original' };
  }
  function sessionDate(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!match) return null;
    const [year,month,day,hour,minute,second] = match.slice(1).map(Number);
    const calendar = new Date(Date.UTC(year,month-1,day)), at = Date.parse(value);
    if (!Number.isFinite(at) || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month-1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
    const parts = Object.fromEntries(sessionFormatter.formatToParts(new Date(at)).map(({type,value:part})=>[type,part]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function comparisonFor(symbols,data,now) {
    const rows = new Map(); let date = '';
    for (const symbol of symbols) {
      const item = data[symbol] || {}, change = window.asiriWatchlistEvidence.quoteChange(item,now);
      const day = change.available && Number.isFinite(change.percent) ? sessionDate(change.toDate) : null;
      const valid = Boolean(day) && (!item.symbol || item.symbol === symbol);
      rows.set(symbol,{change,date:valid ? day : null,percent:null,reason:change.reason || 'وقت القراءة أو رمزها غير صالح للمقارنة.'});
      if (valid && day > date) date = day;
    }
    for (const row of rows.values()) {
      if (row.date === date) { row.percent = row.change.percent; row.reason = ''; }
      else if (row.date) row.reason = `قراءة جلسة ${row.date}؛ أحدث جلسة متاحة ${date}.`;
    }
    return {rows,date};
  }
  function selectSymbols(symbols, data, {query = '', filter = 'ALL', pins = [], favoritesOnly = false, sort = 'original'}, health, now = Date.now(), comparison) {
    const positions = new Map(symbols.map((symbol,index) => [symbol,index]));
    const ranked = CHANGE_SORTS.includes(sort) ? comparison || comparisonFor(symbols,data,now) : null;
    return symbols.filter(symbol => symbol.includes(query.trim().toUpperCase()) && (!favoritesOnly || pins.includes(symbol)) && (filter === 'ALL' || health(data[symbol] || {},now).state === filter)).sort((a,b) => {
      if (ranked) {
        const aa = ranked.rows.get(a).percent, bb = ranked.rows.get(b).percent;
        if ((aa === null) !== (bb === null)) return aa === null ? 1 : -1;
        if (aa !== null && aa !== bb) return sort === 'change-desc' ? (aa > bb ? -1 : 1) : (aa < bb ? -1 : 1);
        return positions.get(a) - positions.get(b);
      }
      const pinned = Number(pins.includes(b)) - Number(pins.includes(a));
      if (pinned) return pinned;
      if (sort === 'name') return a.localeCompare(b,'en');
      if (sort === 'recent') {
        const timestamp = symbol => { const h = health(data[symbol] || {},now); return h.checks?.time && h.state !== 'UNAVAILABLE' ? h.quoteAtMs : -Infinity; };
        const aa = timestamp(a), bb = timestamp(b);
        if (aa !== bb) return aa > bb ? -1 : 1;
      }
      return positions.get(a) - positions.get(b);
    });
  }
  function create(options) {
    const doc = options.document || document;
    const host = options.window || window;
    const get = id => doc.getElementById(id);
    const wrapper = get('stocks-list-wrapper');
    const health = (item,now) => host.asiriQuoteDataHealth.classifyQuote(item,now);
    let prefs;
    try { prefs = preferences(JSON.parse(host.localStorage.getItem(PREF_KEY) || 'null')); } catch (_) { prefs = preferences(null); }
    let query = '', favoritesOnly = false;
    const rows = new Map(), expanded = new Set(), histories = new Map(), pending = new Map(), undos = [];
    const save = () => { try { host.localStorage.setItem(PREF_KEY,JSON.stringify(prefs)); } catch (_) { get('watchlist-preference-note').textContent = 'تعذر حفظ التفضيلات؛ تعمل خلال هذه الزيارة فقط.'; } };
    const time = value => { const t = new Date(value || ''); return Number.isFinite(t.getTime()) ? t.toLocaleString('ar-SA') : 'غير متاح'; };
    const money = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}$${Math.abs(value).toFixed(2)}`;
    function changeText(change) { return change?.available ? `${change.label}: ${money(change.absolute)} (${change.percent > 0 ? '+' : ''}${change.percent.toFixed(2)}%)` : 'التغيّر اليومي غير متاح'; }
    function makeRow(symbol) {
      const row = doc.createElement('article'); row.className = 'stock-row watchlist-row'; row.id = `row-${symbol}`; row.dataset.symbol = symbol;
      row.innerHTML = `<div class="watchlist-main"><span class="sym" dir="ltr">${symbol}</span><span class="watchlist-price stock-col-price" dir="ltr"></span><small class="watchlist-daily" dir="auto"></small></div>
        <button type="button" class="watchlist-pin" data-action="pin" data-symbol="${symbol}" aria-label="تثبيت ${symbol}" aria-pressed="false">☆</button>
        <div class="watchlist-state-line"><span class="badge-data-state"></span></div>
        <button type="button" class="watchlist-toggle" data-action="expand" data-symbol="${symbol}" aria-expanded="false" aria-controls="watchlist-details-${symbol}">التفاصيل</button>
        <div id="watchlist-details-${symbol}" class="watchlist-details" hidden>
          <div class="watchlist-meta"></div><div class="watchlist-movement"></div>
          <div class="watchlist-chart" aria-live="polite">السجل اليومي غير محمّل.</div>
          <button type="button" class="watchlist-history-button" data-action="history" data-symbol="${symbol}">تحميل الرسم اليومي</button>
          <div class="watchlist-actions">
            <button class="smart-summary-btn" type="button" data-symbol="${symbol}" aria-label="فتح تفاصيل القراءة لـ ${symbol}">تفاصيل القراءة</button>
            <button type="button" data-action="technicals" data-symbol="${symbol}">التحليل الفني</button>
            <button type="button" data-action="research" data-symbol="${symbol}">الأبحاث</button>
            <details class="watchlist-menu"><summary aria-label="إجراءات إضافية لـ ${symbol}">⋯</summary><button type="button" class="remove-symbol-btn" data-action="remove" data-symbol="${symbol}">حذف من المتابعة</button></details>
          </div>
        </div>`;
      rows.set(symbol,row); return row;
    }
    function renderHistory(symbol,row,now) {
      const el = row.querySelector('.watchlist-chart'), button = row.querySelector('[data-action="history"]');
      const record = histories.get(symbol);
      button.disabled = pending.has(symbol);
      button.textContent = pending.has(symbol) ? 'جاري تحميل السجل…' : record ? 'تحديث الرسم اليومي' : 'تحميل الرسم اليومي';
      if (!record) return;
      const evidence = host.asiriWatchlistEvidence.evaluate(record.payload,symbol,now);
      const html = evidence.available
        ? `<svg viewBox="${safe(evidence.chart.viewBox)}" role="img" aria-label="${safe(evidence.chart.label)}" preserveAspectRatio="none"><path d="${safe(evidence.chart.path)}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" /></svg><p>${safe(evidence.chart.label)}</p><p>${safe(evidence.source)} • نهاية السجل <bdi>${safe(evidence.endDate)}</bdi></p>${evidence.change.available ? `<p>${safe(changeText(evidence.change))} • مقارنة <bdi>${safe(evidence.change.fromDate)}</bdi> و<bdi>${safe(evidence.change.toDate)}</bdi></p>` : ''}`
        : `<p>السجل اليومي غير متاح — ${safe(record.error || evidence.reason)}</p>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    }
    function render() {
      const {symbols,data,filter} = options.getState();
      const now = Date.now();
      const comparison = CHANGE_SORTS.includes(prefs.sort) ? comparisonFor(symbols,data,now) : null;
      const selected = selectSymbols(symbols,data,{query,filter,pins:prefs.pins,favoritesOnly,sort:prefs.sort},health,now,comparison);
      const focused = wrapper.contains(doc.activeElement) ? doc.activeElement : null;
      const selectedSet = new Set(selected);
      for (const [symbol,row] of rows) {
        if (!selectedSet.has(symbol)) row.remove();
        if (!symbols.includes(symbol)) { rows.delete(symbol); expanded.delete(symbol); histories.delete(symbol); pending.get(symbol)?.abort(); }
      }
      wrapper.querySelector('.watchlist-empty')?.remove();
      selected.forEach((symbol,index) => {
        const item = data[symbol] || {}, h = health(item,now), view = host.asiriQuoteDataHealth.describeQuote(h);
        const row = rows.get(symbol) || makeRow(symbol);
        const price = row.querySelector('.watchlist-price');
        price.className = `watchlist-price stock-col-price ${h.state === 'UNAVAILABLE' ? 'val-neutral' : 'val-price'}`;
        price.textContent = h.state === 'UNAVAILABLE' ? 'غير متاح' : `$${Number(item.price).toFixed(2)}`;
        const rank = comparison?.rows.get(symbol), change = rank?.change || host.asiriWatchlistEvidence.quoteChange(item,now);
        const daily = row.querySelector('.watchlist-daily'); daily.textContent = changeText(change) + (rank?.percent === null ? ` • خارج المقارنة: ${rank.reason}` : ''); daily.className = `watchlist-daily ${change.available ? (change.absolute > 0 ? 'val-pos' : change.absolute < 0 ? 'val-neg' : 'val-neutral') : 'val-neutral'}`;
        const badge = row.querySelector('.badge-data-state'); badge.textContent = view.label; badge.className = `badge-data-state ${view.cls}`;
        const pin = row.querySelector('.watchlist-pin'), pinned = prefs.pins.includes(symbol);
        pin.setAttribute('aria-pressed',String(pinned)); pin.setAttribute('aria-label',`${pinned ? 'إلغاء تثبيت' : 'تثبيت'} ${symbol}`); pin.textContent = pinned ? '★' : '☆';
        const open = expanded.has(symbol), toggle = row.querySelector('.watchlist-toggle');
        toggle.setAttribute('aria-expanded',String(open)); toggle.textContent = open ? 'إخفاء التفاصيل' : 'التفاصيل'; row.querySelector('.watchlist-details').hidden = !open;
        row.querySelector('.watchlist-meta').textContent = `${view.detail} • ${h.sourceStatus} • المصدر: ${item.source || 'غير متاح'} • وقت السعر: ${time(item.updatedAt || item.time)} • وقت رصد المصدر: ${time(item.observedAt)}`;
        row.querySelector('.watchlist-movement').textContent = change.available ? `الإغلاق السابق المستخدم: $${Number(item.previousClose).toFixed(2)} • ${change.label}` : change.reason || 'الإغلاق السابق الموثق غير متاح لهذه القراءة.';
        if (open) renderHistory(symbol,row,now);
        const at = wrapper.children[index]; if (at !== row) wrapper.insertBefore(row,at || null);
      });
      // Moving an existing row can blur its focused control, including in Safari.
      if (focused?.isConnected && doc.activeElement !== focused) focused.focus({preventScroll:true});
      const sortNote = get('watchlist-sort-note');
      sortNote.hidden = !comparison;
      const sortText = comparison ? (comparison.date ? `حسب نسبة التغيّر لجلسة ${comparison.date}؛ القراءات غير القابلة للمقارنة في النهاية. المفضلة لا تغيّر ترتيب النسب.` : 'لا تتوفر تغيّرات موثقة للمقارنة؛ تُعرض الأسهم بترتيبها الأصلي.') : '';
      if (sortNote.textContent !== sortText) sortNote.textContent = sortText;
      if (!selected.length) {
        const empty = doc.createElement('p'); empty.className='watchlist-empty'; empty.textContent = !symbols.length ? 'قائمة المتابعة فارغة. أضف رمزًا للبدء.' : favoritesOnly && !prefs.pins.some(s=>symbols.includes(s)) ? 'لم تثبّت أسهمًا بعد. اعرض الكل واضغط النجمة بجوار السهم.' : 'لا توجد أسهم تطابق البحث والتصفية. جرّب مسح البحث أو تغيير حالة البيانات.'; wrapper.appendChild(empty);
      }
      const countText = `${selected.length} من ${symbols.length} سهم`;
      if (get('watchlist-result-count').textContent !== countText) get('watchlist-result-count').textContent = countText;
      const states = symbols.map(s=>health(data[s] || {},now));
      const closed=states.filter(h=>h.reasonCode==='MARKET_CLOSED').length, failed=states.filter(h=>h.reasonCode==='UPDATE_FAILED').length, fresh=states.filter(h=>h.state==='FRESH').length;
      get('watchlist-session-summary').textContent = !states.length ? 'لا توجد قراءات بعد.' : [closed ? `${closed} سهم خارج الجلسة؛ آخر إغلاق والمصدر متصل` : '', fresh ? `${fresh} قراءة حديثة داخل الجلسة` : '',failed ? `تعذّر آخر تحديث لـ ${failed} سهم` : '',states.length-closed-fresh-failed ? `${states.length-closed-fresh-failed} قراءة أخرى تحتاج مراجعة حالتها` : ''].filter(Boolean).join(' • ');
    }
    async function loadHistory(symbol) {
      if (pending.has(symbol) || !options.getState().symbols.includes(symbol)) return;
      if (pending.size >= 2) { get('watchlist-preference-note').textContent = 'انتظر اكتمال تحميل الرسم الحالي ثم حاول مجددًا.'; return; }
      const controller = new AbortController(); pending.set(symbol,controller); render();
      const timer = host.setTimeout(()=>controller.abort(),20000);
      try {
        const response = await options.fetchHistory(symbol,controller.signal);
        if (!response.ok) throw new Error('تعذر الاتصال بمصدر السجل');
        const payload = await response.json();
        if (options.getState().symbols.includes(symbol)) histories.set(symbol,{payload});
      } catch (_) { if (options.getState().symbols.includes(symbol)) histories.set(symbol,{payload:null,error:'تعذر جلب سجل موثّق؛ حاول مجددًا.'}); }
      finally { host.clearTimeout(timer); pending.delete(symbol); render(); }
    }
    wrapper.addEventListener('click',event=>{
      const button = event.target.closest('button[data-action]'); if (!button || !wrapper.contains(button)) return;
      const {action,symbol}=button.dataset; if (!options.getState().symbols.includes(symbol)) return;
      if (action==='pin') { prefs.pins = prefs.pins.includes(symbol) ? prefs.pins.filter(s=>s!==symbol) : [...prefs.pins,symbol].slice(-80); save(); render(); (button.isConnected ? button : get('watchlist-favorites')).focus({preventScroll:true}); }
      else if (action==='expand') { expanded.has(symbol) ? expanded.delete(symbol) : expanded.add(symbol); render(); }
      else if (action==='remove') options.remove(symbol);
      else if (action==='history') loadHistory(symbol);
      else options.navigate(symbol,action);
    });
    get('watchlist-search').addEventListener('input',event=>{query=event.target.value;render();});
    get('watchlist-sort').value=prefs.sort;
    get('watchlist-sort').addEventListener('change',event=>{prefs.sort=preferences({sort:event.target.value}).sort;save();render();});
    get('watchlist-favorites').addEventListener('click',event=>{favoritesOnly=!favoritesOnly;event.currentTarget.setAttribute('aria-pressed',String(favoritesOnly));render();});
    function undoDisplay() { get('watchlist-undo').hidden=!undos.length; get('watchlist-undo-message').textContent=undos.length ? `حُذف ${undos[undos.length-1].symbol} من المتابعة على هذا الجهاز.` : ''; }
    get('watchlist-undo-button').addEventListener('click',()=>{const undo=undos.pop(); if(undo)undo.restore();undoDisplay();render();get('watchlist-search').focus({preventScroll:true});});
    const measureHeader=()=>{const bar=doc.querySelector('.account-bar');if(bar)doc.documentElement.style.setProperty('--account-bar-height',`${Math.ceil(bar.getBoundingClientRect().height)}px`);};
    if (host.ResizeObserver) new host.ResizeObserver(measureHeader).observe(doc.querySelector('.account-bar'));
    host.addEventListener('resize',measureHeader); measureHeader();
    host.addEventListener('pagehide',()=>pending.forEach(controller=>controller.abort()));
    return {render,offerUndo(symbol,restore){undos.push({symbol,restore});undoDisplay();get('watchlist-undo-button').focus({preventScroll:true});},resetSearch(){query='';favoritesOnly=false;get('watchlist-search').value='';get('watchlist-favorites').setAttribute('aria-pressed','false');}};
  }
  window.asiriWatchlist = Object.freeze({create,preferences,selectSymbols});
})();
