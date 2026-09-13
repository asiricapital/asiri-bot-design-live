import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
for (const name of ['quote-data-health.js', 'watchlist-evidence.js']) vm.runInContext(fs.readFileSync(new URL(name, import.meta.url), 'utf8'), context, { filename: name });
const { evaluate, quoteChange } = context.window.asiriWatchlistEvidence;
const now = Date.parse('2026-09-12T14:00:00.000Z');
const daily = (lastClose = 110) => ({
  ok: true, symbol: 'SNAP', availability: 'available', source: 'Yahoo Finance • Daily OHLCV', interval: '1d',
  observedAt: '2026-09-12T13:59:00.000Z', endOfHistory: '2026-09-11T13:30:00.000Z', candles: 40, historyStatus: 'RECENT_DAILY',
  indicators: { sparkline: [{ date: '2026-09-10T13:30:00.000Z', close: 100 }, { date: '2026-09-11T13:30:00.000Z', close: lastClose }] }
});
const inspect = (payload) => evaluate(payload, 'SNAP', now);
const blocked = (payload, code) => { const result = inspect(payload); assert.equal(result.available, false); assert.equal(result.reasonCode, code); assert.equal(result.chart.path, null); assert.equal(result.change.absolute, null); };

for (const [close, delta] of [[110, 10], [90, -10], [100, 0]]) {
  const payload = daily(close), before = JSON.stringify(payload), result = inspect(payload);
  assert.equal(result.available, true);
  assert.equal(result.change.available, true);
  assert.equal(result.change.absolute, delta);
  assert.equal(result.change.percent, delta);
  assert.equal(result.change.label, 'تغيّر آخر إغلاق');
  assert.equal(result.change.fromDate, '2026-09-10');
  assert.equal(result.change.toDate, '2026-09-11');
  assert.equal(result.chart.pointCount, 2);
  assert.equal((result.chart.path.match(/[ML]/g) || []).length, 2);
  assert.equal(JSON.stringify(payload), before, 'Evidence inspection must not mutate payloads.');
}
assert.equal(inspect(daily(100)).chart.path, 'M0.00,19.00 L100.00,19.00');
blocked({ ...daily(), source: ' ' }, 'MISSING_SOURCE');
blocked({ ...daily(), symbol: 'OTHER' }, 'SYMBOL_MISMATCH');
blocked({ ...daily(), ok: false }, 'SOURCE_UNAVAILABLE');
blocked({ ...daily(), interval: '5m' }, 'INVALID_INTERVAL');
blocked({ ...daily(), historyStatus: 'STALE' }, 'STALE_HISTORY');
blocked({ ...daily(), candles: 1 }, 'INVALID_CANDLES');
blocked({ ...daily(), observedAt: '2026-09-12T14:01:01.000Z' }, 'FUTURE_TIME');
blocked({ ...daily(), observedAt: '2026-09-12T13:49:00.000Z' }, 'STALE_OBSERVATION');
blocked({ ...daily(), endOfHistory: '2026-09-12T14:01:01.000Z' }, 'FUTURE_TIME');
blocked({ ...daily(), endOfHistory: '2026-09-08T13:30:00.000Z' }, 'STALE_HISTORY');
blocked({ ...daily(), observedAt: 'not a date' }, 'INVALID_TIME');
blocked({ ...daily(), observedAt: '2026-02-30T13:59:00.000Z' }, 'INVALID_TIME');
blocked({ ...daily(), endOfHistory: '2026-09-11T14:30:00.000Z' }, 'END_MISMATCH');
for (const close of [null, undefined, '', true, '110', 0, -1, NaN, Infinity]) {
  const payload = daily(close); payload.indicators.sparkline[1].close = close;
  blocked(payload, 'INVALID_POINTS');
}
for (const dates of [
  ['2026-09-11T13:30:00.000Z', '2026-09-11T13:30:00.000Z'],
  ['2026-09-11T13:30:00.000Z', '2026-09-11T14:30:00.000Z'],
  ['2026-09-11T13:30:00.000Z', '2026-09-10T13:30:00.000Z']
]) {
  const payload = daily(); dates.forEach((date, index) => { payload.indicators.sparkline[index].date = date; });
  blocked(payload, 'UNORDERED_POINTS');
}
blocked({ ...daily(), indicators: { sparkline: [{ date: '2026-09-11T13:30:00.000Z', close: 100 }] } }, 'INSUFFICIENT_POINTS');
const futurePoint = daily(); futurePoint.indicators.sparkline[1].date = '2026-09-12T14:02:00.000Z'; blocked(futurePoint, 'FUTURE_TIME');
const currentDay = daily();
currentDay.endOfHistory = '2026-09-12T13:30:00.000Z'; currentDay.indicators.sparkline[1].date = currentDay.endOfHistory;
const currentResult = inspect(currentDay);
assert.equal(currentResult.chart.available, true);
assert.equal(currentResult.chart.lastCandleCompleted, false);
assert.equal(currentResult.change.available, false);
assert.equal(currentResult.change.reasonCode, 'INCOMPLETE_LAST_CANDLE');

// Calendar changes in UTC do not establish that a New York trading day ended.
const newYorkBoundary = daily(); newYorkBoundary.observedAt = '2026-09-12T01:00:00.000Z';
const boundary = evaluate(newYorkBoundary, 'SNAP', Date.parse('2026-09-12T01:01:00.000Z'));
assert.equal(boundary.chart.available, true); assert.equal(boundary.change.available, false);

// Adjacency means successive returned trading sessions, not adjacent calendar days.
const weekend = daily(); weekend.observedAt = '2026-09-15T13:59:00.000Z'; weekend.endOfHistory = '2026-09-14T13:30:00.000Z';
weekend.indicators.sparkline = [{ date: '2026-09-11T13:30:00.000Z', close: 100 }, { date: weekend.endOfHistory, close: 110 }];
assert.equal(evaluate(weekend, 'SNAP', Date.parse('2026-09-15T14:00:00.000Z')).change.absolute, 10);

const quote = (overrides = {}) => ({ symbol: 'SNAP', price: 7.1, previousClose: 6.76, source: 'Yahoo Finance • Last Regular Close', updatedAt: '2026-09-11T20:00:00.000Z', observedAt: '2026-09-12T13:59:00.000Z', session: 'REGULAR_CLOSE', isFresh: false, isLiveSession: false, error: false, fromSnapshot: false, ...overrides });
const validQuote = quoteChange(quote(), now);
assert.equal(validQuote.available, true);
assert.ok(Math.abs(validQuote.absolute - 0.34) < 1e-12);
assert.ok(Math.abs(validQuote.percent - (0.34 / 6.76 * 100)) < 1e-10);
assert.equal(validQuote.label, 'تغيّر آخر إغلاق');
assert.equal(validQuote.fromDate, null, 'The quote contract does not identify the previous session date.');
const regular = quoteChange(quote({ session: 'REGULAR', isFresh: true, isLiveSession: true, updatedAt: '2026-09-12T13:59:00.000Z' }), now);
assert.equal(regular.available, true); assert.equal(regular.label, 'مقارنة بالإغلاق السابق');
for (const overrides of [{ error: true }, { fromSnapshot: true }, { source: null }, { observedAt: '2026-09-12T13:55:00.000Z' }, { updatedAt: '2026-09-12T14:02:00.000Z' }, { observedAt: '2026-09-12T14:02:00.000Z' }, { session: 'POST_MARKET' }, { session: 'PRE_MARKET' }]) assert.equal(quoteChange(quote(overrides), now).available, false);
for (const previousClose of [null, undefined, '', true, '6.76', 0, -1, NaN, Infinity]) assert.equal(quoteChange(quote({ previousClose }), now).available, false);
for (const [price, delta] of [[110, 10], [90, -10], [100, 0]]) assert.equal(quoteChange(quote({ price, previousClose: 100, change: 999, changePercent: 999 }), now).absolute, delta);

console.log('Watchlist evidence checks passed: verified daily history and quote baselines, malformed/stale/future data, current New York day, and unavailable states.');
