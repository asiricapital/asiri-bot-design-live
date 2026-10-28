import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('./operational-trust-panel-v1.js',import.meta.url),'utf8');
for(const fixture of [{fail:false},{fail:true},{fail:false,pending:true},{fail:false,degraded:true}]) {
 const {fail,pending,degraded}=fixture;
 const nodes={};const requests=[];
 for(const id of ['operational-trust-panel','operational-trust-refresh','operational-trust-updated','operational-trust-source',...['service','market','stream','notifications','safety'].map(x=>'trust-card-'+x)]) nodes[id]={dataset:{},textContent:'',addEventListener(){},status:{},evidence:{},querySelector(selector){return selector==='[data-trust-status]'?this.status:this.evidence}};
 const window={setTimeout:()=>1,clearTimeout(){},setInterval(){},addEventListener(){},asiriMarketView:{snapshots:()=>[{fresh:true},{fresh:false}],health:item=>({state:item.fresh?'FRESH':'STALE'})}};
 const document={readyState:'complete',getElementById:id=>nodes[id]};
 vm.runInNewContext(source,{window,document,AbortController,fetch:async(url,options)=>{requests.push({url,options});if(fail)throw new Error('unreachable');return {ok:!(degraded&&url.includes('system/health')),status:degraded&&url.includes('system/health')?503:200,json:async()=>url.includes('market-stream')?(pending?{enabled:true,state:'READY',connections:[]}:{enabled:false,state:'DISABLED'}):url.includes('system/health')?{ok:!degraded,version:'test',checks:[]}:{executionAllowed:false,automaticTrading:false,brokerSubmission:false}}}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(nodes['trust-card-market'].status.textContent,'1/2 قراءة حديثة');
 assert(requests.every(r=>r.options.method==='GET'&&r.options.signal));
 assert.equal(requests.some(r=>r.url.includes('/snapshot')),false,'market health must not depend on optional stream snapshot');
 assert.equal(nodes['operational-trust-refresh'].disabled,false);
 if(fail) assert.match(nodes['trust-card-service'].evidence.textContent,/لا يثبت توقفها/);
 else {assert.equal(nodes['trust-card-service'].status.textContent,degraded?'الخدمة تحتاج مراجعة':'الخدمة متاحة');assert.equal(nodes['trust-card-stream'].status.textContent,pending?'الاتصال غير مثبت':'اختياري · غير مفعّل')}
}
console.log('Operational trust runtime passed: canonical market counts, optional stream disabled, failed status read distinguished from service outage.');
