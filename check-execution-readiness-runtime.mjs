import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('./execution-readiness-ui.js', import.meta.url), 'utf8');
async function run({ payload = {}, status = 200, missing = false, timeout = false, loading = false } = {}) {
  const nodes = {};
  for (const id of ['execution-readiness-gates','execution-readiness-state','execution-readiness-card','execution-readiness-note','execution-lock-toggle','execution-review-button']) nodes[id] = { innerHTML:'', textContent:'', attributes:{}, setAttribute(k,v){this.attributes[k]=v}, addEventListener(){}, parentElement:{querySelector:()=>null} };
  const requests=[]; let expire; let ready; let cleared=false;
  const context={ document:{readyState:loading?'loading':'complete',getElementById:id=>missing?null:nodes[id]}, window:{setTimeout:fn=>{expire=fn;return 1},clearTimeout:()=>{cleared=true},addEventListener:(name,fn)=>{ready=fn}}, AbortController,fetch:async(url,options)=>{requests.push({url,options});if(timeout)return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout'))));return{ok:status===200,status,json:async()=>payload}}};
  vm.runInNewContext(source,context);
  if(loading) ready();
  if(timeout) expire();
  await new Promise(resolve=>setImmediate(resolve));
  return {nodes,requests,cleared};
}
for (const loading of [true,false]) {
  const {nodes,requests,cleared}=await run({loading,payload:{ready:false,gates:{marketData:false},blockers:[]}});
  assert.equal(requests.length,1);assert.equal(requests[0].options.method,undefined);assert(requests[0].options.signal);
  assert.equal(nodes['execution-readiness-state'].textContent,'غير جاهز للتداول الحقيقي');
  assert.equal(nodes['execution-lock-toggle'].disabled,true);assert(cleared);
}
const conflict=await run({payload:{ready:false,serverLiveGates:{serverGatesOpenForLiveOrders:true}}});
assert.match(conflict.nodes['execution-readiness-state'].textContent,/تعارض/);
assert.equal(conflict.nodes['execution-readiness-card'].attributes['data-server-open'],'false');
for(const fixture of [{status:503},{timeout:true}]) {
 const {nodes,cleared}=await run(fixture);assert.match(nodes['execution-readiness-state'].textContent,/مقفول احتياطيًا/);assert(cleared);
}
assert.equal((await run({missing:true})).requests.length,0);
console.log('Execution readiness runtime passed: load lifecycle, visible gates, GET-only request, conflict lock, HTTP failure and timeout.');
