import {paperDecisionOutcome} from './paper-decision-snapshot-v1.mjs';
import {formatMarketTime} from './market-reading-format-v1.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const money=n=>Number.isFinite(n)?n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
const valid=t=>t.decisionSnapshot?.version===1&&t.decisionSnapshot.symbol===t.symbol&&t.decisionSnapshot.side===t.side&&t.decisionSnapshot.capturedAt===t.committedAt&&t.decisionSnapshot.quantity===t.quantity&&Number.isFinite(t.decisionSnapshot.entry)&&t.decisionSnapshot.entry>0;
export function createDecisionReview(ledger){
 const panel=el('section');panel.className='decision-review';panel.id='decision-review';
 const title=el('h4','الخطة وقت التأكيد'),label=el('label','اختر عملية محفوظة'),select=el('select');select.id='decision-review-select';label.append(select);
 const body=el('div');body.id='decision-review-body';body.setAttribute('aria-live','polite');panel.append(title,label,body);ledger.before(panel);
 let wallet=null,selected='',lastKey='';
 function render(next){wallet=next;const key=`${wallet.version}|${selected}`;if(key===lastKey)return;lastKey=key;
  const trades=wallet.trades.filter(valid).slice(-100).reverse();if(!trades.some(t=>t.id===selected))selected=trades[0]?.id||'';
  select.replaceChildren();for(const t of trades){const option=el('option',`${t.symbol} · ${t.side==='BUY'?'شراء':'بيع'} · ${formatMarketTime(t.committedAt)}`);option.value=t.id;select.append(option);}select.value=selected;select.disabled=!trades.length;body.replaceChildren();
  const trade=trades.find(t=>t.id===selected);if(!trade){body.append(el('p','تظهر هنا لقطات العمليات الجديدة بعد التأكيد التجريبي. السجل السابق محفوظ كما هو.'));return;}
  const s=trade.decisionSnapshot,outcome=paperDecisionOutcome(wallet,trade),badge=el('span','لقطة محفوظة · محاكاة فقط');badge.className='decision-badge';body.append(badge,el('p',`وقت التأكيد: ${formatMarketTime(s.capturedAt)} · الرياض`));
  const facts=el('dl');facts.className='decision-facts';
  const values=[['التنفيذ الافتراضي',s.entry],['الكمية',s.quantity],['الوقف المخطط',s.stop],['الهدف المخطط',s.target],['المخاطرة المخططة',s.plannedRisk],['العائد المخطط',s.plannedReward],['النقد قبل العملية',s.cashBefore],['النقد بعدها',s.cashAfter]];
  for(const[name,value]of values){const row=el('div'),dt=el('dt',name),dd=el('dd',money(value));dd.dir='ltr';row.append(dt,dd);facts.append(row);}body.append(facts,el('small','المبالغ بالدولار في نموذج المحاكاة؛ المستويات المخططة لا تنفذ تلقائيًا.'));
  const chart=s.chart?.rows;
  if(Array.isArray(chart)&&chart.length>=2&&chart.length<=32&&chart.every(p=>Number.isFinite(p.close)&&p.close>0&&Number.isFinite(Date.parse(p.date)))){
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 500 160');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${s.symbol} · إغلاقات يومية محفوظة وقت التأكيد`);
   const lo=Math.min(...chart.map(p=>p.close)),hi=Math.max(...chart.map(p=>p.close)),span=hi-lo||hi*.02;
   const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',chart.map((p,i)=>`${i?'L':'M'}${10+i/(chart.length-1)*480},${12+(hi-p.close)/span*125}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#94e7ce');path.setAttribute('stroke-width','2.5');svg.append(path);body.append(svg,el('small',`إغلاقات يومية محفوظة · ${formatMarketTime(chart[0].date,true)} — ${formatMarketTime(chart.at(-1).date,true)} · ${s.chart.source}`));
  }else body.append(el('p','لم يتوفر سجل رسم صالح لحظة التأكيد؛ بيانات القرار محفوظة دون رسم بديل.'));
  body.append(el('p',`سبب العملية: ${s.reason}`),el('small',`${s.source} · وقت السعر الأصلي ${formatMarketTime(s.quoteAt)} · عملة المصدر ${s.quoteCurrency||'غير موثقة؛ أُقر افتراض USD'}`));
  const result=el('div');result.className='decision-outcome';
  if(!outcome.available)result.append(el('p','تعذر ربط نتيجة البيع من حقول السجل المتاحة.'));
  else{result.append(el('strong',outcome.realized===null?'لم تُبع كمية من هذه الخطة بعد.':`صافي نتيجة الكمية المباعة: ${money(outcome.realized)} USD`));if(outcome.side==='BUY')result.append(el('p',`المباع المنسوب للخطة ${money(outcome.sold)} سهم · المتبقي ${money(outcome.remaining)} سهم`),el('small','عند تعدد الشراء يُوزع البيع نسبيًا وفق متوسط التكلفة.'));result.append(el('p',`رسوم تأكيد الشراء ${money(outcome.entryFee)} · رسوم البيع المنسوبة ${money(outcome.exitFee)} USD`),el('small','الصافي يستخدم الحصيلة بعد الرسوم وتكلفة الشراء الشاملة؛ الانزلاق والسبريد داخل سعر التنفيذ الافتراضي.'));}body.append(result);
 }
 select.addEventListener('change',()=>{selected=select.value;lastKey='';render(wallet)});
 ledger.addEventListener('click',event=>{const b=event.target.closest('[data-review-decision]');if(!b)return;selected=b.dataset.reviewDecision;lastKey='';render(wallet);panel.scrollIntoView({block:'nearest',behavior:'smooth'})});
 return{render};
}
