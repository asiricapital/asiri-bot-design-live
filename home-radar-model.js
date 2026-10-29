/* Display model shared by the home radar; no requests, storage writes or trade decisions. */
(() => {
 'use strict';
 const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
 const time=value=>{const n=new Date(value||'').getTime();return Number.isFinite(n)?n:null;};
 function createStore(){
  const samples=new Map();let rows=[];
  function ingest(quotes,classify){
   const symbols=new Set(quotes.map(q=>q.symbol));for(const s of samples.keys())if(!symbols.has(s))samples.delete(s);
   rows=quotes.map((q,index)=>{
    const health=classify(q),price=number(q.price),at=time(q.updatedAt||q.time);let record=samples.get(q.symbol);
    if(health.state==='FRESH'&&price>0&&at!==null&&q.source){
     if(!record||record.source!==q.source){record={source:q.source,points:[]};samples.set(q.symbol,record);}
     const last=record.points.at(-1);if(!last||at>last.at){record.points.push({at,price});record.points=record.points.slice(-24);}
    }
    const points=record&&record.source===q.source?record.points.map(p=>({...p})):[];
    return{symbol:q.symbol,index,price:price>0?price:null,quoteAt:at,source:q.source||null,health,points,
     sampleChange:points.length>1?(points.at(-1).price/points[0].price-1)*100:null};
   });
  }
  function counts(){const result={total:rows.length,fresh:0,delayed:0,stale:0,missing:0};for(const r of rows)result[{FRESH:'fresh',DELAYED:'delayed',STALE:'stale',UNAVAILABLE:'missing'}[r.health.state]||'missing']++;return{...result,review:result.total-result.fresh};}
  function select({query='',filter='ALL',sort='watchlist'}={}){
   const text=String(query).trim().toUpperCase();let selected=rows.filter(r=>r.symbol.includes(text)&&(filter==='FRESH'?r.health.state==='FRESH':filter==='REVIEW'?r.health.state!=='FRESH':true));
   if(sort==='price')selected.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity)||a.index-b.index);
   if(sort==='recent')selected.sort((a,b)=>(b.quoteAt??-Infinity)-(a.quoteAt??-Infinity)||a.index-b.index);
   return selected.map(r=>({...r,points:r.points.map(p=>({...p}))}));
  }
  return Object.freeze({ingest,counts,select});
 }
 function miniPath(points){
  if(points.length<2)return null;const values=points.map(p=>p.price),min=Math.min(...values),max=Math.max(...values),span=max-min;
  return values.map((v,i)=>`${i?'L':'M'}${(i/(values.length-1)*136+2).toFixed(2)},${(span?30-(v-min)/span*26:17).toFixed(2)}`).join(' ');
 }
 window.asiriRadarData=Object.freeze({createStore,miniPath});
})();
