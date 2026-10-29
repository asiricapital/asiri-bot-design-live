import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {formatMarketTime,referenceCurrencyLabel} from './market-reading-format-v1.mjs';
import {previewOrder,newWallet} from './manual-paper-core.mjs';
import {buildPaperPlan} from './manual-paper-plan.mjs';
import {visualTicket} from './manual-paper-visual-model.mjs';
const html=fs.readFileSync('index.html','utf8');
// Execute the actual bridge function: foreign-currency metadata must reach
// all consumers rather than being lost before the USD guard sees the quote.
const bridge=html.slice(html.indexOf('        function normalizeQuoteCurrency('),html.indexOf('        function markQuoteUnavailable('));
const context={watchlist:['TEST'],stockMarketData:{TEST:{symbol:'TEST'}},finiteNumber:v=>v===null||v===undefined?null:Number(v)};
vm.createContext(context);vm.runInContext(bridge,context);
const now=Date.now(),base={symbol:'TEST',price:10,source:'fixture',currency:' eur ',updatedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),isFresh:true,isLiveSession:true};
context.updateVerifiedStockPrice(base);const quote=context.stockMarketData.TEST;assert.equal(quote.currency,'EUR');assert.equal(quote.updatedAt,base.updatedAt);assert.equal(quote.observedAt,base.observedAt);
const wallet=newWallet(),order={symbol:'TEST',side:'BUY',quantity:1,stop:9,target:12,reason:'currency guard',currencyAcknowledged:true};
assert.throws(()=>previewOrder(wallet,order,quote,now),/الدولار/);
assert.equal(buildPaperPlan(wallet,'TEST','BUY',quote,null,now).status,'UNAVAILABLE');assert.equal(visualTicket(wallet,order,quote,now).available,false);
context.updateVerifiedStockPrice({...base,currency:'usd'});assert.equal(context.stockMarketData.TEST.currency,'USD');assert(previewOrder(wallet,order,context.stockMarketData.TEST,now).paperOnly);
context.updateVerifiedStockPrice({...base,currency:null});assert.equal(context.stockMarketData.TEST.currency,null,'no inherited currency from a prior reading');
assert(html.includes('currency: normalizeQuoteCurrency(saved.currency)'));assert(html.includes('currency: normalizeQuoteCurrency(item.currency)'));
assert.match(formatMarketTime('2026-10-29T11:00:18.000Z'),/14:00:18/);assert.equal(formatMarketTime('bad'),'غير متاح');assert(!formatMarketTime(base.updatedAt,true).includes('T'));
assert.equal(referenceCurrencyLabel('USD'),'عملة السعر: USD');assert.match(referenceCurrencyLabel(null),/غير موثقة/);assert.match(referenceCurrencyLabel('<script>'),/غير موثقة/);
assert.equal(wallet.cash,1000);assert.equal(wallet.trades.length,0);
console.log('Market reading passed: currency propagation/reset, non-USD plan/preview guards, preserved original timestamps and Riyadh display.');
