import {chartRange,chartStats,validCandle} from './verified-candle-model-v1.mjs';
import {chartTradeMarkers} from './manual-paper-visual-model.mjs';
const svg=(tag,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(text!==undefined)node.textContent=text;return node;};
const fmt=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function createCandleChart(host){
 const holder=document.getElementById('manual-chart'),slider=document.getElementById('manual-chart-point');
 const tools=el('div','vc-tools'),periodGroup=el('div','vc-segmented'),modeGroup=el('div','vc-segmented');
 periodGroup.setAttribute('role','group');periodGroup.setAttribute('aria-label','الفترة المعروضة من السجل اليومي');modeGroup.setAttribute('role','group');modeGroup.setAttribute('aria-label','نوع الرسم');tools.append(periodGroup,modeGroup);holder.before(tools);
 const summary=el('div','vc-summary'),readout=el('dl','vc-readout');tools.after(summary,readout);
 let period='3M',mode='candles',latest=null,markerCount=0;
 const periodButtons=new Map(),modeButtons=new Map();
 function refresh(){if(!latest)return;render(...latest);slider.dispatchEvent(new Event('input',{bubbles:true}));}
 for(const[key,label]of [['1M','شهر'],['3M','3 أشهر'],['ALL','المتاح']]){const b=el('button','',label);b.type='button';b.dataset.chartPeriod=key;b.addEventListener('click',()=>{period=key;refresh()});periodButtons.set(key,b);periodGroup.append(b);}
 for(const[key,label]of [['candles','شموع'],['line','خط']]){const b=el('button','',label);b.type='button';b.dataset.chartMode=key;b.addEventListener('click',()=>{mode=key;refresh()});modeButtons.set(key,b);modeGroup.append(b);}
 function render(history,wallet,symbol,point){
  latest=[history,wallet,symbol,point];const range=chartRange(history,period),bars=range.rows,stats=chartStats(bars),hasCandles=history.length>0&&history.every(validCandle),effectiveMode=hasCandles?mode:'line';
  for(const[k,b]of periodButtons)b.setAttribute('aria-pressed',String(k===period));for(const[k,b]of modeButtons)b.setAttribute('aria-pressed',String(k===effectiveMode));modeButtons.get('candles').disabled=!hasCandles;modeButtons.get('candles').title=hasCandles?'شموع يومية من سجل المصدر':'السجل المتاح إغلاقات فقط';
  slider.min=String(range.start);slider.max=String(range.end);const index=Math.max(range.start,Math.min(range.end,Number.isFinite(point)?point:range.end));slider.value=String(index);
  summary.replaceChildren();readout.replaceChildren();holder.replaceChildren();
  markerCount=0;const volumeNode=document.getElementById('manual-chart-volume');if(volumeNode)volumeNode.textContent='حجم الجلسة غير متاح';
  const symbolTag=el('b','vc-symbol',symbol||'—');symbolTag.dir='ltr';summary.append(symbolTag);
  if(stats){const movement=el('span','vc-movement',`${stats.changePct>0?'+':''}${stats.changePct.toFixed(2)}%`);movement.dir='ltr';movement.dataset.direction=stats.changePct>=0?'up':'down';summary.append(movement,el('small','',`تغير الإغلاقات خلال الفترة · ${stats.count} جلسة`));}
  if(bars.length<2){holder.append(el('div','mp-chart-empty','لا توجد نقطتان موثقتان لهذه الفترة.'));return;}
  const selected=history[index],fields=hasCandles?[['افتتاح',selected.open],['أعلى',selected.high],['أدنى',selected.low],['إغلاق',selected.close]]:[['إغلاق',selected.close]];
  for(const[label,value]of fields){const block=el('div',''),dt=el('dt','',label),dd=el('dd','',fmt(value));dd.dir='ltr';block.append(dt,dd);readout.append(block);}
  const markers=chartTradeMarkers(bars,wallet.trades,symbol),width=Math.max(300,holder.clientWidth||800),height=Math.max(240,holder.clientHeight||320),left=12,right=65,top=20,bottom=24,plotBottom=height-78;markerCount=markers.length;
  const values=[...bars.flatMap(p=>hasCandles?[p.low,p.high]:[p.close]),...markers.map(p=>p.fill)],min=Math.min(...values),max=Math.max(...values),padding=(max-min||max*.02)*.05,low=min-padding,high=max+padding,span=high-low;
  const step=(width-left-right)/(bars.length-1),x=i=>left+i*step,y=v=>top+(high-v)/span*(plotBottom-top);
  const graph=svg('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${symbol} · ${effectiveMode==='candles'?'شموع يومية':'إغلاقات يومية'} · ${bars.length} جلسة موثقة`});
  for(let i=0;i<4;i++){const value=low+span*i/3,yy=y(value);graph.append(svg('line',{x1:left,x2:width-right,y1:yy,y2:yy,stroke:'#29464e','stroke-dasharray':'3 6'}),svg('text',{x:width-2,y:yy+4,fill:'#9ab4bf','font-size':11,'text-anchor':'end'},fmt(value)));}
  if(effectiveMode==='candles')for(let i=0;i<bars.length;i++){const p=bars[i],color=p.close>=p.open?'#98e8d1':'#e6a29a',body=Math.max(1,Math.min(12,step*.65));graph.append(svg('line',{x1:x(i),x2:x(i),y1:y(p.high),y2:y(p.low),stroke:color,'stroke-width':1.2}),svg('rect',{x:x(i)-body/2,y:Math.min(y(p.open),y(p.close)),width:body,height:Math.max(1,Math.abs(y(p.open)-y(p.close))),fill:color,rx:.6}));}
  else{const path=bars.map((p,i)=>`${i?'L':'M'}${x(i)},${y(p.close)}`).join(' ');graph.append(svg('path',{d:`${path} L${x(bars.length-1)},${plotBottom} L${left},${plotBottom} Z`,fill:'#204c45',opacity:.35}),svg('path',{d:path,fill:'none',stroke:'#98e8d1','stroke-width':2.5,'stroke-linejoin':'round'}));}
  const maxVolume=Math.max(0,...bars.map(r=>Number.isFinite(r.volume)?r.volume:0));
  if(maxVolume>0)for(let i=0;i<bars.length;i++){const p=bars[i];if(!Number.isFinite(p.volume)||p.volume<=0)continue;const hh=p.volume/maxVolume*32;graph.append(svg('rect',{x:x(i)-Math.max(1,step*.6)/2,y:height-bottom-hh,width:Math.max(1,step*.6),height:hh,fill:p.close>=(p.open||p.close)?'#467c70':'#835d5b',opacity:.7}));}
  for(const i of width<450?[0,bars.length-1]:[0,Math.floor((bars.length-1)/2),bars.length-1])graph.append(svg('text',{x:x(i),y:height-4,fill:'#9ab4bf','font-size':10,'text-anchor':i===0?'start':i===bars.length-1?'end':'middle'},bars[i].sessionDate.slice(5)));
  const local=index-range.start;graph.append(svg('line',{x1:x(local),x2:x(local),y1:top,y2:height-bottom,stroke:'#e4c48e','stroke-dasharray':'4 5'}),svg('circle',{cx:x(local),cy:y(selected.close),r:4,fill:'#e4c48e'}));
  for(const marker of markers){const group=svg('g',{'data-paper-trade':marker.id||marker.committedAt});group.append(svg('title',{},`${marker.side} · ${marker.quantity} · ${fmt(marker.fill)}`),svg('circle',{cx:x(marker.index),cy:y(marker.fill),r:8,fill:marker.side==='BUY'?'#98e8d1':'#e4c48e',stroke:'#10222a','stroke-width':2}),svg('text',{x:x(marker.index),y:y(marker.fill)+3,fill:'#10222a','font-size':8,'text-anchor':'middle'},marker.side==='BUY'?'B':'S'));graph.append(group);}
  holder.append(graph);
  const volume=document.getElementById('manual-chart-volume');if(volume)volume.textContent=Number.isFinite(selected.volume)?`حجم الجلسة: ${selected.volume.toLocaleString('en-US')}`:'حجم الجلسة غير متاح';
 }
 const volume=el('p','vc-volume');volume.id='manual-chart-volume';holder.after(volume);
 return{render,key:()=>`${period}:${mode}`,markerNote:()=>markerCount?`${markerCount} علامة من سجلك المحلي ضمن الفترة المعروضة · B شراء · S بيع · موضع العلامة يبين اليوم وسعر التنفيذ الافتراضي، لا توقيتًا داخل اليوم.`:'لا توجد عمليات محلية ضمن فترة الرسم المعروضة.'};
}
