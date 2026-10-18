import fs from 'node:fs';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
for (const marker of ['ASIRI COMMAND CENTER V1','PAPER ONLY','READ-ONLY','EXECUTION','DATA QUALITY','command-center-strip','command-kpi-deck','--cc-bg']) assert.ok(html.includes(marker), `Missing root Command Center marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('ASIRI Command Center root contract passed — root page contains visual shell and no execution enablement.');
