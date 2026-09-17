import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const js = await fs.readFile(new URL('./decision-intelligence-panel.js', import.meta.url), 'utf8');
assert.match(html, /decision-intelligence-panel/);
assert.match(html, /quality-market-state/);
assert.match(html, /decision-journal-list/);
assert.match(html, /decision-intelligence-panel\.js/);
assert.match(js, /executionAllowed|automaticTrading/); // safety wording must remain visible in the module contract
assert.match(js, /localStorage/);
assert.match(js, /setInterval\(refresh, 15000\)/);
console.log('Decision intelligence panel contract passed');
