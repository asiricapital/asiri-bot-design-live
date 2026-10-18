import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['ASIRI LAYOUT POLISH V1','@media(max-width:900px)','@media(max-width:560px)','cc-topology-stage{height:240px','PAPER ONLY','READ-ONLY']) assert.ok(html.includes(marker), `Missing layout marker: ${marker}`);
assert.equal((html.match(/<\/style>/g) || []).length, 1, 'Expected one closed style block');
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('ASIRI layout polish contract passed — responsive visual layer only, no execution enablement.');
