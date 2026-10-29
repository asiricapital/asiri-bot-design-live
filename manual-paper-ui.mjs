import {MANUAL_KEY,newWallet,previewOrder,commitOrder} from './manual-paper-core.mjs?v=2';
import {buildPaperPlan} from './manual-paper-plan.mjs';
const $=id=>document.getElementById(id);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const money=x=>Number.isFinite(x)?x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4}):'—';
let wallet,draft=null,busy=false,history=[],chartGeneration=0;
let technicals=null,activeSymbol='',pendingAuto=true,plan=null;
function readWallet(){const raw=localStorage.getItem(MANUAL_KEY);if(raw===null)return newWallet();const value=JSON.parse(raw);if(value.schema!==1||!Number.isFinite(value.cash)||!Array.isArray(value.trades)||!value.positions||!Number.isSafeInteger(value.version))throw Error('تعذر قراءة السجل المحفوظ؛ لم يُمسح ولم يُستبدل.');return value;}
const rows=()=>window.asiriMarketView?.snapshots?.()||[];const quote=()=>rows().find(q=>q.symbol===$('manual-symbol').value);
function notice(text){$('manual-message').textContent=text;}
function invalidate(){draft=null;$('manual-confirm').disabled=true;$('manual-preview-result').textContent='أعد المعاينة بعد تحديد البيانات.';}
function resetPlan(){
 invalidate();plan=null;pendingAuto=true;
 ['manual-quantity','manual-stop','manual-target','manual-reason'].forEach(id=>$(id).value='');
 const sell=$('manual-side').value==='SELL';$('manual-stop').disabled=sell;$('manual-target').disabled=sell;
 $('manual-plan-status').textContent=sell?'جارٍ قراءة المركز المملوك…':'جارٍ حساب مسودة من الرصيد والسجل الفني…';
 $('manual-plan-details').textContent='';
}
function populatePlan(){
 if(!pendingAuto)return;
 plan=buildPaperPlan(wallet,$('manual-symbol').value,$('manual-side').value,quote(),technicals);
 $('manual-plan-status').textContent=plan.message;
 if(plan.status==='UNAVAILABLE')return;
 $('manual-quantity').value=String(plan.quantity);$('manual-stop').value=plan.stop??'';$('manual-target').value=plan.target??'';$('manual-reason').value=plan.reason;
 pendingAuto=false;
 $('manual-plan-details').textContent=plan.side==='SELL'?`المملوك: ${plan.ownedQuantity} سهم · لا بيع على المكشوف. راجع الكمية وسبب الخروج.`:
  `النقد ${money(wallet.cash)} USD · احتياطي ${money(plan.reserve)} · تكلفة تقديرية ${money(plan.totalCost)} · النقد بعدها ${money(plan.cashAfter)} · خسارة مخططة ${money(plan.risk)} من حد ${money(plan.riskBudget)} USD · القيد الحاكم: ${plan.limiting}. الاتجاه اليومي: ${plan.context}${plan.rsi===null?'':` · RSI ${money(plan.rsi)}`}. ${plan.resistanceWarning?'تنبيه: مقاومة يومية قبل الهدف. ':''}السعر: ${plan.source} (${plan.quoteAt}) · الفني: ${plan.technicalSource} (${plan.historyAt}). ${plan.spreadSource==='quote'?'السبريد من الاقتباس.':'السبريد افتراضي ضمن نموذج التكاليف.'}`;
 notice('تعبئة مسودة فقط؛ راجع الحقول ثم عاين. لا تأكيد أو تنفيذ تلقائي.');
}
function selectSymbol(){
 activeSymbol=$('manual-symbol').value;technicals=null;resetPlan();populatePlan();loadChart();
}
function render(){
 const list=rows(),select=$('manual-symbol'),prior=select.value,key=JSON.stringify(list.map(q=>q.symbol));
 if(select.dataset.key!==key){select.replaceChildren();list.forEach(q=>{let o=document.createElement('option');o.value=q.symbol;o.textContent=q.symbol;select.append(o)});select.dataset.key=key;if(list.some(q=>q.symbol===prior))select.value=prior;invalidate();}
 if(activeSymbol!==select.value)selectSymbol();
 const q=quote(),health=q?window.asiriMarketView.health(q):null;
 $('manual-quote').textContent=q?`${q.symbol} · ${money(q.price)} · ${window.asiriQuoteDataHealth.describeQuote(health).label} · ${q.source||'غير متاح'} · ${q.updatedAt||q.time||'وقت غير متاح'}`:'بانتظار البيانات';
 if(draft&&(health?.state!=='FRESH'||q?.price!==draft.referencePrice||(q.updatedAt||q.time)!==draft.quoteAt||q.source!==draft.source)){invalidate();notice('تغير السعر أو صلاحيته؛ أعد المعاينة.');}
 if(pendingAuto)populatePlan();
 else if(plan&&plan.side==='BUY'&&(q?.price!==plan.referencePrice||(q?.updatedAt||q?.time)!==plan.quoteAt)){$('manual-plan-status').textContent='وصلت قراءة أخرى؛ المسودة السابقة محفوظة للمراجعة. اضغط «إعادة تجهيز حسب الرصيد والسوق» لتحديثها.';}
 $('manual-cash').textContent=money(wallet.cash);$('manual-realized').textContent=money(wallet.trades.reduce((sum,t)=>sum+(Number.isFinite(t.realizedPnl)?t.realizedPnl:0),0));
 $('manual-holdings').innerHTML=Object.entries(wallet.positions).map(([s,p])=>{const row=list.find(q=>q.symbol===s);const valid=row&&window.asiriMarketView.health(row).state==='FRESH';return `<div><b>${esc(s)}</b> · ${esc(p.quantity)} سهم · تكلفة شاملة ${money(p.costBasis)} USD · ${valid?`القيمة المرجعية ${money(p.quantity*row.price)} USD`:'التقييم الحالي غير متاح'}</div>`}).join('')||'لا توجد مراكز يدوية.';
 $('manual-ledger').innerHTML=wallet.trades.slice().reverse().slice(0,100).map(t=>`<article><b>${t.side==='BUY'?'شراء':'بيع'} ${esc(t.symbol)} · ${esc(t.quantity)} سهم</b><p>تنفيذ افتراضي ${money(t.fill)} · رسوم ${money(t.fee)} · النقد بعد العملية ${money(t.cashAfter)} USD${t.realizedPnl===null?'':` · صافي المحقق ${money(t.realizedPnl)}`}</p><small>${esc(t.committedAt)} · ${esc(t.source)} · وقت السعر ${esc(t.quoteAt)}</small><p>${esc(t.reason)}</p></article>`).join('')||'لا توجد عمليات بعد.';
}
function order(){return{id:crypto.randomUUID(),symbol:$('manual-symbol').value,side:$('manual-side').value,quantity:Number($('manual-quantity').value),stop:Number($('manual-stop').value),target:Number($('manual-target').value),reason:$('manual-reason').value,currencyAcknowledged:$('manual-currency').checked};}
function preview(){try{wallet=readWallet();if(plan&&plan.side==='BUY'&&(quote()?.price!==plan.referencePrice||(quote()?.updatedAt||quote()?.time)!==plan.quoteAt))throw Error('تغير السعر المرجعي؛ أعد تجهيز المسودة حسب الرصيد والسوق.');draft=previewOrder(wallet,order(),quote());$('manual-preview-result').textContent=`${draft.side==='BUY'?'شراء':'بيع'} ${draft.quantity} ${draft.symbol} · سعر مرجعي ${money(draft.referencePrice)} · تنفيذ افتراضي ${money(draft.fill)} · رسوم ${money(draft.fee)} · النقد المتوقع ${money(draft.cashAfter)} USD. فرق السعر ${draft.spreadSource==='quote'?'من الاقتباس':'افتراض 0.15% لكل جانب'}، والانزلاق 0.05% والعمولة 0.10%.`; $('manual-confirm').disabled=false;notice('راجع المعاينة ثم أكد خلال دقيقة. لا توجد صفقة حقيقية.');}catch(e){invalidate();notice(e.message)}}
async function confirm(){if(busy||!draft)return;if(!navigator.locks){notice('الحفظ متوقف: المتصفح لا يدعم قفل السجل بين النوافذ. استخدم متصفحًا يدعم Web Locks.');return;}busy=true;$('manual-confirm').disabled=true;try{await navigator.locks.request(MANUAL_KEY,()=>{const current=readWallet();const next=commitOrder(current,draft,quote());localStorage.setItem(MANUAL_KEY,JSON.stringify(next));wallet=next;});resetPlan();populatePlan();render();notice('حُفظت العملية التجريبية محليًا وتحدث الرصيد. لا إرسال إلى وسيط.');}catch(e){invalidate();notice(`لم يُؤكد الحفظ: ${e.message}`)}finally{busy=false}}
function chartPoint(){const i=Number($('manual-chart-point').value),p=history[i];$('manual-chart-label').textContent=p?`${p.date||p.time||'تاريخ غير متاح'} · إغلاق ${money(Number(p.close))}`:'السجل غير متاح';}
async function loadChart(){const symbol=$('manual-symbol').value,gen=++chartGeneration;history=[];$('manual-chart').replaceChildren();$('manual-chart-label').textContent='جارٍ قراءة السجل اليومي…';$('manual-chart-source').textContent='';$('manual-chart-point').disabled=true;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);try{const response=await fetch(`https://asiri-bot.onrender.com/api/live-terminal/technicals/${encodeURIComponent(symbol)}`,{cache:'no-store',signal:ctrl.signal});const p=await response.json();if(gen!==chartGeneration)return;if(!response.ok||p.symbol!==symbol||p.availability!=='available')throw Error('السجل غير متاح');technicals=p;history=(p.indicators?.sparkline||[]).filter(x=>Number.isFinite(Number(x.close))&&Number(x.close)>0);if(history.length<2)throw Error('السجل غير كافٍ');const values=history.map(x=>Number(x.close)),min=Math.min(...values),span=Math.max(...values)-min||1;let svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 600 150');svg.setAttribute('role','img');svg.setAttribute('aria-label','سجل إغلاقات يومية');let path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',values.map((x,i)=>`${i?'L':'M'}${i/(values.length-1)*600},${140-(x-min)/span*130}`).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#8fe2c9');path.setAttribute('stroke-width','2');svg.append(path);$('manual-chart').append(svg);$('manual-chart-point').max=history.length-1;$('manual-chart-point').value=history.length-1;$('manual-chart-point').disabled=false;$('manual-chart-source').textContent=`${p.source||'مصدر غير متاح'} · نهاية السجل ${p.endOfHistory||'غير متاح'} · ${p.historyStatus||'حالة غير متاحة'} · رسم إغلاقات وليس أسعار تنفيذ`;chartPoint();populatePlan();}catch(e){if(gen===chartGeneration){history=[];technicals=null;$('manual-chart-label').textContent='تعذر السجل؛ لم يُرسم بديل.';populatePlan()}}finally{clearTimeout(timer)}}
function init(){
 const host=$('manual-paper-workspace');if(!host)return;
 try{wallet=readWallet()}catch(e){notice(e.message);host.querySelectorAll('button,input,select').forEach(n=>n.disabled=true);return;}
 render();if($('home-open-paper'))$('home-open-paper').disabled=false;
 host.addEventListener('input',e=>{if(e.target.id==='manual-chart-point'){chartPoint();return}invalidate();if(['manual-quantity','manual-stop','manual-target','manual-reason'].includes(e.target.id)){pendingAuto=false;plan=null;$('manual-plan-details').textContent='عاين التكاليف وأثر الرصيد للتحقق من القيم المعدلة.';$('manual-plan-status').textContent='مسودة معدلة يدويًا؛ لن تستبدل قراءات الأسعار تعديلاتك. أعد التجهيز إذا أردت إعادة الحساب.';}});
 $('manual-symbol').addEventListener('change',()=>{selectSymbol();render()});$('manual-side').addEventListener('change',()=>{resetPlan();populatePlan()});$('manual-auto-plan').addEventListener('click',()=>{try{wallet=readWallet();resetPlan();if($('manual-side').value==='BUY'){technicals=null;loadChart()}populatePlan();render()}catch(e){notice(e.message)}});$('manual-preview').addEventListener('click',preview);$('manual-confirm').addEventListener('click',confirm);
 $('manual-research').addEventListener('click',()=>{if(typeof switchMainTab==='function')switchMainTab('research');$('sec-research')?.scrollIntoView({block:'start',behavior:'smooth'})});
 window.addEventListener('asiri:quotes-rendered',render);window.addEventListener('storage',e=>{if(e.key===MANUAL_KEY){try{wallet=readWallet();invalidate();pendingAuto=false;plan=null;$('manual-plan-status').textContent='تغير الرصيد في نافذة أخرى؛ أعد تجهيز المسودة.';render()}catch(err){invalidate();notice(err.message)}}});
 setInterval(()=>{if(!document.hidden){if(draft&&Date.now()-draft.previewAt>60000)invalidate();render()}},5000);
 window.asiriManualPaper=Object.freeze({open:symbol=>{render();if([...$('manual-symbol').options].some(o=>o.value===symbol))$('manual-symbol').value=symbol;$('manual-side').value='BUY';selectSymbol();if(typeof switchMainTab==='function')switchMainTab('portfolio');host.scrollIntoView({block:'start',behavior:'smooth'});render()},paperOnly:true});
}
init();
