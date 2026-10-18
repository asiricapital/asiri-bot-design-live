import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('live-index.html', 'utf8');
for (const marker of [
  'ASIRI COMMAND CENTER',
  'PAPER ONLY',
  'READ-ONLY',
  'DATA QUALITY',
  'command-center-strip',
  'command-kpi-deck',
  '--cc-bg',
  '@media(max-width:780px)'
]) assert.ok(html.includes(marker), `Missing Command Center marker: ${marker}`);
assert.equal(/executionAllowed\s*:\s*true|automaticTrading\s*:\s*true|brokerSubmission\s*:\s*true/i.test(html), false);
console.log('ASIRI Command Center V1 visual contract passed — visual shell only, no execution controls.');
