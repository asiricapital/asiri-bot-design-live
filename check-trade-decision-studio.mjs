import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planRisk, parseBars, replayBreakout, tradeStats, walkForward } from './trade-decision-engine.mjs';

const p=planRisk({equity:1000,riskPct:1,entry:5,stop:4.75,target:5.5,spread:0.02,commission:0,maxAllocationPct:10});
assert.equal(p.quantity,20);
assert.equal(p.eligible,true);
assert.ok(p.plannedLoss<=10);
assert.ok(planRisk({equity:1000,riskPct:1,entry:5,stop:5.1,target:5.5}).error);

const lines=['time,open,high,low,close'];
const start=Date.UTC(2026,0,2,14,30);
for(let i=0;i<150;i++) {
  const open=10+i*0.02;
  lines.push(`${new Date(start+i*300000).toISOString()},${open.toFixed(3)},${(open+0.08).toFixed(3)},${(open-0.03).toFixed(3)},${(open+0.05).toFixed(3)}`);
}
const bars=parseBars(lines.join('\n'));
assert.equal(bars.length,150);
assert.throws(()=>parseBars(lines.slice().reverse().join('\n')));
const trades=replayBreakout(bars,{lookback:20,atrPeriod:14,stopAtr:1.5,rr:2,spread:0.01});
assert.ok(Array.isArray(trades));
assert.equal(tradeStats(trades).count,trades.length);
assert.equal(walkForward(trades).inSample.count+walkForward(trades).outSample.count,trades.length);

const html=readFileSync(new URL('./trade-decision-studio.html',import.meta.url),'utf8');
const home=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.match(html,/trade-decision-studio\.mjs/);
assert.match(html,/RESEARCH ONLY/);
assert.match(home,/asiri-decision-studio-link/);
console.log('ASIRI Decision Studio checks passed: sizing, CSV validation, replay, split, integration.');
