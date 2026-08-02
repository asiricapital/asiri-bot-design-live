import { loadIntelligenceBrief, portfolioMetrics, committeeMetrics } from './v65-data.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=(value)=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const num=(value,digits=1)=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
const money=(value)=>Number.isFinite(Number(value))?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)):'—';
const pct=(value)=>Number.isFinite(Number(value))?`${Number(value)>=0?'+':''}${num(value,1)}%`:'—';
let brief=null,loading=false;

function setText(id,value){const el=$('#'+id);if(el)el.textContent=value}
function risk(row){return row.members?.find(member=>member.role==='RISK_OFFICER')||{}}

function decision(){
  const marketScore=Number(brief?.intelligence?.market?.score??brief?.market?.score??0);
  const committees=committeeMetrics(brief?.committees||[]);
  const best=brief?.intelligence?.top3?.[0]||brief?.intelligence?.golden?.closest;
  if(!brief?.health?.ok)return {mode:'SYSTEM CHECK',type:'system',headline:'الأولوية لصحة النظام',reason:'فحص الخدمة أو أحد مصادر البيانات غير مكتمل.',priority:'أعد التحديث قبل الاعتماد على أي إشارة.'};
  if(marketScore<35||committees.vetoes)return {mode:'DEFENSIVE',type:'defensive',headline:'حماية رأس المال أولًا',reason:committees.vetoes?`يوجد ${committees.vetoes} اعتراض من مدير المخاطر.`:`نبض السوق دفاعي عند ${num(marketScore,0)}/100.`,priority:committees.vetoes?'راجع اعتراض اللجنة ووقف الخسارة.':'لا توسع المراكز حتى يتحسن نبض السوق.'};
  if(committees.conditional){const row=committees.valid.find(item=>item.consensus?.decisionCode==='CONDITIONAL_ENTRY');return {mode:'SELECTIVE',type:'selective',headline:'إعداد مشروط يحتاج بوابات',reason:`اللجنة صنفت ${row?.symbol||'سهمًا'} كدخول مشروط، والتنفيذ ما زال محظورًا.`,priority:`تحقق شرعيًا من ${row?.symbol||'السهم'} وراقب منطقة الدخول دون مطاردة.`}}
  if(best&&Number(best.score)>=78)return {mode:'WATCH',type:'watch',headline:'فرصة قوية تحت المراقبة',reason:`${best.symbol} هو الأقرب بدرجة ${num(best.score,0)}/100.`,priority:`اعقد لجنة ${best.symbol} وراجع الحجم والمقاومة والتحقق الشرعي.`};
  return {mode:'OBSERVE',type:'observe',headline:'لا توجد إشارة مكتملة الآن',reason:`نبض السوق ${num(marketScore,0)}/100 واللجان تميل إلى الانتظار.`,priority:brief?.broker?.connected?'استمر في المراقبة المنضبطة.':'استمر في Shadow Mode وانتظر تفعيل Saxo.'};
}

function renderMission(){
  const d=decision(),mode=$('#ios65Mode');
  if(mode){mode.textContent=d.mode;mode.className=`ios65-mode ${d.type}`}
  setText('ios65Headline',d.headline);setText('ios65Reason',d.reason);setText('ios65Priority',d.priority);setText('ios65Updated',new Date().toLocaleString('ar-SA'));
}

function renderKpis(){
  const p=portfolioMetrics(brief?.portfolio||[]),c=committeeMetrics(brief?.committees||[]);
  const marketScore=brief?.intelligence?.market?.score??brief?.market?.score;
  const best=brief?.intelligence?.top3?.[0]||brief?.intelligence?.golden?.closest;
  setText('ios65MarketScore',Number.isFinite(Number(marketScore))?`${num(marketScore,0)}/100`:'—');
  setText('ios65MarketRegime',brief?.intelligence?.market?.regime||brief?.market?.regime||'—');
  setText('ios65MarketValue',money(p.marketValue));
  setText('ios65Pnl',p.costValue?`${p.pnl>=0?'+':''}${money(p.pnl)} · ${pct(p.pnlPct)}`:'لا توجد تكلفة مسجلة');
  setText('ios65Concentration',p.largest?`${num(p.concentration,1)}%`:'—');
  setText('ios65Largest',p.largest?`${p.largest.symbol} · ${money(p.largest.value)}`:'لا توجد مراكز');
  setText('ios65Consensus',c.average==null?'—':`${num(c.average,0)}/100`);
  setText('ios65Vetoes',c.vetoes?`${c.vetoes} اعتراض مخاطر`:'لا اعتراضات مسجلة');
  setText('ios65Best',best?.symbol||'لا يوجد');
  setText('ios65BestScore',best?`${num(best.score,0)}/100 · ${best.decision||best.bucket||'مراقبة'}`:'لا توجد فرصة مكتملة');
  setText('ios65Broker',brief?.broker?.connected?'متصل':'بانتظار التفعيل');
  setText('ios65BrokerMode',brief?.broker?.connected?`${String(brief.broker.environment||'sim').toUpperCase()} · قراءة فقط`:'Shadow Mode متاح');
}

function renderPortfolio(){
  const box=$('#ios65Portfolio'),p=portfolioMetrics(brief?.portfolio||[]);if(!box)return;
  setText('ios65PositionsCount',`${p.valid.length} مراكز`);
  if(!p.valid.length){box.innerHTML='<p class="muted">لا توجد مراكز مسجلة.</p>';return}
  box.innerHTML=p.valid.map(row=>{
    const a=row.analysis||{},position=row.position||{},weight=p.marketValue?Number(a.marketValue||0)/p.marketValue*100:0;
    return `<article class="ios65-row"><div><b>${esc(row.symbol)}</b><small>${esc(row.name||'')}</small></div><div><span>القيمة</span><b>${money(a.marketValue)}</b></div><div><span>الأداء</span><b class="${Number(a.pnlPct)>=0?'up':'down'}">${pct(a.pnlPct)}</b></div><div><span>الوزن</span><b>${num(weight,1)}%</b></div><div><span>قرار المركز</span><b>${esc(a.decision||'—')}</b></div><div><span>الوقف</span><b>${position.stopLoss?`$${num(position.stopLoss,2)}`:'غير مسجل'}</b></div></article>`;
  }).join('');
}

function openCommittee(symbol){
  const input=$('#committee64Symbol');if(input)input.value=symbol;
  $('.main-nav button[data-page="investmentcommittee"]')?.click();
  setTimeout(()=>$('#committee64Run')?.click(),100);
}

function renderCommittees(){
  const box=$('#ios65Committees');if(!box)return;
  const rows=brief?.committees||[];
  if(!rows.length){box.innerHTML='<p class="muted">لا توجد مراكز لعقد لجنة عليها.</p>';return}
  box.innerHTML=rows.map(row=>row.error?`<article class="ios65-row error"><div><b>${esc(row.symbol)}</b><small>${esc(row.error)}</small></div></article>`:`<article class="ios65-row committee ${String(row.consensus?.decisionCode||'wait').toLowerCase()}"><div><b>${esc(row.symbol)}</b><small>${esc(row.consensus?.decision||'انتظار')}</small></div><div><span>الثقة</span><b>${num(row.consensus?.confidence,0)}/100</b></div><div><span>المخاطر</span><b>${num(risk(row).riskScore,0)}/100</b></div><div><span>الاعتراض</span><b class="${risk(row).veto?'down':'up'}">${risk(row).veto?'موجود':'لا يوجد'}</b></div><div><span>الحجم الأقصى</span><b>${num(row.consensus?.maxPositionPct,0)}%</b></div><button data-ios65-committee="${esc(row.symbol)}" class="ghost">التفاصيل</button></article>`).join('');
  $$('[data-ios65-committee]',box).forEach(button=>button.addEventListener('click',()=>openCommittee(button.dataset.ios65Committee)));
}

function renderOpportunities(){
  const box=$('#ios65Opportunities');if(!box)return;
  const rows=brief?.intelligence?.top3||[];
  box.innerHTML=rows.length?rows.map((row,index)=>`<article class="ios65-row opportunity"><div><b>${index+1}. ${esc(row.symbol)}</b><small>${esc(row.decision||'مراقبة')}</small></div><div><span>السعر</span><b>$${num(row.price,2)}</b></div><div><span>الدرجة</span><b>${num(row.score,0)}/100</b></div><div><span>الزخم</span><b>${esc(row.momentum||'—')}</b></div><div><span>السيولة</span><b>${esc(row.liquidity||'—')}</b></div><button data-ios65-committee="${esc(row.symbol)}" class="secondary">اعقد لجنة</button></article>`).join(''):'<p class="muted">لا توجد فرص عالية الجودة مكتملة في الرادار الحالي.</p>';
  $$('[data-ios65-committee]',box).forEach(button=>button.addEventListener('click',()=>openCommittee(button.dataset.ios65Committee)));
}

function actions(){
  const result=[],p=portfolioMetrics(brief?.portfolio||[]),c=committeeMetrics(brief?.committees||[]),best=brief?.intelligence?.top3?.[0];
  if(c.vetoes)result.push(['critical',`مراجعة ${c.vetoes} اعتراض من مدير المخاطر قبل أي توسع.`]);
  if(p.concentration>=65)result.push(['high',`تركيز المحفظة مرتفع: ${num(p.concentration,1)}% في ${p.largest?.symbol}.`]);
  if(!brief?.broker?.connected)result.push(['normal','الاستمرار في Shadow Mode وانتظار موافقة Saxo دون فتح وسيط ثالث.']);
  if(best)result.push(['normal',`مراقبة ${best.symbol} مع التحقق الشرعي وعدم مطاردة السعر.`]);
  if(!brief?.golden?.qualified)result.push(['normal','لا توجد Golden Alert مكتملة؛ الانتظار قرار منضبط.']);
  return result.length?result.slice(0,6):[['normal','لا توجد إجراءات عاجلة؛ استمر في المراقبة.']];
}

function renderActions(){const box=$('#ios65Actions');if(box)box.innerHTML=actions().map(([kind,text])=>`<li class="${kind}">${esc(text)}</li>`).join('')}
function source(name,status,detail,kind){return `<article class="ios65-source ${kind}"><i>${kind==='ready'?'✓':kind==='warn'?'!':'×'}</i><div><b>${esc(name)}</b><small>${esc(detail)}</small></div><span>${esc(status)}</span></article>`}
function renderSources(){
  const marketReady=Boolean(brief?.market?.rows?.length&&brief?.intelligence),dbReady=Array.isArray(brief?.positions),committeeReady=!brief?.positions?.length||brief?.committees?.some(row=>!row.error),broker=brief?.broker||{};
  const cards=[
    source('Market Data',marketReady?'جاهز':'غير مكتمل',marketReady?'نبض السوق والرادار يعملان':'تعذر تحميل إحدى طبقات السوق',marketReady?'ready':'down'),
    source('Supabase Portfolio',dbReady?'متصل':'غير متصل',dbReady?`${brief.positions.length} مراكز معزولة للمستخدم`:'جلسة المحفظة غير جاهزة',dbReady?'ready':'down'),
    source('Investment Committee',committeeReady?'جاهزة':'جزئية',committeeReady?'فني + مخاطر + مدير محفظة':'تعذر عقد بعض الاجتماعات',committeeReady?'ready':'warn'),
    source('Saxo Gateway',broker.connected?'متصل':'بانتظار التفعيل',broker.connected?`${String(broker.environment||'sim').toUpperCase()} · قراءة فقط`:'Mock وShadow Mode متاحان',broker.connected?'ready':'warn'),
    source('Render Service',brief?.health?.ok?'سليم':'غير مؤكد',brief?.health?.ok?`Backend v${brief.health.version||'—'}`:'فحص الصحة لم ينجح',brief?.health?.ok?'ready':'down'),
    source('Golden Scanner',brief?.golden?.enabled?'نشط':'محدود',brief?.golden?.enabled?`${brief.golden.qualified||0} إشارات مؤهلة`:'يعتمد على إعدادات الخلفية',brief?.golden?.enabled?'ready':'warn')
  ];
  const box=$('#ios65Sources');if(box)box.innerHTML=cards.join('');
}

function render(){
  renderMission();renderKpis();renderPortfolio();renderCommittees();renderOpportunities();renderActions();renderSources();
  const status=$('#ios65Status');if(status){status.textContent=brief?.errors?.length?`اكتمل مع ملاحظات: ${brief.errors.join(' · ')}`:'اكتمل موجز مركز القيادة. النتائج للقراءة والمراجعة البشرية فقط.';status.className=brief?.errors?.length?'status flat':'status up'}
}

async function load(force=false){
  if(loading)return;loading=true;
  const button=$('#ios65Refresh');if(button){button.disabled=true;button.textContent='جارٍ بناء الموجز…'}
  setText('ios65Status','جارٍ ربط السوق والمحفظة واللجنة والوسيط…');
  try{brief=await loadIntelligenceBrief(force);render()}
  catch(error){const status=$('#ios65Status');if(status){status.textContent=`تعذر بناء الموجز: ${error.message}`;status.className='status down'}}
  finally{loading=false;if(button){button.disabled=false;button.textContent='تحديث مركز القيادة'}}
}

function bind(){
  $('#ios65Refresh')?.addEventListener('click',()=>load(true));
  $('#ios65OpenCommittee')?.addEventListener('click',()=>openCommittee(brief?.intelligence?.top3?.[0]?.symbol||brief?.positions?.[0]?.symbol||'AMPL'));
  $('.main-nav button[data-page="intelligenceos"]')?.addEventListener('click',()=>{if(!brief)load(false)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
