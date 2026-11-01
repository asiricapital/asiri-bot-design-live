import {visualTicket} from './manual-paper-visual-model.mjs';
import {quoteBlockReason} from './manual-paper-core.mjs?v=3';
export function buildChartPlan(wallet,order,quote,now=Date.now()){
 const ticket=visualTicket(wallet,order,quote,now);
 if(!ticket.available||!ticket.levels)return{available:false,message:order.side==='SELL'?'بيع من المملوك؛ لا مستويات شراء جديدة.':'أكمل كمية ووقفًا وهدفًا صالحين لعرض الخطة.'};
 const reference=Boolean(quoteBlockReason(quote,order.symbol,now));
 return{...ticket,available:true,reference,label:reference?'مسودة مرجعية · السعر غير صالح للتأكيد الآن':'مسودة حالية · تنتظر المعاينة والتأكيد',note:ticket.capacity?'ضمن حدود الرصيد والمخاطرة':'تحتاج مراجعة حدود الرصيد أو المخاطرة'};
}
