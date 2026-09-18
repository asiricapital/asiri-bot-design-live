import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runResearchOrchestratorV60 } from './research-orchestrator-v60.js';
import { getQuotes } from './market.js';
import {
  startXOAuth,
  finishXOAuth,
  xStatus,
  disconnectX,
  xFeedEndpoint,
  getXFeed,
  isXBackendReady,
} from './x-intelligence.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const SERVER_LLM_BASE_URL = String(process.env.ASIRI_LLM_BASE_URL || '').replace(/\/$/, '');
const SERVER_LLM_API_KEY = String(process.env.ASIRI_LLM_API_KEY || '');
const SERVER_LLM_MODEL = String(process.env.ASIRI_LLM_MODEL || '');
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const ALLOWED_MODELS = new Set(['openai','openai-fast','gpt-5.6-sol','gpt-5.6-terra','gpt-5.6-luna','claude-fast','claude-sonnet-5','gemini-fast','gemini-search','deepseek','kimi','glm','qwen-large','perplexity-fast']);
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '768kb' }));

const clean = (v,max=6000)=>String(v||'').replace(/[<>]/g,'').trim().slice(0,max);
function rateLimit(req,res,next){
  const ip=req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()||req.ip||'unknown';
  const now=Date.now(); const b=rateBuckets.get(ip)||{start:now,count:0};
  if(now-b.start>60_000){b.start=now;b.count=0;} b.count++; rateBuckets.set(ip,b);
  if(b.count>12) return res.status(429).json({error:'تم تجاوز حد البحث مؤقتًا. حاول بعد دقيقة.'});
  next();
}

async function fetchJson(url, options={}, timeoutMs=90_000){
  const c=new AbortController(); const timer=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:c.signal,headers:{Accept:'application/json',...(options.headers||{})}});
    const text=await r.text();
    if(!r.ok) throw new Error(`HTTP ${r.status}${text?`: ${text.slice(0,300)}`:''}`);
    return text?JSON.parse(text):{};
  }finally{clearTimeout(timer);}
}

function normalizeMode(v){return ['quick','deep','max','live'].includes(String(v||'').toLowerCase())?String(v).toLowerCase():'max';}
function resolveProvider(body){
  const key=String(body?.providerKey||'');
  const requested=String(body?.providerModel||'openai');
  const model=ALLOWED_MODELS.has(requested)?requested:'openai';
  if(key&&/^(sk_|pk_)/.test(key)) return {type:'pollinations-byop',baseUrl:POLLINATIONS_BASE_URL,apiKey:key,model};
  if(SERVER_LLM_BASE_URL&&SERVER_LLM_MODEL) return {type:'server-openai-compatible',baseUrl:SERVER_LLM_BASE_URL,apiKey:SERVER_LLM_API_KEY,model:SERVER_LLM_MODEL};
  return null;
}

function evidenceCap(mode){return mode==='quick'?16:mode==='max'?45:30;}
function numberedEvidence(inv,mode){
  const readByUrl=new Map((inv.sourcesRead||[]).map(x=>[x.url,x]));
  return (inv.results||[]).slice(0,evidenceCap(mode)).map((r,i)=>{
    const read=readByUrl.get(r.url);
    return {id:i+1,title:r.title,url:r.url,source:r.source||r.provider,provider:r.provider,publishedAt:r.publishedAt,evidenceScore:r.evidenceScore,excerpt:clean(read?.excerpt||r.snippet||'',1500),readStatus:read?.readStatus||(r.provider==='X Timeline'?'x-api':'search-snippet'),fromX:Boolean(r.fromX)};
  });
}

function evidencePack(inv,refs){
  const sources=refs.map(r=>`[${r.id}] ${r.title}\nالمصدر: ${r.source} / ${r.provider}\nالتاريخ: ${r.publishedAt||'غير متاح'}\nEvidence: ${r.evidenceScore??'n/a'}\nقراءة: ${r.readStatus}\n${r.excerpt}\n${r.url}`).join('\n\n');
  const claims=(inv.claims||[]).slice(0,20).map(c=>`C${c.id}: ${c.claim}\nمستقل=${c.independentSources}; ثقة=${c.confidence}/100; تعارض=${c.possibleConflict?'نعم':'لا'}`).join('\n\n');
  const coverage=inv.coverage?`الوضع=${inv.coverage.mode}; Planner=${inv.coverage.planner||'ASIRI'}; فروع=${inv.coverage.branches||inv.coverage.passes||1}; أدلة=${inv.coverage.totalEvidence}; مصادر مستقلة=${inv.coverage.independentSources}; مصادر مقروءة=${inv.coverage.sourcesRead}; أولية/رسمية=${inv.coverage.primarySources||0}; أخبار قوية=${inv.coverage.trustedNews||0}`:'لا توجد بيانات تغطية.';
  const plan=(inv.researchPlan||[]).map((t,i)=>`P${i+1}: ${t.label} | ${t.query}`).join('\n')||'- لا توجد خطة.';
  const xSignals=(inv.xSignals||[]).slice(0,10).map((x,i)=>`X${i+1}: ${x.title||x.snippet||''}\n${x.url||''}`).join('\n\n')||'- لا توجد إشارة X مرتبطة أو لم تتوفر الحصة.';
  const gaps=(inv.gaps||[]).map(x=>`- ${x}`).join('\n')||'- لا توجد فجوة مسجلة.';
  return `خطة البحث:\n${plan}\n\nتغطية البحث:\n${coverage}\n\nالمصادر الأساسية المرقمة (خارج X):\n${sources}\n\nالادعاءات:\n${claims}\n\nفجوات الدليل:\n${gaps}\n\nإشارات X المساعدة فقط (لا ترفع الثقة الأساسية):\n${xSignals}`;
}

function authorSystem(inv){
  return `أنت ASIRI Deep Intelligence Analyst. اكتب بالعربية الواضحة والمباشرة. المجال: ${inv.intent?.domainLabel||'بحث عام'}.\nقواعد إلزامية:\n1) استخدم فقط الأدلة المقدمة وضع [n] بجوار كل ادعاء جوهري.\n2) ادمج المصادر ولا تسرد روابط بلا تفسير.\n3) افصل المؤكد عن المرجح وعن غير المؤكد.\n4) X طبقة اكتشاف مساعدة فقط: لا تستخدم منشور X كدليل مستقل، ولا تجعله أساس الخلاصة، ولا ترفعه فوق مصدر رسمي/أولي أو صحافة مستقلة.\n5) إذا تعطلت X أو نفدت حصتها، قل إن X لم يدخل هذا التحقيق ولا تخفض قيمة بقية المصادر.\n6) لا تخترع حقيقة أو رقمًا أو مصدرًا.\n7) عند السياسة اعرض الوقائع والروايات المنسوبة ومواطن الخلاف بشكل محايد، بلا تأييد أو ترتيب سياسي أو توقع انتخابي.\n8) لا تصدر أمر تداول أو إجراء تنفيذي.\n9) اجعل الخلاصة مركزة ثم اعرض التفاصيل المهمة.\nالعناوين: ## الخلاصة الآن ## ما تأكد من المصادر الأساسية ## ما وجدناه من المصادر الرسمية والأولية ## ما تقوله المصادر المستقلة ## إشارات X المساعدة (إن وجدت) ## ما يزال غير مؤكد أو مختلفًا عليه ## لماذا هذا مهم؟ ## ما الذي يجب مراقبته ## جودة التغطية.`;
}

async function callModelOnce(provider,messages,temp=0.1,modelOverride=null){
  const headers={'Content-Type':'application/json'}; if(provider.apiKey) headers.Authorization=`Bearer ${provider.apiKey}`;
  const model=modelOverride||provider.model;
  const d=await fetchJson(`${provider.baseUrl}/chat/completions`,{method:'POST',headers,body:JSON.stringify({model,temperature:temp,messages})});
  const answer=d?.choices?.[0]?.message?.content; if(!answer) throw new Error('لم يُعد النموذج محتوى صالحًا');
  return {answer,model};
}
async function callModel(provider,messages,temp=0.1){
  try{return await callModelOnce(provider,messages,temp);}catch(error){
    if(provider.type==='pollinations-byop'&&provider.model!=='openai') return callModelOnce(provider,messages,temp,'openai');
    throw error;
  }
}
async function authorAnswer(provider,question,inv,refs,conversation){
  const history=Array.isArray(conversation)?conversation.slice(-6).filter(m=>['user','assistant'].includes(m?.role)).map(m=>({role:m.role,content:clean(m.content,2800)})):[];
  return callModel(provider,[{role:'system',content:authorSystem(inv)},...history,{role:'user',content:`السؤال:\n${question}\n\n${evidencePack(inv,refs)}\n\nاكتب الإجابة النهائية الموثقة.`}],0.08);
}
async function challengeAnswer(provider,question,draft,inv,refs){
  return callModel(provider,[{role:'system',content:'أنت ASIRI Challenge Agent. راجع الأدلة بصرامة واحذف أي ادعاء غير مسند. لا تضف حقائق جديدة.'},{role:'user',content:`السؤال: ${question}\n\nالمسودة:\n${draft}\n\n${evidencePack(inv,refs)}\n\nأعد النسخة المصححة فقط، وحافظ على المراجع [n].`}],0.03);
}

function symbolsFromQuery(v){return [...new Set([...String(v||'').toUpperCase().matchAll(/\$([A-Z]{1,6})\b/g)].map(m=>m[1]))].slice(0,4);}
async function addMarketContext(inv,q){if(inv.intent?.domain!=='markets')return inv;const s=symbolsFromQuery(q);if(!s.length)return inv;try{return{...inv,marketContext:await getQuotes(s)}}catch{return inv;}}
function classifyXError(error){
  const e=String(error||'').toLowerCase();
  if(!e) return {state:'ready',label:'جاهز'};
  if(/credit|deplet|quota|usage|payment/.test(e)) return {state:'quota-blocked',label:'متصل · الحصة/الرصيد غير متاح'};
  if(/unauthor|401|token|auth/.test(e)) return {state:'auth-blocked',label:'متصل · يحتاج إعادة تفويض'};
  if(/rate|429/.test(e)) return {state:'rate-limited',label:'متصل · حد الطلبات مؤقتًا'};
  return {state:'degraded',label:'متصل · المصدر متعثر'};
}

app.get('/auth/x/start',startXOAuth);
app.get('/auth/x/callback',finishXOAuth);
app.get('/api/x/status',xStatus);
app.get('/api/x/feed',rateLimit,xFeedEndpoint);
app.post('/api/x/disconnect',disconnectX);

app.get('/health',(_req,res)=>res.json({ok:true,service:'asiri-deep-intelligence-os',version:'6.0-research-orchestrator',researchModes:['quick','deep','max','live'],pipeline:['understand','plan','parallel-executors','primary-source-search','independent-verification','read','rerank','claims','gap-search','cross-check','x-signals','synthesize','challenge','publish'],xIntegration:true,xBackendReady:isXBackendReady(),serverLLMConfigured:Boolean(SERVER_LLM_BASE_URL&&SERVER_LLM_MODEL),clientBYOPSupported:true,trading:false,time:new Date().toISOString()}));

app.post('/api/deep-research',rateLimit,async(req,res)=>{
  const question=clean(req.body?.question||req.body?.message,3000); if(question.length<2)return res.status(400).json({error:'اكتب ما تريد معرفته.'});
  const mode=normalizeMode(req.body?.researchMode);
  const provider=resolveProvider(req.body); const started=Date.now();
  const xLimit=mode==='quick'?60:mode==='max'?240:mode==='live'?160:140;
  try{
    const xFeed=await getXFeed(req,res,{query:question,limit:xLimit});
    const xState=classifyXError(xFeed.error);
    let inv=await runResearchOrchestratorV60(question,{mode,xResults:xFeed.results,xConnected:xFeed.connected,xError:xFeed.error});
    inv=await addMarketContext(inv,question);
    const refs=numberedEvidence(inv,mode);
    let answer=inv.answer,engine='deterministic-max-coverage',model=null,challenge={used:false,passed:null,error:null},modelError=null;
    if(provider&&refs.length){
      try{
        const draft=await authorAnswer(provider,question,inv,refs,req.body?.conversation); model=draft.model; engine=provider.type;
        try{const reviewed=await challengeAnswer({...provider,model},question,draft.answer,inv,refs);answer=reviewed.answer;model=reviewed.model;challenge={used:true,passed:true,error:null};}
        catch(error){answer=draft.answer;challenge={used:true,passed:false,error:clean(error?.message||error,320)};}
      }catch(error){modelError=clean(error?.message||error,420);}
    }
    const independentStrong=(inv.claims||[]).filter(c=>Number(c.independentSources||0)>=2&&Number(c.confidence||0)>=70).length;
    const finalConfidence=Math.min(99,Math.round(Number(inv.confidence||0)*0.68+Math.min(8,independentStrong)*2.8+(challenge.passed?8:0)));
    res.set('Cache-Control','no-store');
    res.json({id:`asiri-v54-${Date.now().toString(36)}`,question,researchMode:mode,durationMs:Date.now()-started,engine,model,answer,confidence:finalConfidence,challenge,modelError,intent:inv.intent,plan:inv.plan,coverage:inv.coverage,stages:inv.stages,results:refs,sourcesRead:inv.sourcesRead,claims:inv.claims,contradictions:inv.contradictions,gaps:inv.gaps,gapQueries:inv.gapQueries,timeline:inv.timeline,independence:inv.independence,marketContext:inv.marketContext||[],x:{...inv.x,connected:xFeed.connected,user:xFeed.user,totalFetched:xFeed.totalFetched,error:xFeed.error,state:xState.state,stateLabel:xState.label,signals:inv.xSignals||[]},researchPlan:inv.researchPlan||[],followUps:['اعرض أقوى الأدلة المستقلة فقط.','ما الذي أضافته الجولة الثانية والثالثة من البحث؟','اعرض إشارات X التي تم تأكيدها خارج X فقط.','ما المعلومات التي لم نجد لها تأكيدًا مستقلًا؟','ما الجديد منذ هذا التحقيق؟'],guardrails:['research-only','multi-pass','query-expansion','full-source-reading','x-discovery-not-single-truth','independence-aware','citations-required','challenge-review']});
  }catch(error){res.status(500).json({error:'تعذر إكمال البحث العميق.',detail:clean(error?.message||error,500)});}
});

const AI_FIX=`<script>(()=>{const b=document.getElementById('aiConnect');if(!b)return;b.onclick=()=>{const p=new URLSearchParams({redirect_url:location.origin+location.pathname,expiry:'7'});location.href='https://enter.pollinations.ai/authorize?'+p.toString()};})();</script>`;
app.get(['/', '/deep', '/deep-intelligence.html'],async(_req,res)=>{
  res.set('Cache-Control','no-store');
  try{
    const [html,css53,js53,css54,js54]=await Promise.all([
      fs.readFile(path.join(root,'deep-intelligence-x.html'),'utf8'),
      fs.readFile(path.join(root,'ui-v53.css'),'utf8'),
      fs.readFile(path.join(root,'ui-v53.js'),'utf8'),
      fs.readFile(path.join(root,'ui-v54.css'),'utf8'),
      fs.readFile(path.join(root,'ui-v54.js'),'utf8'),
    ]);
    const out=html.replace('</head>',`<style>${css53}</style><style>${css54}</style></head>`).replace('</body>',`${AI_FIX}<script>${js53}</script><script>${js54}</script></body>`);
    res.type('html').send(out);
  }catch(error){console.error('ASIRI v5.4 UI load error:',error?.message||error);res.status(500).send('ASIRI UI unavailable');}
});

app.listen(port,'0.0.0.0',()=>console.log(`ASIRI Deep Intelligence OS v6 Research Orchestrator listening on ${port}`));
