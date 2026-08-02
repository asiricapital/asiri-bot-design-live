const pc662Q=(selector)=>document.querySelector(selector);
const pc662Money=(value,currency='USD')=>Number.isFinite(Number(value))?new Intl.NumberFormat('en-US',{style:'currency',currency:currency||'USD',maximumFractionDigits:2}).format(Number(value)):'—';
const pc662Number=(value)=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const pc662State={supabase:null,session:null,timer:null,busy:false,enabled:true,lastPrices:new Map(),lastSuccessAt:null};

async function pc662Session(){
  if(pc662State.supabase&&pc662State.session)return pc662State.session;
  const config=await fetch('/api/config',{cache:'no-store'}).then((response)=>response.json());
  if(!config.supabase?.enabled)throw new Error('Supabase غير متصل');
  pc662State.supabase=window.supabase.createClient(config.supabase.url,config.supabase.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  pc662State.session=(await pc662State.supabase.auth.getSession()).data.session;
  if(!pc662State.session){
    const signed=await pc662State.supabase.auth.signInAnonymously();
    if(signed.error)throw signed.error;
    pc662State.session=signed.data.session;
  }
  return pc662State.session;
}

async function pc662Api(path){
  const session=await pc662Session();
  pc662State.session=(await pc662State.supabase.auth.getSession()).data.session||session;
  const response=await fetch(path,{cache:'no-store',headers:{authorization:`Bearer ${pc662State.session.access_token}`}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`تعذر طلب الأسعار (${response.status})`);
  return data;
}

function pc662EnsureBar(){
  const page=pc662Q('#portfoliocenter');
  if(!page||pc662Q('#pc662LiveBar'))return;
  const bar=document.createElement('section');
  bar.id='pc662LiveBar';
  bar.className='panel';
  bar.innerHTML=`
    <div class="pc662-head">
      <div class="pc662-title"><i id="pc662Pulse" class="pc662-pulse"></i><div><span class="eyebrow">ASIRI LIVE PRICE ENGINE</span><h3>أسعار Saxo السريعة</h3><small id="pc662Message">جارٍ تجهيز محرك الأسعار…</small></div></div>
      <div class="pc662-badges"><span id="pc662FeedBadge" class="pc662-badge">STARTING</span><span class="pc662-badge">READ ONLY</span><button id="pc662Toggle" class="secondary" type="button">إيقاف التحديث</button></div>
    </div>
    <div class="pc662-stats">
      <div class="pc662-stat"><span>دورة التحديث</span><b id="pc662RefreshRate">2 ثانية</b><small>تحديث سريع آمن</small></div>
      <div class="pc662-stat"><span>تأخير المصدر</span><b id="pc662Delay">—</b><small id="pc662Rights">بانتظار فحص الحقوق</small></div>
      <div class="pc662-stat"><span>الأسهم المحدثة</span><b id="pc662Count">0</b><small id="pc662Errors">لا توجد أخطاء</small></div>
      <div class="pc662-stat"><span>آخر نبضة</span><b id="pc662Last">—</b><small>Saxo InfoPrice</small></div>
    </div>`;
  const title=page.querySelector('.page-title');
  if(title)title.insertAdjacentElement('afterend',bar);else page.prepend(bar);
  pc662Q('#pc662Toggle')?.addEventListener('click',()=>{
    pc662State.enabled=!pc662State.enabled;
    pc662Q('#pc662Toggle').textContent=pc662State.enabled?'إيقاف التحديث':'تشغيل التحديث';
    pc662Q('#pc662Message').textContent=pc662State.enabled?'تم تشغيل التحديث السريع.':'تم إيقاف التحديث مؤقتًا.';
    if(pc662State.enabled)pc662Tick();
  });
}

function pc662SetFeed(state,message){
  const pulse=pc662Q('#pc662Pulse');
  const badge=pc662Q('#pc662FeedBadge');
  if(pulse)pulse.className=`pc662-pulse ${state}`;
  if(badge){badge.className=`pc662-badge ${state}`;badge.textContent=state==='live'?'LIVE':state==='delayed'?'DELAYED':'OFFLINE';}
  if(pc662Q('#pc662Message'))pc662Q('#pc662Message').textContent=message;
}

function pc662RowMap(){
  const map=new Map();
  document.querySelectorAll('#pc661Table tbody tr').forEach((row)=>{
    const symbol=String(row.querySelector('td')?.textContent||'').trim().toUpperCase();
    if(symbol)map.set(symbol,row);
  });
  return map;
}

function pc662Apply(data){
  pc662EnsureBar();
  const prices=Array.isArray(data.prices)?data.prices:[];
  const delay=Number(data.maxDelayMinutes||0);
  const state=prices.length?(delay===0?'live':'delayed'):'down';
  pc662SetFeed(state,prices.length?(delay===0?'الأسعار تصل من Saxo دون تأخير معلن.':`Saxo يعلن تأخيرًا قدره ${delay} دقيقة.`):'لم تصل أسعار من Saxo حتى الآن.');
  pc662Q('#pc662Delay').textContent=prices.length?(delay===0?'0 دقيقة':`${delay} دقيقة`):'—';
  pc662Q('#pc662Rights').textContent=prices.length?(delay===0?'حقوق أسعار فورية متاحة':'يلزم اشتراك بيانات فورية لدى Saxo'):'لم يتم فحص الحقوق';
  pc662Q('#pc662Count').textContent=String(prices.length);
  pc662Q('#pc662Errors').textContent=data.errors?.length?`${data.errors.length} خطأ جزئي`:'لا توجد أخطاء';
  pc662Q('#pc662RefreshRate').textContent=`${Math.round(Number(data.refreshMs||2000)/1000)} ثانية`;
  const now=data.updatedAt?new Date(data.updatedAt):new Date();
  pc662Q('#pc662Last').textContent=now.toLocaleTimeString('ar-SA');
  pc662State.lastSuccessAt=Date.now();

  const rows=pc662RowMap();
  for(const price of prices){
    const symbol=String(price.symbol||'').toUpperCase();
    const row=rows.get(symbol);
    if(!row||!Number.isFinite(Number(price.price)))continue;
    const cells=row.querySelectorAll('td');
    if(cells.length<8)continue;
    const current=Number(price.price);
    const previous=pc662State.lastPrices.get(symbol);
    pc662State.lastPrices.set(symbol,current);
    cells[5].classList.remove('pc662-tick-up','pc662-tick-down');
    void cells[5].offsetWidth;
    if(Number.isFinite(previous)&&current!==previous)cells[5].classList.add(current>previous?'pc662-tick-up':'pc662-tick-down');
    const sourceClass=Number(price.delayedByMinutes||0)===0?'pc662-price-live':'pc662-price-delayed';
    const sourceText=Number(price.delayedByMinutes||0)===0?'SAXO LIVE':`DELAYED ${Number(price.delayedByMinutes||0)}m`;
    cells[5].innerHTML=`$${pc662Number(current)}<small class="pc662-price-meta ${sourceClass}">${sourceText}</small>`;
    cells[6].textContent=pc662Money(price.marketValue,price.currency||data.currency||'USD');
    cells[7].textContent=pc662Money(price.unrealizedPnl,price.currency||data.currency||'USD');
    cells[7].className=Number(price.unrealizedPnl)>0?'up':Number(price.unrealizedPnl)<0?'down':'flat';
  }

  if(data.summary){
    const currency=data.currency||'USD';
    const positionsValue=Number(data.summary.positionsValue||0);
    const pnl=Number(data.summary.unrealizedPnl||0);
    const total=Number(data.summary.estimatedTotalValue||0);
    if(pc662Q('#pc661PositionsValue'))pc662Q('#pc661PositionsValue').textContent=pc662Money(positionsValue,currency);
    if(pc662Q('#pc661Pnl')){pc662Q('#pc661Pnl').textContent=pc662Money(pnl,currency);pc662Q('#pc661Pnl').className=pnl>0?'up':pnl<0?'down':'flat';}
    if(total&&pc662Q('#pc661Total'))pc662Q('#pc661Total').textContent=pc662Money(total,currency);
    if(pc662Q('#pc661Updated'))pc662Q('#pc661Updated').textContent=now.toLocaleString('ar-SA');
    if(pc662Q('#pc661Source'))pc662Q('#pc661Source').textContent=delay===0?'Saxo Live Price':'Saxo Delayed Price';
  }
}

async function pc662Tick(){
  if(pc662State.busy||!pc662State.enabled||document.hidden||!pc662Q('#portfoliocenter.active'))return;
  pc662State.busy=true;
  try{
    const data=await pc662Api('/api/broker/saxo/live-prices');
    pc662Apply(data);
  }catch(error){
    pc662EnsureBar();
    pc662SetFeed('down',`تعذر تحديث أسعار Saxo: ${error.message}`);
  }finally{pc662State.busy=false;}
}

function pc662Start(){
  pc662EnsureBar();
  if(pc662State.timer)clearInterval(pc662State.timer);
  pc662State.timer=setInterval(pc662Tick,2000);
  pc662Tick();
}

function pc662Mount(){
  pc662EnsureBar();
  pc662Q('.main-nav button[data-page="portfoliocenter"]')?.addEventListener('click',()=>setTimeout(pc662Start,350));
  const observer=new MutationObserver(()=>{if(pc662Q('#portfoliocenter.active'))pc662Start();});
  const page=pc662Q('#portfoliocenter');if(page)observer.observe(page,{attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pc662Tick();});
  if(page?.classList.contains('active'))pc662Start();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',pc662Mount,{once:true}):pc662Mount();
