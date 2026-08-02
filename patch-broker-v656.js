import fs from 'node:fs/promises';

const path = new URL('./v62.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');
const marker = 'ASIRI_RECONCILIATION_CENTER_V656';

if (!source.includes(marker)) {
  const initAnchor = "document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initBrokerB62):initBrokerB62();";
  if (!source.includes(initAnchor)) {
    console.warn('broker-v6.5.6: init anchor not found; continuing without UI enhancement');
  } else {
    const enhancement = `
// ASIRI_RECONCILIATION_CENTER_V656
function ensureReconciliationCenterB656(){
  if(document.querySelector('#recon656Center'))return;
  const host=document.querySelector('#brokergateway .broker62-shell');
  if(!host)return;
  const section=document.createElement('section');
  section.id='recon656Center';
  section.className='panel recon656-center';
  section.innerHTML=\`
    <div class="section-head"><div><span class="eyebrow">PORTFOLIO RECONCILIATION CENTER</span><h3>مركز مطابقة المحفظة</h3><p class="muted">Saxo Balance · Asiri Portfolio · الفروقات · آخر مزامنة · تنبيهات آمنة</p></div><button id="recon656Refresh" class="secondary">تحديث المطابقة</button></div>
    <div class="recon656-kpis">
      <div><span>إجمالي Saxo</span><b id="recon656Total">—</b><small id="recon656Cash">النقد —</small></div>
      <div><span>قيمة Asiri</span><b id="recon656AsiriValue">—</b><small id="recon656AsiriCount">0 مركز</small></div>
      <div><span>حالة المطابقة</span><b id="recon656State">بانتظار القراءة</b><small id="recon656Counts">—</small></div>
      <div><span>آخر مزامنة</span><b id="recon656Updated">—</b><small id="recon656Source">—</small></div>
    </div>
    <div class="recon656-grid"><div><h4>تنبيهات التشغيل</h4><div id="recon656Alerts" class="recon656-alerts"></div></div><div><h4>بوابات الأمان</h4><div class="recon656-gates"><span>✓ قراءة فقط</span><span>✓ Supabase مشفّر</span><span>✓ Shadow Mode</span><span>✓ التداول معطّل</span></div></div></div>\`;
  const mock=host.querySelector('.broker62-mock-panel');
  host.insertBefore(section,mock||host.firstChild);
  if(!document.querySelector('#recon656Styles')){
    const style=document.createElement('style');style.id='recon656Styles';
    style.textContent='.recon656-center{border-color:rgba(66,211,146,.38)}.recon656-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.recon656-kpis>div{padding:15px;border:1px solid rgba(120,170,210,.24);border-radius:16px;background:rgba(8,31,48,.55)}.recon656-kpis span,.recon656-kpis small{display:block;color:#91a7b8}.recon656-kpis b{display:block;font-size:1.18rem;margin:7px 0}.recon656-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:16px}.recon656-alerts{display:grid;gap:8px}.recon656-alert{padding:10px 12px;border-radius:12px;background:rgba(17,50,70,.65);border:1px solid rgba(130,180,210,.18)}.recon656-alert.up{border-color:rgba(66,211,146,.35)}.recon656-alert.warn{border-color:rgba(255,190,80,.45)}.recon656-alert.down{border-color:rgba(255,90,105,.45)}.recon656-gates{display:grid;grid-template-columns:1fr 1fr;gap:8px}.recon656-gates span{padding:10px;border-radius:12px;background:rgba(25,67,82,.58)}@media(max-width:760px){.recon656-kpis{grid-template-columns:1fr 1fr}.recon656-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  document.querySelector('#recon656Refresh')?.addEventListener('click',async()=>{
    await loadBrokerStatusB62();
    if(brokerStatusB62?.connected)await loadSnapshotB62();else await loadLatestB62();
    renderReconciliationCenterB656();
  });
}

function renderReconciliationCenterB656(){
  ensureReconciliationCenterB656();
  const snap=brokerSnapshotB62||{},b=snap.balance||{},rows=compareB62();
  const counts={MATCH:0,NEW:0,CHANGE:0,MISSING:0};rows.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  const asiriValue=portfolioRowsB62.reduce((sum,p)=>sum+Number(p.quantity||0)*Number(p.avg_price||0),0);
  const set=(id,value)=>{const el=document.querySelector('#'+id);if(el)el.textContent=value};
  set('recon656Total',moneyB62(b.totalValue,b.currency||'USD'));
  set('recon656Cash','النقد '+moneyB62(b.cashBalance,b.currency||'USD'));
  set('recon656AsiriValue',moneyB62(asiriValue,'USD'));
  set('recon656AsiriCount',portfolioRowsB62.length+' مركز');
  const issues=counts.NEW+counts.CHANGE+counts.MISSING;
  set('recon656State',!brokerSnapshotB62?'بانتظار القراءة':issues===0?'متطابقة':'تحتاج مراجعة');
  set('recon656Counts','مطابق '+counts.MATCH+' · مختلف '+counts.CHANGE+' · جديد '+counts.NEW+' · مفقود '+counts.MISSING);
  set('recon656Updated',snap.updatedAt?new Date(snap.updatedAt).toLocaleString('ar-SA'):(brokerStatusB62?.lastSnapshotAt?new Date(brokerStatusB62.lastSnapshotAt).toLocaleString('ar-SA'):'—'));
  set('recon656Source',sourceLabelB62(snap.source||brokerStatusB62?.lastSnapshotSource));
  const expiry=brokerStatusB62?.tokenExpiresAt?new Date(brokerStatusB62.tokenExpiresAt).getTime():0;
  const mins=expiry?Math.round((expiry-Date.now())/60000):null;
  const alerts=[
    {state:brokerStatusB62?.connected?'up':'down',text:brokerStatusB62?.connected?'اتصال Saxo جاهز':'اتصال Saxo غير متاح'},
    {state:brokerStatusB62?.storageMode==='supabase-encrypted'?'up':'down',text:brokerStatusB62?.storageMode==='supabase-encrypted'?'التخزين الدائم مشفّر':'التخزين الدائم يحتاج مراجعة'},
    {state:mins===null?'warn':mins>10?'up':mins>0?'warn':'down',text:'صلاحية رمز Saxo: '+(mins===null?'غير متاح':mins+' دقيقة')}
  ];
  if(brokerSnapshotB62)alerts.push({state:issues===0?'up':'warn',text:issues===0?'لا توجد فروقات في المراكز':'ظهرت فروقات وتحتاج مراجعة يدوية'});
  const box=document.querySelector('#recon656Alerts');if(box)box.innerHTML=alerts.map(a=>'\u003cdiv class="recon656-alert '+a.state+'">'+escB62(a.text)+'\u003c/div>').join('');
}

const originalRenderSnapshotB656=renderSnapshotB62;
renderSnapshotB62=function(){const result=originalRenderSnapshotB656();renderReconciliationCenterB656();return result};
const originalRenderStatusB656=renderBrokerStatusB62;
renderBrokerStatusB62=function(){const result=originalRenderStatusB656();renderReconciliationCenterB656();return result};
const originalMountBrokerB656=mountBrokerB62;
mountBrokerB62=function(){const result=originalMountBrokerB656();ensureReconciliationCenterB656();return result};

async function autoReadSaxoB656(){
  if(!brokerStatusB62?.connected||brokerSnapshotB62?.source==='saxo-api')return;
  const key='asiri:auto-saxo-read:'+(sessionB62?.user?.id||'anonymous');
  if(sessionStorage.getItem(key)==='done')return;
  sessionStorage.setItem(key,'running');
  try{await loadSnapshotB62();sessionStorage.setItem(key,'done');renderReconciliationCenterB656()}catch{sessionStorage.removeItem(key)}
}

const originalInitBrokerB656=initBrokerB62;
initBrokerB62=async function(){await originalInitBrokerB656();renderReconciliationCenterB656();await autoReadSaxoB656()};
`;
    source = source.replace(initAnchor, enhancement + '\n' + initAnchor);
    await fs.writeFile(path, source, 'utf8');
  }
}

console.log('broker-v6.5.6-patch',{applied:true,reconciliationCenter:true,automaticReadOnlyRefresh:true,tradingEnabled:false});
