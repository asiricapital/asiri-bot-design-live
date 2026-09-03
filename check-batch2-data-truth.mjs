import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lens = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');

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

const finiteNumber = vm.runInNewContext(`(${extractFunction(html, 'finiteNumber')})`);
const quoteDataState = vm.runInNewContext(`(${extractFunction(html, 'quoteDataState')})`, { finiteNumber });
const normalizeDataFilter = vm.runInNewContext(`(${extractFunction(html, 'normalizeDataFilter')})`, {
  DATA_FILTERS: new Set(['ALL', 'FRESH', 'CACHED', 'UNAVAILABLE'])
});

const complete = { price: '6.76', source: 'Asiri Market Engine', time: '2026-09-03T12:00:00Z' };
assert.equal(quoteDataState({ ...complete, isFresh: true, error: false }), 'FRESH', 'A complete current quote must be fresh');
assert.equal(quoteDataState({ ...complete, isFresh: false, error: false }), 'CACHED', 'A complete stale quote must remain a cached reading');
assert.equal(quoteDataState({ ...complete, isFresh: true, error: true }), 'CACHED', 'A prior complete quote must remain cached after refresh failure');
assert.equal(quoteDataState({ ...complete, source: '' }), 'UNAVAILABLE', 'A quote without a provider must be unavailable');
assert.equal(quoteDataState({ ...complete, time: null }), 'UNAVAILABLE', 'A quote without an observation time must be unavailable');
assert.equal(quoteDataState({ ...complete, time: 'not-a-date' }), 'UNAVAILABLE', 'A quote with an invalid observation time must be unavailable');
assert.equal(quoteDataState({ ...complete, price: null }), 'UNAVAILABLE', 'A null quote must be unavailable, not zero');
assert.equal(quoteDataState({ ...complete, price: '' }), 'UNAVAILABLE', 'An empty quote must be unavailable, not zero');
assert.equal(quoteDataState({ ...complete, price: '   ' }), 'UNAVAILABLE', 'A whitespace quote must be unavailable, not zero');
assert.equal(quoteDataState({ ...complete, price: 0 }), 'UNAVAILABLE', 'A zero quote must be unavailable');
assert.equal(quoteDataState({ ...complete, price: -1 }), 'UNAVAILABLE', 'A negative quote must be unavailable');
assert.equal(quoteDataState({ ...complete, price: Infinity }), 'UNAVAILABLE', 'A non-finite quote must be unavailable');
assert.equal(quoteDataState({ ...complete, source: '   ' }), 'UNAVAILABLE', 'A whitespace-only provider must be unavailable');
assert.equal(quoteDataState({ decision: 'BUY', text: 'شراء', cls: 'badge-buy' }), 'UNAVAILABLE', 'Legacy recommendation fields must not create a data state');
assert.equal(quoteDataState({ ...complete, isFresh: true, error: false, decision: 'AVOID' }), 'FRESH', 'Legacy recommendation fields must not influence data quality');

for (const state of ['ALL', 'FRESH', 'CACHED', 'UNAVAILABLE']) assert.equal(normalizeDataFilter(state), state);
assert.equal(normalizeDataFilter('BUY'), 'ALL', 'A legacy BUY filter must safely reset to ALL');
assert.equal(normalizeDataFilter('wait'), 'ALL', 'A legacy WAIT filter must safely reset to ALL');
assert.equal(normalizeDataFilter('unknown'), 'ALL', 'An unknown filter must safely reset to ALL');

const numericPrice = vm.runInNewContext(`(${extractFunction(lens, 'numericPrice')})`);
const dataView = vm.runInNewContext(`(${extractFunction(lens, 'dataView')})`, { numericPrice });
const dataCompleteness = vm.runInNewContext(`(${extractFunction(lens, 'dataCompleteness')})`, { numericPrice, Object, Number, Date, String, Boolean, dataView });
assert.equal(dataView({ ...complete, isFresh: true, error: false }).state, 'FRESH');
assert.equal(dataView({ ...complete, isFresh: false, error: false }).state, 'CACHED');
assert.equal(dataView({ ...complete, source: null, isFresh: true, error: false }).state, 'UNAVAILABLE');
assert.equal(numericPrice('   '), null, 'The lens must reject a whitespace quote');
assert.equal(numericPrice(0), null, 'The lens must reject a zero quote');
assert.equal(numericPrice(-1), null, 'The lens must reject a negative quote');
const freshCompleteness = dataCompleteness({ ...complete, isFresh: true, error: false }, { state: 'FRESH' });
assert.equal(freshCompleteness.label, 'مكتملة الآن');
assert.equal(freshCompleteness.availableCount, 3);
assert.deepEqual({ ...freshCompleteness.checks }, { price: true, source: true, time: true });
assert.equal('score' in freshCompleteness, false, 'Quote completeness must not expose an investment-like numeric score');
const cachedCompleteness = dataCompleteness({ ...complete, isFresh: false, error: false }, { state: 'CACHED' });
assert.equal(cachedCompleteness.tone, 'cached', 'A cached reading must use a warning tone');
assert.equal(cachedCompleteness.label, 'مكتملة ومحفوظة');
const incompleteCompleteness = dataCompleteness({ ...complete, source: '', time: null, isFresh: true }, { state: 'UNAVAILABLE' });
assert.equal(incompleteCompleteness.availableCount, 1);
assert.equal(incompleteCompleteness.label, 'غير مكتملة');

const parityFixtures = [
  { ...complete, isFresh: true, error: false },
  { ...complete, isFresh: false, error: false },
  { ...complete, isFresh: true, error: true },
  { ...complete, source: '   ', isFresh: true, error: false },
  { ...complete, time: 'invalid', isFresh: true, error: false },
  { ...complete, price: 0, isFresh: true, error: false },
  { ...complete, price: -1, isFresh: true, error: false }
];
for (const fixture of parityFixtures) {
  assert.equal(dataView(fixture).state, quoteDataState(fixture), 'Table and quality lens must classify the same quote identically');
}

assert.ok(lens.includes('اكتمال بيانات السعر') && lens.includes('جودة التحليل') && lens.includes('غير محسوبة'), 'The lens must separate quote completeness from analytical quality');
assert.ok(!lens.includes('مؤشر ثقة الأدلة') && !lens.includes('/ 100'), 'The quote lens must not present a repeated 100-point confidence score');

const makeClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    toggle: (name, force) => force ? values.add(name) : values.delete(name),
    contains: (name) => values.has(name)
  };
};
const filterButtons = ['ALL', 'FRESH', 'CACHED', 'UNAVAILABLE'].map((filter) => ({
  dataset: { filter }, classList: makeClassList(), attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; }
}));
const filterContext = vm.createContext({
  currentFilter: 'ALL', normalizeDataFilter,
  document: { querySelectorAll: () => filterButtons },
  renderTable() {}
});
const filterAction = vm.runInContext(`(${extractFunction(html, 'filterAction')})`, filterContext);
filterAction('CACHED', filterButtons[2]);
assert.equal(filterContext.currentFilter, 'CACHED');
assert.equal(filterButtons.filter((button) => button.classList.contains('active')).length, 1, 'Exactly one data filter must remain active');
assert.equal(filterButtons[2].attributes['aria-pressed'], 'true', 'The selected data filter must expose aria-pressed=true');
filterAction('BUY', null);
assert.equal(filterContext.currentFilter, 'ALL', 'A legacy filter must dynamically reset to ALL');
assert.equal(filterButtons[0].attributes['aria-pressed'], 'true', 'The ALL filter must become selected after a legacy filter is normalized');

const readinessElements = Object.fromEntries([
  'readiness-total', 'readiness-fresh', 'readiness-cached', 'readiness-unavailable', 'readiness-latest', 'readiness-sources'
].map((id) => [id, { textContent: '' }]));
const readinessContext = vm.createContext({
  watchlist: ['FRESH1', 'CACHE1', 'CACHE2', 'MISSING'],
  stockMarketData: {
    FRESH1: { price: 1, source: 'Provider A', time: '2026-09-03T12:00:00Z', isFresh: true, error: false },
    CACHE1: { price: 2, source: 'Provider A', time: '2026-09-03T10:00:00Z', isFresh: false, error: false },
    CACHE2: { price: 3, source: 'Provider B', time: '2026-09-03T11:00:00Z', isFresh: false, error: true },
    MISSING: { price: 4, source: null, time: '2026-09-03T12:00:00Z', isFresh: true, error: false }
  },
  document: { getElementById: (id) => readinessElements[id] || null },
  quoteDataState
});
const renderReadiness = vm.runInContext(`(${extractFunction(html, 'renderDataReadinessSummary')})`, readinessContext);
renderReadiness();
assert.deepEqual(
  ['readiness-total', 'readiness-fresh', 'readiness-cached', 'readiness-unavailable'].map((id) => Number(readinessElements[id].textContent)),
  [4, 1, 2, 1],
  'Readiness summary must count canonical data states'
);
assert.equal(readinessElements['readiness-sources'].textContent, 'Provider A، Provider B', 'Readiness summary must deduplicate complete-reading providers');
assert.notEqual(readinessElements['readiness-latest'].textContent, 'غير متاح', 'Readiness summary must expose the latest complete reading time');

const normalizeSymbol = vm.runInNewContext(`(${extractFunction(html, 'normalizeSymbol')})`);
const fallbackContext = vm.createContext({
  watchlist: ['SG'], normalizeSymbol,
  stockMarketData: { SG: { symbol: 'SG', ...complete, isFresh: true, updated: true, error: false } },
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE'
});
const markUnavailable = vm.runInContext(`(${extractFunction(html, 'markQuoteUnavailable')})`, fallbackContext);
markUnavailable('SG');
assert.equal(quoteDataState(fallbackContext.stockMarketData.SG), 'CACHED', 'A failed refresh must demote the last complete quote to CACHED');
assert.equal(fallbackContext.stockMarketData.SG.price, '6.76', 'A failed refresh must preserve the last complete price');
assert.equal(fallbackContext.stockMarketData.SG.source, complete.source, 'A failed refresh must preserve the last complete provider');
assert.equal(fallbackContext.stockMarketData.SG.time, complete.time, 'A failed refresh must preserve the last complete observation time');

const snapshotNow = new Date();
const recentStoredAt = new Date(snapshotNow.getTime() - 60_000).toISOString();
const expiredStoredAt = new Date(snapshotNow.getTime() - (25 * 60 * 60 * 1000)).toISOString();
const futureStoredAt = new Date(snapshotNow.getTime() + 60_000).toISOString();
const snapshotPayload = {
  storedAt: snapshotNow.toISOString(),
  rows: {
    SG: { ...complete, storedAt: recentStoredAt, decision: 'BUY', text: 'شراء', cls: 'badge-buy' },
    LEGACY: { ...complete, decision: 'WAIT', text: 'انتظار' },
    OLD: { ...complete, storedAt: expiredStoredAt, decision: 'BUY' },
    FUTURE: { ...complete, storedAt: futureStoredAt },
    BROKEN: { price: 4.2, source: null, time: complete.time, storedAt: recentStoredAt }
  }
};
const restoreContext = vm.createContext({
  QUOTE_SNAPSHOT_KEY: 'snapshot', QUOTE_SNAPSHOT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  localStorage: { getItem: () => JSON.stringify(snapshotPayload) },
  watchlist: ['SG', 'LEGACY', 'OLD', 'FUTURE', 'BROKEN'],
  stockMarketData: { SG: { symbol: 'SG' }, LEGACY: { symbol: 'LEGACY' }, OLD: { symbol: 'OLD' }, FUTURE: { symbol: 'FUTURE' }, BROKEN: { symbol: 'BROKEN' } },
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE', finiteNumber
});
const restoreSnapshot = vm.runInContext(`(${extractFunction(html, 'restoreVerifiedQuoteSnapshot')})`, restoreContext);
restoreSnapshot();
assert.equal(restoreContext.stockMarketData.SG.price, 6.76, 'A recent complete legacy row must be restored');
assert.equal(restoreContext.stockMarketData.SG.snapshotStoredAt, recentStoredAt, 'A restored row must retain its own cache age');
for (const field of ['decision', 'text', 'cls']) assert.ok(!(field in restoreContext.stockMarketData.SG), `Legacy ${field} must not be restored`);
assert.equal(restoreContext.stockMarketData.LEGACY.snapshotStoredAt, snapshotNow.toISOString(), 'A v1 snapshot must migrate its envelope timestamp to the restored row');
for (const field of ['decision', 'text']) assert.ok(!(field in restoreContext.stockMarketData.LEGACY), `A v1 snapshot must not restore legacy ${field}`);
assert.equal(restoreContext.stockMarketData.OLD.price, undefined, 'An expired row must not be revived by a newer envelope timestamp');
assert.equal(restoreContext.stockMarketData.FUTURE.price, undefined, 'A future-dated row must not bypass cache age validation');
assert.equal(restoreContext.stockMarketData.BROKEN.price, undefined, 'An incomplete row must not be restored');
restoreContext.localStorage.getItem = () => '{malformed';
assert.doesNotThrow(() => restoreSnapshot(), 'A malformed snapshot must never break page initialization');

let savedSnapshot = null;
const saveContext = vm.createContext({
  QUOTE_SNAPSHOT_KEY: 'snapshot', QUOTE_SNAPSHOT_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  localStorage: { setItem: (_key, value) => { savedSnapshot = JSON.parse(value); } },
  watchlist: ['SG', 'OLD', 'FUTURE'],
  stockMarketData: {
    SG: { ...complete, snapshotStoredAt: recentStoredAt, isFresh: false, error: true },
    OLD: { ...complete, snapshotStoredAt: expiredStoredAt, isFresh: false, error: true },
    FUTURE: { ...complete, snapshotStoredAt: futureStoredAt, isFresh: false, error: true }
  },
  portfolioHasPrice: (item) => quoteDataState(item) !== 'UNAVAILABLE', finiteNumber
});
const saveSnapshot = vm.runInContext(`(${extractFunction(html, 'saveVerifiedQuoteSnapshot')})`, saveContext);
saveSnapshot();
assert.equal(savedSnapshot.schemaVersion, 2, 'The row-aged snapshot schema must be explicit');
assert.equal(savedSnapshot.rows.SG.storedAt, recentStoredAt, 'Saving a failed refresh must not renew a cached row age');
assert.ok(!savedSnapshot.rows.OLD, 'Expired rows must be omitted instead of having their age renewed');
assert.ok(!savedSnapshot.rows.FUTURE, 'Future-dated rows must be omitted instead of bypassing cache age validation');

const toolsStart = html.indexOf('<div id="sec-tools"');
const toolsEnd = html.indexOf('<div id="sec-journey"');
const tools = html.slice(toolsStart, toolsEnd);
for (const state of ['ALL', 'FRESH', 'CACHED', 'UNAVAILABLE']) {
  assert.ok(tools.includes(`data-filter="${state}"`), `Missing ${state} data filter`);
}
assert.equal((tools.match(/class="filter-btn/g) || []).length, 4, 'Exactly four data-quality filters must be shown');
assert.ok(tools.includes('aria-pressed="true"') && tools.includes('aria-pressed="false"'), 'Filter state must be exposed to assistive technology');

const renderStart = html.indexOf('function renderTable()');
const renderEnd = html.indexOf('function removeStock(', renderStart);
const renderTable = html.slice(renderStart, renderEnd);
assert.ok(renderTable.includes('quoteDataState('), 'Table filtering must use the canonical data-state contract');
assert.ok(renderTable.includes('quoteDataView('), 'Table labels must use the canonical data-state view');
assert.ok(!renderTable.includes('.decision'), 'Table filtering must not depend on legacy recommendation fields');
assert.ok(renderTable.includes('badge-data-state') && renderTable.includes('تفاصيل القراءة'), 'Rows must show data status and a truthful details action');
assert.ok(renderTable.includes("hasPrice ? 'val-price' : 'val-neutral'") && !renderTable.includes("hasPrice ? 'val-pos'"), 'Quote availability must not be styled as a positive price move');

const restoreStart = html.indexOf('function restoreVerifiedQuoteSnapshot()');
const restoreEnd = html.indexOf('function saveVerifiedQuoteSnapshot()', restoreStart);
const restore = html.slice(restoreStart, restoreEnd);
assert.ok(!restore.includes('...saved'), 'Legacy snapshots must not spread untrusted or obsolete fields into runtime state');
for (const field of ['price: finiteNumber(saved.price)', 'time: saved.time || null', 'source: saved.source || null']) {
  assert.ok(restore.includes(field), `Snapshot restore must explicitly whitelist ${field}`);
}

for (const id of ['readiness-total', 'readiness-fresh', 'readiness-cached', 'readiness-unavailable', 'readiness-latest', 'readiness-sources']) {
  assert.ok(html.includes(`id="${id}"`), `Readiness summary is missing ${id}`);
}
assert.ok(html.includes('function renderDataReadinessSummary()'), 'Readiness summary must be derived from current data states');
assert.ok(html.includes('لا تُحفظ عتبات سعرية') && html.includes('غير مفعّلة'), 'Alerts must explicitly disclose that they are not enabled');
assert.ok(html.includes("view.state === 'CACHED' ? 'stale' : 'unavailable'"), 'Research status styling must distinguish cached and unavailable readings');

for (const obsolete of [
  'السعر الحي',
  'القرار التنفيذي لكل سهم',
  'تدفق البث',
  'إحصائيات البث المباشر وأحجام التداول اللحظية',
  'التنبيهات تفعل فور',
  'اضبط تنبيهك',
  'قمة القرار'
]) assert.ok(!html.includes(obsolete), `Misleading production phrase remains: ${obsolete}`);

for (const obsolete of ['decision:', '.decision', "'BUY'", "'WAIT'", "'AVOID'", 'عدسة القرار الذكية']) {
  assert.ok(!lens.includes(obsolete), `The quote-quality lens still depends on a legacy recommendation marker: ${obsolete}`);
}
for (const marker of [
  'DATA QUALITY LENS · READ ONLY',
  'تفاصيل جودة القراءة',
  'function dataView(item)',
  'function qualityChecks(item)',
  'أدلة غير مكتملة',
  'قراءة مكتملة',
  'لا توصية'
]) assert.ok(lens.includes(marker), `Quote-quality lens marker missing: ${marker}`);

assert.ok(/\.filter-btn\{[^}]*font-size:\.72rem/s.test(html), 'Narrow iPhone filters must use compact text');
assert.ok(/\.readiness-grid,\.filter-grid\{grid-template-columns:1fr 1fr\}/.test(html), 'Narrow iPhones must show the four filters in a readable two-column grid');
assert.ok(html.includes('.nav-pill,.filter-btn,.smart-summary-btn,.remove-symbol-btn,.modal-btn{min-height:44px}'), 'Interactive mobile controls must keep a 44px touch target');
assert.ok(/\.smart-lens-scenario-buttons button\s*\{[\s\S]*?min-height:\s*44px/.test(fs.readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8')), 'Quality simulation buttons must keep a 44px touch target');
for (const marker of ['returnFocus', "event.key !== 'Tab'", 'focusTarget.focus({ preventScroll: true })', 'window.asiriSmartDecisionLens = publicApi']) {
  assert.ok(lens.includes(marker), `Quality dialog accessibility or compatibility marker missing: ${marker}`);
}
assert.ok(!/\b(fetch|XMLHttpRequest)\s*\(/.test(lens), 'The local quality lens must remain network-free');

console.log('Batch 2 data-truth checks passed: canonical quote states, safe snapshots, truthful filters, quality lens, alert disclosure and iPhone safeguards.');
