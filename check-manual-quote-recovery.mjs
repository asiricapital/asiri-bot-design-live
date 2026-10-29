import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {newWallet,quoteBlockReason,previewOrder,commitOrder,MANUAL_KEY} from './manual-paper-core.mjs';
import {buildPaperPlan} from './manual-paper-plan.mjs';

const now=Date.now();
const q={symbol:'TEST',price:10,currency:'USD',source:'fixture',session:'REGULAR',isFresh:true,isLiveSession:true,updatedAt:new Date(now-30000).toISOString(),observedAt:new Date(now).toISOString()};
assert.equal(quoteBlockReason(q,'TEST',now),null);
assert.equal(quoteBlockReason({...q,isLiveSession:null},'TEST',now),null);
assert.match(quoteBlockReason({...q,isLiveSession:false},'TEST',now),/جلسة مغلقة/);
assert.match(quoteBlockReason({...q,session:'CLOSED'},'TEST',now),/جلسة مغلقة/);
assert.match(quoteBlockReason({...q,updatedAt:new Date(now-121000).toISOString()},'TEST',now),/آخر حركة منذ 2 دقيقة/);
assert.match(quoteBlockReason({...q,observedAt:new Date(now-121000).toISOString()},'TEST',now),/آخر فحص للمصدر/);
assert.match(quoteBlockReason({...q,observedAt:null},'TEST',now),/مفقود/);
assert.match(quoteBlockReason({...q,error:true},'TEST',now),/تعذر آخر تحديث/);
assert.match(quoteBlockReason({...q,fromSnapshot:true},'TEST',now),/نسخة محفوظة/);
assert.match(quoteBlockReason({...q,updatedAt:new Date(now+6000).toISOString()},'TEST',now),/ساعة الجهاز/);
assert.match(quoteBlockReason({...q,isFresh:false},'TEST',now),/متأخر/);
assert.match(quoteBlockReason({...q,symbol:'OTHER'},'TEST',now),/غير مكتمل/);

// Exercise the actual preview handler against a changed stream, without a broker or persistence.
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,checked:false,dataset:{}});return nodes.get(id)};
let current={...q};
const tech={symbol:'TEST',availability:'available',source:'fixture',endOfHistory:new Date(now-3600000).toISOString(),indicators:{atr14:.4,low20:9.4,high20:11}};
node('manual-symbol').value='TEST';node('manual-side').value='BUY';node('manual-currency').checked=true;
const context=vm.createContext({document:{getElementById:node},window:{asiriMarketView:{snapshots:()=>[current]}},localStorage:{getItem:()=>null},crypto:{randomUUID},Date,Number,String,JSON,Error,console,MANUAL_KEY,newWallet,quoteBlockReason,previewOrder,commitOrder,buildPaperPlan});
const source=(await readFile(new URL('./manual-paper-focus-ui-v3.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\ninit\(\);\s*$/,'');
vm.runInContext(source+`\nwallet=newWallet();technicals=${JSON.stringify(tech)};plan=buildPaperPlan(wallet,'TEST','BUY',rows()[0],technicals);pendingAuto=true;populatePlan();globalThis.testState=()=>({draft,plan});`,context);
current={...q,price:10.1,updatedAt:new Date(now).toISOString()};
vm.runInContext('preview()',context);
assert.equal(context.testState().draft.referencePrice,10.1);
assert.equal(node('manual-confirm').disabled,false);
assert.match(node('manual-preview-result').textContent,/وقف/);
assert.equal(node('manual-quantity').value,String(context.testState().draft.quantity));

// A user-edited plan remains intact while the current quote is revalidated.
vm.runInContext('plan=null;pendingAuto=false;invalidate()',context);
node('manual-quantity').value='2';node('manual-stop').value='9';node('manual-target').value='12';node('manual-reason').value='manual levels';
current={...current,price:10.2};vm.runInContext('preview()',context);
assert.equal(context.testState().draft.quantity,2);
assert.equal(context.testState().draft.stop,9);
assert.equal(context.testState().draft.reason,'manual levels');

// A recently checked source cannot turn an old trade into a current price.
current={...current,updatedAt:new Date(now-180000).toISOString()};
vm.runInContext('preview();renderQuoteStatus()',context);
assert.equal(context.testState().draft,null);assert.equal(node('manual-confirm').disabled,true);
assert.match(node('manual-message').textContent,/السعر المعروض قديم/);
assert.equal(node('manual-quote-status').dataset.state,'blocked');
current={...current,updatedAt:new Date(now).toISOString()};
vm.runInContext('preview();renderQuoteStatus()',context);
assert.equal(node('manual-confirm').disabled,false);
assert.equal(node('manual-quote-status').dataset.state,'ready');
console.log('Quote recovery passed: precise rejection reasons, session metadata, stale source vs trade, streaming preview rebase, manual edits preserved, stale rejection and fresh recovery.');
