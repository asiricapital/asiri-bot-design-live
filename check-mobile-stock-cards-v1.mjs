import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['ASIRI MOBILE STOCK CARDS V1','stock-col-change{grid-column:1/-1','stock-col-action{grid-column:1/-1','min-height:44px','smart-summary-btn:focus-visible','remove-symbol-btn:focus-visible','aria-label="فتح تفاصيل القراءة']) assert.ok(html.includes(marker), `Missing stock card marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('Mobile stock cards contract passed — readable cards and touch-safe actions, no execution changes.');
