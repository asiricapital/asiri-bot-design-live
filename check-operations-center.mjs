import assert from 'node:assert/strict';
import { normalizeSignal, normalizeSignals, safeReviewUrl, emptyOperations, parseOperations, markSignalRead, startFollowing, closeFollowing, advanceFollowing, trackingQuoteReason, filterSignals, FOLLOW_TTL_MS } from './operations-model.mjs';

const now = Date.parse('2026-11-09T15:00:00Z');
const row = {
  id: 'server-id', at: new Date(now - 60000).toISOString(), kind: 'stop', symbol: 'EXTR', sent: true,
  text: '📈 اقتراح شراء سهم — EXTR\nالطريقة: سلسلة عسيري\nالدخول: آخر إغلاق $24.03؛ أعد فحص السعر\nالعدد: 1 سهم ≈ $24.08 · الخسارة عند الوقف ≈ $4.18\nوقف الخسارة: $19.9\nهدف مرجعي: $29.13 · ليس تنفيذًا\nافتح: https://asiri-bot.onrender.com/stock-proposals#sp-2026-11-06-TRAIL-EXTR'
};
const signal = normalizeSignal(row, now);
assert.equal(signal.kind, 'buy', 'Buy messages containing a stop must not become stop alerts.');
assert.equal(signal.quantity, 1); assert.equal(signal.stop, 19.9); assert.equal(signal.target1, 29.13); assert.equal(signal.target2, null);
assert.equal(signal.executionAllowed, false); assert(signal.trackable); assert(signal.recent); assert(signal.riskLine.includes('4.18'));
assert.equal(signal.reviewUrl, 'https://asiri-bot.onrender.com/stock-proposals#sp-2026-11-06-TRAIL-EXTR');
assert.equal(normalizeSignal({ ...row, id: 'db-100' }, now).key, signal.key, 'Database reloads preserve message identity.');
assert.equal(normalizeSignals([row, { ...row, id: 'new-id' }], now).length, 1);
assert.equal(normalizeSignal({ ...row, at: new Date(now + 61000).toISOString() }, now), null);
assert.equal(normalizeSignal({ ...row, at: 'missing' }, now), null);
assert.equal(normalizeSignal({ ...row, text: '' }, now), null);
assert.equal(normalizeSignal({ ...row, text: '🔴 Asiri · تنبيه أمان\nASIRI_EXECUTION_KILL_SWITCH', symbol: 'KILL' }, now).symbol, null);
const test = normalizeSignal({ ...row, text: 'TEST · طلب مراجعة اختباري\nوقف الخسارة: $19.9\nالهدف الأول: $29.13' }, now);
assert(test.test); assert.equal(test.trackable, false); assert.equal(filterSignals([signal, test]).length, 1);
assert.equal(normalizeSignal({ ...row, text: 'تقرير الإغلاق\nوقف الخسارة: $10' }, now).kind, 'report');
const arabic = normalizeSignal({ ...row, text: 'Golden Alert\nالسهم: ABC\nوقف الخسارة: $٤٫٥\nالهدف الأول: $٥٫٥\nالهدف الثاني: $٦٫٥' }, now);
assert.equal(arabic.symbol, 'ABC'); assert.equal(arabic.stop, 4.5); assert.equal(arabic.target1, 5.5); assert.equal(arabic.target2, 6.5);
assert.equal(normalizeSignal({ ...row, text: row.text.replace('$19.9', '$30') }, now).trackable, false);
assert.equal(safeReviewUrl('https://asiri-bot.onrender.com.evil.test/stock-proposals#sp-123'), null);
assert.equal(safeReviewUrl('https://asiri-bot.onrender.com/stock-proposals?token=secret#sp-123'), null);
assert.equal(safeReviewUrl('https://asiri-bot.onrender.com/stock-proposals#approve'), null);
assert.equal(safeReviewUrl('javascript:alert(1)'), null);

let state = emptyOperations(); const original = structuredClone(state);
state = markSignalRead(state, signal.key); assert.deepEqual(original, emptyOperations());
assert.equal(markSignalRead(state, signal.key), state, 'Reading the same message is idempotent.');
assert.throws(() => parseOperations('{broken'));
assert.throws(() => parseOperations(JSON.stringify({ schema: 2 })));
state = startFollowing(state, signal, now);
assert.equal(state.follows.length, 1); assert.equal(state.events.length, 1); assert.equal(state.follows[0].state, 'ACTIVE');
assert.deepEqual(parseOperations(JSON.stringify(state)), state);
assert.throws(() => startFollowing(state, signal, now));
assert.throws(() => startFollowing(emptyOperations(), signal, now + FOLLOW_TTL_MS));
assert.throws(() => startFollowing(emptyOperations(), test, now));
const quote = { symbol: 'EXTR', price: 30, source: 'fixture source', currency: 'USD', updatedAt: new Date(now + 1000).toISOString(), observedAt: new Date(now + 1000).toISOString(), isLiveSession: true, isFresh: true, exchangeDataDelayedBy: 0 };
assert.equal(trackingQuoteReason(quote, 'EXTR', now + 1000), null);
for (const override of [{ fromSnapshot: true }, { isFresh: false }, { isLiveSession: false }, { error: true }, { exchangeDataDelayedBy: 15 }, { currency: 'SAR' }, { symbol: 'OTHER' }, { price: 0 }, { price: '30' }, { updatedAt: new Date(now - 121000).toISOString() }, { observedAt: null }, { updatedAt: new Date(now + 100000).toISOString() }]) {
  const bad = { ...quote, ...override };
  assert(trackingQuoteReason(bad, 'EXTR', now + 1000));
  assert.equal(advanceFollowing(state, [bad], now + 1000).events.length, 0, JSON.stringify(override));
}
assert.equal(advanceFollowing(state, [{ ...quote, updatedAt: new Date(now - 10000).toISOString() }], now + 1000).events.length, 0, 'No inference about price events before the user started following.');
const result = advanceFollowing(state, [quote], now + 1000);
assert.equal(result.events.length, 1); assert.equal(result.events[0].type, 'TARGET1'); assert.equal(result.events[0].source, 'fixture source');
assert.equal(state.follows[0].hits.length, 0, 'The prior snapshot stays immutable.');
assert.equal(advanceFollowing(result.state, [quote], now + 1000).events.length, 0, 'Repeated quotes do not duplicate events.');
const stopped = advanceFollowing(result.state, [{ ...quote, price: 19, updatedAt: new Date(now + 2000).toISOString(), observedAt: new Date(now + 2000).toISOString() }], now + 2000);
assert.equal(stopped.events[0].type, 'STOP');
const expired = advanceFollowing(stopped.state, [], now + FOLLOW_TTL_MS);
assert.equal(expired.state.follows[0].state, 'EXPIRED'); assert.equal(expired.events[0].type, 'EXPIRED');
assert.equal(advanceFollowing(expired.state, [quote], now + FOLLOW_TTL_MS).events.length, 0);
const closed = closeFollowing(state, signal.key, now + 1000);
assert.equal(closed.follows[0].state, 'CLOSED'); assert.equal(advanceFollowing(closed, [quote], now + 1000).events.length, 0);
assert.equal(closeFollowing(closed, signal.key), closed);
assert.equal(filterSignals([signal, arabic], { query: 'extr' }).length, 1);
assert.equal(filterSignals([signal, arabic], { kind: 'report' }).length, 0);
console.log('Operations checks passed: actual-message parsing, buy/stop precedence, Arabic levels, exact-source retention, source-ID-independent dedupe, strict review links, test isolation, immutable local history, expiry, no stale/delayed/closed/backfilled price events, idempotent level tracking and no broker action.');
