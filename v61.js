const FAVORITES_V61 = [
  ['AMD','تقنية متقدمة'],['SNAP','تقنية واتصالات'],['MVIS','تقنية عالية المخاطر'],['SG','مطاعم ونمو'],['RKLB','فضاء'],['CHPT','شحن المركبات'],['BLNK','شحن المركبات'],['HUMA','تقنية حيوية'],['AGEN','تقنية حيوية'],
  ['TMCI','تقنية طبية'],['AMPL','محفظتي'],['OCGN','تقنية حيوية'],['RDW','فضاء'],['INO','تقنية حيوية'],['LASE','تقنية صناعية'],['PLUG','طاقة نظيفة'],['CRDL','محفظتي'],['ADMA','تقنية حيوية تاريخية'],
  ['CURI','إعلام رقمي'],['OPTT','طاقة بحرية'],['PLUL','منتج رافعة مالية']
].map(([symbol,theme])=>({symbol,theme}));

const ORIGINAL_SYMBOLS_V61 = new Set(FAVORITES_V61.map(x=>x.symbol));
const PORTFOLIO_SYMBOLS_V61 = new Set(['AMPL','CRDL']);
const LEVERAGED_SYMBOLS_V61 = new Set(['PLUL']);
const SHARIA_KEY_V61 = 'asiri_v61_sharia_status';

const $v61 = (s,r=document)=>r.querySelector(s);
const $$v61 = (s,r=document)=>[...r.querySelectorAll(s)];
const escV61 = (v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const numV61 = (v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';

let clientV61=null,sessionV61=null,dbRowsV61=[],rowsV61=[],activeFilterV61='ALL';

function shariaMapV61(){try{return JSON.parse(localStorage.getItem(SHARIA_KEY_V61)||'{}')}catch{return {}}}
function setShariaV61(symbol,status){const map=shariaMapV61();map[symbol]=status;localStorage.setItem(SHARIA_KEY_V61,JSON.stringify(map));renderV61()}
function shariaLabelV61(status){return status==='APPROVED'?'تم التحقق في عوائد':status==='REJECTED'?'غير متوافق حسب آخر فحص':'بانتظار فحص عوائد'}
function shariaClassV61(status){return status==='APPROVED'?'good':status==='REJECTED'?'bad':'warn'}

function categoryV61(row){
  const symbol=row.symbol;
  const price=Number(row.analysis?.price);
  const a=row.analysis?.candidateAnalysis||{};
  const score=Number(a.asiriScore??a.confidence??0);
  const rr=Number(a.riskReward||0);
  const decision=String(a.decision||'').toUpperCase();
  if(PORTFOLIO_SYMBOLS_V61.has(symbol))return 'PORTFOLIO';
  if(LEVERAGED_SYMBOLS_V61.has(symbol))return 'EXCLUDED';
  if(Number.isFinite(price)&&price<1)return 'PENNY';
  if(Number.isFinite(price)&&price>10)return 'OUTSIDE';
  if(a.goldenQualified===true&&score>=95&&(rr>=1.8||rr===0))return 'GOLDEN';
  if(Number.isFinite(price)&&price>=1&&price<=10&&score>=75&&!decision.includes('تجنب')&&!decision.includes('AVOID')&&(rr>=1.8||rr===0))return 'STRONG';
  return 'WAIT';
}

function categoryMetaV61(cat){return ({
  PORTFOLIO:['محفظتي','good'],GOLDEN:['Golden Alert','warn'],STRONG:['مراقبة قوية','good'],WAIT:['انتظار',''],PENNY:['عالي المخاطر أقل من $1','bad'],OUTSIDE:['خارج نطاق $1–$10','bad'],EXCLUDED:['مستبعد: رافعة مالية','bad']
})[cat]||['مراقبة','']}

function categoryReasonV61(row){
  const cat=categoryV61(row),a=row.analysis?.candidateAnalysis||{};
  if(cat==='PORTFOLIO')return 'مركز حالي — الأولوية لإدارة المخاطر والأهداف.';
  if(cat==='GOLDEN')return 'اكتملت شروط Golden Alert وفق المحرك؛ التنفيذ بعد التحقق الشرعي فقط.';
  if(cat==='STRONG')return 'ضمن النطاق السعري وبدرجة فنية جيدة، لكنه يحتاج تأكيد الدخول.';
  if(cat==='PENNY')return 'أقل من دولار؛ تذبذب وسيولة ومخاطر تنفيذ أعلى.';
  if(cat==='OUTSIDE')return 'السعر خارج نطاق الاستراتيجية الحالية من 1 إلى 10 دولارات.';
  if(cat==='EXCLUDED')return 'منتج ذو رافعة مالية؛ لا يدخل في قائمة الأسهم الأساسية.';
  return a.reason||'لم تكتمل شروط الدخول القوية؛ يبقى تحت المراقبة.';
}

async function initClientV61(){
  const cfg=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
  if(!cfg.supabase?.enabled)throw new Error('Supabase غير متصل');
  clientV61=window.supabase.createClient(cfg.supabase.url,cfg.supabase.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  for(let i=0;i<8;i++){
    const {data}=await clientV61.auth.getSession();
    if(data.session){sessionV61=data.session;break}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!sessionV61){const signed=await clientV61.auth.signInAnonymously();if(signed.error)throw signed.error;sessionV61=signed.data.session}
}

async function fetchDbRowsV61(){
  const {data,error}=await clientV61.from('watchlist').select('*').eq('user_id',sessionV61.user.id).order('created_at',{ascending:true});
  if(error)throw error;dbRowsV61=data||[];return dbRowsV61;
}

async function seedOriginalV61(force=false){
  await fetchDbRowsV61();
  const seedKey=`asiri_original_favorites_${sessionV61.user.id}_v1`;
  if(!force&&localStorage.getItem(seedKey)==='done')return 0;
  const existing=new Set(dbRowsV61.map(x=>String(x.symbol).toUpperCase()));
  const missing=FAVORITES_V61.filter(x=>!existing.has(x.symbol)).map(x=>({user_id:sessionV61.user.id,symbol:x.symbol,notes:`المفضلة الأصلية · ${x.theme}`}));
  if(missing.length){const {error}=await clientV61.from('watchlist').insert(missing);if(error)throw error}
  localStorage.setItem(seedKey,'done');
  await fetchDbRowsV61();
  return missing.length;
}

async function analyzeOneV61(symbol){
  try{const r=await fetch(`/api/analyze/${encodeURIComponent(symbol)}?t=${Date.now()}`,{cache:'no-store'});const data=await r.json();if(!r.ok)throw new Error(data.error||'تعذر التحليل');return data}catch(error){return {symbol,error:error.message}}
}

async function mapPoolV61(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){while(next<items.length){const i=next++;out[i]=await worker(items[i],i)}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;
}

async function loadV61(refreshAnalysis=true){
  const status=$v61('#fav61Status');if(status)status.textContent='جارٍ تحديث المفضلة الذكية…';
  await fetchDbRowsV61();
  const dbMap=new Map(dbRowsV61.map(x=>[String(x.symbol).toUpperCase(),x]));
  const ordered=[...FAVORITES_V61.map(x=>x.symbol),...dbRowsV61.map(x=>String(x.symbol).toUpperCase()).filter(x=>!ORIGINAL_SYMBOLS_V61.has(x))];
  const unique=[...new Set(ordered)];
  if(refreshAnalysis){
    const analyses=await mapPoolV61(unique,4,analyzeOneV61);
    rowsV61=unique.map((symbol,i)=>({symbol,db:dbMap.get(symbol),analysis:analyses[i],theme:FAVORITES_V61.find(x=>x.symbol===symbol)?.theme||'إضافة لاحقة'}));
  }else{
    const old=new Map(rowsV61.map(x=>[x.symbol,x.analysis]));
    rowsV61=unique.map(symbol=>({symbol,db:dbMap.get(symbol),analysis:old.get(symbol)||{symbol},theme:FAVORITES_V61.find(x=>x.symbol===symbol)?.theme||'إضافة لاحقة'}));
  }
  if(status)status.textContent=`تم فحص ${rowsV61.length} سهمًا · ${new Date().toLocaleTimeString('ar-SA')}`;
  renderV61();
}

function filteredRowsV61(){
  const search=($v61('#fav61Search')?.value||'').trim().toUpperCase();
  const sharia=shariaMapV61();
  let list=rowsV61.filter(r=>!search||r.symbol.includes(search)||String(r.analysis?.name||'').toUpperCase().includes(search));
  list=list.filter(r=>{
    const cat=categoryV61(r);
    if(activeFilterV61==='ALL')return true;
    if(activeFilterV61==='QUALIFIED')return ['GOLDEN','STRONG'].includes(cat);
    if(activeFilterV61==='SHARIA')return (sharia[r.symbol]||'PENDING')==='PENDING';
    return cat===activeFilterV61;
  });
  const mode=$v61('#fav61Sort')?.value||'PRIORITY';
  const rank={PORTFOLIO:0,GOLDEN:1,STRONG:2,WAIT:3,PENNY:4,OUTSIDE:5,EXCLUDED:6};
  list.sort((a,b)=>{
    if(mode==='SCORE')return Number(b.analysis?.candidateAnalysis?.asiriScore||0)-Number(a.analysis?.candidateAnalysis?.asiriScore||0);
    if(mode==='PRICE')return Number(a.analysis?.price||Infinity)-Number(b.analysis?.price||Infinity);
    if(mode==='CHANGE')return Number(b.analysis?.changePercent||0)-Number(a.analysis?.changePercent||0);
    return (rank[categoryV61(a)]??9)-(rank[categoryV61(b)]??9)||Number(b.analysis?.candidateAnalysis?.asiriScore||0)-Number(a.analysis?.candidateAnalysis?.asiriScore||0);
  });
  return list;
}

function renderSummaryV61(){
  const counts={total:rowsV61.length,portfolio:0,qualified:0,penny:0,outside:0};
  rowsV61.forEach(r=>{const c=categoryV61(r);if(c==='PORTFOLIO')counts.portfolio++;if(['GOLDEN','STRONG'].includes(c))counts.qualified++;if(c==='PENNY')counts.penny++;if(['OUTSIDE','EXCLUDED'].includes(c))counts.outside++});
  const vals={fav61Total:counts.total,fav61Portfolio:counts.portfolio,fav61Qualified:counts.qualified,fav61Penny:counts.penny,fav61Outside:counts.outside};
  Object.entries(vals).forEach(([id,v])=>{const el=$v61('#'+id);if(el)el.textContent=v});
}

function cardV61(row){
  const q=row.analysis||{},a=q.candidateAnalysis||{},cat=categoryV61(row),[catLabel,catClass]=categoryMetaV61(cat);
  const score=Number(a.asiriScore??a.confidence??0),sharia=shariaMapV61()[row.symbol]||'PENDING';
  const price=Number(q.price),change=Number(q.changePercent),rr=Number(a.riskReward||0),vol=Number(a.volumeRatio||q.technicals?.volumeRatio||0);
  return `<article class="fav61-card" data-category="${cat}">
    <div class="fav61-head"><div class="fav61-symbol"><strong>${escV61(row.symbol)}</strong><span>${escV61(q.name||row.theme)}</span></div><span class="fav61-badge ${catClass}">${catLabel}</span></div>
    <div class="fav61-meta"><div><div class="fav61-price">${Number.isFinite(price)?'$'+numV61(price):'السعر غير متاح'}</div><small class="${change>0?'up':change<0?'down':'flat'}">${Number.isFinite(change)?`${change>=0?'+':''}${numV61(change)}%`:'—'}</small></div><div><span>Asiri Score</span><div class="fav61-score">${score||'—'}/100</div></div></div>
    <div class="fav61-meter" style="--score:${Math.max(0,Math.min(100,score))}%"><i></i></div>
    <div class="fav61-badges"><span class="fav61-badge">${escV61(a.decision||'مراقبة')}</span><span class="fav61-badge">R/R ${rr?numV61(rr,1):'—'}</span><span class="fav61-badge">Volume ${vol?numV61(vol,1)+'×':'—'}</span><span class="fav61-badge ${shariaClassV61(sharia)}">${shariaLabelV61(sharia)}</span></div>
    <p class="fav61-note">${escV61(categoryReasonV61(row))}</p>
    <div class="fav61-actions"><button data-fav-analysis="${row.symbol}">فتح التحليل</button><div class="fav61-sharia"><select data-fav-sharia="${row.symbol}"><option value="PENDING" ${sharia==='PENDING'?'selected':''}>بانتظار فحص عوائد</option><option value="APPROVED" ${sharia==='APPROVED'?'selected':''}>تم التحقق: متوافق</option><option value="REJECTED" ${sharia==='REJECTED'?'selected':''}>غير متوافق</option></select><button class="ghost" data-fav-remove="${row.db?.id||''}" ${row.db?.id?'':'disabled'}>إزالة</button></div></div>
  </article>`;
}

function renderV61(){
  renderSummaryV61();
  const list=filteredRowsV61(),box=$v61('#fav61Grid');if(!box)return;
  box.innerHTML=list.length?list.map(cardV61).join(''):'<div class="fav61-empty">لا توجد أسهم مطابقة للتصفية الحالية.</div>';
  $$v61('[data-fav-analysis]',box).forEach(b=>b.onclick=()=>openAnalysisV61(b.dataset.favAnalysis));
  $$v61('[data-fav-sharia]',box).forEach(s=>s.onchange=()=>setShariaV61(s.dataset.favSharia,s.value));
  $$v61('[data-fav-remove]',box).forEach(b=>b.onclick=async()=>{if(!b.dataset.favRemove)return;if(!confirm('إزالة السهم من قائمة المفضلة فقط؟'))return;const {error}=await clientV61.from('watchlist').delete().eq('id',b.dataset.favRemove).eq('user_id',sessionV61.user.id);if(error)return alert(error.message);await loadV61(false)});
}

function openAnalysisV61(symbol){
  $v61('.main-nav button[data-page="analysis"]')?.click();
  setTimeout(()=>{const input=$v61('#stockQuery');if(input)input.value=symbol;$v61('#stockSearch')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))},80);
}

function mountV61(){
  const page=$v61('#watchlist');if(!page||$v61('#fav61Root'))return;
  const title=page.querySelector('.page-title h2');if(title)title.textContent='المفضلة الذكية';
  const eyebrow=page.querySelector('.page-title .eyebrow');if(eyebrow)eyebrow.textContent='ORIGINAL FAVORITES · INTELLIGENT FILTER';
  page.querySelector('#watchForm')?.classList.add('fav61-legacy-hidden');
  page.querySelector('#watchStatus')?.classList.add('fav61-legacy-hidden');
  page.querySelector('#watchRows')?.classList.add('fav61-legacy-hidden');
  page.insertAdjacentHTML('beforeend',`<div id="fav61Root" class="fav61-shell">
    <div class="fav61-hero"><section class="panel"><span class="eyebrow">ASIRI FAVORITES ENGINE</span><h3>قائمة البداية بتصنيف تلقائي</h3><p>يتم تحليل القائمة الأصلية وفق نطاقنا من 1 إلى 10 دولارات، Asiri Score، العائد إلى المخاطرة، المخاطر السعرية، وحالة الفحص الشرعي اليدوية.</p><div class="fav61-filters"><button class="fav61-filter active" data-fav-filter="ALL">الكل</button><button class="fav61-filter" data-fav-filter="PORTFOLIO">محفظتي</button><button class="fav61-filter" data-fav-filter="QUALIFIED">مرشحة قوية</button><button class="fav61-filter" data-fav-filter="WAIT">انتظار</button><button class="fav61-filter" data-fav-filter="PENNY">أقل من $1</button><button class="fav61-filter" data-fav-filter="OUTSIDE">خارج النطاق</button><button class="fav61-filter" data-fav-filter="EXCLUDED">مستبعدة</button><button class="fav61-filter" data-fav-filter="SHARIA">بانتظار عوائد</button></div></section><aside class="fav61-rule-card"><span>قاعدة التنفيذ</span><h3>لا شراء لمجرد وجود السهم في المفضلة</h3><p>Golden Alert فقط بعد اكتمال الشروط، ثم التحقق من التوافق الشرعي في عوائد.</p></aside></div>
    <section class="fav61-summary"><div><span>إجمالي القائمة</span><b id="fav61Total">0</b></div><div><span>في المحفظة</span><b id="fav61Portfolio">0</b></div><div><span>مرشحة قوية</span><b id="fav61Qualified">0</b></div><div><span>عالية المخاطر</span><b id="fav61Penny">0</b></div><div><span>خارج الاستراتيجية</span><b id="fav61Outside">0</b></div></section>
    <section class="panel"><div class="fav61-toolbar"><input id="fav61Search" placeholder="بحث بالرمز أو اسم الشركة"><select id="fav61Sort"><option value="PRIORITY">ترتيب حسب الأولوية</option><option value="SCORE">الأعلى Asiri Score</option><option value="PRICE">الأقل سعرًا</option><option value="CHANGE">الأعلى تغيرًا</option></select><div><button id="fav61Refresh">تحديث التحليل</button> <button id="fav61Restore" class="secondary">استعادة قائمة البداية</button></div></div><div id="fav61Status" class="status">جارٍ التجهيز…</div></section>
    <section id="fav61Grid" class="fav61-grid"><div class="fav61-empty fav61-loading">جارٍ تحميل القائمة الأصلية…</div></section>
    <section class="panel"><h3>إضافة سهم جديد للمفضلة</h3><form id="fav61AddForm" class="inline-form"><input id="fav61AddSymbol" maxlength="12" required placeholder="رمز السهم"><input id="fav61AddNote" placeholder="ملاحظة اختيارية"><button>إضافة وتحليل</button></form><div id="fav61AddStatus" class="status"></div></section>
    <p class="dashboard-disclaimer">التصفية فنية وإدارية ولا تمثل حكمًا شرعيًا أو ضمانًا للربح. يجب التحقق في تطبيق عوائد قبل التنفيذ.</p>
  </div>`);

  $$v61('[data-fav-filter]').forEach(b=>b.onclick=()=>{activeFilterV61=b.dataset.favFilter;$$v61('[data-fav-filter]').forEach(x=>x.classList.toggle('active',x===b));renderV61()});
  $v61('#fav61Search').addEventListener('input',renderV61);$v61('#fav61Sort').addEventListener('change',renderV61);
  $v61('#fav61Refresh').onclick=()=>loadV61(true).catch(showErrorV61);
  $v61('#fav61Restore').onclick=async()=>{try{const n=await seedOriginalV61(true);await loadV61(true);$v61('#fav61Status').textContent=`تمت استعادة ${n} أسهم مفقودة من قائمة البداية.`}catch(e){showErrorV61(e)}};
  $v61('#fav61AddForm').addEventListener('submit',async e=>{e.preventDefault();const symbol=$v61('#fav61AddSymbol').value.trim().toUpperCase();const notes=$v61('#fav61AddNote').value.trim();const {error}=await clientV61.from('watchlist').upsert({user_id:sessionV61.user.id,symbol,notes},{onConflict:'user_id,symbol'});if(error)return $v61('#fav61AddStatus').textContent=error.message;e.target.reset();$v61('#fav61AddStatus').textContent=`تمت إضافة ${symbol}`;await loadV61(true)});
}

function showErrorV61(error){const s=$v61('#fav61Status');if(s)s.textContent=`تعذر التحديث: ${error.message||error}`;console.error('favorites-v61',error)}

async function initV61(){
  try{mountV61();await initClientV61();const added=await seedOriginalV61(false);await loadV61(true);if(added)$v61('#fav61Status').textContent=`تمت إضافة قائمة البداية: ${added} سهمًا، ثم تحليلها وتصنيفها.`;$v61('.main-nav button[data-page="watchlist"]')?.addEventListener('click',()=>loadV61(true).catch(showErrorV61))}catch(error){showErrorV61(error)}
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initV61):initV61();