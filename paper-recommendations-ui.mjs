import {buildPaperRecommendation,RECOMMENDATION_RULES} from './paper-recommendation-model.mjs';
const API='https://asiri-bot.onrender.com/api/analyze/';
const money=n=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:4}):'—';
const time=t=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Riyadh',calendar:'gregory'}).format(new Date(t));
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};

export function createPaperRecommendationDesk({host,getWallet,getQuotes,onReview}){
 const desk=el('section');desk.id='paper-recommendations';desk.className='paper-recommendations';desk.setAttribute('aria-labelledby','paper-recommendations-title');
 const head=el('div');head.className='pr-head';const title=el('div');title.append(el('span','ASIRI · PAPER CANDIDATES'));const h=el('h3','ترشيحات الشراء التجريبي');h.id='paper-recommendations-title';title.append(h,el('p','من أسهم قائمتك بين 1 و10 دولارات. الترشيح من محرك ASIRI، والكمية حسب رصيد المحاكاة.'));
 const scanButton=el('button','فحص الترشيحات الآن');scanButton.type='button';scanButton.id='paper-recommendations-scan';head.append(title,scanButton);
 const status=el('p','بانتظار قراءات قائمة المتابعة.');status.id='paper-recommendations-status';status.className='pr-status';status.setAttribute('role','status');
 const grid=el('div');grid.id='paper-recommendations-list';grid.className='pr-grid';
 const waiting=el('details');waiting.className='pr-wait';const summary=el('summary','أسباب انتظار بقية الأسهم');const waitList=el('ul');waiting.append(summary,waitList);
 desk.append(head,status,grid,waiting,el('p','يُقبل الترشيح بعد اكتمال بوابات المحرك والتوافق الشرعي المسجل في المنصة، وسعر وتحليل حديثين، وسيولة موثقة، وصافي عائد/مخاطرة 2:1 أو أكثر. حد المركز 10%، احتياطي 30%، ومخاطرة حتى 1%. التوافق من قائمة المنصة وليس فحصًا شرعيًا جديدًا.'));
 host.before(desk);
 const homeButton=el('button','ترشيحات الشراء التجريبي');homeButton.type='button';homeButton.id='home-paper-recommendations';
 document.getElementById('home-open-portfolio')?.after(homeButton);
 homeButton.addEventListener('click',()=>{if(typeof switchMainTab==='function')switchMainTab('portfolio');desk.scrollIntoView({block:'start',behavior:'smooth'});});
 let records=new Map(),busy=false,lastScan=0,scanGeneration=0,disposed=false,errors=new Map();
 function get(symbol){const record=records.get(symbol);if(!record)return null;try{return buildPaperRecommendation(getWallet(),record.analysis,getQuotes().find(q=>q.symbol===symbol),Date.now(),record.fetchedAt)}catch{return null}}
 function render(){
  const quotes=getQuotes();grid.replaceChildren();waitList.replaceChildren();let results=[];
  try{const wallet=getWallet();results=quotes.map(q=>{const record=records.get(q.symbol);return buildPaperRecommendation(wallet,record?.analysis,q,Date.now(),record?.fetchedAt)});}catch(e){status.textContent=e.message;return;}
  const ready=results.filter(r=>r.status==='READY').sort((a,b)=>b.score-a.score||b.plan.rewardRisk-a.plan.rewardRisk).slice(0,3);
  for(const result of ready){
   const p=result.plan,card=el('article');card.className='pr-card';card.dataset.symbol=result.symbol;
   card.append(el('span','مؤهل للمراجعة · ينتظر تأكيدك'),el('h4',result.symbol),el('p',result.explanation),el('span',`درجة المحرك ${result.score}/100 · ليست احتمال ربح`));
   const dl=el('dl');for(const[label,value]of [['الدخول التقديري',`${money(p.entry)} USD`],['الكمية',`${p.quantity} سهم`],['الوقف',money(p.stop)],['الهدف',money(p.target)],['المخاطرة بعد التكاليف',`${money(p.risk)} USD`],['صافي العائد/المخاطرة',`${money(p.rewardRisk)}:1`]]){const div=el('div');div.append(el('dt',label),el('dd',value));dl.append(div)}card.append(dl);
   card.append(el('small',`${p.source} · وقت السعر ${time(p.quoteAt)} · التحليل ${time(p.recommendation.analysisAt)} · التكاليف تقديرية؛ الوقف والهدف لا ينفذان تلقائيًا.`));
   const button=el('button','راجع الترشيح وجهّز المعاينة');button.type='button';button.dataset.reviewSymbol=result.symbol;
   button.addEventListener('click',()=>{const current=get(result.symbol);if(current?.status!=='READY'||current.id!==result.id){render();status.textContent='تغيرت صلاحية الترشيح؛ حدّث الفحص قبل المراجعة.';return;}onReview(current)});card.append(button);grid.append(card);
  }
  if(!ready.length){const empty=el('div',busy?'جارٍ فحص قائمة المتابعة…':'لا يوجد ترشيح شراء تجريبي مستوفٍ للشروط الآن.');empty.className='pr-empty';grid.append(empty)}
  for(const result of results.filter(r=>r.status!=='READY'))waitList.append(el('li',`${result.symbol}: ${errors.get(result.symbol)||result.message}`));
  homeButton.textContent=`ترشيحات الشراء التجريبي (${ready.length})`;
  summary.textContent=`أسباب الانتظار (${results.filter(r=>r.status!=='READY').length})`;
  scanButton.disabled=busy;scanButton.textContent=busy?'جارٍ فحص الترشيحات…':'فحص الترشيحات الآن';
  status.textContent=busy?'جارٍ قراءة محرك التحليل…':lastScan?`آخر فحص ${time(lastScan)} · ${ready.length} ترشيح جاهز للمراجعة · يتجدد الفحص كل دقيقتين عند فتح هذه المساحة.`:'بانتظار أول فحص من محرك التحليل.';
 }
 async function scan(){
  if(busy||disposed)return;
  const symbols=getQuotes().filter(q=>typeof q.price==='number'&&q.price>=RECOMMENDATION_RULES.minPrice&&q.price<=RECOMMENDATION_RULES.maxPrice).map(q=>q.symbol).slice(0,40);
  if(!symbols.length){render();return;}
  busy=true;const generation=++scanGeneration;records=new Map();errors=new Map();render();
  let next=0;
  async function worker(){while(next<symbols.length){const symbol=symbols[next++],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(API+encodeURIComponent(symbol),{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('تعذر تحميل تحليل هذا السهم؛ أعد الفحص.');const analysis=await response.json();if(analysis.symbol!==symbol)throw Error('رمز استجابة التحليل لا يطابق السهم.');if(generation===scanGeneration)records.set(symbol,{analysis,fetchedAt:Date.now()});}catch(e){errors.set(symbol,e.name==='AbortError'?'انتهت مهلة التحليل؛ أعد الفحص.':e.message)}finally{clearTimeout(timer)}}}
  try{await Promise.all(Array.from({length:Math.min(3,symbols.length)},worker));}finally{if(generation===scanGeneration){lastScan=Date.now();busy=false;render();window.dispatchEvent(new Event('asiri:recommendations-updated'));}}
 }
 scanButton.addEventListener('click',scan);
 window.addEventListener('asiri:quotes-rendered',()=>{render();if(!lastScan&&!busy&&getQuotes().length)scan()});
 window.addEventListener('storage',()=>render());
 const timer=setInterval(()=>{if(disposed||document.hidden)return;render();if(desk.getClientRects().length&&Date.now()-lastScan>=120000)scan()},10000);
 if(getQuotes().length)scan();else render();
 return Object.freeze({get,render,scan,paperOnly:true,dispose(){disposed=true;++scanGeneration;clearInterval(timer)}});
}
