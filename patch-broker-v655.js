import fs from 'node:fs/promises';

const path = new URL('./v62.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');

if (!source.includes('async function autoReadSaxoB655')) {
  const anchor = `async function initBrokerB62(){`;
  const helper = `async function autoReadSaxoB655(){
  const status=$b62('#broker62ActionStatus');
  if(!brokerStatusB62?.connected)return;
  if(brokerSnapshotB62?.source==='saxo-api')return;
  const key='asiri:auto-saxo-read:'+(sessionB62?.user?.id||'anonymous');
  if(sessionStorage.getItem(key)==='done')return;
  sessionStorage.setItem(key,'running');
  try{
    status.textContent='جارٍ تنفيذ القراءة الفعلية من Saxo تلقائيًا بوضع القراءة فقط…';
    await loadSnapshotB62();
    const rows=compareB62();
    const counts=rows.reduce((acc,row)=>{acc[row.status]=(acc[row.status]||0)+1;return acc;},{});
    const summary=[
      'MATCH '+(counts.MATCH||0),
      'CHANGE '+(counts.CHANGE||0),
      'NEW '+(counts.NEW||0),
      'MISSING '+(counts.MISSING||0)
    ].join(' · ');
    status.textContent='✅ تمت قراءة Saxo الفعلية وحفظ اللقطة في Supabase. نتيجة المطابقة: '+summary;
    status.className='status up';
    sessionStorage.setItem(key,'done');
  }catch(error){
    sessionStorage.removeItem(key);
    status.textContent='تعذرت القراءة التلقائية من Saxo: '+error.message;
    status.className='status down';
  }
}

`;
  if (source.includes(anchor)) source = source.replace(anchor, helper + anchor);
  else console.warn('v6.5.5 helper anchor not found; continuing without auto-read helper injection');
}

if (!source.includes('await autoReadSaxoB655();')) {
  const initStart = source.indexOf('async function initBrokerB62(){');
  const initEnd = initStart >= 0 ? source.indexOf('\n}', initStart) : -1;
  if (initStart >= 0 && initEnd > initStart) {
    const initBlock = source.slice(initStart, initEnd + 2);
    let patchedBlock = initBlock;
    if (patchedBlock.includes('await loadLatestB62();')) {
      patchedBlock = patchedBlock.replace('await loadLatestB62();', 'await loadLatestB62();await autoReadSaxoB655();');
    } else if (patchedBlock.includes('renderSnapshotB62();')) {
      patchedBlock = patchedBlock.replace('renderSnapshotB62();', 'await autoReadSaxoB655();renderSnapshotB62();');
    } else {
      console.warn('v6.5.5 init sequence not found; continuing without auto-read call');
    }
    source = source.slice(0, initStart) + patchedBlock + source.slice(initEnd + 2);
  } else {
    console.warn('v6.5.5 init block not found; continuing without auto-read call');
  }
}

await fs.writeFile(path, source, 'utf8');
console.log('broker-v6.5.5-patch', {
  applied: true,
  automaticReadOnlySaxoSnapshot: source.includes('await autoReadSaxoB655();'),
  automaticReconciliationSummary: true,
  tradingEnabled: false
});
