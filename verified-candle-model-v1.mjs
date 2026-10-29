const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export const validCandle=row=>['open','high','low','close'].every(k=>positive(row?.[k]))&&row.high>=Math.max(row.open,row.close)&&row.low<=Math.min(row.open,row.close)&&row.high>=row.low;
const parsedDate=value=>{const n=value?Date.parse(value):NaN;return Number.isFinite(n)?n:null;};
export function selectChartHistory(payload,symbol){
 const empty={rows:[],kind:'none',source:null,origin:null,lastBarMayUpdate:false};
 if(payload?.symbol!==symbol||!payload.source)return empty;
 const chart=payload.chartHistory;
 if(chart?.availability==='available'&&chart.interval==='1d'&&chart.timeZone==='America/New_York'&&chart.source&&['PROVIDER','VERIFIED_MEMORY'].includes(chart.origin)&&Array.isArray(chart.rows)&&chart.rows.length>=2&&chart.rows.length<=126){
  let previous='';const rows=[];
  for(const row of chart.rows){const time=parsedDate(row?.date);if(time===null||!validCandle(row)||dayFormat.format(new Date(time))!==row.sessionDate||row.sessionDate<=previous)return fallback();previous=row.sessionDate;rows.push({...row,volume:typeof row.volume==='number'&&Number.isFinite(row.volume)&&row.volume>=0?row.volume:null});}
  if(rows.at(-1).date!==chart.endOfHistory)return fallback();
  return{rows,kind:'candles',source:chart.source,origin:chart.origin,lastBarMayUpdate:chart.lastBarMayUpdate===true};
 }
 return fallback();
 function fallback(){
  const rows=[],seen=new Set();
  for(const row of payload.indicators?.sparkline||[]){const time=parsedDate(row?.date||row?.time),close=Number(row?.close);if(time===null||!positive(close))continue;const sessionDate=dayFormat.format(new Date(time));if(seen.has(sessionDate))return empty;seen.add(sessionDate);rows.push({date:new Date(time).toISOString(),sessionDate,close});}
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  return rows.length>=2?{rows:rows.slice(-126),kind:'line',source:payload.source,origin:null,lastBarMayUpdate:false}:empty;
 }
}
export function chartRange(history,period='3M'){
 if(!history.length)return{rows:[],start:0,end:0};
 const months=period==='1M'?1:period==='3M'?3:null;
 let start=0;
 if(months){const day=history.at(-1).sessionDate||dayFormat.format(new Date(history.at(-1).date)),[y,m,d]=day.split('-').map(Number);const last=new Date(Date.UTC(y,m-months,0)).getUTCDate();const cutoff=new Date(Date.UTC(y,m-1-months,Math.min(d,last))).toISOString().slice(0,10);const i=history.findIndex(row=>(row.sessionDate||dayFormat.format(new Date(row.date)))>=cutoff);start=i<0?history.length-1:i;}
 return{rows:history.slice(start),start,end:history.length-1};
}
export function chartStats(rows){
 if(!rows.length)return null;
 const first=rows[0].close,last=rows.at(-1).close,candles=rows.every(validCandle);
 return{changePct:(last/first-1)*100,high:Math.max(...rows.map(r=>candles?r.high:r.close)),low:Math.min(...rows.map(r=>candles?r.low:r.close)),candles,count:rows.length};
}
