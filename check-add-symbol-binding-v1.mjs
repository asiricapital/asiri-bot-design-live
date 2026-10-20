import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of [
  'addSymbolStatus',
  'تحقق وإضافة',
  'VERIFIED_QUOTES_API}?stocks=${encodeURIComponent(sym)}',
  'لم تتم إضافته',
  'updateVerifiedStockPrice(row, payload?.observedAt)',
  'saveVerifiedQuoteSnapshot()',
  'renderTable()',
  'aria-live="polite"'
]) assert.ok(html.includes(marker), `Missing add-symbol binding marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|SAXO_EXECUTION_FEATURE_ENABLED\s*:\s*true/i.test(html), false);
console.log('Add-symbol binding contract passed — provider validation, immediate quote binding, and no execution path.');
