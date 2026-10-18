import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['COMMAND CENTER DATA BINDING V1','paper-lab-sharpe','paper-lab-max-dd','readiness-fresh','MutationObserver',"dataset.bound='paper-lab'",'executionAllowed=false']) assert.ok(html.includes(marker), `Missing data binding marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('ASIRI Command Center data binding contract passed — paper metrics and data readiness remain read-only.');
