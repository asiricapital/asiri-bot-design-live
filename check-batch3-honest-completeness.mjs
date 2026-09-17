import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8');
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

new vm.Script(script, { filename: 'smart-decision-lens-static.js' });
const numericPrice = vm.runInNewContext(`(${extractFunction(script, 'numericPrice')})`);
const healthContext = vm.createContext({ window: {}, Date, Number, String, Boolean, Object, Array, Math });
new vm.Script(healthSource).runInContext(healthContext);
const healthApi = healthContext.window.asiriQuoteDataHealth;
const lensWindow = { asiriQuoteDataHealth: healthApi };
const dataCompleteness = vm.runInNewContext(`(${extractFunction(script, 'dataCompleteness')})`, { numericPrice, Object, Number, Date, String, Boolean, window: lensWindow });
const now = Date.parse('2026-09-03T20:00:00Z');
const complete = { price: 5.72, source: 'Asiri Market Engine', time: '2026-09-03T19:59:30Z', observedAt: '2026-09-03T19:59:50Z', isFresh: true, isLiveSession: true, error: false };

const fresh = dataCompleteness(complete, { state: 'FRESH', health: healthApi.classifyQuote(complete, now) });
assert.equal(fresh.label, 'مكتملة وحديثة');
assert.equal(fresh.availableCount, 4);
assert.equal(fresh.total, 4);
assert.equal('score' in fresh, false, 'Quote completeness must not expose a numeric confidence score');

const delayedItem = { ...complete, isFresh: false };
const delayed = dataCompleteness(delayedItem, { state: 'DELAYED', health: healthApi.classifyQuote(delayedItem, now) });
assert.equal(delayed.label, 'مكتملة ومتأخرة');
assert.equal(delayed.tone, 'delayed');

const staleItem = { ...complete, error: true };
const stale = dataCompleteness(staleItem, { state: 'STALE', health: healthApi.classifyQuote(staleItem, now) });
assert.equal(stale.label, 'مكتملة وقديمة');
assert.equal(stale.tone, 'stale');

const unavailableItem = { ...complete, price: null, source: '' };
const unavailable = dataCompleteness(unavailableItem, { state: 'UNAVAILABLE', health: healthApi.classifyQuote(unavailableItem, now) });
assert.equal(unavailable.label, 'غير مكتملة');
assert.equal(unavailable.availableCount, 2);

assert.ok(html.includes('quote-data-health.js?v=1') && html.includes('smart-decision-lens-static.css?v=5') && html.includes('smart-decision-lens-static.js?v=5'), 'Fresh quote-lens assets must be cache-busted for Safari');
for (const marker of ['اكتمال بيانات السعر', 'جودة التحليل', 'غير محسوبة', 'هذا فحص لنقل البيانات فقط', 'smart-lens-field-grid']) {
  assert.ok(script.includes(marker), `Honest completeness marker missing: ${marker}`);
}
assert.ok(!script.includes('مؤشر ثقة الأدلة') && !script.includes('/ 100'), 'The quote lens must not render a repeated 100-point confidence score');
assert.ok(css.includes('.smart-lens-completeness') && css.includes('.smart-lens-analysis-status'), 'Completeness and analysis-status cards must be styled');
assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.smart-lens-field-grid\s*\{\s*grid-template-columns:\s*1fr/, 'Quote fields must stack safely on iPhone widths');

console.log('Batch 3 checks passed: no repeated 100/100 score, honest quote completeness, separated analysis quality, and iPhone-safe styling.');
