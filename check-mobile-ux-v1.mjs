import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['@media(max-width:390px)','cc-topology-stage{height:145px','PAPER ONLY','READ-ONLY','executionAllowed=false','tradingEnabled=false']) assert.ok(html.includes(marker), `Missing mobile UX marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('Mobile UX v1 contract passed — compact phone hierarchy with execution remaining disabled.');
