import { PAPER_RULES, halfSpreadBps } from './paper-lab-shared-engine.mjs';
export const MANUAL_KEY='asiri.design.manual-paper.v1';
export const newWallet=()=>({schema:1,version:0,initialCash:PAPER_RULES.initialCash,cash:PAPER_RULES.initialCash,positions:{},trades:[]});
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const round=x=>Math.round(x*1e8)/1e8;
function fail(message){throw new Error(message)}
export function quoteBlockReason(quote, symbol, now=Date.now()) {
 if(quote?.currency && quote.currency!=='USD') return 'هذا النموذج يدعم الدولار الأمريكي فقط.';
 const age=now-Date.parse(quote?.updatedAt||quote?.time||'');const observed=now-Date.parse(quote?.observedAt||'');
 if(quote?.symbol!==symbol||!positive(quote?.price)||!quote.source||!quote.isFresh||quote.error||quote.fromSnapshot||quote.isLiveSession!==true||!Number.isFinite(age)||age< -5000||age>120000||!Number.isFinite(observed)||observed< -5000||observed>120000) return 'السعر غير صالح الآن؛ انتظر قراءة حديثة بجلسة نشطة.';
 return null;
}
export function previewOrder(wallet, order, quote, now=Date.now()) {
 if(!positive(wallet?.initialCash)||!Number.isSafeInteger(wallet?.version)||Object.values(wallet?.positions||{}).some(p=>!Number.isSafeInteger(p.quantity)||p.quantity<=0||!positive(p.costBasis))) fail('بيانات المراكز المحفوظة غير صالحة.');
 if(wallet?.schema!==1||!Number.isFinite(wallet.cash)||wallet.cash<0||!Array.isArray(wallet.trades)) fail('سجل المحاكاة غير صالح؛ لا تعِد ضبطه تلقائيًا.');
 if(wallet.trades.length>=2000) fail('بلغ السجل حد المراجعة؛ احتفظ بالسجل قبل بدء تجربة أخرى.');
 if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(order.symbol)||!['BUY','SELL'].includes(order.side)||!Number.isSafeInteger(order.quantity)||order.quantity<=0) fail('اختر سهمًا وكمية صحيحة موجبة.');
 if(!String(order.reason||'').trim()||String(order.reason).length>1000) fail('اكتب سبب العملية بما لا يتجاوز 1000 حرف.');
 if(order.currencyAcknowledged!==true) fail('أكد افتراض الدولار الأمريكي لهذه المحاكاة.');
 const blocked=quoteBlockReason(quote,order.symbol,now);if(blocked)fail(blocked);
 const spread=halfSpreadBps({bid:quote.bidPrice,ask:quote.askPrice});
 if(spread.bps>PAPER_RULES.maxEntryHalfSpreadBps) fail('فرق السعر أوسع من حد المحاكاة.');
 const fill=quote.price*(1+(order.side==='BUY'?1:-1)*(PAPER_RULES.slippageBps+spread.bps)/10000);
 const gross=fill*order.quantity,fee=gross*PAPER_RULES.feeBps/10000;
 const current=wallet.positions[order.symbol];const cost=order.side==='BUY'?gross+fee:gross-fee;
 const cashAfter=round(wallet.cash+(order.side==='BUY'?-cost:cost));
 if(order.side==='BUY') {
  if(cashAfter<wallet.initialCash*PAPER_RULES.minCashPct) fail('النقد لا يكفي مع الاحتياطي النقدي 30%.');
  if((current?.costBasis||0)+cost>wallet.initialCash*PAPER_RULES.maxPositionPct) fail('تجاوز المركز حد 10% من رصيد البداية.');
  if(!positive(order.stop)||!positive(order.target)||order.stop>=fill||order.target<=fill) fail('ضع وقفًا أقل من الدخول وهدفًا أعلى منه.');
  const plannedLoss=(fill-order.stop)*order.quantity+fee+order.stop*order.quantity*PAPER_RULES.feeBps/10000;
  if(plannedLoss>wallet.initialCash*.01) fail('المخاطرة المخططة تتجاوز 1% من رصيد البداية.');
 } else if(!current||order.quantity>current.quantity) fail('لا يمكنك بيع كمية أكبر من المركز التجريبي؛ البيع على المكشوف غير متاح.');
 return {...order,reason:String(order.reason).trim(),walletVersion:wallet.version,fill:round(fill),gross:round(gross),fee:round(fee),cashAfter,spreadBps:spread.bps,spreadSource:spread.source,slippageBps:PAPER_RULES.slippageBps,referencePrice:quote.price,quoteAt:quote.updatedAt||quote.time,observedAt:quote.observedAt,source:quote.source,previewAt:now,cost:round(cost),paperOnly:true};
}
export function commitOrder(wallet,preview,quote,now=Date.now()) {
 if(!preview?.id||typeof preview.id!=='string') fail('معرّف العملية مفقود.');
 if(wallet.trades.some(t=>t.id===preview.id)) return wallet;
 if(wallet.version!==preview.walletVersion) fail('تغيرت المحفظة؛ أعد المعاينة.');
 if(now-preview.previewAt>60000||now<preview.previewAt) fail('انتهت المعاينة؛ أعد الفحص.');
 const fresh=previewOrder(wallet,preview,quote,now);
 if(fresh.quoteAt!==preview.quoteAt||fresh.referencePrice!==preview.referencePrice||fresh.source!==preview.source||fresh.fill!==preview.fill) fail('تغيرت القراءة؛ راجع معاينة جديدة.');
 const next=structuredClone(wallet);const old=next.positions[preview.symbol];let realized=null;
 if(preview.side==='BUY') next.positions[preview.symbol]={quantity:(old?.quantity||0)+preview.quantity,costBasis:round((old?.costBasis||0)+fresh.cost)};
 else {const allocated=old.costBasis*preview.quantity/old.quantity;realized=round(fresh.cost-allocated);const remaining=old.quantity-preview.quantity;if(remaining) next.positions[preview.symbol]={quantity:remaining,costBasis:round(old.costBasis-allocated)};else delete next.positions[preview.symbol];}
 next.cash=fresh.cashAfter;next.version++;next.trades.push({...fresh,id:preview.id,realizedPnl:realized,committedAt:new Date(now).toISOString()});return next;
}
