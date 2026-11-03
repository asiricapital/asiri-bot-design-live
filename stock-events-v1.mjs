import {formatMarketTime} from './market-reading-format-v1.mjs';

const NEWS_URL='https://asiri-bot.onrender.com/api/news/intelligence';
const CACHE_MS=120000;
export function relevantNews(items,symbol){
 if(!Array.isArray(items)||!symbol)return [];
 return items.filter(item=>Array.isArray(item?.relatedTickers)&&item.relatedTickers.some(t=>String(t).toUpperCase()===symbol)&&typeof item.title==='string'&&item.title.trim()&&typeof item.publisher==='string'&&item.publisher.trim()&&Number.isFinite(Date.parse(item.publishedAt))&&safeUrl(item.link))
  .sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,5);
}
function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null}catch{return null}}
export function createStockEvents(host,getSymbol){
 const box=host.querySelector('.mp-research-note');if(!box)return {render(){}};
 const old=box.querySelector('span');if(old)old.remove();
 const panel=document.createElement('section');panel.className='stock-events';panel.setAttribute('aria-label','أحداث السهم');
 const head=document.createElement('div');head.className='stock-events-head';
 const title=document.createElement('strong');title.textContent='أحداث تستحق المتابعة';
 const button=document.createElement('button');button.type='button';button.textContent='عرض الأخبار المتاحة';head.append(title,button);
 const status=document.createElement('p');status.setAttribute('role','status');status.textContent='اطلب الأخبار لمراجعة الأحداث المرتبطة بهذا السهم.';
 const list=document.createElement('div');list.className='stock-events-list';
 const note=document.createElement('small');note.textContent='التغطية محدودة بأخبار محرك المنصة؛ الارتباط لا يثبت سبب حركة السعر.';
 panel.append(head,status,list,note);box.prepend(panel);
 let payload=null,fetched=0,busy=false,requested=false;
 function render(){
  if(!requested)return;const symbol=getSymbol();list.replaceChildren();
  if(busy){status.textContent='جارٍ قراءة الأخبار…';return;}
  if(!payload){status.textContent='تعذر تحميل الأخبار؛ أعد المحاولة.';return;}
  const matches=relevantNews(payload.items,symbol);
  status.textContent=matches.length?`أخبار مرتبطة بـ ${symbol} · ${payload.connected===true?'قراءة المصدر':'نسخة محفوظة؛ راجع أوقات النشر'}`:`لا توجد أخبار مطابقة لـ ${symbol} في هذه الدفعة. لا يعني ذلك عدم وجود أخبار أخرى.`;
  for(const item of matches){const a=document.createElement('a');a.href=safeUrl(item.link);a.target='_blank';a.rel='noopener noreferrer';const t=document.createElement('strong');t.textContent=item.title;const meta=document.createElement('span');meta.textContent=`${item.publisher} · ${formatMarketTime(item.publishedAt)} · الرياض`;a.append(t,meta);list.append(a)}
 }
 button.addEventListener('click',async()=>{
  requested=true;if(busy)return;
  if(payload&&Date.now()-fetched<CACHE_MS){render();return}
  busy=true;render();button.disabled=true;
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
  try{const response=await fetch(NEWS_URL,{signal:ctrl.signal,cache:'no-store'});if(!response.ok)throw Error('unavailable');const data=await response.json();if(!Array.isArray(data.items))throw Error('invalid');payload=data;fetched=Date.now()}
  catch{payload=null}finally{clearTimeout(timer);busy=false;button.disabled=false;button.textContent='تحديث الأخبار';render()}
 });
 return {render};
}
