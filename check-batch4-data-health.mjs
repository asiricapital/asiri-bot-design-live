import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const healthSource = fs.readFileSync(new URL('./quote-data-health.js', import.meta.url), 'utf8');
const lens = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8');

const healthContext = vm.createContext({ window: {}, Date, Number, String, Boolean, Object, Array, Math });
new vm.Script(healthSource, { filename: 'quote-data-health.js' }).runInContext(healthContext);
const api = healthContext.window.asiriQuoteDataHealth;
assert.ok(api, 'The shared quote-data health engine must be exposed');

const now = Date.parse('2026-09-03T22:00:00.000Z');
const isoBefore = (milliseconds) => new Date(now - milliseconds).toISOString();
const complete = {
  price: 6.75,
  source: 'Yahoo Finance • After-Hours • 10s polling',
  updatedAt: isoBefore(10 * 60 * 1000),
  observedAt: isoBefore(30 * 1000),
  isFresh: true,
  isLiveSession: true,
  session: 'POST_MARKET',
  error: false
};

const fresh = api.classifyQuote(complete, now);
assert.equal(fresh.state, 'FRESH', 'A connected source may be fresh even when an illiquid symbol has not traded recently');
assert.equal(fresh.sourceStatus, 'المصدر متصل الآن');
assert.equal(api.describeQuote(fresh).label, 'حديثة الآن');
assert.match(api.describeQuote(fresh).detail, /آخر حركة منذ 10 دقيقة/);
assert.deepEqual(Object.keys(fresh.checks), ['price', 'source', 'time', 'observation']);

const delayed = api.classifyQuote({ ...complete, isFresh: false }, now);
assert.equal(delayed.state, 'DELAYED', 'A connected provider that does not claim freshness must be delayed');
assert.equal(api.describeQuote(delayed).label, 'متأخرة');

const closed = api.classifyQuote({ ...complete, isFresh: false, isLiveSession: false, session: 'REGULAR_CLOSE', updatedAt: isoBefore(12 * 60 * 60 * 1000) }, now);
assert.equal(closed.state, 'DELAYED', 'A recent source carrying the last close must not look disconnected');
assert.equal(api.describeQuote(closed).label, 'آخر إغلاق');

const sourceBoundary = api.classifyQuote({ ...complete, observedAt: isoBefore(api.LIMITS.sourceRecentMs) }, now);
assert.equal(sourceBoundary.state, 'FRESH', 'The exact source-recency boundary remains fresh');
assert.equal(api.classifyQuote({ ...complete, observedAt: isoBefore(api.LIMITS.sourceRecentMs + 1) }, now).state, 'STALE', 'One millisecond beyond the source-recency boundary is stale');
const failedUpdate = api.classifyQuote({ ...complete, error: true }, now);
assert.equal(failedUpdate.reasonCode, 'UPDATE_FAILED');
assert.equal(failedUpdate.sourceStatus, 'تعذر آخر تحديث');
const localSnapshot = api.classifyQuote({ ...complete, fromSnapshot: true }, now);
assert.equal(localSnapshot.reasonCode, 'LOCAL_SNAPSHOT');
assert.match(localSnapshot.sourceStatus, /الاتصال الحالي غير مؤكد/);

for (const fixture of [
  { ...complete, price: null },
  { ...complete, price: 0 },
  { ...complete, source: '   ' },
  { ...complete, updatedAt: null },
  { ...complete, observedAt: null }
]) assert.equal(api.classifyQuote(fixture, now).state, 'UNAVAILABLE', 'Missing core fields must fail closed');

const missingObservation = api.classifyQuote({ ...complete, observedAt: null }, now);
assert.equal(missingObservation.checks.observation, false);
assert.equal(missingObservation.sourceStatus, 'وقت رصد المصدر غير متاح');
assert.notEqual(missingObservation.sourceStatus, 'المصدر متصل الآن');

const futureObservation = api.classifyQuote({ ...complete, observedAt: new Date(now + api.LIMITS.futureToleranceMs + 1).toISOString() }, now);
assert.equal(futureObservation.reasonCode, 'INVALID_FUTURE_TIME', 'An implausibly future source timestamp must be rejected');
assert.equal(futureObservation.checks.observation, false);
assert.equal(futureObservation.sourceStatus, 'وقت رصد المصدر غير صالح');
const futureQuote = api.classifyQuote({ ...complete, updatedAt: new Date(now + api.LIMITS.futureToleranceMs + 1).toISOString() }, now);
assert.equal(futureQuote.reasonCode, 'INVALID_FUTURE_TIME', 'An implausibly future market timestamp must be rejected');
assert.equal(futureQuote.checks.time, false, 'A future market timestamp must not count as a complete field');

const blocked = api.analysisGate(complete, now);
assert.equal(blocked.state, 'BLOCKED');
assert.equal(blocked.recommendation, null, 'Price transport alone must never create a recommendation');
assert.equal(blocked.availableCount, 0);
const reviewReady = api.analysisGate({
  ...complete,
  analysisEvidence: { priceHistory: true, liquidity: true, technicals: true, news: true, risk: true }
}, now);
assert.equal(reviewReady.state, 'REVIEW_READY');
assert.equal(reviewReady.recommendation, null, 'Complete evidence enables human review, not automated BUY/SELL');
const allEvidence = { priceHistory: true, liquidity: true, technicals: true, news: true, risk: true };
for (const fixture of [
  { ...complete, isFresh: false, analysisEvidence: allEvidence },
  { ...complete, error: true, analysisEvidence: allEvidence },
  { ...complete, observedAt: null, analysisEvidence: allEvidence }
]) assert.equal(api.analysisGate(fixture, now).state, 'BLOCKED', 'Non-fresh data cannot bypass the gate with complete analysis flags');

for (const [name, source] of [['health', healthSource], ['lens', lens]]) new vm.Script(source, { filename: `${name}.js` });
for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `index-inline-${index}.js` });
}

for (const marker of [
  'quote-data-health.js?v=1',
  'smart-decision-lens-static.css?v=5',
  'smart-decision-lens-static.js?v=5',
  "new Set(['ALL', 'FRESH', 'DELAYED', 'STALE', 'UNAVAILABLE'])",
  'data-filter="DELAYED"',
  'data-filter="STALE"',
  'id="readiness-delayed"',
  'id="readiness-stale"',
  'id="portfolio-delayed-count"',
  'id="portfolio-stale-count"',
  'fromSnapshot: true',
  'observedAt: row?.observedAt || payload?.observedAt || null',
  'time: row?.updatedAt || row?.time || null',
  'new AbortController()',
  'controller.abort()'
]) assert.ok(html.includes(marker), `Batch 4 HTML marker missing: ${marker}`);

for (const marker of [
  'حديثة الآن', 'متأخرة', 'قديمة', 'ناقصة',
  'حالة المصدر', 'آخر حركة سعر', 'وقت رصد المصدر', 'بيانات التتبع',
  'بوابة التوصية:', 'أدلة تحليلية مكتملة',
  'اختبار القراءة الحالية والحالات الأربع', 'وقت رصد المصدر', '<bdi dir="ltr">'
]) assert.ok(lens.includes(marker) || healthSource.includes(marker), `Batch 4 quote-lens marker missing: ${marker}`);

for (const marker of [
  '.smart-lens-state.fresh', '.smart-lens-state.delayed', '.smart-lens-state.stale', '.smart-lens-state.unavailable',
  '.smart-lens-completeness.delayed', '.smart-lens-completeness.stale', '.smart-lens-analysis-lock',
  '.smart-lens-analysis-lock.review-ready', 'inset-inline-start', 'border-inline-start', 'position: sticky', '92dvh', 'overscroll-behavior: contain'
]) assert.ok(css.includes(marker), `Batch 4 CSS marker missing: ${marker}`);

assert.ok(lens.includes("element.closest('details:not([open])')"), 'The focus trap must skip controls hidden inside a closed details element');
assert.ok(lens.includes('keepSimulatorOpen') && lens.includes('simulator.open = true'), 'Scenario selection must preserve the expanded simulator state');
assert.ok(html.includes('.portfolio-kpis>:last-child,.readiness-grid>:last-child,.filter-grid>:last-child{grid-column:1/-1}'), 'Odd mobile KPI/filter cards must span the final row');

assert.ok(!lens.includes('ثقة تحت 40'), 'The obsolete numeric-confidence copy must be removed');
assert.ok(!lens.includes('مؤشر ثقة الأدلة') && !lens.includes('/ 100'), 'The quote lens must remain free of pseudo-confidence scores');
assert.ok(!html.includes("state === 'CACHED'"), 'The ambiguous CACHED state must be replaced by DELAYED or STALE');
assert.ok(!healthSource.includes('recommendation: \'BUY\'') && !healthSource.includes('recommendation: \'SELL\''), 'The health engine must not emit trading decisions');

console.log('Batch 4 checks passed: four truthful states, source/market timestamps, fail-closed review gate, timeout safety and iPhone-friendly UI.');
