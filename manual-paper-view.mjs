import {visualTicket,visualAllocation,chartTradeMarkers} from './manual-paper-visual-model.mjs';
const money=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const usd=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const $=id=>document.getElementById(id),put=(id,value)=>{$(id).textContent=value;};
const date=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(d):'غير متاح';};
const svgNode=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
export function createWorkspaceView(host){
 let lastHistory=null,lastVersion=-1,lastSymbol='',lastPoint=-1;
 function setView(name,focus=false){
  if(!['overview','chart','plan','journal'].includes(name))return;
  host.dataset.view=name;
  host.querySelectorAll('[data-mp-tab]').forEach(b=>{const active=b.dataset.mpTab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;if(active&&focus)b.focus();});
  host.querySelectorAll('[data-mp-panel]').forEach(p=>p.hidden=p.dataset.mpPanel!==name);
 }
 host.querySelectorAll('[data-mp-tab]').forEach(b=>{b.addEventListener('click',()=>setView(b.dataset.mpTab));b.addEventListener('keydown',e=>{const tabs=['overview','chart','plan','journal'];let i=tabs.indexOf(b.dataset.mpTab);if(e.key==='Home')i=0;else if(e.key==='End')i=3;else if(e.key==='ArrowLeft')i=(i+1)%4;else if(e.key==='ArrowRight')i=(i+3)%4;else return;e.preventDefault();setView(tabs[i],true);});});
 host.querySelectorAll('[data-mp-go]').forEach(b=>b.addEventListener('click',()=>{setView(b.dataset.mpGo,true);host.querySelector(`[data-mp-tab="${b.dataset.mpGo}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});}));
 function drawHistory(history,wallet,symbol,point){
  if(history===lastHistory&&wallet.version===lastVersion&&symbol===lastSymbol&&point===lastPoint)return;
  lastHistory=history;lastVersion=wallet.version;lastSymbol=symbol;lastPoint=point;
  const bars=history.filter(p=>Number.isFinite(Number(p.close))&&Number(p.close)>0);
  const markers=chartTradeMarkers(bars,wallet.trades,symbol);
  for(const id of ['manual-overview-chart','manual-chart']){
   const holder=$(id);holder.replaceChildren();
   if(bars.length<2){const empty=document.createElement('div');empty.className='mp-chart-empty';empty.textContent='بانتظار سجل موثق؛ لا رسم افتراضي.';holder.append(empty);continue;}
   const detailed=id==='manual-chart',width=800,height=260,left=12,right=detailed?65:12,top=20,bottom=24;
   const vals=[...bars.map(p=>Number(p.close)),...markers.map(t=>t.fill)],low=Math.min(...vals),high=Math.max(...vals),span=high-low||Math.max(high*.02,.01);
   const x=i=>left+i/(bars.length-1)*(width-left-right),y=v=>top+(high-v)/span*(height-top-bottom);
   const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${symbol} · سجل إغلاقات يومية · ${markers.length} علامة عملية محفوظة`});
   for(let i=0;i<4;i++){const value=low+span*i/3,yy=y(value);svg.append(svgNode('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#253f4c','stroke-width':1,'stroke-dasharray':'3 7'}));if(detailed)svg.append(svgNode('text',{x:width-2,y:yy+4,fill:'#92aebd','font-size':12,'text-anchor':'end'},money(value)));}
   const path=bars.map((p,i)=>`${i?'L':'M'}${x(i)},${y(Number(p.close))}`).join(' ');
   svg.append(svgNode('path',{d:`${path} L${x(bars.length-1)},${height-bottom} L${left},${height-bottom} Z`,fill:'#173e42',opacity:'.35'}));
   svg.append(svgNode('path',{d:path,fill:'none',stroke:'#95e4cd','stroke-width':2.8,'stroke-linejoin':'round','stroke-linecap':'round'}));
   for(const t of markers){const g=svgNode('g',{'data-paper-trade':t.id||t.committedAt}),color=t.side==='BUY'?'#94e7ce':'#edcd8e';g.append(svgNode('title',{},`${t.side==='BUY'?'شراء':'بيع'} ${t.quantity} · ${money(t.fill)} · ${t.committedAt}`));g.append(svgNode('circle',{cx:x(t.index),cy:y(t.fill),r:9,fill:color,stroke:'#07151f','stroke-width':2}));g.append(svgNode('text',{x:x(t.index),y:y(t.fill)+3,fill:'#09221e','font-size':8,'font-weight':700,'text-anchor':'middle'},t.side==='BUY'?'B':'S'));svg.append(g);}
   if(detailed){const i=Math.max(0,Math.min(bars.length-1,Number.isFinite(point)?point:bars.length-1)),xx=x(i),yy=y(Number(bars[i].close));svg.append(svgNode('line',{x1:xx,x2:xx,y1:top,y2:height-bottom,stroke:'#e4c48e','stroke-width':1,'stroke-dasharray':'4 5'}));svg.append(svgNode('circle',{cx:xx,cy:yy,r:4,fill:'#e4c48e'}));}
   holder.append(svg);
  }
  put('manual-history-period',bars.length?`${date(bars[0].date||bars[0].time)} — ${date(bars.at(-1).date||bars.at(-1).time)}`:'بانتظار السجل اليومي');
  put('manual-chart-markers',markers.length?`${markers.length} علامة من سجلك المحلي ضمن الفترة · B شراء · S بيع · موضع العلامة يبين اليوم وسعر التنفيذ الافتراضي، لا توقيتًا داخل اليوم.`:'لا توجد عمليات محلية موثقة ضمن فترة الرسم. لا تُضاف علامات افتراضية.');
 }
 function sync(next){
  const{wallet,quote:q,health,technicals,order,history}=next;
  put('manual-hero-price',money(q?.price));const change=Number.isFinite(q?.changePercent)?q.changePercent:null;
  put('manual-hero-change',change===null?'':`${change>0?'+':''}${change.toFixed(2)}%`);$('manual-hero-change').dataset.direction=change>0?'up':change<0?'down':'flat';
  const healthState=health?.state||'UNAVAILABLE';$('manual-market-state').dataset.state=healthState;
  put('manual-market-state',window.asiriQuoteDataHealth?.describeQuote(health||{state:'UNAVAILABLE'})?.label||'بانتظار القراءة');
  const t=technicals?.indicators;put('manual-trend',t?.trendLabel||'غير متاح');put('manual-rsi',money(t?.rsi14));put('manual-atr',money(t?.atr14));put('manual-trade-count',wallet.trades.length);
  const ticket=visualTicket(wallet,order,q),allocation=visualAllocation(wallet,ticket);
  put('manual-summary-quantity',ticket.available?`${ticket.quantity} سهم`:'—');put('manual-summary-cost',ticket.available?`${usd(ticket.cost)} USD`:'—');
  for(const[id,value]of [['manual-ticket-stop',ticket.levels?ticket.stop:null],['manual-ticket-entry',ticket.available?ticket.entry:null],['manual-ticket-target',ticket.levels?ticket.target:null],['manual-ticket-cash',ticket.available?ticket.cashAfter:null],['manual-ticket-fee',ticket.available?ticket.fee:null],['manual-ticket-risk',ticket.levels?ticket.risk:null]])put(id,value===null?'—':`${id.includes('cash')||id.includes('fee')||id.includes('risk')?usd(value):money(value)}${id.includes('cash')||id.includes('fee')||id.includes('risk')?' USD':''}`);
  put('manual-visual-risk',ticket.levels?`${usd(ticket.risk)} USD`:'—');put('manual-visual-reward',ticket.levels?`${usd(ticket.reward)} USD`:'—');
  const map=$('manual-risk-map');map.replaceChildren();
  if(ticket.levels){
   const lossPct=(ticket.entry-ticket.stop)/(ticket.target-ticket.stop)*100;
   const scale=document.createElement('div');scale.className='mp-map-scale';
   for(const[name,pct]of [['mp-map-loss',lossPct],['mp-map-gain',100-lossPct]]){const el=document.createElement('span');el.className=name;el.style.width=`${pct}%`;scale.append(el);}
   const pin=document.createElement('i');pin.className='mp-map-pin';pin.style.left=`${lossPct}%`;scale.append(pin);map.append(scale);
   const labels=document.createElement('div');labels.className='mp-map-labels';
   for(const[cls,label,value]of [['mp-stop','وقف مخطط',ticket.stop],['mp-entry','دخول تقديري',ticket.entry],['mp-target','هدف مخطط',ticket.target]]){const el=document.createElement('div');el.className=cls;const small=document.createElement('small');small.textContent=label;const b=document.createElement('b');b.dir='ltr';b.textContent=money(value);el.append(small,b);labels.append(el);}map.append(labels);
   put('manual-map-badge',ticket.ratio>0?`${ticket.ratio.toFixed(2)} : 1`:'راجع المستويات');
   put('manual-map-note',`${healthState==='FRESH'?'تقدير من القراءة الحالية':'مسودة مرجعية من آخر سعر متاح'} · ${ticket.capacity?'ضمن حدود المحاكاة':'تحتاج مراجعة حدود الرصيد أو المخاطرة'}. ${next.resistanceWarning?'مقاومة يومية قبل الهدف. ':''}المستويات لا تنفذ تلقائيًا.`);
  }else{const p=document.createElement('p');p.textContent=order.side==='SELL'?'خطة بيع من المملوك فقط؛ لا مستويات شراء أو وقف جديد.':'تظهر خريطة المخاطرة بعد تجهيز مستويات صالحة.';map.append(p);put('manual-map-badge',order.side==='SELL'?'بيع من المملوك':'بانتظار الخطة');put('manual-map-note',ticket.available&&!ticket.ownedEnough?'الكمية تتجاوز المملوك؛ البيع غير متاح.':'اختر السهم وراجع الخطة قبل أي تأكيد.');}
  const bar=$('manual-allocation-bar'),legend=$('manual-allocation-legend');bar.replaceChildren();legend.replaceChildren();
  for(const segment of allocation.segments){const strip=document.createElement('span');strip.style.width=`${segment.pct}%`;strip.style.background=segment.color;bar.append(strip);const item=document.createElement('div');item.className='mp-allocation-item';item.style.setProperty('--segment-color',segment.color);const dot=document.createElement('i'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=segment.label;value.textContent=`${usd(segment.value)} USD`;item.append(dot,label,value);legend.append(item);}
  bar.setAttribute('aria-label',allocation.segments.map(s=>`${s.label} ${usd(s.value)} USD`).join('، '));put('manual-allocation-basis',allocation.projected?'تقدير بعد المسودة':'التوزيع الحالي بالتكلفة');
  put('manual-allocation-note','الأرقام نقد وتكلفة مراكز، وليست قيمة سوقية. توزيع المسودة تقديري؛ لا يغير الرصيد قبل التأكيد.');
  drawHistory(history,wallet,order.symbol,Number($('manual-chart-point').value));
 }
 return{sync,setView,drawHistory};
}
