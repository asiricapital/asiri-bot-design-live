const canonical=(value)=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9.-]/g,'').slice(0,12);

async function json(url,options={}){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(url,{cache:'no-store',...options,signal:controller.signal});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Request failed (${response.status})`);
    return payload;
  }finally{clearTimeout(timeout)}
}

async function sessionClient(){
  const config=await json('/api/config');
  if(!config.supabase?.enabled||!window.supabase)throw new Error('Supabase is not ready');
  const client=window.supabase.createClient(config.supabase.url,config.supabase.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
  let session=null;
  for(let attempt=0;attempt<8;attempt++){
    const result=await client.auth.getSession();
    session=result.data.session;
    if(session)break;
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(!session){
    const signed=await client.auth.signInAnonymously();
    if(signed.error)throw signed.error;
    session=signed.data.session;
  }
  return {client,session,config};
}

async function positionsFrom(client,userId){
  const result=await client.from('portfolio').select('*').eq('user_id',userId).order('created_at',{ascending:true});
  if(result.error)throw result.error;
  return result.data||[];
}

async function committee(symbol){
  try{return await json(`/api/investment-committee/${encodeURIComponent(symbol)}`)}
  catch(error){return {symbol,error:error.message}}
}

export async function loadIntelligenceBrief(force=false){
  const {client,session,config}=await sessionClient();
  const positions=await positionsFrom(client,session.user.id);
  const symbols=positions.map(row=>canonical(row.symbol)).filter(Boolean);
  const portfolioPayload=positions.map(row=>({
    id:row.id,symbol:canonical(row.symbol),quantity:Number(row.quantity||0),avg_price:Number(row.avg_price||0),
    stop_loss:row.stop_loss,target1:row.target1,target2:row.target2,notes:row.notes||''
  }));
  const suffix=force?`t=${Date.now()}`:'';
  const intelligenceUrl=`/api/market-intelligence?symbols=${encodeURIComponent(symbols.join(','))}${suffix?`&${suffix}`:''}`;
  const auth={authorization:`Bearer ${session.access_token}`};
  const tasks={
    portfolio:portfolioPayload.length?json('/api/portfolio-analysis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({positions:portfolioPayload})}):Promise.resolve([]),
    market:json(`/api/market${suffix?`?${suffix}`:''}`),
    intelligence:json(intelligenceUrl),
    health:json(`/health${suffix?`?${suffix}`:''}`),
    golden:json('/api/golden-scanner/status'),
    broker:json('/api/broker/status',{headers:auth}),
    committees:Promise.all(symbols.slice(0,5).map(committee))
  };
  const keys=Object.keys(tasks);
  const settled=await Promise.allSettled(Object.values(tasks));
  const data={config,positions,errors:[]};
  settled.forEach((result,index)=>{
    const key=keys[index];
    if(result.status==='fulfilled')data[key]=result.value;
    else{data[key]=null;data.errors.push(`${key}: ${result.reason?.message||'error'}`)}
  });
  return data;
}

export function portfolioMetrics(rows=[]){
  const valid=rows.filter(row=>!row.error);
  const marketValue=valid.reduce((sum,row)=>sum+Number(row.analysis?.marketValue||0),0);
  const costValue=valid.reduce((sum,row)=>sum+Number(row.analysis?.costValue||0),0);
  const pnl=marketValue-costValue;
  const weighted=valid.map(row=>({symbol:row.symbol,value:Number(row.analysis?.marketValue||0)})).sort((a,b)=>b.value-a.value);
  const largest=weighted[0]||null;
  return {valid,marketValue,costValue,pnl,pnlPct:costValue?pnl/costValue*100:null,largest,concentration:largest&&marketValue?largest.value/marketValue*100:0};
}

export function committeeMetrics(rows=[]){
  const valid=rows.filter(row=>!row.error);
  const riskOf=(row)=>row.members?.find(member=>member.role==='RISK_OFFICER')||{};
  return {
    valid,
    vetoes:valid.filter(row=>riskOf(row).veto).length,
    conditional:valid.filter(row=>row.consensus?.decisionCode==='CONDITIONAL_ENTRY').length,
    average:valid.length?valid.reduce((sum,row)=>sum+Number(row.consensus?.confidence||0),0)/valid.length:null
  };
}
