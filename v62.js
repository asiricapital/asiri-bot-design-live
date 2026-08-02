const $b62=(s,r=document)=>r.querySelector(s);
const $$b62=(s,r=document)=>[...r.querySelectorAll(s)];
const moneyB62=(v,c='USD')=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD',maximumFractionDigits:2}).format(Number(v)):'—';
const numB62=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const escB62=(v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const canonicalB62=(v)=>String(v||'').trim().toUpperCase().split(':')[0].replace(/[^A-Z0-9.-]/g,'');
let brokerStatusB62=null,brokerSnapshotB62=null,portfolioRowsB62=[],supabaseB62=null,sessionB62=null;

async function initSupabaseB62(){
  const cfg=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
  if(!cfg.supabase?.enabled)throw new Error('Supabase غير متصل');
  supabaseB62=window.supabase.createClient(cfg.supabase.url,cfg.supabase.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  for(let i=0;i<8;i++){
    const {data}=await supabaseB62.auth.getSession();
    if(data.session){sessionB62=data.session;break}
    await new Promise(r=>setTimeout(r,400));
  }
  if(!sessionB62){const signed=await supabaseB62.auth.signInAnonymously();if(signed.error)throw signed.error;sessionB62=signed.data.session}
}

async function authHeadersB62(json=false){
  const {data}=await supabaseB62.auth.getSession();
  sessionB62=data.session||sessionB62;
  if(!sessionB62?.access_token)throw new Error('جلسة المستخدم غير جاهزة');
  return {authorization:`Bearer ${sessionB62.access_token}`,...(json?{'content-type':'application/json'}:{})};
}

async function brokerFetchB62(url,options={}){
  const headers={...(options.headers||{}),...(await authHeadersB62(options.body!=null))};
  const r=await fetch(url,{cache:'no-store',...options,headers});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`تعذر الطلب (${r.status})`);
  return d;
}

async function loadPortfolioB62(){
  if(!sessionB62)return [];
  const {data,error}=await supabaseB62.from('portfolio').select('*').eq('user_id',sessionB62.user.id).order('created_at',{ascending:true});
  if(error)throw error;portfolioRowsB62=data||[];return portfolioRowsB62;
}

async function loadBrokerStatusB62(){
  brokerStatusB62=await brokerFetchB62('/api/broker/status');renderBrokerStatusB62();return brokerStatusB62;
}

function workflowRowsB62(){
  const s=brokerStatusB62||{};
  const hasSnapshot=Boolean(brokerSnapshotB62);
  return [
    ['2','تثبيت نسخة Asiri Capital','فرع رجوع ثابت محفوظ','done'],
    ['3','Broker Gateway','مصادقة المستخدم وحماية القراءة فقط جاهزة','done'],
    ['4','تطبيق Saxo SIM',s.appConfigured?'بيانات التطبيق مضافة':'الاختبار التجريبي متاح الآن؛ OAuth ينتظر App Key',s.appConfigured?'done':'active'],
    ['5','اختبار الرصيد والمراكز',s.connected?'Saxo API جاهز للقراءة':hasSnapshot?'تم اختبار الرصيد والمراكز ببيانات SIM تجريبية':'اختبار Mock جاهز دون حساب Saxo','active'],
    ['6','Shadow Mode',hasSnapshot?'المقارنة تعمل دون تعديل المحفظة':'جاهز لأول سيناريو تجريبي',hasSnapshot?'done':'active'],
    ['7','طلب تطبيق LIVE','يبقى مرتبطًا بقبول وتمويل الحساب','blocked'],
    ['8','الربط الحقيقي','يبدأ بعد اعتماد تطبيق LIVE','blocked'],
    ['9','موصل ChatGPT','واجهات broker-status وreconciliation جاهزة للقراءة','done']
  ];
}

function sourceLabelB62(source){
  return ({'saxo-api':'Saxo API','mock-matched':'Mock مطابق','mock-variance':'Mock فروقات','mock-empty':'Mock فارغ'})[source]||source||'—';
}
function storageLabelB62(mode){
  return ({'supabase-encrypted':'Supabase مشفّر','memory-fallback':'ذاكرة مؤقتة — يلزم migration/key','memory-only':'ذاكرة مؤقتة'})[mode]||mode||'—';
}

function renderBrokerStatusB62(){
  const s=brokerStatusB62||{};
  const connected=$b62('#broker62Connected');if(connected){connected.textContent=s.connected?'متصل وجاهز':'غير متصل';connected.className=s.connected?'up':'flat'}
  const env=$b62('#broker62Env');if(env)env.textContent=(s.environment||'sim').toUpperCase();
  const mode=$b62('#broker62Mode');if(mode)mode.textContent='قراءة فقط';
  const last=$b62('#broker62Last');if(last)last.textContent=s.lastSnapshotAt?new Date(s.lastSnapshotAt).toLocaleString('ar-SA'):'لا توجد لقطة';
  const storage=$b62('#broker62Storage');if(storage)storage.textContent=storageLabelB62(s.storageMode);
  const token=$b62('#broker62Token');if(token)token.textContent=s.tokenExpiresAt?new Date(s.tokenExpiresAt).toLocaleTimeString('ar-SA'):s.connected?'متاح':'غير متاح';
  const source=$b62('#broker62Source');if(source)source.textContent=sourceLabelB62(s.lastSnapshotSource);
  const connect=$b62('#broker62Connect');if(connect){connect.disabled=!s.appConfigured;connect.textContent=s.connected?'إعادة تفويض Saxo SIM':'ربط Saxo SIM'}
  const config=$b62('#broker62ConfigState');
  if(config){
    if(s.appConfigured&&s.storageMode==='supabase-encrypted')config.textContent='OAuth وPKCE والتخزين المشفّر جاهزة.';
    else if(s.appConfigured)config.textContent='تطبيق SIM جاهز، لكن التخزين الدائم يحتاج migration وBROKER_TOKEN_ENCRYPTION_KEY.';
    else config.textContent='يمكن اختبار Shadow Mode الآن. الربط الرسمي ينتظر SAXO_APP_KEY وSAXO_REDIRECT_URI.';
  }
  const storageWarning=$b62('#broker62StorageWarning');
  if(storageWarning){storageWarning.textContent=s.storageError?`ملاحظة التخزين: ${s.storageError}`:'';storageWarning.classList.toggle('broker62-hidden',!s.storageError)}
  const steps=$b62('#broker62Steps');if(steps)steps.innerHTML=workflowRowsB62().map(([n,title,detail,state])=>`<div class="broker62-step ${state}"><i>${state==='done'?'✓':n}</i><div><b>${escB62(title)}</b><small>${escB62(detail)}</small></div><span class="${state==='done'?'up':state==='active'?'broker62-active-label':'flat'}">${state==='done'?'جاهز':state==='active'?'قابل للتنفيذ':'بانتظار شرط خارجي'}</span></div>`).join('');
}

function compareB62(){
  if(!brokerSnapshotB62)return [];
  const local=new Map(portfolioRowsB62.map(p=>[canonicalB62(p.symbol),{symbol:canonicalB62(p.symbol),quantity:Number(p.quantity||0),avg:Number(p.avg_price||0),source:'Asiri'}]));
  const remote=new Map((brokerSnapshotB62.positions||[]).map(p=>[canonicalB62(p.symbol),{...p,symbol:canonicalB62(p.symbol),quantity:Number(p.quantity||0),avg:Number(p.averagePrice||0),source:'Saxo'}]));
  const symbols=[...new Set([...local.keys(),...remote.keys()])].filter(Boolean).sort();
  return symbols.map(symbol=>{
    const a=local.get(symbol),s=remote.get(symbol);let status='MATCH';
    if(!a)status='NEW';else if(!s)status='MISSING';else if(Math.abs(a.quantity-s.quantity)>1e-6||Math.abs(a.avg-s.avg)>0.01)status='CHANGE';
    return {symbol,asiri:a,saxo:s,status};
  });
}

function statusTextB62(status){return ({MATCH:'متطابق',NEW:'جديد في Saxo',MISSING:'غير موجود في Saxo',CHANGE:'اختلاف'})[status]||status}
function statusClassB62(status){return status==='MATCH'?'broker62-diff-match':status==='MISSING'?'broker62-diff-missing':'broker62-diff-change'}

function renderWarningsB62(){
  const box=$b62('#broker62Warnings');if(!box)return;
  const warnings=brokerSnapshotB62?.validation?.warnings||[];
  box.innerHTML=warnings.length?warnings.map(x=>`<div class="broker62-warning">⚠️ ${escB62(x)}</div>`).join(''):'<div class="broker62-safe">✓ اجتازت اللقطة فحوص السلامة ولم يتم تعديل المحفظة.</div>';
}

function renderSnapshotB62(){
  const snap=brokerSnapshotB62,empty=$b62('#broker62SnapshotEmpty'),content=$b62('#broker62SnapshotContent');
  if(!snap){empty?.classList.remove('broker62-hidden');content?.classList.add('broker62-hidden');renderBrokerStatusB62();return}
  empty?.classList.add('broker62-hidden');content?.classList.remove('broker62-hidden');
  const b=snap.balance||{};
  const vals={broker62Cash:moneyB62(b.cashBalance,b.currency),broker62Available:moneyB62(b.cashAvailableForTrading,b.currency),broker62Total:moneyB62(b.totalValue,b.currency),broker62PositionCount:(snap.positions||[]).length,broker62SnapshotSource:sourceLabelB62(snap.source)};
  Object.entries(vals).forEach(([id,v])=>{const el=$b62('#'+id);if(el)el.textContent=v});
  const rows=compareB62();
  const counts={MATCH:0,NEW:0,CHANGE:0,MISSING:0};rows.forEach(r=>counts[r.status]++);
  const countVals={broker62Match:counts.MATCH,broker62New:counts.NEW,broker62Change:counts.CHANGE,broker62Missing:counts.MISSING};Object.entries(countVals).forEach(([id,v])=>{const el=$b62('#'+id);if(el)el.textContent=v});
  const table=$b62('#broker62DiffTable');if(table)table.innerHTML=rows.length?`<table class="technical-table broker62-table"><thead><tr><th>السهم</th><th>Asiri كمية</th><th>Saxo كمية</th><th>Asiri متوسط</th><th>Saxo متوسط</th><th>النتيجة</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escB62(r.symbol)}</b></td><td>${r.asiri?numB62(r.asiri.quantity):'—'}</td><td>${r.saxo?numB62(r.saxo.quantity):'—'}</td><td>${r.asiri?'$'+numB62(r.asiri.avg):'—'}</td><td>${r.saxo?'$'+numB62(r.saxo.avg):'—'}</td><td class="${statusClassB62(r.status)}"><b>${statusTextB62(r.status)}</b></td></tr>`).join('')}</tbody></table>`:'<p class="muted">لا توجد مراكز في المصدر. لم يتم حذف أو تعديل أي مركز محلي.</p>';
  const raw=$b62('#broker62SaxoPositions');if(raw)raw.innerHTML=(snap.positions||[]).length?(snap.positions||[]).map(p=>`<div class="trade-row"><div><b>${escB62(canonicalB62(p.symbol))}</b><small>${escB62(p.description||p.assetType||'')}</small></div><div><b>${numB62(p.quantity)} سهم</b><small>متوسط $${numB62(p.averagePrice)} · قيمة ${moneyB62(p.marketValue,p.currency||b.currency)}</small></div></div>`).join(''):'<p class="muted">المصدر أعاد صفر مراكز. الحماية تمنع أي حذف تلقائي.</p>';
  renderWarningsB62();renderBrokerStatusB62();
}

async function loadSnapshotB62(){
  const status=$b62('#broker62ActionStatus');status.textContent='جارٍ قراءة Saxo في وضع القراءة فقط…';
  try{
    await loadPortfolioB62();brokerSnapshotB62=await brokerFetchB62('/api/broker/saxo/snapshot');status.textContent=`تمت قراءة ${brokerSnapshotB62.positions?.length||0} مركزًا من Saxo دون تعديل المحفظة.`;await loadBrokerStatusB62();renderSnapshotB62();
  }catch(error){status.textContent=`تعذر اختبار Saxo: ${error.message}`;renderSnapshotB62()}
}

async function loadLatestB62(){
  try{brokerSnapshotB62=await brokerFetchB62('/api/broker/shadow/latest');await loadPortfolioB62();renderSnapshotB62()}catch{/* no previous snapshot */}
}

async function runMockB62(){
  const scenario=$b62('#broker62MockScenario')?.value||'matched';
  const status=$b62('#broker62ActionStatus');status.textContent='جارٍ تشغيل Shadow Mode ببيانات SIM تجريبية…';
  try{
    await loadPortfolioB62();
    brokerSnapshotB62=await brokerFetchB62('/api/broker/mock/snapshot',{method:'POST',body:JSON.stringify({scenario})});
    status.textContent=`نجح الاختبار التجريبي (${sourceLabelB62(brokerSnapshotB62.source)}): ${brokerSnapshotB62.positions?.length||0} مركزًا، دون أي كتابة على المحفظة.`;
    await loadBrokerStatusB62();renderSnapshotB62();
  }catch(error){status.textContent=`فشل الاختبار التجريبي: ${error.message}`}
}

async function connectSaxoB62(){
  const status=$b62('#broker62ActionStatus');status.textContent='جارٍ إنشاء رابط OAuth محمي بـPKCE…';
  try{const data=await brokerFetchB62('/api/broker/saxo/connect-url',{method:'POST',body:JSON.stringify({})});location.assign(data.url)}catch(error){status.textContent=`تعذر بدء OAuth: ${error.message}`}
}

function mountBrokerB62(){
  const page=$b62('#brokergateway');if(!page)return;
  $b62('#broker62RefreshStatus')?.addEventListener('click',()=>loadBrokerStatusB62().catch(e=>$b62('#broker62ActionStatus').textContent=e.message));
  $b62('#broker62Connect')?.addEventListener('click',connectSaxoB62);
  $b62('#broker62Snapshot')?.addEventListener('click',loadSnapshotB62);
  $b62('#broker62RunMock')?.addEventListener('click',runMockB62);
  $b62('#broker62Developer')?.addEventListener('click',()=>window.open('https://www.developer.saxo/accounts/sim/signup','_blank','noopener'));
  $b62('#broker62Disconnect')?.addEventListener('click',async()=>{try{await brokerFetchB62('/api/broker/saxo/disconnect',{method:'POST',body:JSON.stringify({})});brokerSnapshotB62=null;await loadBrokerStatusB62();renderSnapshotB62();$b62('#broker62ActionStatus').textContent='تم قطع الاتصال ومسح الرموز المخزنة لهذا المستخدم.'}catch(error){$b62('#broker62ActionStatus').textContent=error.message}});
  $b62('.main-nav button[data-page="brokergateway"]')?.addEventListener('click',async()=>{await loadBrokerStatusB62().catch(()=>{});await loadLatestB62()});
}

async function initBrokerB62(){
  try{
    mountBrokerB62();await initSupabaseB62();await Promise.all([loadPortfolioB62(),loadBrokerStatusB62()]);await loadLatestB62();
    const params=new URLSearchParams(location.search);if(params.get('broker')==='saxo-connected'){$b62('#broker62ActionStatus').textContent='تم تفويض Saxo بنجاح. جارٍ اختبار اللقطة…';await loadSnapshotB62()}if(params.get('brokerError'))$b62('#broker62ActionStatus').textContent=`خطأ الربط: ${params.get('brokerError')}`;
    renderSnapshotB62();
  }catch(error){const el=$b62('#broker62ActionStatus');if(el)el.textContent=`تعذر تجهيز Broker Gateway: ${error.message}`;console.error('broker-v63',error)}
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initBrokerB62):initBrokerB62();
