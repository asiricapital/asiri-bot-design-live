import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {buildPaperRecommendation} from './paper-recommendation-model.mjs';
import {newWallet,previewOrder,commitOrder,quoteBlockReason,MANUAL_KEY} from './manual-paper-core.mjs';
import {buildPaperPlan} from './manual-paper-plan.mjs';
const now=Date.now();
const quote={symbol:'TEST',price:5,source:'fixture',currency:'USD',updatedAt:new Date(now-10000).toISOString(),observedAt:new Date(now).toISOString(),isLiveSession:true,isFresh:true,session:'REGULAR',bidPrice:4.999,askPrice:5.001};
const analysis={...quote,bid:4.999,ask:5.001,averageVolume:1000000,technicals:{trendLabel:'صاعد',rsi14:60},candidateAnalysis:{isShariaCompliant:true,shariaStatus:'COMPLIANT',shariaSource:'fixture approved list',dataComplete:true,missingData:[],reasons:['اتجاه صاعد']},unifiedDecision:{engine:'fixture-unified',score:90,verdict:'READY_FOR_HUMAN_REVIEW',gates:{score:true,relativeVolume:true,rewardRisk:true,quantity:true,spread:true,dataFresh:true},order:{symbol:'TEST',side:'Buy',orderType:'Limit',limitPrice:5,stopLoss:4.8,target1:5.7},reasons:['حجم مؤكد'],missing:[],risks:[]}};
const copy=()=>structuredClone(analysis),wallet=newWallet();
const candidate=buildPaperRecommendation(wallet,analysis,quote,now,now);
assert.equal(candidate.status,'READY');assert.equal(candidate.plan.stop,4.8);assert.equal(candidate.plan.target,5.7);assert(candidate.plan.quantity>0);assert(candidate.plan.risk<=10);assert(candidate.plan.totalCost<=100);assert(candidate.plan.cashAfter>=300);assert(candidate.plan.rewardRisk>=2);
const order={...candidate.plan,id:'accepted-candidate',currencyAcknowledged:true};
const preview=previewOrder(wallet,order,quote,now);assert.equal(wallet.trades.length,0);
const bought=commitOrder(wallet,preview,quote,now);assert.equal(bought.trades.length,1);assert.equal(bought.trades[0].recommendation.id,candidate.id);assert.equal(bought.trades[0].recommendation.score,90);assert.equal(bought.trades[0].paperOnly,true);assert(bought.cash<1000);assert.equal(wallet.cash,1000);
assert.equal(buildPaperRecommendation(bought,analysis,quote,now,now).status,'WAIT');
for(const mutate of [
 a=>a.unifiedDecision.verdict='WATCH',a=>a.unifiedDecision.verdict='REJECT',
 a=>a.unifiedDecision.gates.relativeVolume=false,a=>delete a.unifiedDecision.gates.spread,
 a=>a.candidateAnalysis.isShariaCompliant=false,a=>a.candidateAnalysis.shariaStatus='UNKNOWN',
 a=>a.candidateAnalysis.dataComplete=false,a=>a.paperTestMode=true,
 a=>a.unifiedDecision.order.target1=5.1,a=>a.unifiedDecision.order.stopLoss=5.1,
 a=>a.unifiedDecision.order.symbol='OTHER',a=>a.averageVolume=100,
 a=>a.observedAt=new Date(now-121000).toISOString(),a=>a.updatedAt=new Date(now-121000).toISOString(),
 a=>a.price=4.8,a=>a.unifiedDecision.order.limitPrice=4.8,
 a=>a.unifiedDecision.score=null,a=>a.unifiedDecision.order.side='Sell'
]){const a=copy();mutate(a);assert.equal(buildPaperRecommendation(wallet,a,quote,now,now).status,'WAIT');}
assert.equal(buildPaperRecommendation(wallet,analysis,{...quote,fromSnapshot:true},now,now).status,'WAIT');
assert.equal(buildPaperRecommendation(wallet,analysis,quote,now,now-121000).status,'WAIT');
assert.equal(buildPaperRecommendation({...wallet,cash:300},analysis,quote,now,now).status,'WAIT');
assert.equal(buildPaperRecommendation(wallet,analysis,{...quote,price:11},now,now).status,'WAIT');

// Exercise the real workspace preview and confirmation handlers with a qualified source fixture.
const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,checked:false,dataset:{}});return nodes.get(id)};
let saved=null,allowCandidate=true;const desk={get:()=>allowCandidate?buildPaperRecommendation(saved?JSON.parse(saved):newWallet(),analysis,quote,Date.now(),now):{status:'WAIT',message:'انتهت صلاحية الترشيح'},render:()=>{}};
node('manual-symbol').value='TEST';node('manual-side').value='BUY';node('manual-currency').checked=true;
const context=vm.createContext({document:{getElementById:node},window:{asiriMarketView:{snapshots:()=>[quote]}},navigator:{locks:{request:async(_key,fn)=>fn()}},localStorage:{getItem:()=>saved,setItem:(_key,value)=>{saved=value}},crypto:{randomUUID},Date,Number,String,JSON,Error,console,MANUAL_KEY,newWallet,previewOrder,commitOrder,quoteBlockReason,buildPaperPlan});
const source=(await readFile(new URL('./manual-paper-focus-ui-v3.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
context.testDesk=desk;context.testId=candidate.id;
vm.runInContext(source+"\nwallet=newWallet();recommendationDesk=testDesk;recommendationId=testId;pendingAuto=true;populatePlan();globalThis.getDraft=()=>draft;globalThis.render=()=>{};",context);
vm.runInContext('preview()',context);assert.equal(context.getDraft().recommendation.id,candidate.id);assert.equal(saved,null);assert.equal(node('manual-confirm').disabled,false);
allowCandidate=false;await vm.runInContext('confirm()',context);assert.equal(saved,null);assert.match(node('manual-message').textContent,/انتهت صلاحية الترشيح/);
allowCandidate=true;vm.runInContext('pendingAuto=true;populatePlan();preview()',context);await vm.runInContext('confirm()',context);
const result=JSON.parse(saved);assert.equal(result.trades.length,1);assert.equal(result.trades[0].recommendation.id,candidate.id);assert(result.cash<1000);assert.equal(result.positions.TEST.quantity,candidate.plan.quantity);
// The desk uses only GET analysis reads and revalidates the displayed card on click.
const elements=[],events=new Map();let deskQuotes=[],reviewed=0,failFetch=false,fetchCount=0;
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};elements.push(this)}
 append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=nodes}
 setAttribute(){}before(){}after(){}scrollIntoView(){}getClientRects(){return[{}]}
 addEventListener(name,fn){this.listeners[name]=fn}
}
const deskContext=vm.createContext({document:{createElement:tag=>new Element(tag),getElementById:()=>null,hidden:false},window:{addEventListener:(name,fn)=>events.set(name,fn),dispatchEvent:event=>events.get(event.type)?.()},setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout,AbortController,Event,Date,Number,String,Map,Promise,Error,console,buildPaperRecommendation,RECOMMENDATION_RULES:{minPrice:1,maxPrice:10},fetch:async(url,options)=>{fetchCount++;assert(url.endsWith('/TEST'));assert.equal(options.method,undefined);if(failFetch)throw Error('fixture offline');return{ok:true,json:async()=>analysis}},fixtureHost:new Element('host'),fixtureWallet:()=>newWallet(),fixtureQuotes:()=>deskQuotes,fixtureReview:()=>{reviewed++}});
const ui=(await readFile(new URL('./paper-recommendations-ui.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace('export function createPaperRecommendationDesk','function createPaperRecommendationDesk');
vm.runInContext(ui+'\nglobalThis.desk=createPaperRecommendationDesk({host:fixtureHost,getWallet:fixtureWallet,getQuotes:fixtureQuotes,onReview:fixtureReview});',deskContext);
assert.equal(fetchCount,0);deskQuotes=[quote];await deskContext.desk.scan();
const reviewButton=elements.find(e=>e.dataset.reviewSymbol==='TEST');assert(reviewButton);reviewButton.listeners.click();assert.equal(reviewed,1);
deskQuotes=[{...quote,updatedAt:new Date(now-180000).toISOString()}];reviewButton.listeners.click();assert.equal(reviewed,1);
deskQuotes=[quote];failFetch=true;await deskContext.desk.scan();
const list=elements.find(e=>e.id==='paper-recommendations-list');assert(!list.children.some(e=>e.dataset.symbol==='TEST'));
assert.equal(saved&&JSON.parse(saved).trades.length,1);
console.log('Recommendation flow passed: source gates, Sharia list, no WATCH/test promotion, liquidity, quote/analysis expiry, price drift, sizing and costs, GET-only desk, stale-card recheck, failed-refresh clearing, no save before confirmation, expired approval rejection, confirmed ledger provenance and cash.');
