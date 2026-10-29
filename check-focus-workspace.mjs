import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {normalizeLayout,FOCUS_KEY,FOCUS_PANELS} from './focus-workspace-v1.mjs';
// Persisted preferences are untrusted: retain all valid panels exactly once,
// keep the chart discoverable and never share the financial ledger key.
const raw={order:['journal','ticket','ticket','<script>'],hidden:['chart','ticket','invalid','ticket'],wide:true,mode:'classic'};
const snapshot=JSON.stringify(raw),clean=normalizeLayout(raw);
assert.equal(JSON.stringify(raw),snapshot);
assert.equal(clean.order[0],'journal');assert.equal(clean.order[1],'ticket');
assert.equal(clean.order.length,FOCUS_PANELS.length);assert.equal(new Set(clean.order).size,FOCUS_PANELS.length);
assert.deepEqual(clean.hidden,['ticket']);assert.equal(clean.mode,'classic');assert(clean.wide);
for(const value of [null,undefined,0,[],{order:'wrong',hidden:0},{order:[null,{},'chart'],mode:'corrupt'}]){
 const next=normalizeLayout(value);assert.equal(next.order.length,6);assert(next.order.includes('chart'));assert(!next.hidden.includes('chart'));assert.equal(next.mode,'focus');
}
assert.notEqual(FOCUS_KEY,'asiri.design.manual-paper.v1');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('./manual-paper-focus-ui-v1.mjs'));assert(html.includes('./focus-workspace-v1.css'));
for(const id of ['manual-symbol','manual-quantity','manual-stop','manual-target','manual-confirm','manual-chart'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
for(const file of ['focus-workspace-v1.mjs','manual-paper-focus-view-v1.mjs','manual-paper-focus-ui-v1.mjs'])execFileSync(process.execPath,['--check',file]);
console.log('Focus workspace passed: corrupt preferences, required chart, distinct storage, unique financial controls, release assets and syntax.');
