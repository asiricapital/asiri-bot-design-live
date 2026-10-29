import assert from 'node:assert/strict';
import {selectChartHistory,chartRange,chartStats} from './verified-candle-model-v1.mjs';
const rows=Array.from({length:100},(_,i)=>{const date=new Date(Date.UTC(2026,6,i+1,13,30)).toISOString();return{date,sessionDate:date.slice(0,10),open:10+i*.01,high:11+i*.01,low:9+i*.01,close:10.5+i*.01,volume:1000+i}});
const payload={symbol:'TEST',source:'daily-fixture',indicators:{sparkline:rows.map(({date,close})=>({date,close}))},chartHistory:{availability:'available',interval:'1d',source:'daily-fixture',timeZone:'America/New_York',origin:'PROVIDER',rows,endOfHistory:rows.at(-1).date}};
const snapshot=JSON.stringify(payload),selected=selectChartHistory(payload,'TEST');assert.equal(selected.kind,'candles');assert.equal(selected.rows.length,100);assert.equal(JSON.stringify(payload),snapshot);
assert.equal(selectChartHistory(payload,'OTHER').kind,'none');
for(const corrupt of [
 {...payload.chartHistory,rows:[...rows].reverse()},
 {...payload.chartHistory,rows:rows.map(r=>({...r,open:null}))},
 {...payload.chartHistory,rows:rows.map(r=>({...r,high:r.low-1}))},
 {...payload.chartHistory,rows:[rows[0],rows[0]]},
 {...payload.chartHistory,endOfHistory:'wrong'},
 {...payload.chartHistory,timeZone:'UTC'},
 {...payload.chartHistory,origin:'unknown'}
]){const result=selectChartHistory({...payload,chartHistory:corrupt},'TEST');assert.equal(result.kind,'line');assert(result.rows.every(r=>r.open===undefined),'never manufacture candle OHLC from closes');}
assert.equal(selectChartHistory({...payload,chartHistory:null},'TEST').kind,'line');
assert.equal(selectChartHistory({...payload,chartHistory:null,indicators:null},'TEST').rows.length,0);
assert.equal(selectChartHistory({...payload,chartHistory:{...payload.chartHistory,origin:'VERIFIED_MEMORY'}},'TEST').origin,'VERIFIED_MEMORY');
const all=chartRange(rows,'ALL'),month=chartRange(rows,'1M'),quarter=chartRange(rows,'3M');assert.equal(all.rows.length,100);assert(month.rows.length<quarter.rows.length);assert(quarter.rows.length<=all.rows.length);assert.equal(month.rows.at(-1),rows.at(-1));assert.equal(month.rows[0],rows[month.start]);
const monthEnd=['2026-02-27','2026-02-28','2026-03-01','2026-03-31'].map(sessionDate=>({sessionDate,close:10}));assert.equal(chartRange(monthEnd,'1M').rows[0].sessionDate,'2026-02-28');
assert.equal(chartRange([]).rows.length,0);assert.equal(chartStats([]),null);
const stats=chartStats([{open:10,high:12,low:9,close:10},{open:10,high:15,low:8,close:12}]);assert(Math.abs(stats.changePct-20)<1e-10);assert.equal(stats.high,15);assert.equal(stats.low,8);
const closes=chartStats([{close:10},{close:12}]);assert.equal(closes.high,12);assert.equal(closes.low,10);assert.equal(closes.candles,false);
console.log('Verified candles passed: strict OHLC/source/symbol checks, truthful close fallback, immutable data, range and month-end handling, period statistics.');
