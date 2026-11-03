import {formatMarketTime} from './market-reading-format-v1.mjs';

// This card reads the same quote used by the paper ticket. It does not fetch prices.
export function createDataCompass(host){
 const chart=host.querySelector('#manual-chart');
 if(!chart)return {render(){}};
 const card=document.createElement('section');card.className='stock-compass';card.setAttribute('aria-label','بوصلة بيانات السهم');
 const heading=document.createElement('div');heading.className='stock-compass-head';
 const title=document.createElement('strong');title.textContent='بوصلة بيانات السهم';
 const state=document.createElement('span');state.className='stock-compass-state';heading.append(title,state);
 const grid=document.createElement('div');grid.className='stock-compass-grid';
 const values={};
 for(const [key,label] of [['price','السعر المرجعي'],['source','المصدر'],['time','وقت السعر · الرياض'],['observed','آخر فحص للمصدر']]){
  const cell=document.createElement('div'),caption=document.createElement('small'),value=document.createElement('b');caption.textContent=label;cell.append(caption,value);grid.append(cell);values[key]=value;
 }
 const note=document.createElement('p');note.className='stock-compass-note';
 card.append(heading,grid,note);chart.before(card);
 return {render(quote,blocked){
  const price=quote?.price;values.price.textContent=Number.isFinite(price)&&price>0?`${price.toLocaleString('en-US',{maximumFractionDigits:4})} ${typeof quote.currency==='string'?quote.currency:'عملة غير موثقة'}`:'غير متاح';
  values.source.textContent=quote?.source||'غير متاح';
  values.time.textContent=formatMarketTime(quote?.updatedAt||quote?.time);
  values.observed.textContent=formatMarketTime(quote?.observedAt);
  state.textContent=!quote?'بانتظار البيانات':blocked?'للمراجعة':'حديثة للمعاينة';card.dataset.state=!quote?'missing':blocked?'review':'ready';
  note.textContent=blocked||(!quote?'لا توجد قراءة للسهم بعد.':'تُستخدم القراءة نفسها في المسودة التجريبية. لا تمثل سعر تنفيذ مضمونًا.');
 }};
}
