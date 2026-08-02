import fs from 'node:fs/promises';

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
const uiPath = new URL('./ui-pages-v64.js', import.meta.url);
const clientPath = new URL('./v62.js', import.meta.url);
const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
const marker = 'ASIRI_SAXO_SIM_EXECUTION_V730';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.3.0 Saxo SIM execution patch failed: ${label} anchor not found`);
  return text.replace(before, after);
}

let gateway = await fs.readFile(gatewayPath, 'utf8');
if (!gateway.includes("from './saxo-sim-execution-core-v730.js'")) {
  gateway = replaceRequired(
    gateway,
    "import crypto from 'node:crypto';",
    "import crypto from 'node:crypto';\nimport { registerSaxoSimExecution } from './saxo-sim-execution-core-v730.js';",
    'broker gateway import'
  );
}
if (!gateway.includes('registerSaxoSimExecution(app,')) {
  const registerAnchor = `export function registerBrokerGateway(app) {
  readOnlyGuard();`;
  const registerReplacement = `${registerAnchor}
  registerSaxoSimExecution(app, {
    verifyUser,
    config,
    refreshIfPossible,
    adminRest,
    markStorageError,
    buildSnapshot,
    lastSnapshots
  });`;
  gateway = replaceRequired(gateway, registerAnchor, registerReplacement, 'broker gateway registration');
}
await fs.writeFile(gatewayPath, gateway, 'utf8');

let ui = await fs.readFile(uiPath, 'utf8');
if (!ui.includes(marker)) {
  ui = ui
    .replace('إدارة اتصال Saxo بصورة آمنة وواضحة، مع قراءة الحساب والمراكز فقط دون تنفيذ أي أمر تداول.', 'إدارة اتصال Saxo وقراءة الحساب، مع تجهيز أوامر SIM وتنفيذها بعد تأكيدك اليدوي فقط. بيئة LIVE مقفلة دائمًا.')
    .replace('<span class="broker-v2-badge broker-v2-badge-safe"><i></i> قراءة فقط</span>', '<span class="broker-v2-badge broker-v2-badge-safe"><i></i> SIM + تأكيد يدوي</span>')
    .replace('<div><span>نوع الوصول</span><b id="broker62Mode">قراءة فقط</b></div>', '<div><span>نوع الوصول</span><b id="broker62Mode">قراءة + SIM مؤكد</b></div>')
    .replace('<div><i>✓</i><span><b>التداول مغلق</b><small>SAXO_ALLOW_TRADING = false</small></span></div>', '<div><i>✓</i><span><b>LIVE مغلق</b><small>التنفيذ محصور في SIM وبعد تأكيد يدوي.</small></span></div>')
    .replace('أي محاولة لتفعيل التداول المباشر يجب أن تُرفض من الخادم.', 'SAXO_ALLOW_TRADING يبقى false، ومسار التنفيذ الجديد لا يقبل إلا SIM + Limit + تأكيد يدوي.')
    .replace('الاتصال في وضع القراءة فقط، ولا يستطيع إرسال أوامر شراء أو بيع.', 'قراءة الحساب آمنة. تنفيذ SIM يمر عبر Pre-check ثم تأكيد يدوي مستقل.');

  const insertionAnchor = `    <section class="panel broker62-mock-panel broker-v2-lab">`;
  const executionDesk = `    <!-- ASIRI_SAXO_SIM_EXECUTION_V730 -->
    <section id="saxoExecutionV730" class="panel sx730-desk" aria-labelledby="sx730Title">
      <div class="section-head broker-v2-section-head sx730-head">
        <div>
          <span class="broker-v2-overline">SAXO SIM EXECUTION DESK</span>
          <h3 id="sx730Title">منضدة التنفيذ المؤكد</h3>
          <p>حل UIC، فحص السعر والمخاطر، Saxo Pre-check، ثم إرسال Limit Order إلى SIM بعد موافقتك الصريحة فقط.</p>
        </div>
        <div class="sx730-state-stack">
          <span id="sx730ModeBadge" class="broker-v2-badge">جارٍ الفحص…</span>
          <span class="broker-v2-badge sx730-live-lock">LIVE LOCKED</span>
        </div>
      </div>

      <div id="sx730Blockers" class="sx730-blockers" role="status"></div>

      <div class="sx730-form-grid">
        <label><span>حساب Saxo SIM</span><select id="sx730Account"><option value="">اقرأ حساب Saxo أولًا</option></select></label>
        <label><span>رمز السهم الأمريكي</span><input id="sx730Symbol" inputmode="text" autocomplete="off" placeholder="RKLB" maxlength="12"></label>
        <label><span>الاتجاه</span><select id="sx730Side"><option value="Buy">شراء</option><option value="Sell">بيع من مركز قائم</option></select></label>
        <label><span>الكمية</span><input id="sx730Quantity" type="number" min="0.0001" step="0.0001" placeholder="10"></label>
        <label><span>سعر Limit بالدولار</span><input id="sx730LimitPrice" type="number" min="0.0001" step="0.0001" placeholder="12.50"></label>
        <label><span>مدة الأمر</span><select id="sx730Duration"><option value="DayOrder">حتى نهاية الجلسة</option><option value="GoodTillCancel">صالح حتى الإلغاء</option></select></label>
      </div>

      <div class="sx730-actions">
        <button id="sx730Resolve" class="broker-v2-secondary" type="button">1. حل UIC</button>
        <button id="sx730Preview" class="broker-v2-primary" type="button">2. تشغيل Pre-check</button>
        <button id="sx730RefreshOrders" class="broker-v2-tertiary" type="button">تحديث الأوامر</button>
      </div>
      <div id="sx730Status" class="status sx730-status" role="status" aria-live="polite">لن يُرسل أي أمر قبل ظهور المعاينة وتفعيل مربع التأكيد.</div>

      <div id="sx730Instrument" class="sx730-result sx730-hidden"></div>
      <div id="sx730PreviewCard" class="sx730-preview sx730-hidden">
        <div id="sx730PreviewSummary"></div>
        <label class="sx730-confirm-row"><input id="sx730ConfirmCheck" type="checkbox"><span>أؤكد أن البيانات أعلاه صحيحة وأن هذا أمر تجريبي على Saxo SIM فقط.</span></label>
        <button id="sx730Confirm" class="sx730-confirm-button" type="button" disabled>3. تأكيد وإرسال إلى Saxo SIM</button>
      </div>
      <div id="sx730Receipt" class="sx730-receipt sx730-hidden"></div>

      <div class="sx730-orders-panel">
        <div class="broker-v2-panel-title"><span>حالة أوامر Saxo SIM</span><small>Submitted · Working · Partially Filled · Filled · Rejected · Cancelled</small></div>
        <div id="sx730Orders" class="trade-list"><p class="muted">لم يتم تحميل الأوامر بعد.</p></div>
      </div>
    </section>

`;
  ui = replaceRequired(ui, insertionAnchor, executionDesk + insertionAnchor, 'execution desk placement');
  await fs.writeFile(uiPath, ui, 'utf8');
}

let client = await fs.readFile(clientPath, 'utf8');
if (!client.includes(marker)) {
  const initAnchor = "document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initBrokerB62):initBrokerB62();";
  const clientEnhancement = `
// ASIRI_SAXO_SIM_EXECUTION_V730
let sx730ExecutionStatus=null,sx730Instrument=null,sx730PreviewData=null;
const sx730El=(id)=>document.querySelector('#'+id);
const sx730Fmt=(value,digits=2)=>Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';

function sx730SetStatus(text,state=''){
  const el=sx730El('sx730Status');if(!el)return;el.textContent=text;el.className='status sx730-status '+state;
}

function sx730Accounts(){
  const select=sx730El('sx730Account');if(!select)return;
  const current=select.value;
  const accounts=(brokerSnapshotB62?.accounts||[]).filter(a=>a.active!==false&&a.accountKey);
  select.innerHTML=accounts.length?accounts.map(a=>'<option value="'+escB62(a.accountKey)+'">'+escB62((a.accountId||'Saxo SIM')+' · '+(a.currency||'USD'))+'</option>').join(''):'<option value="">اقرأ حساب Saxo أولًا</option>';
  if(accounts.some(a=>a.accountKey===current))select.value=current;
}

function sx730RenderExecutionStatus(){
  const status=sx730ExecutionStatus||{};
  const badge=sx730El('sx730ModeBadge');
  if(badge){badge.textContent=status.enabled?'SIM CONFIRMED READY':'SIM EXECUTION LOCKED';badge.className='broker-v2-badge '+(status.enabled?'sx730-ready':'sx730-locked')}
  const blockers=sx730El('sx730Blockers');
  if(blockers){blockers.innerHTML=status.blockers?.length?status.blockers.map(x=>'<div>⚠️ '+escB62(x)+'</div>').join(''):'<div class="sx730-ok">✓ البيئة SIM، وLimit فقط، وLIVE مقفل، والتأكيد اليدوي إلزامي.</div>'}
  ['sx730Resolve','sx730Preview'].forEach(id=>{const el=sx730El(id);if(el)el.disabled=!status.enabled});
  const mode=$b62('#broker62Mode');if(mode)mode.textContent=status.enabled?'قراءة + SIM مؤكد':'قراءة فقط';
}

async function sx730LoadExecutionStatus(){
  sx730ExecutionStatus=await brokerFetchB62('/api/broker/saxo/execution/status');
  sx730RenderExecutionStatus();return sx730ExecutionStatus;
}

async function sx730ResolveInstrument(){
  sx730PreviewData=null;sx730El('sx730PreviewCard')?.classList.add('sx730-hidden');sx730El('sx730Receipt')?.classList.add('sx730-hidden');
  const symbol=canonicalB62(sx730El('sx730Symbol')?.value);
  const accountKey=sx730El('sx730Account')?.value||'';
  if(!accountKey){sx730SetStatus('اقرأ حساب Saxo واختر الحساب قبل حل UIC.','down');return}
  if(!symbol){sx730SetStatus('أدخل رمز سهم أمريكي صحيح.','down');return}
  sx730SetStatus('جارٍ حل الرمز إلى UIC والتحقق من قابلية التداول…');
  try{
    const data=await brokerFetchB62('/api/broker/saxo/instruments/resolve',{method:'POST',body:JSON.stringify({symbol,accountKey})});
    sx730Instrument=data.instrument;
    const box=sx730El('sx730Instrument');
    if(box){box.classList.remove('sx730-hidden');box.innerHTML='<div><span>السهم</span><b>'+escB62(data.instrument.symbol)+'</b></div><div><span>UIC</span><b>'+escB62(data.instrument.uic)+'</b></div><div><span>السوق</span><b>'+escB62(data.instrument.exchangeId||data.instrument.exchangeName||'—')+'</b></div><div><span>العملة</span><b>'+escB62(data.instrument.currency||'—')+'</b></div>'}
    sx730SetStatus('تم حل UIC بنجاح. أدخل الكمية والسعر ثم شغّل Pre-check.','up');
  }catch(error){sx730Instrument=null;sx730SetStatus('تعذر حل الأداة: '+error.message,'down')}
}

function sx730PreviewHtml(data){
  const risk=data.risk||{},market=data.market||{},order=data.order||{},instrument=data.instrument||{};
  const checks=(risk.checks||[]).map(c=>'<div class="sx730-check '+(c.passed?'ok':'fail')+'"><i>'+(c.passed?'✓':'!')+'</i><span><b>'+escB62(c.name)+'</b><small>'+escB62(c.detail)+'</small></span></div>').join('');
  return '<div class="sx730-preview-head"><div><span>المعاينة النهائية</span><b>'+escB62(order.side)+' '+sx730Fmt(order.quantity,4)+' '+escB62(instrument.symbol)+' @ $'+sx730Fmt(order.limitPrice,4)+'</b></div><div><span>القيمة</span><b>$'+sx730Fmt(risk.notional,2)+'</b></div><div><span>سعر Saxo المرجعي</span><b>$'+sx730Fmt(market.referencePrice,4)+'</b></div><div><span>تنتهي</span><b>'+new Date(data.expiresAt).toLocaleTimeString('ar-SA')+'</b></div></div><div class="sx730-checks">'+checks+'</div><div class="sx730-precheck-ok">✓ اجتاز Saxo Pre-check. لم يُرسل الأمر بعد.</div>';
}

async function sx730RunPreview(){
  const accountKey=sx730El('sx730Account')?.value||'';
  const symbol=canonicalB62(sx730El('sx730Symbol')?.value);
  const side=sx730El('sx730Side')?.value||'Buy';
  const quantity=Number(sx730El('sx730Quantity')?.value);
  const limitPrice=Number(sx730El('sx730LimitPrice')?.value);
  const durationType=sx730El('sx730Duration')?.value||'DayOrder';
  if(!accountKey||!symbol||!Number.isFinite(quantity)||!Number.isFinite(limitPrice)){sx730SetStatus('أكمل الحساب والرمز والكمية وسعر Limit.','down');return}
  sx730SetStatus('جارٍ تحديث الحساب والسعر وتشغيل ضوابط المخاطر وSaxo Pre-check…');
  try{
    const payload={accountKey,symbol,side,quantity,limitPrice,durationType,uic:sx730Instrument?.uic||null,assetType:sx730Instrument?.assetType||'Stock'};
    sx730PreviewData=await brokerFetchB62('/api/broker/saxo/orders/preview',{method:'POST',body:JSON.stringify(payload)});
    sx730Instrument=sx730PreviewData.instrument;
    const card=sx730El('sx730PreviewCard'),summary=sx730El('sx730PreviewSummary'),check=sx730El('sx730ConfirmCheck'),button=sx730El('sx730Confirm');
    if(summary)summary.innerHTML=sx730PreviewHtml(sx730PreviewData);
    card?.classList.remove('sx730-hidden');if(check)check.checked=false;if(button)button.disabled=true;
    sx730SetStatus('المعاينة جاهزة. راجع كل البيانات ثم فعّل مربع التأكيد.','up');
  }catch(error){sx730PreviewData=null;sx730El('sx730PreviewCard')?.classList.add('sx730-hidden');sx730SetStatus('فشل Pre-check: '+error.message,'down')}
}

async function sx730ConfirmOrder(){
  if(!sx730PreviewData){sx730SetStatus('شغّل Pre-check جديدًا أولًا.','down');return}
  if(!sx730El('sx730ConfirmCheck')?.checked){sx730SetStatus('فعّل مربع التأكيد اليدوي قبل الإرسال.','down');return}
  const requestId='asiri-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(16).slice(2));
  const button=sx730El('sx730Confirm');if(button)button.disabled=true;
  sx730SetStatus('جارٍ إعادة فحص المخاطر وإرسال أمر Limit إلى Saxo SIM…');
  try{
    const result=await brokerFetchB62('/api/broker/saxo/orders/confirm',{method:'POST',headers:{'x-request-id':requestId},body:JSON.stringify({previewId:sx730PreviewData.previewId,confirmationToken:sx730PreviewData.confirmationToken,requestId})});
    const receipt=sx730El('sx730Receipt');if(receipt){receipt.classList.remove('sx730-hidden');receipt.innerHTML='<div class="sx730-receipt-icon">✓</div><div><span>تم الإرسال إلى Saxo SIM</span><b>Order ID: '+escB62(result.orderId||'بانتظار رقم Saxo')+'</b><small>x-request-id: '+escB62(result.requestId||requestId)+' · الحالة: '+escB62(result.status||'submitted')+'</small></div>'}
    sx730SetStatus(result.duplicate?'تم منع التكرار وإرجاع نتيجة الطلب الأصلية.':'تم إرسال الأمر التجريبي بنجاح إلى Saxo SIM.','up');
    sx730PreviewData=null;sx730El('sx730PreviewCard')?.classList.add('sx730-hidden');await sx730LoadOrders();
  }catch(error){sx730SetStatus('تعذر إكمال الإرسال: '+error.message,'down');if(button)button.disabled=false}
}

async function sx730LoadOrders(){
  const box=sx730El('sx730Orders');if(!box)return;
  box.innerHTML='<p class="muted">جارٍ قراءة أوامر Saxo SIM…</p>';
  try{
    const data=await brokerFetchB62('/api/broker/saxo/orders');
    box.innerHTML=data.orders?.length?data.orders.map(o=>'<div class="trade-row sx730-order"><div><b>'+escB62(o.symbol||o.uic||'Order')+'</b><small>'+escB62((o.side||'')+' · '+(o.amount||0)+' · '+(o.assetType||''))+'</small></div><div><b>'+escB62(o.status||'—')+'</b><small>Order '+escB62(o.orderId||'—')+' · $'+sx730Fmt(o.price,4)+' · منفذ '+sx730Fmt(o.filledAmount,4)+'</small></div></div>').join(''):'<p class="muted">لا توجد أوامر مفتوحة أعادها Saxo SIM حاليًا.</p>';
  }catch(error){box.innerHTML='<p class="status down">تعذر قراءة الأوامر: '+escB62(error.message)+'</p>'}
}

function sx730Mount(){
  sx730El('sx730Resolve')?.addEventListener('click',sx730ResolveInstrument);
  sx730El('sx730Preview')?.addEventListener('click',sx730RunPreview);
  sx730El('sx730Confirm')?.addEventListener('click',sx730ConfirmOrder);
  sx730El('sx730RefreshOrders')?.addEventListener('click',sx730LoadOrders);
  sx730El('sx730ConfirmCheck')?.addEventListener('change',e=>{const b=sx730El('sx730Confirm');if(b)b.disabled=!e.target.checked||!sx730PreviewData});
  sx730El('sx730Symbol')?.addEventListener('input',()=>{sx730Instrument=null;sx730PreviewData=null;sx730El('sx730Instrument')?.classList.add('sx730-hidden');sx730El('sx730PreviewCard')?.classList.add('sx730-hidden')});
  sx730Accounts();
}

const sx730OriginalRenderSnapshot=renderSnapshotB62;
renderSnapshotB62=function(){const result=sx730OriginalRenderSnapshot();sx730Accounts();return result};
const sx730OriginalRenderStatus=renderBrokerStatusB62;
renderBrokerStatusB62=function(){const result=sx730OriginalRenderStatus();sx730RenderExecutionStatus();return result};
const sx730OriginalInit=initBrokerB62;
initBrokerB62=async function(){await sx730OriginalInit();sx730Mount();await sx730LoadExecutionStatus().catch(error=>sx730SetStatus('تعذر فحص تنفيذ SIM: '+error.message,'down'));if(sx730ExecutionStatus?.enabled)await sx730LoadOrders()};
`;
  client = replaceRequired(client, initAnchor, clientEnhancement + '\n' + initAnchor, 'client initialization');
  await fs.writeFile(clientPath, client, 'utf8');
}

let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
if (!bootstrap.includes('/saxo-sim-execution-v730.css')) {
  const scopedAnchor = 'const scopedQueries = [';
  const cssInjection = `if (!index.includes('/saxo-sim-execution-v730.css')) index = index.replace('</head>', '<link rel="stylesheet" href="/saxo-sim-execution-v730.css?v=7300"></head>'); // ASIRI_SAXO_SIM_EXECUTION_CSS_V730\n\n`;
  bootstrap = replaceRequired(bootstrap, scopedAnchor, cssInjection + scopedAnchor, 'execution stylesheet injection');
  const staticCandidates = [
    "app.get('/broker-mobile-v722.css', (_req, res) => res.sendFile(path.join(root, 'broker-mobile-v722.css')));",
    "app.get('/broker-ui-v721.css', (_req, res) => res.sendFile(path.join(root, 'broker-ui-v721.css')));"
  ];
  const staticAnchor = staticCandidates.find((candidate) => bootstrap.includes(candidate));
  if (!staticAnchor) throw new Error('v7.3.0 Saxo SIM execution patch failed: CSS route anchor not found');
  bootstrap = bootstrap.replace(staticAnchor, `${staticAnchor}\napp.get('/saxo-sim-execution-v730.css', (_req, res) => res.sendFile(path.join(root, 'saxo-sim-execution-v730.css')));`);
  await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
}

console.log('saxo-sim-execution-v7.3.0', {
  applied: true,
  environment: 'SIM only',
  confirmedOnly: true,
  limitOrdersOnly: true,
  manualOrder: true,
  xRequestIdRequired: true,
  liveLocked: true,
  legacyTradingFlag: 'must remain false'
});
