import {visualTicket} from './manual-paper-visual-model.mjs';
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const round=n=>Math.round(n*1e8)/1e8;
const text=(value,max=180)=>String(value||'').slice(0,max);
export function capturePaperDecision(wallet,trade,quote,context,now){
 const ticket=visualTicket(wallet,trade,quote,now);
 let chart=null;
 if(context?.symbol===trade.symbol&&context.source&&Array.isArray(context.history)){
  const rows=[],seen=new Set();
  for(const p of context.history){const t=Date.parse(p?.date||p?.time||'');if(!Number.isFinite(t)||t>now+5000||!positive(p?.close))continue;const date=new Date(t).toISOString();if(seen.has(date)){rows.length=0;break;}seen.add(date);rows.push({date,close:p.close});}
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length>=2)chart={source:text(context.source),origin:text(context.origin)||null,observedAt:text(context.observedAt)||null,rows:rows.slice(-32)};
 }
 return{version:1,symbol:trade.symbol,side:trade.side,capturedAt:new Date(now).toISOString(),quantity:trade.quantity,entry:trade.fill,stop:trade.side==='BUY'?trade.stop:null,target:trade.side==='BUY'?trade.target:null,referencePrice:trade.referencePrice,quoteAt:trade.quoteAt,observedAt:trade.observedAt,source:text(trade.source),quoteCurrency:quote.currency||null,modelCurrency:'USD',reason:text(trade.reason,1000),cashBefore:wallet.cash,cashAfter:trade.cashAfter,fee:trade.fee,cost:trade.cost,plannedRisk:ticket.levels?round(ticket.risk):null,plannedReward:ticket.levels?round(ticket.reward):null,ratio:ticket.levels?ticket.ratio:null,chart,paperOnly:true};
}

// Attribute actual later sales pro rata, matching the ledger's average-cost basis.
// Missing legacy fields make the result unavailable rather than guessed.
export function paperDecisionOutcome(wallet,selected){
 const unavailable={available:false};
 if(!selected?.id||!Array.isArray(wallet?.trades))return unavailable;
 if(selected.side==='SELL')return Number.isFinite(selected.realizedPnl)?{available:true,side:'SELL',realized:selected.realizedPnl,sold:selected.quantity,remaining:0,entryFee:null,exitFee:selected.fee}:unavailable;
 const lots=[];let found=null;
 for(const trade of wallet.trades){
  if(trade.symbol!==selected.symbol)continue;
  if(!Number.isSafeInteger(trade.quantity)||trade.quantity<=0||!positive(trade.cost)||!Number.isFinite(trade.fee)||trade.fee<0)return unavailable;
  if(trade.side==='BUY'){const lot={id:trade.id,remaining:trade.quantity,basis:trade.cost,sold:0,realized:0,exitFee:0,entryFee:trade.fee};lots.push(lot);if(trade.id===selected.id)found=lot;}
  else if(trade.side==='SELL'){
   const total=lots.reduce((sum,l)=>sum+l.remaining,0);if(trade.quantity>total+1e-7||total<=0)return unavailable;
   const fraction=trade.quantity/total;
   for(const lot of lots){const share=lot.remaining/total,sold=lot.remaining*fraction,basis=lot.basis*fraction;lot.sold+=sold;lot.realized+=trade.cost*share-basis;lot.exitFee+=trade.fee*share;lot.remaining-=sold;lot.basis-=basis;}
  }else return unavailable;
 }
 return found?{available:true,side:'BUY',realized:found.sold>1e-8?round(found.realized):null,sold:round(found.sold),remaining:round(Math.max(0,found.remaining)),entryFee:found.entryFee,exitFee:round(found.exitFee)}:unavailable;
}
