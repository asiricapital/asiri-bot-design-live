import {PAPER_RULES,halfSpreadBps} from './paper-lab-shared-engine.mjs';
import {quoteBlockReason,previewOrder} from './manual-paper-core.mjs?v=3';

export const RECOMMENDATION_RULES=Object.freeze({minPrice:1,maxPrice:10,maxAnalysisAgeMs:120000,maxPriceDriftPct:.5,minNetRewardRisk:2,minAverageDollarVolume:1000000});
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const number=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
const stamp=x=>Date.parse(x||'');
const strings=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'):[];

// A source-backed paper candidate. No orders, persistence, score generation, or WATCH promotion.
export function buildPaperRecommendation(wallet,analysis,quote,now=Date.now(),fetchedAt=now){
 const symbol=String(analysis?.symbol||quote?.symbol||'');
 const decision=analysis?.unifiedDecision,order=decision?.order,candidate=analysis?.candidateAnalysis;
 const score=number(decision?.score),stop=order?.stopLoss,target=order?.target1;
 const id=[symbol,analysis?.updatedAt,stop,target,score].join('|');
 const blocked=message=>({id,symbol,status:'WAIT',message,score,paperOnly:true});
 const quoteReason=quoteBlockReason(quote,symbol,now);if(quoteReason)return blocked(quoteReason);
 if(quote.price<RECOMMENDATION_RULES.minPrice||quote.price>RECOMMENDATION_RULES.maxPrice)return blocked('خارج نطاق الترشيحات: من 1 إلى 10 دولارات.');
 if(!analysis||analysis.symbol!==quote.symbol||!analysis.source)return blocked('بانتظار تحليل موثق من محرك ASIRI.');
 if(analysis.paperTestMode===true||analysis.testMode===true)return blocked('نتيجة اختبار؛ لا تُعرض كترشيح سوق.');
 const analyzedAge=now-stamp(analysis.observedAt),fetchAge=now-fetchedAt;
 if(!Number.isFinite(analyzedAge)||analyzedAge< -5000||analyzedAge>RECOMMENDATION_RULES.maxAnalysisAgeMs||!Number.isFinite(fetchAge)||fetchAge<0||fetchAge>RECOMMENDATION_RULES.maxAnalysisAgeMs)return blocked('انتهت صلاحية التحليل؛ حدّث الترشيحات.');
 const analyzedQuoteReason=quoteBlockReason({...analysis,bidPrice:analysis.bid,askPrice:analysis.ask},symbol,now);
 if(analyzedQuoteReason)return blocked(`قراءة التحليل: ${analyzedQuoteReason}`);
 if(candidate?.isShariaCompliant!==true||candidate?.shariaStatus!=='COMPLIANT')return blocked('لم يصل تأكيد التوافق الشرعي من قائمة المنصة المعتمدة.');
 if(decision?.verdict!=='READY_FOR_HUMAN_REVIEW')return blocked(`لم يكتمل الترشيح: ${[...strings(decision?.missing),...strings(decision?.risks)].slice(0,3).join(' · ')||candidate?.reason||'محرك ASIRI في حالة انتظار'}`);
 if(score===null||score<0||score>100)return blocked('درجة المحرك غير مكتملة.');
 if(!['score','relativeVolume','rewardRisk','quantity','spread','dataFresh'].every(key=>decision.gates?.[key]===true))return blocked('لم تكتمل بوابات المحرك الموحد.');
 if(candidate?.dataComplete!==true||candidate.missingData?.length)return blocked('البيانات التحليلية الأساسية غير مكتملة.');
 if(!order||String(order.symbol||'')!==symbol||String(order.side||'').toUpperCase()!=='BUY'||order.orderType!=='Limit')return blocked('خطة شراء محددة السعر غير مكتملة من المحرك.');
 if(!positive(analysis.price)||!positive(order.limitPrice)||!positive(stop)||!positive(target))return blocked('مستويات الترشيح غير مكتملة.');
 if(Math.abs(quote.price/analysis.price-1)*100>RECOMMENDATION_RULES.maxPriceDriftPct||Math.abs(quote.price/order.limitPrice-1)*100>RECOMMENDATION_RULES.maxPriceDriftPct)return blocked('تحرك السعر أكثر من 0.5% عن التحليل؛ يلزم ترشيح محدث.');
 const averageVolume=positive(analysis.averageVolume)?analysis.averageVolume:null;
 if(!averageVolume||averageVolume*quote.price<RECOMMENDATION_RULES.minAverageDollarVolume)return blocked('السيولة اليومية الموثقة أقل من حد الترشيح أو غير مكتملة.');
 if(wallet?.trades?.some(t=>t.side==='BUY'&&t.recommendation?.id===id))return blocked('سبق تأكيد هذا الترشيح تجريبيًا؛ انتظر تحليلًا جديدًا.');
 if(!positive(wallet?.initialCash)||!Number.isFinite(wallet?.cash)||!wallet.positions)return blocked('تعذر قراءة رصيد المحاكاة.');
 const spread=halfSpreadBps({bid:quote.bidPrice,ask:quote.askPrice});
 if(spread.bps>PAPER_RULES.maxEntryHalfSpreadBps)return blocked('فرق السعر أوسع من حد المحاكاة.');
 const entry=quote.price*(1+(spread.bps+PAPER_RULES.slippageBps)/10000),feeRate=PAPER_RULES.feeBps/10000;
 const exitFactor=(1-(spread.bps+PAPER_RULES.slippageBps)/10000)*(1-feeRate);
 const unitCost=entry*(1+feeRate),unitRisk=unitCost-stop*exitFactor,unitReward=target*exitFactor-unitCost;
 if(stop>=entry||target<=entry||unitRisk<=0||unitReward<=0)return blocked('تغير السعر فأصبحت مستويات الوقف أو الهدف غير صالحة.');
 const rewardRisk=unitReward/unitRisk;
 if(rewardRisk<RECOMMENDATION_RULES.minNetRewardRisk)return blocked('صافي العائد/المخاطرة بعد التكاليف أقل من 2:1.');
 const reserve=wallet.initialCash*PAPER_RULES.minCashPct;
 const positionBudget=Math.max(0,wallet.initialCash*PAPER_RULES.maxPositionPct-(wallet.positions[symbol]?.costBasis||0));
 const riskBudget=Math.min(wallet.initialCash,wallet.cash)*.01;
 const quantity=Math.max(0,Math.min(Math.floor(Math.max(0,wallet.cash-reserve)/unitCost),Math.floor(positionBudget/unitCost),Math.floor(riskBudget/unitRisk)));
 if(!quantity)return blocked('الرصيد وحدود المركز أو المخاطرة لا تسمح بسهم كامل إضافي.');
 const reasons=[...strings(decision.reasons),...strings(candidate.reasons)];
 const explanation=[...new Set(reasons)].slice(0,4).join(' · ')||'استوفى بوابات محرك ASIRI الموحد.';
 const recommendation={id,engine:decision.engine||'ASIRI unified',verdict:decision.verdict,score,analysisAt:analysis.observedAt,analysisQuoteAt:analysis.updatedAt,analysisSource:analysis.source,shariaSource:candidate.shariaSource||'قائمة المنصة',fetchedAt};
 const reason=`ترشيح محرك ASIRI للتجربة: ${explanation} · صافي عائد/مخاطرة ${rewardRisk.toFixed(2)}:1. مستويات المحرك محفوظة؛ الكمية من رصيد المحاكاة ومخاطرة حتى 1%.`.slice(0,950);
 const plan={symbol,side:'BUY',quantity,stop,target,entry,referencePrice:quote.price,quoteAt:quote.updatedAt||quote.time,source:quote.source,status:'DRAFT',message:'ترشيح تجريبي مؤهل للمراجعة؛ ينتظر معاينتك وتأكيدك.',reason,recommendation,rewardRisk,totalCost:quantity*unitCost,cashAfter:wallet.cash-quantity*unitCost,risk:quantity*unitRisk,riskBudget,reserve,positionBudget,limiting:'الرصيد والمركز 10% والمخاطرة 1%',technicalSource:'محرك ASIRI الموحد',historyAt:analysis.observedAt,spreadSource:spread.source,context:analysis.technicals?.trendLabel||'من التحليل الموحد',rsi:number(analysis.technicals?.rsi14)};
 try{previewOrder(wallet,{...plan,currencyAcknowledged:true},quote,now)}catch(e){return blocked(e.message)}
 return {id,symbol,status:'READY',message:plan.message,score,explanation,plan,recommendation,paperOnly:true};
}
