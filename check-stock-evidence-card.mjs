import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const elements = {};
for (const id of ['evidence-symbol','evidence-ticker','evidence-price','evidence-state','evidence-source','evidence-time','evidence-session','evidence-next','evidence-data-step']) {
  elements[id] = { value: '', textContent: '', dataset: {}, listeners: {}, addEventListener(n, f) { this.listeners[n] = f; }, replaceChildren() { this.value = ''; }, append(option) { if (!this.value) this.value = option.value; } };
}
const document = { readyState: 'complete', hidden: false, getElementById: id => elements[id], createElement: () => ({ value: '', textContent: '' }), addEventListener() {} };
let refresh;
const window = { asiriQuoteDataHealth: { classifyQuote: item => item.health || { state: 'UNAVAILABLE' } }, setInterval: f => { refresh = f; } };
const stockMarketData = { AAPL: { price: 123.45, source: 'Test source', updatedAt: '2026-01-01T10:00:00Z', sessionLabel: 'مفتوح', health: { state: 'FRESH', quoteAgeMs: 1000 } }, MSFT: { price: null, health: { state: 'UNAVAILABLE' } } };
const watchlist = ['AAPL','MSFT'];
vm.runInNewContext(await readFile(new URL('./stock-evidence-card.js', import.meta.url), 'utf8'), { window, document, watchlist, stockMarketData, Date, Number, JSON });
assert.equal(elements['evidence-ticker'].textContent, 'AAPL');
assert.equal(elements['evidence-price'].textContent, '123.45');
assert.equal(elements['evidence-source'].textContent, 'Test source');
assert.equal(elements['evidence-state'].dataset.state, 'FRESH');
stockMarketData.AAPL.health.quoteAgeMs = 121000; refresh();
assert.equal(elements['evidence-state'].dataset.state, 'STALE', 'old quote must not remain fresh');
stockMarketData.AAPL.health = { state: 'DELAYED' }; refresh();
assert.equal(elements['evidence-state'].dataset.state, 'DELAYED');
elements['evidence-symbol'].value = 'MSFT'; elements['evidence-symbol'].listeners.change();
assert.equal(elements['evidence-price'].textContent, '—');
assert.equal(elements['evidence-source'].textContent, 'غير متاح');
assert.equal(elements['evidence-state'].dataset.state, 'UNAVAILABLE');
watchlist.splice(0); refresh();
assert.equal(elements['evidence-ticker'].textContent, '—');
console.log('Stock evidence card: freshness, selection, missing data, and empty list passed.');
