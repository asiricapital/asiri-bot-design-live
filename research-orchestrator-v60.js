import { runDeepInvestigationWithX } from './deep-intelligence-engine-x.js';
import { understandQuestion } from './deep-intelligence-engine.js';
import ledger from './evidence-ledger-v6.js';

const MODE_CFG = {
  quick: { tasks: 2, maxRead: 5, resultCap: 18 },
  deep: { tasks: 4, maxRead: 7, resultCap: 36 },
  max: { tasks: 6, maxRead: 8, resultCap: 56 },
  live: { tasks: 4, maxRead: 6, resultCap: 40 },
};

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFKC')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/\s+/g,' ').trim();
}
function rootDomain(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
    const p = h.split('.');
    return p.length <= 2 ? h : p.slice(-2).join('.');
  } catch { return ''; }
}
function uniq(items, keyFn, cap=100) {
  const out=[]; const seen=new Set();
  for (const x of items || []) {
    const k=keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(x);
    if (out.length >= cap) break;
  }
  return out;
}
function tierOf(item) {
  const t = ledger.tierOf(item || {});
  return { ...t, rank: t.w };
}
function rankScore(item) {
  const tier = tierOf(item);
  const base = Number(item?.evidenceScore || 0);
  const freshness = item?.publishedAt ? Math.max(0, 8 - Math.floor((Date.now()-new Date(item.publishedAt).getTime())/86400000)) : 0;
  return base + Number(tier.rank || 0) * 45 + freshness;
}
function englishTopicVariant(question) {
  const q=normalize(question);
  if (/اليمن|yemen/.test(q)) return 'Yemen Houthi Red Sea Aden Sanaa Mokha latest developments';
  if (/غزه|gaza|فلسطين|palestin/.test(q)) return 'Gaza Palestine latest developments';
  if (/ايران|iran|هرمز|hormuz/.test(q)) return 'Iran Strait of Hormuz latest developments';
  if (/اوكرانيا|ukrain|روسيا|russia/.test(q)) return 'Ukraine Russia latest developments';
  return '';
}
function officialQuery(intent, question) {
  if (intent.domain === 'markets') return `${question} SEC filing investor relations official announcement`;
  if (intent.domain === 'technology') return `${question} official documentation release notes security advisory GitHub`;
  if (intent.domain === 'government') return `${question} site:gov.sa OR site:etimad.sa official`;
  if (intent.domain === 'science') return `${question} guideline systematic review primary study official`;
  if (intent.domain === 'cyber') return `${question} CISA NVD security advisory official`;
  if (intent.domain === 'politics') return `${question} official statement government ministry UN`;
  return `${question} official primary source`;
}
function independentQuery(intent, question) {
  if (intent.domain === 'politics') return `${question} Reuters AP AFP BBC independent report`;
  if (intent.domain === 'markets') return `${question} Reuters Bloomberg filing independent analysis`;
  if (intent.domain === 'technology') return `${question} independent review benchmark issue tracker`;
  if (intent.domain === 'science') return `${question} peer reviewed independent evidence`;
  return `${question} independent sources confirmation`;
}
function contradictionQuery(question) {
  return `${question} denied disputed contradiction fact check confirmation`;
}
function contextQuery(intent, question) {
  if (intent.urgency === 'live') return `${question} timeline last 24 hours latest update`;
  return `${question} background timeline context key events`;
}
function buildPlan(question, mode, intent) {
  const cfg=MODE_CFG[mode] || MODE_CFG.max;
  const tasks=[
    {id:'core', role:'core', label:'السؤال الرئيسي', query:question},
    {id:'official', role:'primary', label:'المصدر الأولي/الرسمي', query:officialQuery(intent,question)},
    {id:'independent', role:'independent', label:'تحقق مستقل', query:independentQuery(intent,question)},
    {id:'context', role:'context', label:'السياق والخط الزمني', query:contextQuery(intent,question)},
    {id:'contradiction', role:'challenge', label:'البحث عن النفي والتعارض', query:contradictionQuery(question)},
  ];
  const en=englishTopicVariant(question);
  if (en) tasks.push({id:'bilingual',role:'bilingual',label:'مسار إنجليزي موازٍ',query:`${en} Reuters AP official statement`});
  return tasks.slice(0,cfg.tasks);
}
function mergeClaims(investigations, intent) {
  const rows=[];
  for (const c of investigations.flatMap(x=>x.claims||[])) {
    const k=normalize(c.claim);
    if (!k) continue;
    const old=rows.find(x=>normalize(x.claim)===k);
    if (!old) { rows.push({...c,providers:[...(c.providers||[])],sourceDomains:[...(c.sourceDomains||[])],items:[...(c.items||[])]}); continue; }
    old.supportCount=Math.max(Number(old.supportCount||0),Number(c.supportCount||0));
    old.independentSources=Math.max(Number(old.independentSources||0),Number(c.independentSources||0));
    old.confidence=Math.max(Number(old.confidence||0),Number(c.confidence||0));
    old.possibleConflict=Boolean(old.possibleConflict||c.possibleConflict);
    old.providers=[...new Set([...(old.providers||[]),...(c.providers||[])])];
    old.sourceDomains=[...new Set([...(old.sourceDomains||[]),...(c.sourceDomains||[])])];
    old.items=uniq([...(old.items||[]),...(c.items||[])],x=>x.url||x.text,10);
  }
  const windowDays = ledger.windowForQuestion(intent || {});
  return rows
    .map((x) => ({ ...x, ...ledger.rescoreClaim(x, { windowDays, today: new Date() }) }))
    .sort((a,b)=>(Number(b.independentSources||0)*25+Number(b.confidence||0))-(Number(a.independentSources||0)*25+Number(a.confidence||0)))
    .slice(0,32)
    .map((x,i)=>({...x,id:i+1}));
}
function buildFallbackAnswer(claims, results, gaps, plan) {
  const strong=claims.filter(c=>Number(c.independentSources||0)>=2&&Number(c.confidence||0)>=70).slice(0,6);
  const uncertain=claims.filter(c=>Number(c.independentSources||0)<2||c.possibleConflict).slice(0,5);
  const refs=results.slice(0,30).map((r,i)=>({...r,_id:i+1}));
  const cite=(c)=>{const hit=refs.find(r=>(c.items||[]).some(x=>x.url===r.url));return hit?`[${hit._id}]`:'';};
  const s=strong.length?strong.map(c=>`- ${c.claim} ${cite(c)}`).join('\n'):'- لم تصل الأدلة المستقلة بعد إلى عتبة كافية لبناء خلاصة قوية.';
  const u=uncertain.length?uncertain.map(c=>`- ${c.claim} — ${c.possibleConflict?'توجد روايات متعارضة':'يحتاج إلى تأكيد مستقل إضافي'} ${cite(c)}`).join('\n'):'- لا يوجد تعارض بارز في أقوى الأدلة الحالية.';
  return `## الخلاصة الآن\n${s}\n\n## ما تأكد من مصادر مستقلة\n${s}\n\n## ما يزال غير مؤكد أو مختلفًا عليه\n${u}\n\n## كيف بحث ASIRI؟\n- نفّذ ${plan.length} مسارات بحث متوازية: رئيسي، أولي/رسمي، مستقل، سياق، ونفي/تعارض حسب الوضع.\n- لا تدخل إشارات X في رفع الثقة الأساسية.\n\n## فجوات البحث\n${gaps.length?gaps.map(x=>`- ${x}`).join('\n'):'- لا توجد فجوة بارزة مكتشفة آليًا.'}`;
}
function relevantXSignals(xResults, question) {
  const tokens=[...new Set(normalize(question).match(/[\p{L}\p{N}]{3,}/gu)||[])].filter(x=>!['اليوم','الان','الآن','اخر','آخر','ماذا','ماهي','هذا','هذه'].includes(x));
  return (xResults||[]).filter(x=>{
    const t=normalize(`${x.title||''} ${x.snippet||''} ${x.source||''}`);
    return tokens.length ? tokens.some(k=>t.includes(k)) : false;
  }).sort((a,b)=>Number(b.evidenceScore||0)-Number(a.evidenceScore||0)).slice(0,12).map((x,i)=>({...x,signalId:`X${i+1}`}));
}
function mergeInvestigations(investigations, plan, mode, xSignals, intent) {
  const cfg=MODE_CFG[mode]||MODE_CFG.max;
  const allNonX=investigations.flatMap(x=>x.results||[]).filter(x=>!x.fromX&&x.provider!=='X Timeline');
  const results=uniq(allNonX.sort((a,b)=>rankScore(b)-rankScore(a)),x=>x.url||`${x.provider}|${x.title}`,cfg.resultCap);
  const sourcesRead=uniq(investigations.flatMap(x=>x.sourcesRead||[]).filter(x=>x.provider!=='X Timeline'),x=>x.url,mode==='max'?32:22);
  const claims=mergeClaims(investigations, intent);
  const contradictions=uniq(investigations.flatMap(x=>x.contradictions||[]),x=>x.claim||x.url,14);
  const gaps=[...new Set(investigations.flatMap(x=>x.gaps||[]))];
  const gapQueries=[...new Set(investigations.flatMap(x=>x.gapQueries||[]))];
  const independenceMap=new Map();
  for (const item of results) {
    const key=ledger.originKey(item);
    if(!key||/^x:|twitter|x\.com/i.test(key)) continue;
    const old=independenceMap.get(key)||{domain:key,count:0,providers:[]};
    old.count+=1;
    if(item.provider&&!old.providers.includes(item.provider)) old.providers.push(item.provider);
    independenceMap.set(key,old);
  }
  const independence=[...independenceMap.values()];
  const timeline=uniq(investigations.flatMap(x=>x.timeline||[]).filter(x=>!x.viaX).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)),x=>`${x.url}|${x.date}`,26);
  const strongClaims=claims.filter(c=>Number(c.independentSources||0)>=2&&Number(c.confidence||0)>=70).length;
  const readCount=sourcesRead.filter(x=>x.readStatus==='read').length;
  const primaryCount=results.filter(x=>tierOf(x).id==='primary').length;
  const trustedNewsCount=results.filter(x=>tierOf(x).id==='wire').length;
  const confidence=Math.min(99,Math.round(Math.min(36,independence.length*4)+Math.min(34,strongClaims*5)+Math.min(18,readCount*2)+Math.min(10,(primaryCount+trustedNewsCount))));
  const stages=investigations.flatMap((x,idx)=>(x.stages||[]).map(s=>({...s,branch:plan[idx]?.id||`b${idx+1}`,branchLabel:plan[idx]?.label||''})));
  return {
    ...(investigations[0]||{}),
    answer:buildFallbackAnswer(claims,results,gaps,plan),
    confidence, results, sourcesRead, claims, contradictions, gaps, gapQueries, independence, timeline, stages,
    researchPlan:plan,
    xSignals,
    coverage:{
      mode,
      planner:'ASIRI v6 planner/executor/publisher',
      branches:investigations.length,
      plannedBranches:plan.length,
      totalEvidence:results.length,
      independentSources:independence.length,
      sourcesRead:readCount,
      strongClaims,
      primarySources:primaryCount,
      trustedNews:trustedNewsCount,
      xSignals:xSignals.length,
    },
  };
}

export async function runResearchOrchestratorV60(question, options={}) {
  const mode=MODE_CFG[options.mode]?options.mode:'max';
  const intent=understandQuestion(question);
  const plan=buildPlan(question,mode,intent);
  const cfg=MODE_CFG[mode];
  const jobs=plan.map(task=>runDeepInvestigationWithX(task.query,{maxRead:cfg.maxRead,xResults:[],xConnected:false,xError:null}));
  const settled=await Promise.allSettled(jobs);
  const investigations=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!investigations.length) throw settled[0]?.reason||new Error('فشل تنفيذ خطة البحث');
  const xSignals=relevantXSignals(options.xResults||[],question);
  const merged=mergeInvestigations(investigations,plan,mode,xSignals,intent);
  merged.intent={...(merged.intent||intent),researchMode:mode};
  merged.x={connected:Boolean(options.xConnected),used:0,signals:xSignals.length,error:options.xError||null,role:'discovery-signal-only'};
  return merged;
}
