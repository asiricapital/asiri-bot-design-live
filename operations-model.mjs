// Source messages and local review state. This module never creates broker orders.
export const OPERATIONS_KEY = 'asiri.design.operations.v1';
export const MAX_HISTORY = 150;
export const FOLLOW_TTL_MS = 24 * 60 * 60 * 1000;
const symbolPattern = /^[A-Z][A-Z0-9.-]{0,9}$/;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const dateMs = v => Date.parse(v || '');
const digits = v => String(v || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٫]/g, '.').replace(/[٬,]/g, '');
const cleanNumber = v => { const n = Number(digits(v)); return positive(n) ? n : null; };
const lineNumber = (text, expression) => cleanNumber(text.match(expression)?.[1]);
const hash = text => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };

export function safeReviewUrl(text) {
  for (const token of String(text || '').match(/https:\/\/[^\s<>"'«»]+/g) || []) {
    try {
      const url = new URL(token);
      if (url.origin === 'https://asiri-bot.onrender.com' && url.pathname === '/stock-proposals' && !url.search && /^#sp-[A-Za-z0-9.-]+$/.test(url.hash)) return url.href;
    } catch { /* A message is data, including its links. */ }
  }
  return null;
}

export function normalizeSignal(row, now = Date.now()) {
  if (!row || typeof row.text !== 'string' || !row.text.trim() || row.text.length > 50000) return null;
  const at = dateMs(row.at);
  if (!Number.isFinite(at) || at > now + 60000) return null;
  const text = row.text.trim(), title = text.split('\n').find(s => s.trim())?.slice(0, 180) || 'رسالة ASIRI';
  const test = /(?:\bTEST\b|اختبار وصول|طلب مراجعة اختباري|رسالة تجريبية|اختبار تنبيه)/i.test(text);
  // Report headings take priority over references to opportunities inside a report.
  const report = /تقرير|ملخص صحة|Dashboard|ملخص السوق|تقرير الإغلاق|\bReport\b|\bBrief\b/i.test(title);
  const buy = !test && !report && /(?:اقتراح شراء سهم|Golden Alert|READY_FOR_HUMAN_REVIEW|قراءة فنية مكتملة|ترشيح شراء)/i.test(title);
  const kind = test ? 'test' : report ? 'report' : buy ? 'buy' : /وقف|هدف|أمان|خروج|حركة|تنبيه|STOP|TARGET/i.test(text) ? 'alert' : 'info';
  const labeled = text.match(/(?:السهم\s*[:：]|اقتراح شراء سهم\s*[—–-])\s*\$?([A-Z][A-Z0-9.-]{0,9})\b/)?.[1];
  const supplied = String(row.symbol || '').toUpperCase();
  const symbol = labeled || (symbolPattern.test(supplied) && !['KILL', 'LIVE', 'SAXO', 'ASIRI', 'TEST', 'USD'].includes(supplied) ? supplied : null);
  const stop = lineNumber(text, /(?:^|\n)\s*وقف الخسارة\s*[:：]\s*\$?([\d٠-٩.,٫٬]+)/);
  const target1 = lineNumber(text, /(?:^|\n)\s*(?:الهدف الأول|هدف مرجعي|الهدف)\s*[:：]\s*\$?([\d٠-٩.,٫٬]+)/);
  const target2 = lineNumber(text, /(?:^|\n)\s*الهدف الثاني\s*[:：]\s*\$?([\d٠-٩.,٫٬]+)/);
  const quantity = lineNumber(text, /(?:^|\n)\s*(?:العدد|الكمية)\s*[:：]\s*([\d٠-٩,٬]+)\s*سهم/);
  const entryLine = text.split('\n').find(l => /^\s*(?:الدخول|الدخول المقترح)\s*[:：]/.test(l))?.trim() || null;
  const method = text.split('\n').find(l => /^\s*الطريقة\s*[:：]/.test(l))?.trim() || null;
  const riskLine = text.split('\n').find(l => /الخسارة عند الوقف/.test(l))?.trim() || null;
  const age = Math.max(0, now - at);
  return {
    key: `signal-${hash(new Date(at).toISOString() + '\n' + text)}`, at: new Date(at).toISOString(), title, text, kind, symbol,
    reviewUrl: safeReviewUrl(text), entryLine, method, riskLine, stop, target1, target2, quantity,
    trackable: kind === 'buy' && !!symbol && positive(stop) && positive(target1) && stop < target1 && (!target2 || target2 >= target1),
    recent: age < FOLLOW_TTL_MS, test, sendAccepted: row.sent === true,
    // The source supplies no validity window or current broker state for these messages.
    validity: 'راجع الحالة الحالية قبل القرار', executionAllowed: false
  };
}

export function normalizeSignals(rows, now = Date.now()) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const signal = normalizeSignal(row, now);
    if (signal) unique.set(signal.key, signal);
  }
  return [...unique.values()].sort((a, b) => dateMs(b.at) - dateMs(a.at)).slice(0, MAX_HISTORY);
}

export const emptyOperations = () => ({ schema: 1, revision: 0, read: [], follows: [], events: [] });
export function parseOperations(raw) {
  if (raw == null) return emptyOperations();
  const value = JSON.parse(raw);
  if (value?.schema !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.read) || !Array.isArray(value.follows) || !Array.isArray(value.events)) throw Error('تعذر قراءة سجل المتابعة المحفوظ؛ لم يُستبدل.');
  if (value.follows.some(f => !f || typeof f.key !== 'string' || !symbolPattern.test(f.symbol || '') || !positive(f.stop) || !positive(f.target1) || f.stop >= f.target1 || (f.target2 != null && (!positive(f.target2) || f.target2 < f.target1)) || !Number.isFinite(dateMs(f.startedAt)) || !Number.isFinite(dateMs(f.expiresAt)) || !['ACTIVE', 'CLOSED', 'EXPIRED'].includes(f.state) || !Array.isArray(f.hits))) throw Error('بيانات المتابعة غير صالحة؛ لم تُستبدل.');
  if(value.follows.some(f=>f.reviewUrl!=null&&safeReviewUrl(f.reviewUrl)!==f.reviewUrl))throw Error('رابط المراجعة المحفوظ غير صالح؛ لم يُفتح.');
  return value;
}

export function markSignalRead(state, key) {
  if (state.read.includes(key)) return state;
  return { ...state, revision: state.revision + 1, read: [...state.read, key].slice(-300) };
}

export function startFollowing(state, signal, now = Date.now()) {
  if (!signal?.trackable || !signal.recent || signal.test || now - dateMs(signal.at) >= FOLLOW_TTL_MS || dateMs(signal.at) > now + 5000) throw Error('تحتاج المتابعة رسالة شراء حديثة بمستويات واضحة.');
  if (state.follows.some(f => f.key === signal.key)) throw Error('هذه الرسالة مسجلة في المتابعة مسبقًا.');
  if (state.follows.filter(f => f.state === 'ACTIVE').length >= 20) throw Error('بلغت المتابعة 20 رسالة؛ أغلق متابعة قديمة أولًا.');
  const startedAt = new Date(now).toISOString();
  const follow = { key: signal.key, symbol: signal.symbol, title: signal.title, messageAt: signal.at, reviewUrl: signal.reviewUrl, stop: signal.stop, target1: signal.target1, target2: signal.target2, startedAt, expiresAt: new Date(dateMs(signal.at) + FOLLOW_TTL_MS).toISOString(), state: 'ACTIVE', hits: [], lastQuoteAt: null };
  return { ...state, revision: state.revision + 1, follows: [...state.follows, follow].slice(-100), events: [{ key: `${signal.key}:FOLLOW`, signalKey: signal.key, symbol: signal.symbol, type: 'FOLLOW', at: startedAt, text: 'بدأت متابعة المستويات؛ لا يعني ذلك شراء السهم.' }, ...state.events].slice(0, MAX_HISTORY) };
}

export function closeFollowing(state, key, now = Date.now()) {
  if (!state.follows.some(f => f.key === key && f.state === 'ACTIVE')) return state;
  const follow = state.follows.find(f => f.key === key);
  return { ...state, revision: state.revision + 1, follows: state.follows.map(f => f.key === key ? { ...f, state: 'CLOSED' } : f), events: [{ key: `${key}:CLOSED`, signalKey: key, symbol: follow.symbol, type: 'CLOSED', at: new Date(now).toISOString(), text: 'أغلقت المتابعة يدويًا؛ لا تمثل بيعًا أو نتيجة تداول.' }, ...state.events].slice(0, MAX_HISTORY) };
}

export function trackingQuoteReason(q, symbol, now = Date.now()) {
  if (!q || q.symbol !== symbol || !positive(q.price) || !q.source || q.error || q.fromSnapshot || (q.currency && q.currency !== 'USD')) return 'بانتظار سعر موثق بالدولار';
  if (Number(q.exchangeDataDelayedBy) > 0 || q.isFresh !== true) return 'القراءة متأخرة؛ متابعة المستويات معلّقة';
  if (q.isLiveSession !== true) return 'الجلسة غير نشطة؛ متابعة المستويات معلّقة';
  const age = now - dateMs(q.updatedAt || q.time), observed = now - dateMs(q.observedAt);
  if (!Number.isFinite(age) || !Number.isFinite(observed) || age < -5000 || observed < -5000 || age > 120000 || observed > 120000) return 'القراءة قديمة؛ متابعة المستويات معلّقة';
  return null;
}

export function advanceFollowing(state, quotes, now = Date.now()) {
  const events = [], changes = [];
  const follows = state.follows.map(f => {
    if (f.state !== 'ACTIVE') return f;
    if (now >= dateMs(f.expiresAt)) {
      events.push({ key: `${f.key}:EXPIRED`, signalKey: f.key, symbol: f.symbol, type: 'EXPIRED', at: new Date(now).toISOString(), text: 'انتهت نافذة المتابعة بعد 24 ساعة من الرسالة. يلزم تحديث الخطة.' });
      changes.push(f.key); return { ...f, state: 'EXPIRED' };
    }
    const q = quotes.find(q => q.symbol === f.symbol);
    if (trackingQuoteReason(q, f.symbol, now)) return f;
    const qt = dateMs(q.updatedAt || q.time);
    if (qt < dateMs(f.startedAt) || qt <= dateMs(f.lastQuoteAt)) return f;
    const hits = [...f.hits];
    for (const [type, level, reached, label] of [
      ['STOP', f.stop, q.price <= f.stop, 'رُصد السعر عند الوقف أو أدنى منه'],
      ['TARGET1', f.target1, q.price >= f.target1, 'رُصد السعر عند الهدف الأول أو أعلى منه'],
      ['TARGET2', f.target2, positive(f.target2) && q.price >= f.target2, 'رُصد السعر عند الهدف الثاني أو أعلى منه']
    ]) {
      if (!reached || hits.includes(type)) continue;
      hits.push(type);
      events.push({ key: `${f.key}:${type}`, signalKey: f.key, symbol: f.symbol, type, at: new Date(now).toISOString(), quoteAt: q.updatedAt || q.time, source: q.source, price: q.price, level, text: `${label}؛ حدث سعري للمراجعة، ولا يثبت تنفيذًا أو ربحًا.` });
    }
    // Only persist quote time when a new event occurs, avoiding writes on each price poll.
    if (hits.length === f.hits.length) return f;
    changes.push(f.key); return { ...f, hits, lastQuoteAt: q.updatedAt || q.time };
  });
  if (!changes.length) return { state, events: [] };
  return { state: { ...state, revision: state.revision + 1, follows, events: [...events, ...state.events].slice(0, MAX_HISTORY) }, events };
}

export function filterSignals(items, { kind = 'all', query = '' } = {}) {
  const needle = query.trim().toUpperCase();
  return items.filter(s => !s.test && (kind === 'all' || s.kind === kind) && (!needle || `${s.symbol || ''} ${s.title} ${s.text}`.toUpperCase().includes(needle)));
}
