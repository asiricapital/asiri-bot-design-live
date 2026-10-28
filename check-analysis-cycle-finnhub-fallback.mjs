import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('./saxo-watchlist-ui-v1.js', import.meta.url), 'utf8');
const cycle = fs.readFileSync(new URL('./analysis-cycle-desk-v1.js', import.meta.url), 'utf8');

assert.match(bridge, /\/api\/market-data/);
assert.match(bridge, /fetchUnifiedQuotes/);
assert.match(bridge, /Finnhub\/موحد/);
assert.match(bridge, /executionAllowed: false/);
assert.match(bridge, /tradingEnabled: false/);
assert.match(cycle, /Saxo أو Finnhub/);
assert.match(cycle, /providerLabel/);
assert.match(cycle, /api\/market-data\?symbols/);
assert.match(cycle, /refreshDirectQuote/);
assert.match(cycle, /scheduleDirectReads/);
assert.match(cycle, /usableQuotes/);
assert.match(cycle, /asiri:saxo-watchlist-quotes/);
assert.match(cycle, /executionAllowed:false/);
assert.doesNotMatch(bridge, /POST|PUT|PATCH|DELETE/);
assert.doesNotMatch(cycle, /placeOrder|submitOrder|trade\/v2\/orders/i);

console.log('Analysis cycle Finnhub fallback contract passed: unified quote fallback, visible provider, and paper-only boundary.');
