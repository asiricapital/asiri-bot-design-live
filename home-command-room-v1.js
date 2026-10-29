/* One watchlist snapshot for home, radar, portfolio and quote details; no provider reads. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),set=(id,value)=>{const n=$(id);if(n&&n.textContent!==String(value))n.textContent=value;};
 const snapshots=()=>typeof watchlist==='undefined'||typeof stockMarketData==='undefined'?[]:watchlist.map(symbol=>({...stockMarketData[symbol],symbol}));
 const health=item=>window.asiriQuoteDataHealth.classifyQuote(item);
 window.asiriMarketView=Object.freeze({snapshots,health,readOnly:true});
 const radar=window.asiriRadarData.createStore(),cardCache=new Map();let filter='ALL',expanded=false;
 const foldingSelectors=['.command-center-strip','.command-ticker','#practical-dashboard','.command-kpi-deck','.cc-topology','#operational-trust-panel','#unified-control-dashboard','#saxo-watchlist-bridge-v1'];
 const price=n=>Number.isFinite(n)&&n>0?n.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
 const time=value=>{const d=new Date(value||'');return Number.isFinite(d.getTime())?d.toLocaleString('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'وقت غير متاح';};
 const svg=(name,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;};
 function foldDetails(){const body=$('home-details-body');if(!body)return;foldingSelectors.forEach(selector=>document.querySelectorAll(selector).forEach(node=>{if(!body.contains(node))body.append(node);}));}
 function openJourney(symbol){
  if(!snapshots().some(r=>r.symbol===symbol))return;
  $('home-symbol').value=symbol;render();
  if(window.asiriManualPaper?.open){set('home-radar-notice','');window.asiriManualPaper.open(symbol);}
  else set('home-radar-notice','مساحة السهم قيد التجهيز؛ انتظر اكتمال التحميل.');
 }
 function createCard(symbol){
  const button=document.createElement('button');button.type='button';button.className='radar-card';button.dataset.symbol=symbol;
  const make=(className,tag='span')=>{const node=document.createElement(tag);node.className=className;return node;};
  const top=make('radar-card-top'),name=make('radar-card-symbol','b'),status=make('radar-card-status');name.textContent=symbol;top.append(name,status);
  const amount=make('radar-card-price','strong'),chart=make('radar-card-chart'),sample=make('radar-card-sample'),source=make('radar-card-source'),footer=make('radar-card-footer'),stamp=document.createElement('span'),arrow=document.createElement('span');arrow.textContent='↗';footer.append(stamp,arrow);button.append(top,amount,chart,sample,source,footer);
  button.addEventListener('click',()=>openJourney(symbol));
  return{button,status,amount,chart,sample,source,stamp,key:null};
 }
 function renderRadar(){
  const items=radar.select({query:$('home-radar-search').value,filter,sort:$('home-radar-sort').value}),shown=expanded?items:items.slice(0,8),ready=Boolean(window.asiriManualPaper?.open),selected=$('home-symbol').value;
  const cards=shown.map(row=>{
   let card=cardCache.get(row.symbol);if(!card){card=createCard(row.symbol);cardCache.set(row.symbol,card);}
   const described=window.asiriQuoteDataHealth.describeQuote(row.health),key=JSON.stringify([row.price,row.health.state,described.label,row.quoteAt,row.source,row.points]);
   if(card.key!==key){
    card.key=key;card.button.dataset.state=row.health.state;card.status.textContent=described.label;card.amount.textContent=price(row.price);card.amount.classList.toggle('radar-card-empty-price',row.price===null);card.source.textContent=row.source||'مصدر غير متاح';card.source.title=row.source||'مصدر غير متاح';card.stamp.textContent=time(row.quoteAt);card.stamp.title='وقت السعر الأصلي بتوقيت الرياض';card.chart.replaceChildren();
    const path=window.asiriRadarData.miniPath(row.points);
    if(path){const plot=svg('svg',{viewBox:'0 0 140 34',role:'img','aria-label':`${row.symbol}: ${row.points.length} عينة سعر أثناء الزيارة، وليست رسمًا يوميًا`});plot.append(svg('path',{d:path,fill:'none',stroke:'#8ddbc4','stroke-width':1.7,'stroke-linejoin':'round','stroke-linecap':'round'}));card.chart.append(plot);card.sample.textContent=`${row.health.state==='FRESH'?'':'عينات سابقة · '}${row.sampleChange>0?'+':''}${row.sampleChange.toFixed(2)}% · تغيّر العينات المعروضة`;card.sample.title=`${time(row.points[0].at)} — ${time(row.points.at(-1).at)} · ${row.points.length} عينة من ${row.source}`;}
    else{const empty=document.createElement('span');empty.textContent=row.health.state==='FRESH'?'بانتظار عينة أخرى للرسم':'لا عينات حية كافية للرسم';card.chart.append(empty);card.sample.textContent='الحركة اليومية غير متاحة هنا';card.sample.removeAttribute('title');}
    card.button.setAttribute('aria-label',`افتح رحلة ${row.symbol}، السعر ${price(row.price)} بعملة المصدر، ${described.label}`);
   }
   card.button.disabled=!ready;card.button.setAttribute('aria-current',String(row.symbol===selected));return card.button;
  });
  const grid=$('home-radar-grid');for(const node of [...grid.children])if(!cards.includes(node))node.remove();cards.forEach((node,i)=>{if(grid.children[i]!==node)grid.insertBefore(node,grid.children[i]||null);});
  for(const symbol of cardCache.keys())if(!snapshots().some(q=>q.symbol===symbol))cardCache.delete(symbol);
  $('home-radar-empty').hidden=items.length!==0;
  set('home-radar-count',`${shown.length} / ${items.length} رمز`);
  const more=$('home-radar-more');more.hidden=items.length<=8;more.textContent=expanded?'عرض أقل':`عرض بقية الأسهم (${items.length-8})`;
  document.querySelectorAll('[data-radar-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.radarFilter===filter)));
 }
 function renderRoom(counts,rows){
  set('home-total',counts.total);set('home-fresh',counts.fresh);set('home-review',counts.review);
  const circumference=2*Math.PI*79,arcs=$('home-health-arcs');arcs.replaceChildren();let offset=0;
  for(const[key,color]of [['fresh','#9ae8d0'],['delayed','#e2c48d'],['stale','#d99f97'],['missing','#4c6578']]){
   const length=counts.total?counts[key]/counts.total*circumference:0;
   if(length>0)arcs.append(svg('circle',{cx:100,cy:100,r:79,fill:'none',stroke:color,'stroke-width':13,'stroke-dasharray':`${length} ${circumference-length}`,'stroke-dashoffset':-offset}));offset+=length;
  }
  $('home-health-ring').setAttribute('aria-label',`${counts.total} رمزًا: ${counts.fresh} حديثة، ${counts.delayed} متأخرة، ${counts.stale} قديمة، ${counts.missing} ناقصة. هذا وصف للبيانات وليس تصنيفًا للسوق.`);
  const breakdown=$('home-health-breakdown');breakdown.replaceChildren();for(const[label,value]of [['متأخرة / إغلاق',counts.delayed],['قديمة',counts.stale],['ناقصة',counts.missing]]){const span=document.createElement('span'),b=document.createElement('b');span.textContent=label;b.textContent=value;span.append(b);breakdown.append(span);}
  const allClosed=rows.length>0&&rows.every(q=>health(q).reasonCode==='MARKET_CLOSED');
  set('home-room-label',!counts.total?'لا توجد رموز':allClosed?'قراءات آخر إغلاق':counts.fresh===counts.total?'القراءات حديثة':'تحتاج مراجعة الوقت');
  set('home-health-note',allClosed?'المصدر متصل والقراءات لآخر إغلاق. الحلقة تصف بيانات قائمتك، ولا تقيس اتجاه السوق.':'الحلقة تصف حداثة بيانات قائمتك، وليست مؤشر اتجاه للسوق أو احتمال ربح.');
 }
 function render(){
  const rows=snapshots(),select=$('home-symbol');if(!select)return;
  const symbols=rows.map(r=>r.symbol),key=JSON.stringify(symbols),selected=select.value;
  if(select.dataset.symbols!==key){select.replaceChildren();select.dataset.symbols=key;for(const symbol of symbols.length?symbols:['']){const o=document.createElement('option');o.value=symbol;o.textContent=symbol||'لا توجد رموز';select.append(o);}if(symbols.includes(selected))select.value=selected;}
  const item=rows.find(r=>r.symbol===select.value)||{},current=health(item),described=window.asiriQuoteDataHealth.describeQuote(current);
  radar.ingest(rows,health);const counts=radar.counts();renderRoom(counts,rows);
  set('home-ticker',item.symbol||'—');set('home-price',price(item.price==null||item.price===''?NaN:Number(item.price)));set('home-state',described.label);$('home-state').dataset.state=current.state;set('home-source',item.source||'غير متاح');set('home-source-status',current.sourceStatus||'الاتصال غير مؤكد');set('home-time',time(item.updatedAt||item.time));
  set('home-next',current.state==='FRESH'?'قراءة حديثة. افتح رحلة السهم لمراجعة الرسم والمخاطرة والخطة؛ السعر وحده لا يكفي.':current.reasonCode==='MARKET_CLOSED'?'آخر إغلاق للمرجع. يمكنك استعراض الرحلة؛ تأكيد التجربة يحتاج قراءة حديثة بجلسة نشطة.':'راجع المصدر والوقت قبل الاعتماد على الرقم. البيانات القديمة أو الناقصة لا تصبح حية عند تحديث الصفحة.');
  $('home-open-analysis').disabled=!item.symbol;$('home-open-paper').disabled=!item.symbol||!window.asiriManualPaper?.open;
  renderRadar();const quality=document.querySelector('.command-center-strip .cc-status:last-child b');if(quality)quality.textContent=`${counts.fresh}/${rows.length} حديثة`;foldDetails();
 }
 function init(){
  set('home-date',new Intl.DateTimeFormat('ar-SA',{calendar:'gregory',timeZone:'Asia/Riyadh',dateStyle:'medium'}).format(new Date()));
  $('home-open-paper')?.addEventListener('click',()=>openJourney($('home-symbol').value));
  $('home-open-health')?.addEventListener('click',()=>{const details=$('home-details');if(details)details.open=true;window.asiriOperationalTrust?.refresh?.();$('operational-trust-panel')?.scrollIntoView({block:'start',behavior:'smooth'});});
  $('home-symbol')?.addEventListener('change',render);
  $('home-open-analysis')?.addEventListener('click',()=>{const s=$('technicals-symbol');if(s)s.value=$('home-symbol').value;if(typeof switchMainTab==='function')switchMainTab('technicals');if(typeof refreshTechnicalAnalysis==='function')refreshTechnicalAnalysis();$('sec-technicals')?.scrollIntoView({block:'start',behavior:'smooth'});});
  $('home-open-portfolio')?.addEventListener('click',()=>{if(typeof switchMainTab==='function')switchMainTab('portfolio');const target=$('evidence-symbol');if(target&&[...target.options].some(o=>o.value===$('home-symbol').value)){target.value=$('home-symbol').value;target.dispatchEvent(new Event('change'));}$('sec-portfolio')?.scrollIntoView({block:'start',behavior:'smooth'});});
  $('home-details')?.addEventListener('toggle',()=>window.dispatchEvent(new Event('resize')));
  $('asiri-home').querySelector('a[href="#home-details"]')?.addEventListener('click',()=>{$('home-details').open=true;});
  $('home-radar-search').addEventListener('input',()=>{expanded=false;renderRadar();});$('home-radar-sort').addEventListener('change',()=>{expanded=false;renderRadar();});
  document.querySelectorAll('[data-radar-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.radarFilter;expanded=false;renderRadar();}));$('home-radar-more').addEventListener('click',()=>{expanded=!expanded;renderRadar();});
  window.addEventListener('asiri:quotes-rendered',render);window.addEventListener('asiri:paper-ready',render);render();
  window.setInterval(()=>{if(!document.hidden)render();},5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render();});window.addEventListener('pageshow',render);
 }
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();
