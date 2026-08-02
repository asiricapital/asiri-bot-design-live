import fs from 'node:fs/promises';

const path = new URL('./v62.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');

try {
  // Patch only the response handling after the existing Mock request.
  // This avoids depending on exact Arabic copy, whitespace, or punctuation.
  if (!source.includes('brokerSnapshotB62.persistence||{}')) {
    const requestLine = "    brokerSnapshotB62=await brokerFetchB62('/api/broker/mock/snapshot',{method:'POST',body:JSON.stringify({scenario})});";
    const requestReplacement = `${requestLine}
    const p=brokerSnapshotB62.persistence||{};
    if(p.ok){
      status.textContent=\`✅ نجح الاختبار وحُفظ في Supabase. Snapshot: \${p.snapshotVerified?'مؤكد':'غير مؤكد'} · Sync: \${p.syncRunVerified?'مؤكد':'غير مؤكد'}\`;
      status.className='status up';
    }else if(p.error){
      status.textContent=\`⚠️ نجح الاختبار في الذاكرة فقط. سبب التخزين: \${p.error}\`;
      status.className='status down';
    }`;
    if (source.includes(requestLine)) source = source.replace(requestLine, requestReplacement);
    else console.warn('broker-v6.5.4-patch', { warning: 'mock request line not found; continuing without UI persistence label' });
  }

  if (!source.includes('async function runStorageSelfTestB62')) {
    const insertAnchor = 'async function connectSaxoB62(){';
    const helper = `async function runStorageSelfTestB62(){
  const status=$b62('#broker62ActionStatus');
  try{
    const result=await brokerFetchB62('/api/broker/storage/self-test',{method:'POST',body:JSON.stringify({})});
    if(result.ok){
      status.textContent=\`✅ اختبار التخزين نجح تلقائيًا. مشروع Supabase: \${result.projectRef||'غير معروف'} · نوع المفتاح: \${result.keyKind||'غير معروف'}\`;
      status.className='status up';
    }else{
      status.textContent=\`❌ اختبار التخزين فشل. المشروع: \${result.projectRef||'غير معروف'} · السبب: \${result.error||'غير معروف'}\`;
      status.className='status down';
    }
    return result;
  }catch(error){
    status.textContent=\`❌ اختبار التخزين فشل: \${error.message}\`;
    status.className='status down';
    return {ok:false,error:error.message};
  }
}

`;
    if (source.includes(insertAnchor)) source = source.replace(insertAnchor, helper + insertAnchor);
    else console.warn('broker-v6.5.4-patch', { warning: 'connect function anchor not found; continuing without self-test helper' });
  }

  if (source.includes('async function runStorageSelfTestB62') && !source.includes('await runStorageSelfTestB62();await loadLatestB62();')) {
    const oldInit = 'await Promise.all([loadPortfolioB62(),loadBrokerStatusB62()]);await loadLatestB62();';
    const newInit = 'await Promise.all([loadPortfolioB62(),loadBrokerStatusB62()]);await runStorageSelfTestB62();await loadLatestB62();';
    if (source.includes(oldInit)) source = source.replace(oldInit, newInit);
    else console.warn('broker-v6.5.4-patch', { warning: 'init anchor not found; continuing without automatic self-test' });
  }

  await fs.writeFile(path, source, 'utf8');
  console.log('broker-v6.5.4-patch', { applied: true, resilient: true, startupBlocking: false });
} catch (error) {
  // Diagnostics must never prevent the production application from starting.
  console.error('broker-v6.5.4-patch-nonfatal', { message: error.message });
}
