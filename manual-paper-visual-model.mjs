import {PAPER_RULES,halfSpreadBps} from './paper-lab-shared-engine.mjs';
const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
// Display-only estimates. These never grant preview/commit eligibility.
export function visualTicket(wallet,order,quote,now=Date.now()){
 const unavailable={available:false,quantity:0,side:order.side,levels:false};
 const age=now-Date.parse(quote?.updatedAt||quote?.time||'');
 if(!positive(quote?.price)||quote.symbol!==order.symbol||!quote.source||!Number.isFinite(age)||age< -5000||age>96*3600000||(quote.currency&&quote.currency!=='USD'))return unavailable;
 const quantity=order.quantity;
 if(!Number.isSafeInteger(quantity)||quantity<=0||!['BUY','SELL'].includes(order.side))return unavailable;
 const spread=halfSpreadBps({bid:quote.bidPrice,ask:quote.askPrice}),adverse=(spread.bps+PAPER_RULES.slippageBps)/10000,feeRate=PAPER_RULES.feeBps/10000;
 const entry=quote.price*(1+(order.side==='BUY'?1:-1)*adverse),gross=quantity*entry,fee=gross*feeRate;
 const cost=order.side==='BUY'?gross+fee:gross-fee,cashAfter=wallet.cash+(order.side==='BUY'?-cost:cost);
 const owned=wallet.positions[order.symbol],reserve=wallet.initialCash*PAPER_RULES.minCashPct;
 const levels=order.side==='BUY'&&positive(order.stop)&&positive(order.target)&&order.stop<entry&&order.target>entry;
 const risk=levels?cost-order.stop*quantity*(1-adverse)*(1-feeRate):null;
 const reward=levels?order.target*quantity*(1-adverse)*(1-feeRate)-cost:null;
 const ownedEnough=order.side==='BUY'||Boolean(owned&&quantity<=owned.quantity);
 const capacity=order.side==='SELL'?ownedEnough:levels&&cashAfter>=reserve&&(owned?.costBasis||0)+cost<=wallet.initialCash*PAPER_RULES.maxPositionPct&&risk<=wallet.initialCash*.01;
 return{available:true,symbol:order.symbol,side:order.side,quantity,entry,fee,cost,cashAfter,levels,stop:order.stop,target:order.target,risk,reward,ratio:risk>0?reward/risk:null,ownedEnough,capacity,spreadSource:spread.source};
}
export function visualAllocation(wallet,ticket){
 const totalCost=Object.values(wallet.positions).reduce((n,p)=>n+p.costBasis,0);
 let cash=wallet.cash,holdings=totalCost,proposed=0;
 const projected=Boolean(ticket.available&&ticket.capacity);
 if(projected){cash=ticket.cashAfter;if(ticket.side==='BUY')proposed=ticket.cost;else{const p=wallet.positions[ticket.symbol];holdings-=p.costBasis*ticket.quantity/p.quantity;}}
 const reserve=Math.min(Math.max(0,cash),wallet.initialCash*PAPER_RULES.minCashPct);
 const segments=[{label:'احتياطي نقدي',value:reserve,color:'#d9bc80'},{label:'مراكز بالتكلفة',value:holdings,color:'#587f94'},{label:'الشراء المخطط',value:proposed,color:'#92dfc7'},{label:'نقد حر',value:Math.max(0,cash-reserve),color:'#284b60'}];
 const total=segments.reduce((n,s)=>n+s.value,0);
 return{projected,total,segments:segments.map(s=>({...s,pct:total>0?s.value/total*100:0}))};
}
export function chartTradeMarkers(history,trades,symbol){
 const day=t=>{const d=new Date(t);return Number.isFinite(d.getTime())?dayFormat.format(d):null;};
 const days=new Map(history.map((p,i)=>[day(p.date||p.time),i]).filter(([d])=>d));
 return trades.filter(t=>t.symbol===symbol&&['BUY','SELL'].includes(t.side)&&positive(t.fill)&&days.has(day(t.committedAt))).map(t=>({...t,index:days.get(day(t.committedAt))}));
}
