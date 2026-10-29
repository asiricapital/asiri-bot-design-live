import assert from 'node:assert/strict';import {newWallet,previewOrder,commitOrder} from './manual-paper-core.mjs';
import {buildPaperPlan} from './manual-paper-plan.mjs';
const now=Date.parse('2026-10-28T15:00:00Z');const q={symbol:'TEST',price:10,source:'fixture',updatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),isFresh:true,isLiveSession:true};
const o={id:'test-buy',symbol:'TEST',side:'BUY',quantity:5,reason:'اختبار',stop:9,target:12,currencyAcknowledged:true};
const original=newWallet();const p=previewOrder(original,o,q,now);const bought=commitOrder(original,p,q,now);
assert.equal(original.cash,1000);assert(bought.cash<950);assert.equal(bought.positions.TEST.quantity,5);assert.deepEqual(commitOrder(bought,p,q,now),bought);
const sellQuote={...q,price:11};const sell=previewOrder(bought,{...o,id:'test-sell',side:'SELL'},sellQuote,now);const closed=commitOrder(bought,sell,sellQuote,now);
assert.equal(Object.keys(closed.positions).length,0);assert(Math.abs(closed.cash-1000-closed.trades[1].realizedPnl)<1e-7);assert(closed.trades[1].realizedPnl<5);
assert.throws(()=>previewOrder(original,{...o,side:'SELL'},q,now));assert.throws(()=>previewOrder(original,{...o,quantity:100},q,now));assert.throws(()=>commitOrder(original,p,{...q,price:12},now));assert.throws(()=>commitOrder(original,p,q,now+60001));assert.throws(()=>commitOrder({...original,version:1},p,q,now));assert.throws(()=>previewOrder(original,o,{...q,isFresh:false},now));assert.throws(()=>previewOrder(original,o,{...q,updatedAt:new Date(now-121000).toISOString()},now));
const partial=previewOrder(bought,{...o,id:'partial',side:'SELL',quantity:2},sellQuote,now);assert.equal(commitOrder(bought,partial,sellQuote,now).positions.TEST.quantity,3);
console.log('Manual paper lifecycle passed: buy, partial/full sell, net cash reconciliation, unchanged input, idempotency, stale/changed price, expiry, version race and limits.');

const tech={symbol:'TEST',availability:'available',source:'daily-fixture',endOfHistory:new Date(now-3600000).toISOString(),indicators:{atr14:.4,low20:9.4,high20:11,trendLabel:'صاعد',rsi14:55}};
const suggested=buildPaperPlan(original,'TEST','BUY',q,tech,now);
assert.equal(suggested.status,'DRAFT');assert(suggested.quantity>1);assert(suggested.stop<q.price);assert(suggested.target>q.price);
assert(suggested.risk<=suggested.riskBudget);assert(suggested.cashAfter>=300);assert(suggested.totalCost<=100);assert(suggested.resistanceWarning);
assert.equal(original.cash,1000);assert.equal(original.trades.length,0);
const proposed={...suggested,id:'auto-sized',currencyAcknowledged:true};
const autoFill=previewOrder(original,proposed,q,now);const autoBought=commitOrder(original,autoFill,q,now);
const proposedSell=buildPaperPlan(autoBought,'TEST','SELL',sellQuote,null,now);
assert.equal(proposedSell.quantity,suggested.quantity);assert.equal(proposedSell.stop,null);
const autoSold=commitOrder(autoBought,previewOrder(autoBought,{...proposedSell,id:'auto-sell',currencyAcknowledged:true},sellQuote,now),sellQuote,now);
assert.equal(Object.keys(autoSold.positions).length,0);assert(Math.abs(autoSold.cash-1000-autoSold.trades[1].realizedPnl)<1e-7);
const closedQuote={...q,isFresh:false,isLiveSession:false,updatedAt:new Date(now-18*3600000).toISOString()};
const ref=buildPaperPlan(original,'TEST','BUY',closedQuote,tech,now);assert.equal(ref.status,'REFERENCE');assert(ref.quantity>0);
assert.throws(()=>previewOrder(original,{...ref,currencyAcknowledged:true},closedQuote,now),/السعر/);
assert.equal(buildPaperPlan(original,'TEST','BUY',q,null,now).status,'UNAVAILABLE');
assert.equal(buildPaperPlan(original,'TEST','BUY',q,{...tech,symbol:'OTHER'},now).quantity,0);
assert.equal(buildPaperPlan(original,'TEST','BUY',{...q,currency:'SAR'},tech,now).quantity,0);
assert.equal(buildPaperPlan(original,'TEST','BUY',q,{...tech,endOfHistory:new Date(now-5*86400000).toISOString()},now).quantity,0);
assert.equal(buildPaperPlan(original,'TEST','SELL',q,tech,now).quantity,0);
assert.equal(buildPaperPlan({...original,cash:300},'TEST','BUY',q,tech,now).status,'NO_CAPACITY');
assert.equal(buildPaperPlan({...original,positions:{TEST:{quantity:10,costBasis:100}}},'TEST','BUY',q,tech,now).quantity,0);
assert.equal(buildPaperPlan(original,'TEST','BUY',{...q,price:200},tech,now).quantity,0);
assert.equal(buildPaperPlan(original,'TEST','BUY',{...q,bidPrice:9,askPrice:11},tech,now).quantity,0);
const fallback=buildPaperPlan(original,'TEST','BUY',q,{...tech,indicators:{...tech.indicators,low20:11}},now);assert(fallback.stop<q.price);assert.match(fallback.reason,/1.5 ATR/);
for(const cash of [305,350,500,1000])for(const price of [.1,1,5,10,50,100]) {
 const row={...q,price};const indicators={...tech.indicators,low20:price*.94,atr14:price*.03,high20:price*1.1};
 const w={...newWallet(),cash};const plan=buildPaperPlan(w,'TEST','BUY',row,{...tech,indicators},now);
 if(plan.quantity>0){assert(plan.risk<=plan.riskBudget+1e-7);assert(plan.cashAfter>=300-1e-7);previewOrder(w,{...plan,currencyAcknowledged:true},row,now);}
}
console.log('Automatic paper plans passed: sizing, cash reserve, position capacity, cost-aware risk, 2:1 target, reference-only closed market, unavailable data, sell ownership and full lifecycle.');
