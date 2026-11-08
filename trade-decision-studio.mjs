import { planRisk, parseBars, replayBreakout, tradeStats, walkForward } from './trade-decision-engine.mjs';

const $=id=>document.getElementById(id);
const numeric=id=>Number($(id).value);
const money=n=>Number.isFinite(n)?`$${n.toFixed(2)}`:'—';
const number=n=>Number.isFinite(n)?n.toFixed(2):'—';
const fmtR=n=>`${n>=0?'+':''}${number(n)}R`;
let bars=null;
const params=new URLSearchParams(location.search);
const symbol=(params.get('symbol')||'').toUpperCase().replace(/[^A-Z0-9.]/g,'').slice(0,12);
if(symbol) $('symbol').value=symbol;

function calculate() {
  const plan=planRisk({ equity:numeric('equity'), riskPct:numeric('risk'), entry:numeric('entry'), stop:numeric('stop'), target:numeric('target'), spread:numeric('spread'), commission:numeric('commission'), maxAllocationPct:numeric('allocation') });
  const message=$('risk-message'), grade=$('decision-grade'), reason=$('decision-reason');
  const fields=['shares','planned-loss','planned-profit','planned-rr'];
  if(plan.error){ fields.forEach(id=>$(id).textContent='—');message.textContent=plan.error;message.className='note bad';grade.textContent='مرفوضة';reason.textContent='راجع بيانات الخطة';return; }
  $('shares').textContent=String(plan.quantity);
  $('planned-loss').textContent=money(plan.plannedLoss);
  $('planned-profit').textContent=money(plan.plannedProfit);
  $('planned-rr').textContent=`1 : ${number(plan.rr)}`;
  if(!plan.quantity){ grade.textContent='لا حجم آمن';reason.textContent='المركز الأصغر يتجاوز حدودك';message.textContent='لا يمكن شراء سهم كامل مع الالتزام بحد المخاطرة وتخصيص رأس المال.';message.className='note bad'; }
  else if(!plan.eligible){ grade.textContent='تحتاج مراجعة';reason.textContent='العائد الصافي أقل من 1.5 ضعف المخاطرة';message.textContent='الحجم محسوب، لكن نسبة العائد إلى المخاطرة منخفضة وفق قاعدة المختبر.';message.className='note bad'; }
  else { grade.textContent='خطة قابلة للدراسة';reason.textContent='اجتازت حساب الحجم فقط، ولم تُتحقق إشارة دخول';message.textContent=`${plan.quantity} سهم · تخصيص ${number(plan.allocation)}% · مخاطرة ${money(plan.plannedLoss)}. تحقق من السعر الفعلي والسيولة قبل أي قرار.`;message.className='note good'; }
}
$('calculate').addEventListener('click',calculate);
['entry','stop','target','equity','risk','spread','commission','allocation'].forEach(id=>$(id).addEventListener('change',calculate));
calculate();

$('bars-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];bars=null;$('run-test').disabled=true;
  if(!file)return;
  const info=$('file-status');
  if(file.size>6_000_000){ info.textContent='الملف كبير جدًا (الحد 6MB).';return; }
  try{bars=parseBars(await file.text());info.textContent=`${file.name} · ${bars.length.toLocaleString('en-US')} شمعة مرتبة`;$('run-test').disabled=false;$('replay-message').textContent='البيانات جاهزة. اضغط تشغيل لبدء حساب تجريبي محلي.';}
  catch(error){info.textContent=error.message;$('replay-message').textContent='تعذر قبول البيانات: '+error.message;}
});

$('run-test').addEventListener('click',()=>{
  if(!bars)return;
  const msg=$('replay-message');
  try{
    const trades=replayBreakout(bars,{lookback:numeric('lookback'),stopAtr:numeric('stop-atr'),rr:numeric('test-rr'),spread:numeric('spread'),commission:numeric('commission')});
    const all=tradeStats(trades), wf=walkForward(trades);
    $('total-trades').textContent=String(all.count);
    $('win-rate').textContent=`${number(all.winRate*100)}%`;
    $('drawdown').textContent=number(all.maxDrawdownR);
    $('profit-factor').textContent=all.profitFactor===null?'غير متاح':number(all.profitFactor);
    $('train-net').textContent=fmtR(wf.inSample.netR);
    $('test-net').textContent=fmtR(wf.outSample.netR);
    $('train-meta').textContent=`${wf.inSample.count} صفقة · نجاح ${number(wf.inSample.winRate*100)}%`;
    $('test-meta').textContent=`${wf.outSample.count} صفقة · نجاح ${number(wf.outSample.winRate*100)}%`;
    msg.className='note '+(all.count>=30 && wf.outSample.count>=10?'good':'bad');
    msg.textContent=all.count<30?'العينة أقل من 30 صفقة؛ لا يمكن استنتاج جودة الاستراتيجية من هذا العدد.':wf.outSample.count<10?'فترة التحقق تضم أقل من 10 صفقات؛ النتيجة غير كافية.':'نتائج وصفية تاريخية فقط؛ ليست احتمالًا متوقعًا ولا تتضمن اختبارًا شاملاً لجودة التنفيذ.';
  }catch(error){msg.className='note bad';msg.textContent=error.message;}
});
