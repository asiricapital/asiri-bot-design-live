import { OPERATIONS_KEY, emptyOperations, parseOperations, normalizeSignals, markSignalRead, startFollowing, closeFollowing, advanceFollowing, trackingQuoteReason, filterSignals } from './operations-model.mjs?v=2';

const API = 'https://asiri-bot.onrender.com';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
const time = value => Number.isFinite(Date.parse(value || '')) ? new Intl.DateTimeFormat('ar-SA', { calendar: 'gregory', timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'غير متاح';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '—';
const KIND = { buy: 'اقتراح شراء', alert: 'تنبيه متابعة', report: 'تقرير', info: 'رسالة تشغيلية', test: 'اختبار' };
let state = emptyOperations(), storageError = '', signals = [], view = 'inbox', kind = 'all', query = '', expanded = false;
let fetching = false, initialized = false, lastFetched = 0, feedError = '', stream = null, streamState = 'CONNECTING', lastRefresh = 0;
let notifications = null, notificationError = '', soundEnabled = false, audioContext = null, previousQuoteHealth = '';
let followQuoteBusy=false,lastFollowQuoteFetch=0;
const followQuotes=new Map();
const openMessages = new Set();
const quotes = () => {const base=window.asiriMarketView?.snapshots?.()||[],symbols=new Set(base.map(q=>q.symbol));return [...base,...[...followQuotes.values()].filter(q=>!symbols.has(q.symbol))];};

function notice(message) { $('operations-notice').textContent = message; }
function readState() { return parseOperations(localStorage.getItem(OPERATIONS_KEY)); }
function save(next) { localStorage.setItem(OPERATIONS_KEY, JSON.stringify(next)); state = next; }
async function update(action) {
  if (storageError) { notice(storageError); return; }
  try {
    // Web Locks serialize changes across tabs where available. localStorage remains the only store.
    const write = () => { const current = readState(), next = action(current); if (next !== current) save(next); else state = current; };
    if (navigator.locks) await navigator.locks.request(OPERATIONS_KEY, write); else write();
    render();
  } catch { storageError = 'تعذر حفظ سجل المتابعة على هذا الجهاز. السجل السابق محفوظ؛ المتابعة الجديدة متوقفة.'; notice(storageError); render(); }
}

function button(text, action, cls = 'ops-button') {
  const node = el('button', text, cls); node.type = 'button'; node.addEventListener('click', action); return node;
}
function reviewLink(url) {
  const link = el('a', 'فتح حالة الاقتراح ومراجعته ↗', 'ops-button ops-primary'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function fields(parent, values) {
  const dl = el('dl', null, 'ops-levels');
  for (const [label, value] of values) { const part = el('div'); part.append(el('dt', label), el('dd', value)); dl.append(part); }
  parent.append(dl);
}
async function copyMessage(message) {
  try { await navigator.clipboard.writeText(message); notice('نُسخت الرسالة كاملة.'); }
  catch {
    const dialog = $('operations-copy-dialog'), area = $('operations-copy-text'); area.value = message;
    if (typeof dialog.showModal === 'function') { dialog.showModal(); area.focus(); area.select(); }
    else notice('تعذر النسخ التلقائي. افتح النص الكامل لتحديده ونسخه.');
  }
}
function ping(message) {
  notice(message);
  if (!soundEnabled || document.hidden || !audioContext) return;
  try { const tone = audioContext.createOscillator(), gain = audioContext.createGain(); gain.gain.value = 0.035; tone.frequency.value = 660; tone.connect(gain); gain.connect(audioContext.destination); tone.start(); tone.stop(audioContext.currentTime + 0.18); } catch { /* Sound is optional. */ }
}
function signalCard(signal) {
  const card = el('article', null, `ops-message ops-${signal.kind}`); card.dataset.signalKey = signal.key;
  const head = el('div', null, 'ops-message-head'), badges = el('div', null, 'ops-badges');
  badges.append(el('span', KIND[signal.kind], 'ops-tag'));
  if (!state.read.includes(signal.key)) badges.append(el('span', 'غير مقروءة', 'ops-unread'));
  if (!signal.recent) badges.append(el('span', 'أرشيف', 'ops-archive'));
  head.append(badges, el('time', time(signal.at))); card.append(head);
  const title = el('h3', signal.title); card.append(title);
  if (signal.kind === 'buy') {
    if (signal.method) card.append(el('p', signal.method, 'ops-method'));
    if (signal.entryLine) card.append(el('p', signal.entryLine, 'ops-entry'));
    fields(card, [['الكمية في الرسالة', signal.quantity ? `${number(signal.quantity)} سهم` : 'تُراجع في النص'], ['وقف الخسارة', signal.stop ? `$${number(signal.stop)}` : 'غير مذكور'], ['الهدف الأول / المرجعي', signal.target1 ? `$${number(signal.target1)}` : 'غير مذكور'], ['الهدف الثاني', signal.target2 ? `$${number(signal.target2)}` : 'غير مذكور']]);
    if (signal.riskLine) card.append(el('p', signal.riskLine, 'ops-risk'));
    card.append(el('p', `${signal.recent ? 'رسالة حديثة' : 'رسالة سابقة'} · ${signal.validity}. الكمية والمستويات تخص وقت الرسالة.`, 'ops-validity'));
  } else card.append(el('p', signal.text.split('\n').filter(Boolean).slice(1, 3).join(' · ').slice(0, 420), 'ops-excerpt'));
  const details = el('details', null, 'ops-full-message'); details.open = openMessages.has(signal.key);
  const summary = el('summary', 'الرسالة كاملة: الأسباب والمخاطر والتفاصيل');
  details.append(summary, el('pre', signal.text));
  details.addEventListener('toggle', () => {
    if (details.open) {
      openMessages.add(signal.key);
      if (!state.read.includes(signal.key)) update(s => markSignalRead(s, signal.key));
    } else openMessages.delete(signal.key);
  }); card.append(details);
  const actions = el('div', null, 'ops-message-actions');
  if (signal.reviewUrl) actions.append(reviewLink(signal.reviewUrl));
  if (signal.trackable && signal.recent) {
    const follows = state.follows.some(f => f.key === signal.key);
    const follow = button(follows ? 'مسجلة في المتابعة' : 'أتابع هذه المستويات', async () => {await update(s => {
      try { const next = startFollowing(s, signal); notice('بدأت متابعة المستويات على هذا الجهاز أثناء فتح المنصة.'); return next; } catch (e) { notice(e.message); return s; }
    });await refreshFollowQuotes();}); follow.disabled = follows || !!storageError; actions.append(follow);
  }
  actions.append(button('نسخ الرسالة', () => copyMessage(signal.text)));
  if (!state.read.includes(signal.key)) actions.append(button('تمت القراءة', () => update(s => markSignalRead(s, signal.key)), 'ops-text-button'));
  card.append(actions, el('small', signal.sendAccepted ? 'المصدر: سجل رسائل الخادم · طلب الإرسال مقبول؛ لا يثبت قراءة الإشعار على جهازك.' : 'المصدر: سجل رسائل الخادم · نجاح الإرسال غير مؤكد.', 'ops-source'));
  return card;
}
function renderInbox() {
  const selected = filterSignals(signals, { kind, query }), list = $('operations-inbox-list'); list.replaceChildren();
  for (const signal of selected.slice(0, expanded ? 100 : 6)) list.append(signalCard(signal));
  $('operations-inbox-empty').hidden = selected.length !== 0;
  $('operations-inbox-empty').textContent = feedError && !signals.length ? 'تعذر الاتصال بسجل الرسائل. أعد التحديث؛ لم تُنشأ توصية بديلة.' : fetching && !initialized ? 'جارٍ قراءة سجل الرسائل الحقيقي…' : query || kind !== 'all' ? 'لا توجد رسائل تطابق التصفية.' : 'لا توجد رسائل في سجل الخادم الحالي. ستظهر الرسالة هنا عندما يصدرها المحرك.';
  $('operations-more').hidden = selected.length <= 6; $('operations-more').textContent = expanded ? 'عرض أقل' : `بقية الرسائل (${selected.length - 6})`;
  $('operations-inbox-count').textContent = `${selected.length} رسالة`;
  $('operations-unread').textContent = signals.filter(s => !s.test && !state.read.includes(s.key)).length;
}
function renderFollowing() {
  const list = $('operations-follow-list'); list.replaceChildren();
  const active = state.follows.filter(f => f.state === 'ACTIVE');
  for (const f of active) {
    const q = quotes().find(q => q.symbol === f.symbol), reason = trackingQuoteReason(q, f.symbol);
    const card = el('article', null, 'ops-follow-card'); card.append(el('h3', f.symbol), el('p', `رسالة ${time(f.messageAt)} · نهاية المتابعة ${time(f.expiresAt)}`, 'ops-source'));
    fields(card, [['آخر سعر مرجعي', q?.price ? `$${number(q.price)}` : 'غير متاح'], ['الوقف', `$${number(f.stop)}`], ['الهدف الأول', `$${number(f.target1)}`], ['الهدف الثاني', f.target2 ? `$${number(f.target2)}` : 'غير مذكور']]);
    const missingSymbol = !q ? 'جارٍ طلب قراءة السهم للمتابعة؛ لا توجد قراءة صالحة بعد.' : null;
    card.append(el('p', missingSymbol || reason || 'متابعة فعالة أثناء فتح الصفحة؛ تُسجّل المستويات المرصودة فقط.', reason ? 'ops-risk' : 'ops-validity'));
    if (q) card.append(el('small', `${q.source || 'مصدر غير متاح'} · وقت السعر ${time(q.updatedAt || q.time)}`, 'ops-source'));
    if (f.hits.length) card.append(el('p', `أحداث مرصودة: ${f.hits.map(h => ({ STOP: 'الوقف', TARGET1: 'الهدف الأول', TARGET2: 'الهدف الثاني' }[h])).join(' · ')}`, 'ops-validity'));
    const actions = el('div', null, 'ops-message-actions'); if (f.reviewUrl) actions.append(reviewLink(f.reviewUrl));
    actions.append(button('إغلاق المتابعة', () => update(s => closeFollowing(s, f.key)))); card.append(actions); list.append(card);
  }
  if (!active.length) list.append(el('div', 'لا توجد متابعة نشطة. اختر «أتابع هذه المستويات» في رسالة شراء واضحة المستويات.', 'ops-empty'));
  $('operations-follow-count').textContent = active.length;
  $('operations-history-list').replaceChildren();
  for (const event of state.events.slice(0, 50)) {
    const item = el('li', null, `ops-event ops-event-${event.type}`);
    item.append(el('time', time(event.at)), el('strong', event.symbol), el('span', event.text));
    if (event.quoteAt) item.append(el('small', `السعر $${number(event.price)} · المستوى $${number(event.level)} · ${event.source} · وقت السعر ${time(event.quoteAt)}`));
    $('operations-history-list').append(item);
  }
  if (!state.events.length) $('operations-history-list').append(el('li', 'لم تُسجل أحداث متابعة بعد.', 'ops-empty'));
}
function renderCandidates() {
  let snapshot=null;
  try{snapshot=window.asiriPaperRecommendations?.snapshot?.();}catch{/* A damaged paper wallet must not interrupt the source inbox. */}
  const rows = snapshot?.results || [];
  $('operations-analysis-count').textContent = snapshot ? `${snapshot.analyzed}/${snapshot.eligible}` : '—';
  $('operations-ready-count').textContent = rows.filter(r => r.status === 'READY').length;
  const next = rows.find(r => r.status === 'READY');
  const proposal = signals.find(s => s.kind === 'buy' && s.recent && s.reviewUrl && !state.read.includes(s.key));
  $('operations-next').textContent = proposal ? `${proposal.symbol || 'اقتراح شراء'}: رسالة جديدة تنتظر مراجعة حالتها الحالية.` : next ? `${next.symbol}: ترشيح تجريبي مكتمل، راجع السبب والمخاطرة ثم المعاينة.` : signals.some(s => s.kind === 'buy' && s.recent) ? 'راجع آخر اقتراح ورسائله كاملة، ثم افتح حالته الحالية قبل القرار.' : 'راقب الوارد؛ تظهر توصية الشراء عند إصدارها من المحرك. أسباب انتظار التجربة متاحة في الفحص.';
}
function renderConnection() {
  const status = $('operations-feed-status');
  status.textContent = feedError ? 'تعذر التحديث · راجع وقت الرسائل' : streamState === 'LIVE' ? 'سجل الخادم متصل · استقبال مباشر' : fetching ? 'جارٍ تحديث الرسائل…' : lastFetched ? 'آخر قراءة متاحة · تحديث دوري' : 'جارٍ الاتصال بسجل الخادم…';
  status.dataset.state = feedError ? 'error' : lastFetched ? 'connected' : 'waiting';
  $('operations-last-fetch').textContent = lastFetched ? `آخر مزامنة ${time(new Date(lastFetched).toISOString())} · توقيت الرياض` : 'بانتظار أول مزامنة';
  $('operations-channel-status').textContent = notifications ? `Telegram ${notifications.telegramEnabled === true ? 'مهيأ على الخادم' : 'غير مهيأ'} · الفحص الخلفي ${notifications.backgroundAlertsEnabled === true ? 'مفعّل حسب الخادم' : 'غير مفعّل حسب الخادم'}` : notificationError || 'جارٍ التحقق من إعداد القنوات…';
  $('operations-refresh').disabled = fetching; $('operations-refresh').textContent = fetching ? 'جارٍ التحديث…' : 'تحديث الوارد';
  $('operations-buy-count').textContent = signals.filter(s => s.kind === 'buy' && s.recent).length;
}
function render() {
  if (!$('operations-center')) return;
  renderInbox(); renderFollowing(); renderCandidates(); renderConnection();
  if (storageError) notice(storageError);
}
function open(target = 'inbox', focus = true) {
  if (!['inbox', 'following', 'candidates', 'history'].includes(target)) target = 'inbox'; view = target;
  if(typeof window.switchMainTab==='function')window.switchMainTab('home',null,{preserveScroll:true});
  for (const node of document.querySelectorAll('[data-ops-view]')) node.setAttribute('aria-pressed', String(node.dataset.opsView === view));
  for (const node of document.querySelectorAll('[data-ops-panel]')) node.hidden = node.dataset.opsPanel !== view;
  if (focus) $('operations-center').scrollIntoView({ block: 'start', behavior: 'smooth' });
  render();
}
function acceptRows(rows, { replace = false, notify = false } = {}) {
  const previous = new Set(signals.map(s => s.key));
  const normalized = normalizeSignals(rows);
  signals = replace ? normalized : normalizeSignals([...normalized, ...signals].map(s => ({ ...s, sent: s.sendAccepted })));
  const added = signals.filter(s => !s.test && !previous.has(s.key));
  if (notify && initialized && added.length) ping(`وصلت ${added.length} رسالة جديدة إلى الوارد${added[0].symbol ? ` · ${added[0].symbol}` : ''}.`);
  render();
}
async function fetchFeed() {
  if (fetching || document.hidden) return;
  fetching = true; renderConnection();
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API}/api/signals?limit=100`, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw Error('feed-unavailable');
    const payload = await response.json(); if (!Array.isArray(payload.items)) throw Error('invalid-feed');
    acceptRows(payload.items, { replace: true, notify: true }); feedError = ''; lastFetched = Date.now(); initialized = true;
  } catch { feedError = 'تعذر قراءة سجل الرسائل؛ أُبقيت الرسائل السابقة بأوقاتها.'; }
  finally { clearTimeout(timer); fetching = false; render(); }
}
function connectStream() {
  if (document.hidden || stream || typeof EventSource !== 'function') return;
  streamState = 'CONNECTING';
  const source = stream = new EventSource(`${API}/api/signals/stream`);
  source.onopen = () => { if (stream !== source) return; streamState = 'LIVE'; fetchFeed(); renderConnection(); };
  source.addEventListener('signal', event => {
    if (stream !== source) return;
    try { const row = JSON.parse(event.data); if (normalizeSignals([row]).length) { acceptRows([row], { notify: true }); lastFetched = Date.now(); feedError = ''; renderConnection(); } } catch { /* Invalid events never replace the last valid feed. */ }
  });
  source.onerror = () => { if (stream !== source) return; source.close(); stream = null; streamState = 'POLLING'; renderConnection(); };
}
async function fetchChannelStatus() {
  if (document.hidden) return;
  try {
    const response = await fetch(`${API}/api/notifications/status`, { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error(); const payload = await response.json();
    if (typeof payload.telegramEnabled !== 'boolean' || typeof payload.backgroundAlertsEnabled !== 'boolean') throw Error();
    notifications = payload; notificationError = '';
  } catch { notifications = null; notificationError = 'تعذر التحقق من إعداد Telegram؛ لا يوجد تأكيد للقناة.'; }
  renderConnection();
}
let advancing = false;
async function refreshFollowQuotes(){
  if(followQuoteBusy||document.hidden||storageError)return;
  const watched=new Set((window.asiriMarketView?.snapshots?.()||[]).map(q=>q.symbol));
  const symbols=[...new Set(state.follows.filter(f=>f.state==='ACTIVE').map(f=>f.symbol))].filter(s=>!watched.has(s));
  for(const key of followQuotes.keys())if(!symbols.includes(key))followQuotes.delete(key);
  if(!symbols.length)return;
  followQuoteBusy=true;lastFollowQuoteFetch=Date.now();
  try{
    const response=await fetch(`${API}/api/unified-market/quotes?stocks=${encodeURIComponent(symbols.join(','))}`,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error();const payload=await response.json();if(!Array.isArray(payload.stocks))throw Error();
    for(const symbol of symbols){
      const q=payload.stocks.find(q=>q?.symbol===symbol);
      if(q?.ok===true)followQuotes.set(symbol,{...q,observedAt:q.observedAt||payload.observedAt,error:false});
      else followQuotes.set(symbol,{...followQuotes.get(symbol),symbol,error:true});
    }
  }catch{for(const symbol of symbols)followQuotes.set(symbol,{...followQuotes.get(symbol),symbol,error:true});}
  finally{followQuoteBusy=false;renderFollowing();checkFollowing();}
}
async function checkFollowing() {
  if (advancing || document.hidden || storageError || !state.follows.some(f => f.state === 'ACTIVE')) return;
  advancing = true;
  try {
    const result = advanceFollowing(state, quotes());
    if (result.state !== state) await update(s => {
      const current = advanceFollowing(s, quotes());
      if (current.events.length) ping(`${current.events[0].symbol}: ${current.events[0].text}`);
      return current.state;
    });
    // Update suspended / active labels even when no level event is persisted.
    const health = JSON.stringify(state.follows.filter(f => f.state === 'ACTIVE').map(f => { const q=quotes().find(q=>q.symbol===f.symbol);return [f.key, trackingQuoteReason(q,f.symbol),q?.updatedAt,q?.price]; }));
    if (health !== previousQuoteHealth) { previousQuoteHealth = health; renderFollowing(); }
  } finally { advancing = false; }
}
function init() {
  if (!$('operations-center')) return;
  $('operations-process').open=typeof matchMedia==='function'&&matchMedia('(min-width: 701px)').matches;
  try { state = readState(); } catch { storageError = 'تعذر قراءة سجل المتابعة المحفوظ على هذا الجهاز؛ لم يُمسح. الرسائل متاحة للعرض فقط.'; }
  window.asiriOperations = Object.freeze({ open, refresh: fetchFeed, readOnly: true });
  for (const node of document.querySelectorAll('[data-ops-view]')) node.addEventListener('click', () => open(node.dataset.opsView));
  for (const node of document.querySelectorAll('[data-ops-kind]')) node.addEventListener('click', () => {
    kind = node.dataset.opsKind; expanded = false;
    for (const b of document.querySelectorAll('[data-ops-kind]')) b.setAttribute('aria-pressed', String(b === node));
    renderInbox();
  });
  $('operations-search').addEventListener('input', event => { query = event.target.value; expanded = false; renderInbox(); });
  $('operations-more').addEventListener('click', () => { expanded = !expanded; renderInbox(); });
  $('operations-refresh').addEventListener('click', fetchFeed);
  $('operations-read-all').addEventListener('click', () => update(s => signals.filter(s => !s.test).reduce((next, item) => markSignalRead(next, item.key), s)));
  $('operations-copy-close').addEventListener('click', () => $('operations-copy-dialog').close());
  $('operations-sound').addEventListener('click', async () => {
    if (soundEnabled) { soundEnabled = false; $('operations-sound').textContent = 'تفعيل صوت الرسائل'; return; }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error(); audioContext = audioContext || new Audio(); await audioContext.resume(); soundEnabled = true;
      $('operations-sound').textContent = 'كتم صوت الرسائل'; ping('فُعّل الصوت للرسائل الجديدة أثناء فتح الصفحة.');
    } catch { notice('الصوت غير متاح في هذا المتصفح؛ الرسائل البصرية تظل متاحة.'); }
  });
  window.addEventListener('asiri:quotes-rendered', () => { renderCandidates(); checkFollowing(); });
  window.addEventListener('asiri:recommendations-updated', renderCandidates);
  window.addEventListener('asiri:paper-ready', renderCandidates);
  window.addEventListener('storage', event => { if (event.key === OPERATIONS_KEY) { try { state = readState(); storageError = ''; } catch { storageError = 'تعذر قراءة تحديث سجل المتابعة.'; } render(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stream?.close(); stream = null; streamState = 'PAUSED'; }
    else { fetchFeed(); connectStream(); refreshFollowQuotes(); checkFollowing(); }
  });
  window.addEventListener('pagehide', () => { stream?.close(); stream = null; });
  window.addEventListener('pageshow', () => { if (initialized) { fetchFeed(); connectStream(); checkFollowing(); } });
  setInterval(() => {
    if (document.hidden) return;
    checkFollowing();
    if(Date.now()-lastFollowQuoteFetch>=30000)refreshFollowQuotes();
    if (!stream && Date.now() - lastRefresh > 60000) { lastRefresh = Date.now(); fetchFeed(); connectStream(); }
    const expired=signals.some(s=>s.recent&&Date.now()-Date.parse(s.at)>=86400000);
    signals = signals.map(s => ({ ...s, recent: Date.now() - Date.parse(s.at) < 86400000 }));if(expired)renderInbox();renderCandidates();
  }, 10000);
  render(); open('inbox', false); fetchFeed(); fetchChannelStatus(); connectStream();refreshFollowQuotes();
}
init();
