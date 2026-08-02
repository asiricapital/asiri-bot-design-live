const q=(s)=>document.querySelector(s);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c='USD')=>Number.isFinite(Number(v))?new Intl.NumberFormat('en-US',{style:'currency',currency:c||'USD',maximumFractionDigits:2}).format(Number(v)):'—';
const num=(v)=>Number.isFinite(Number(v))?Number(v).toLocaleString('en-US',{maximumFractionDigits:2}):'—';
let sb=null,session=null,broker=null,snapshot=null,local=[],recon=null,busy=false;

async function startSession(){
  if(sb&&session)return;
  const cfg=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
  if(!cfg.supabase?.enabled)throw new Error('Supabase غير متصل');
  sb=window.supabase.createClient(cfg.supabase.url,cfg.supabase.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  session=(await sb.auth.getSession()).data.session;
  if(!session){const signed=await sb.auth.signInAnonymously();if(signed.error)throw signed.error;session=signed.data.session}
}

async function api(url){
  session=(await sb.auth.getSession()).data.session||session;
  const r=await fetch(url,{cache:'no-store',headers:{authorization:`Bearer ${session.access_token}`}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d.error||`تعذر الطلب (${r.status})`),{status:r.status});
  return d;
}

async function loadLocal(){
  const result=await sb.from('portfolio').select('symbol,quantity,avg_price').eq('user_id',session.user.id).order('created_at',{ascending:true});
  if(result.error)throw result.error;local=result.data||[];
}

function set(id,text,cls=''){const el=q('#'+id);if(!el)return;el.textContent=text;if(cls)el.className=cls}
function src(v){return ({'saxo-api':'Saxo API فعلي','mock-matched':'Mock مطابق','mock-variance':'Mock فروقات','mock-empty':'Mock فارغ'})[v]||v||'—'}
function label(v){return ({MATCH:'متطابق',CHANGE:'مختلف',NEW:'جديد في Saxo',MISSING:'مفقود من Saxo'})[v]||v}

function render(){
  const b=snapshot?.balance||{},currency=b.currency||'USD',rows=recon?.rows||[];
  const counts={MATCH:0,CHANGE:0,NEW:0,MISSING:0};rows.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  const issues=counts.CHANGE+counts.NEW+counts.MISSING;
  const localCost=local.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.avg_price||0),0);
  const positionMap=new Map((snapshot?.positions||[]).map(p=>[String(p.symbol||'').toUpperCase(),p]));
  const positionsValue=(snapshot?.positions||[]).reduce((s,p)=>s+Number(p.marketValue||0),0);
  const pnl=Number(b.unrealizedPnl||0)||(snapshot?.positions||[]).reduce((s,p)=>s+Number(p.unrealizedPnl||0),0);

  set('pc661Total',money(b.totalValue,currency));set('pc661Currency',currency);
  set('pc661Available',money(b.cashAvailableForTrading,currency));set('pc661Cash','الرصيد النقدي '+money(b.cashBalance,currency));
  set('pc661PositionsValue',money(b.nonMarginPositionsValue||positionsValue,currency));set('pc661SaxoCount',(snapshot?.positions||[]).length+' مركز');
  set('pc661Pnl',money(pnl,currency),pnl>0?'up':pnl<0?'down':'flat');
  set('pc661AsiriCost',money(localCost,'USD'));set('pc661AsiriCount',local.length+' مركز');
  set('pc661MatchState',!snapshot?'بانتظار لقطة':issues?'تحتاج مراجعة':'متطابقة',!snapshot?'flat':issues?'down':'up');
  set('pc661MatchCounts','مطابق '+counts.MATCH+' · مختلف '+counts.CHANGE+' · جديد '+counts.NEW+' · مفقود '+counts.MISSING);
  set('pc661Updated',snapshot?.updatedAt?new Date(snapshot.updatedAt).toLocaleString('ar-SA'):'—');set('pc661Source',src(snapshot?.source));
  set('pc661Connection',broker?.connected?'متصل':'غير متصل',broker?.connected?'up':'down');
  set('pc661Storage',broker?.storageMode==='supabase-encrypted'?'Supabase مشفّر':broker?.storageMode||'—');
  set('pc661Headline',!snapshot?'المركز جاهز لأول قراءة من Saxo':issues?'توجد فروقات تحتاج مراجعة':'المحفظة متطابقة وآمنة');

  const alerts=[
    [broker?.connected?'good':'bad',broker?.connected?'اتصال Saxo جاهز':'اتصال Saxo غير متاح'],
    [broker?.storageMode==='supabase-encrypted'?'good':'bad',broker?.storageMode==='supabase-encrypted'?'التخزين الدائم مشفّر':'التخزين يحتاج مراجعة'],
    [!snapshot?'warn':issues?'warn':'good',!snapshot?'لا توجد لقطة محفظة بعد':issues?'ظهرت فروقات تحتاج مراجعة يدوية':'لا توجد فروقات في المراكز']
  ];
  q('#pc661Alerts').innerHTML=alerts.map(a=>`<div class="pc661-alert ${a[0]}">${esc(a[1])}</div>`).join('');
  q('#pc661Accounts').innerHTML=(snapshot?.accounts||[]).length?snapshot.accounts.map(a=>`<div class="pc661-account"><b>${esc(a.accountId||'حساب Saxo')}</b><small>${esc(a.accountType||'—')} · ${esc(a.currency||'—')} · ${a.active?'نشط':'غير نشط'}</small></div>`).join(''):'<p class="muted">لا توجد بيانات حساب في اللقطة الحالية.</p>';

  q('#pc661Table').innerHTML=rows.length?`<table class="technical-table"><thead><tr><th>السهم</th><th>Asiri كمية</th><th>Saxo كمية</th><th>Asiri متوسط</th><th>Saxo متوسط</th><th>السعر</th><th>القيمة</th><th>الربح/الخسارة</th><th>المطابقة</th></tr></thead><tbody>${rows.map(r=>{const p=positionMap.get(String(r.symbol||'').toUpperCase())||{},rp=Number(p.unrealizedPnl||0);return `<tr><td><b>${esc(r.symbol)}</b></td><td>${r.asiri?num(r.asiri.quantity):'—'}</td><td>${r.saxo?num(r.saxo.quantity):'—'}</td><td>${r.asiri?'$'+num(r.asiri.averagePrice):'—'}</td><td>${r.saxo?'$'+num(r.saxo.averagePrice):'—'}</td><td>${p.currentPrice?'$'+num(p.currentPrice):'—'}</td><td>${money(p.marketValue,p.currency||currency)}</td><td class="${rp>0?'up':rp<0?'down':'flat'}">${money(rp,p.currency||currency)}</td><td><span class="pc661-state ${String(r.status||'').toLowerCase()}">${esc(label(r.status))}</span></td></tr>`}).join('')}</tbody></table>`:'<p class="muted">لا توجد مراكز في اللقطة الحالية. لم يتم تعديل أي مركز محلي.</p>';
}

async function load(force=false){
  if(busy)return;busy=true;const note=q('#pc661Status');
  try{
    note.textContent=force?'جارٍ قراءة Saxo الفعلية في وضع القراءة فقط…':'جارٍ تحميل مركز المحفظة…';
    await startSession();await Promise.all([loadLocal(),api('/api/broker/status').then(d=>broker=d)]);
    if(force){if(!broker?.connected)throw new Error('اربط Saxo SIM أولًا من صفحة ربط الوسطاء');snapshot=await api('/api/broker/saxo/snapshot')}
    else{try{snapshot=await api('/api/broker/shadow/latest')}catch(e){if(e.status!==404)throw e;snapshot=null}}
    if(snapshot){try{recon=await api('/api/assistant/reconciliation')}catch{recon=null}}else recon=null;
    render();note.textContent=snapshot?`تم تحميل ${(snapshot.positions||[]).length} مركزًا دون تنفيذ أي صفقة.`:'المركز جاهز. استخدم قراءة Saxo الفعلية للحصول على أحدث البيانات.';
  }catch(e){note.textContent='تعذر تحديث مركز المحفظة: '+e.message;render()}finally{busy=false}
}

function mount(){if(!q('#portfoliocenter'))return;q('#pc661Refresh')?.addEventListener('click',()=>load(false));q('#pc661ReadSaxo')?.addEventListener('click',()=>load(true));q('.main-nav button[data-page="portfoliocenter"]')?.addEventListener('click',()=>load(false))}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',mount,{once:true}):mount();
