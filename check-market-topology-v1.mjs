import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['MARKET TOPOLOGY','NON-EXECUTIVE','cc-topology-canvas','requestAnimationFrame','PAPER ONLY','READ-ONLY']) assert.ok(html.includes(marker), `Missing topology marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('ASIRI Market Topology V1 contract passed — animated visual layer only, no execution enablement.');
