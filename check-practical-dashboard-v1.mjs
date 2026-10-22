import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const required = [
  'practical-dashboard',
  'ماذا يحدث الآن؟',
  'practical-total',
  'practical-fresh',
  'practical-review',
  'practical-next-text',
  'practical-watch-list',
  'focusPracticalPrices',
  'focusPracticalPaper',
  'focusPracticalAlerts',
  'renderPracticalDashboard',
  'executionAllowed=false'
];
for (const marker of required) assert.ok(html.includes(marker), `Missing practical dashboard marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false, 'Dashboard must not enable execution');
assert.match(html, /لا تقدم توصية شراء أو بيع ولا ترسل أوامر/);
console.log('Practical dashboard contract passed: decision-first summary, live data bindings, read-only safeguards.');
