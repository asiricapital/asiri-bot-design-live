import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lens = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const healthSource = fs.readFileSync(new URL('./quote-data-health.js', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Function ${name} is missing`);
  const signatureEnd = source.indexOf(') {', start);
  assert.ok(signatureEnd >= 0, `Function ${name} has an unsupported signature`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Function ${name} is incomplete`);
}

for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `index-inline-${index}.js` });
}
new vm.Script(lens, { filename: 'smart-decision-lens-static.js' });

const healthContext = vm.createContext({ window: {}, Date, Number, String, Boolean, Object, Array, Math });
new vm.Script(healthSource, { filename: 'quote-data-health.js' }).runInContext(healthContext);
const healthApi = healthContext.window.asiriQuoteDataHealth;
const quoteDataState = (item, nowMs = Date.now()) => healthApi.classifyQuote(item, nowMs).state;
const finiteNumber = vm.runInNewContext(`(${extractFunction(html, 'finiteNumber')})`);
const normalizeDataFilter = vm.runInNewContext(`(${extractFunction(html, 'normalizeDataFilter')})`, {
  DATA_FILTERS: new Set(['ALL', 'FRESH', 'DELAYED', 'STALE', 'UNAVAILABLE'])
});

const now = Date.now();
const complete = {
  price: '6.76', source: 'Asiri Market Engine',
  time: new Date(now - 30_000).toISOString(), observedAt: new Date(now - 10_000).toISOString(),
  isLiveSession: true, session: 'REGULAR'
};
assert.equal(quoteDataState({ ...complete, isFresh: true, error: false }, now), 'FRESH');
assert.equal(quoteDataState({ ...complete, isFresh: false, error: false }, now), 'DELAYED');
assert.equal(quoteDataState({ ...complete, isFresh: true, error: true }, now), 'STALE');
for (const fixture of [
  { ...complete, source: '' }, { ...complete, time: null }, { ...complete, time: 'not-a-date' },
  { ...complete, price: null }, { ...complete, price: '' }, { ...complete, price: '   ' },
  { ...complete, price: 0 }, { ...complete, price: -1 }, { ...complete, price: Infinity }
]) assert.equal(quoteDataState(fixture, now), 'UNAVAILABLE');
assert.equal(quoteDataState({ decision: 'BUY', text: 'شراء', cls: 'badge-buy' }, now), 'UNAVAILABLE');
assert.equal(quoteDataState({ ...complete, isFresh: true, error: false, decision: 'AVOID' }, now), 'FRESH');

for (const state of ['ALL', 'FRESH', 'DELAYED', 'STALE', 'UNAVAILABLE']) assert.equal(normalizeDataFilter(state), state);
for (const legacy of ['BUY', 'WAIT', 'CACHED', 'unknown']) assert.equal(normalizeDataFilter(legacy), 'ALL');

const numericPrice = vm.runInNewContext(`(${extractFunction(lens, 'numericPrice')})`);
assert.equal(numericPrice('   '), null);
assert.equal(numericPrice(0), null);
assert.equal(numericPrice(-1), null);
assert.equal(numericPrice('$6.76'), 6.76);

const makeClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    toggle: (name, force) => force ? values.add(name) : values.delete(name),
    contains: (name) => values.has(name)
  };
};
const filterButtons = ['ALL', 'FRESH', 'DELAYED', 'STALE', 'UNAVAILABLE'].map((filter) => ({
  dataset: { filter }, classList: makeClassList(), attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; }
}));
const filterContext = vm.createContext({
  currentFilter: 'ALL', normalizeDataFilter,
  document: { querySelectorAll: () => filterButtons }, renderTable() {}
});
const filterAction = vm.runInContext(`(${extractFunction(html, 'filterAction')})`, filterContext);
filterAction('STALE', filterButtons[3]);
assert.equal(filterContext.currentFilter, 'STALE');
assert.equal(filterButtons.filter((button) => button.classList.contains('active')).length, 1);
assert.equal(filterButtons[3].attributes['aria-pressed'], 'true');
filterAction('BUY', null);
assert.equal(filterContext.currentFilter, 'ALL');

const readinessIds = [
  'readiness-total', 'readiness-fresh', 'readiness-delayed', 'readiness-stale',
  'readiness-unavailable', 'readiness-latest', 'readiness-sources'
];
const readinessElements = Object.fromEntries(readinessIds.map((id) => [id, { textContent: '' }]));
const readinessContext = vm.createContext({
  watchlist: ['FRESH1', 'DELAY1', 'STALE1', 'MISSING'],
  stockMarketData: {
    FRESH1: { ...complete, price: 1, source: 'Provider A', isFresh: true, error: false },
    DELAY1: { ...complete, price: 2, source: 'Provider A', isFresh: false, error: false },
    STALE1: { ...complete, price: 3, source: 'Provider B', isFresh: true, error: true },
    MISSING: { ...complete, price: 4, source: null, isFresh: true, error: false }
  },
  document: { getElementById: (id) => readinessElements[id] || null }, quoteDataState
});
const renderReadiness = vm.runInContext(`(${extractFunction(html, 'renderDataReadinessSummary')})`, readinessContext);
renderReadiness();
assert.deepEqual(
  ['readiness-total', 'readiness-fresh', 'readiness-delayed', 'readiness-stale', 'readiness-unavailable'].map((id) => Number(readinessElements[id].textContent)),
  [4, 1, 1, 1, 1]
);
assert.equal(readinessElements['readiness-sources'].textContent, 'Provider A، Provider B');

const normalizeSymbol = vm.runInNewContext(`(${extractFunction(html, 'normalizeSymbol')})`);
const fallbackContext = vm.createContext({
  watchlist: ['SG'], normalizeSymbol,
  stockMarketData: { SG: { symbol: 'SG', ...complete, isFresh: true, updated: true, error: false } },
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE'
});
const markUnavailable = vm.runInContext(`(${extractFunction(html, 'markQuoteUnavailable')})`, fallbackContext);
markUnavailable('SG');
assert.equal(quoteDataState(fallbackContext.stockMarketData.SG), 'STALE');
assert.equal(fallbackContext.stockMarketData.SG.price, '6.76');
assert.equal(fallbackContext.stockMarketData.SG.source, complete.source);
assert.equal(fallbackContext.stockMarketData.SG.time, complete.time);

const snapshotNow = new Date();
const recentStoredAt = new Date(snapshotNow.getTime() - 60_000).toISOString();
const expiredStoredAt = new Date(snapshotNow.getTime() - (25 * 60 * 60 * 1000)).toISOString();
const futureStoredAt = new Date(snapshotNow.getTime() + 60_000).toISOString();
const snapshotPayload = { storedAt: snapshotNow.toISOString(), rows: {
  SG: { ...complete, storedAt: recentStoredAt, decision: 'BUY', text: 'شراء', cls: 'badge-buy' },
  LEGACY: { ...complete, decision: 'WAIT', text: 'انتظار' },
  OLD: { ...complete, storedAt: expiredStoredAt }, FUTURE: { ...complete, storedAt: futureStoredAt },
  BROKEN: { price: 4.2, source: null, time: complete.time, storedAt: recentStoredAt }
} };
const restoreContext = vm.createContext({
  QUOTE_SNAPSHOT_KEY: 'snapshot', QUOTE_SNAPSHOT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  localStorage: { getItem: () => JSON.stringify(snapshotPayload) },
  watchlist: ['SG', 'LEGACY', 'OLD', 'FUTURE', 'BROKEN'],
  stockMarketData: Object.fromEntries(['SG', 'LEGACY', 'OLD', 'FUTURE', 'BROKEN'].map((symbol) => [symbol, { symbol }])),
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE', finiteNumber
});
const restoreSnapshot = vm.runInContext(`(${extractFunction(html, 'restoreVerifiedQuoteSnapshot')})`, restoreContext);
restoreSnapshot();
assert.equal(restoreContext.stockMarketData.SG.price, 6.76);
assert.equal(restoreContext.stockMarketData.SG.fromSnapshot, true);
for (const field of ['decision', 'text', 'cls']) assert.ok(!(field in restoreContext.stockMarketData.SG));
assert.equal(restoreContext.stockMarketData.OLD.price, undefined);
assert.equal(restoreContext.stockMarketData.FUTURE.price, undefined);
assert.equal(restoreContext.stockMarketData.BROKEN.price, undefined);
restoreContext.localStorage.getItem = () => '{malformed';
assert.doesNotThrow(() => restoreSnapshot());

let savedSnapshot = null;
const saveContext = vm.createContext({
  QUOTE_SNAPSHOT_KEY: 'snapshot', QUOTE_SNAPSHOT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  watchlist: ['GOOD', 'OLD', 'FUTURE', 'INCOMPLETE'],
  stockMarketData: {
    GOOD: { ...complete, price: 8.4, snapshotStoredAt: recentStoredAt, provider: 'Provider A' },
    OLD: { ...complete, price: 7.1, snapshotStoredAt: expiredStoredAt },
    FUTURE: { ...complete, price: 6.2, snapshotStoredAt: futureStoredAt },
    INCOMPLETE: { ...complete, price: 5.3, observedAt: null, snapshotStoredAt: recentStoredAt }
  },
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE', finiteNumber,
  localStorage: { setItem: (_key, value) => { savedSnapshot = JSON.parse(value); } }
});
const saveSnapshot = vm.runInContext(`(${extractFunction(html, 'saveVerifiedQuoteSnapshot')})`, saveContext);
saveSnapshot();
assert.deepEqual(Object.keys(savedSnapshot.rows), ['GOOD']);
assert.equal(savedSnapshot.rows.GOOD.storedAt, recentStoredAt, 'Saving must preserve the original snapshot age instead of renewing it');
assert.equal(savedSnapshot.rows.GOOD.observedAt, complete.observedAt, 'The independent source-observation timestamp must be preserved');
assert.equal(savedSnapshot.rows.GOOD.updatedAt, complete.time, 'The market timestamp must remain separate from source observation');

const tools = html.slice(html.indexOf('<div id="sec-tools"'), html.indexOf('<div id="sec-journey"'));
for (const state of ['ALL', 'FRESH', 'DELAYED', 'STALE', 'UNAVAILABLE']) {
  assert.ok(tools.includes(`data-filter="${state}"`), `Missing ${state} data filter`);
}
assert.equal((tools.match(/class="filter-btn/g) || []).length, 5);
for (const id of readinessIds) assert.ok(html.includes(`id="${id}"`), `Readiness summary is missing ${id}`);

assert.ok(html.includes('function quoteHealth(item, nowMs = Date.now())'));
assert.ok(html.includes('symbols.filter((symbol) => !receivedSymbols.has(symbol)).forEach(markQuoteUnavailable);'));
assert.ok(html.includes('item.isFresh = false;') && html.includes('item.error = true;'));
assert.ok(html.includes('fromSnapshot: true'));
assert.ok(!html.includes("state === 'CACHED'"));
assert.ok(lens.includes('بوابة التوصية:') && lens.includes('لا يصدر توصية'));
assert.ok(!lens.includes('مؤشر ثقة الأدلة') && !lens.includes('/ 100'));
assert.ok(!/\b(fetch|XMLHttpRequest)\s*\(/.test(lens));
assert.ok(/\.readiness-grid,\.filter-grid\{grid-template-columns:1fr 1fr\}/.test(html));
assert.ok(lens.includes("element.closest('details:not([open])')"), 'The focus trap must ignore controls hidden in collapsed details');
assert.ok(lens.includes("querySelectorAll('button:not([disabled]), summary')"), 'The dialog focus whitelist must remain limited to its actual controls');

console.log('Batch 2 data-truth checks passed: canonical health states, safe snapshots, truthful filters, no recommendation leakage and iPhone safeguards.');
