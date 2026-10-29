import { PAPER_RULES, halfSpreadBps } from './paper-lab-shared-engine.mjs';
import { quoteBlockReason } from './manual-paper-core.mjs?v=2';

// A reproducible planning scenario, never an entry signal or permission to execute.
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const floor4 = n => Math.floor(n * 10000) / 10000;
const ceil4 = n => Math.ceil(n * 10000) / 10000;
const fmt = n => Number(n.toFixed(4));
const maxReferenceAge = 96 * 60 * 60 * 1000;

export function buildPaperPlan(wallet, symbol, side, quote, technicals, now = Date.now()) {
 const empty = message => ({symbol, side, quantity:0, stop:null, target:null, reason:'', status:'UNAVAILABLE', message});
 if(!positive(wallet?.initialCash) || !Number.isFinite(wallet?.cash) || wallet.cash < 0 || !wallet.positions || !['BUY','SELL'].includes(side)) return empty('تعذر حساب المسودة من الرصيد المحفوظ.');
 const owned = wallet.positions[symbol];
 const blocked = quoteBlockReason(quote, symbol, now);
 if(side === 'SELL') {
  if(!owned || !Number.isSafeInteger(owned.quantity) || owned.quantity < 1) return empty('لا تملك هذا السهم في المحفظة التجريبية اليدوية؛ لا توجد كمية للبيع.');
  return {symbol,side,quantity:owned.quantity,stop:null,target:null,status:blocked?'REFERENCE':'DRAFT',
   message:blocked || 'جهزت كمية المركز المملوك للمراجعة؛ هذا ليس توقيت خروج مقترحًا.',
   reason:`مسودة بيع ${owned.quantity} سهم من المركز التجريبي المملوك ${symbol}؛ تكلفة المركز الشاملة ${fmt(owned.costBasis)} USD. راجع سبب الخروج والسعر قبل التأكيد.`,
   ownedQuantity:owned.quantity,quoteAt:quote?.updatedAt||quote?.time,source:quote?.source};
 }
 const quoteAge = now - Date.parse(quote?.updatedAt || quote?.time || '');
 if(quote?.symbol !== symbol || !positive(quote?.price) || !quote?.source || !Number.isFinite(quoteAge) || quoteAge < -5000 || quoteAge > maxReferenceAge || (quote.currency && quote.currency !== 'USD')) return empty('بانتظار سعر مرجعي موثق للسهم؛ لم تُفترض كمية أو مستويات.');
 const historyAge = now - Date.parse(technicals?.endOfHistory || '');
 const t = technicals?.indicators;
 if(technicals?.symbol !== symbol || technicals?.availability !== 'available' || !technicals.source || !Number.isFinite(historyAge) || historyAge < -5000 || historyAge > maxReferenceAge || !positive(t?.atr14)) return empty('بانتظار سجل يومي حديث وATR موثق لحساب الوقف والهدف.');
 const spread = halfSpreadBps({bid:quote.bidPrice,ask:quote.askPrice});
 if(spread.bps > PAPER_RULES.maxEntryHalfSpreadBps) return empty('فرق السعر أوسع من حد المحاكاة؛ لم تُجهز مسودة شراء.');
 const price = quote.price;
 const entry = price * (1 + (PAPER_RULES.slippageBps + spread.bps) / 10000);
 const feeRate = PAPER_RULES.feeBps / 10000;
 const unitCost = entry * (1 + feeRate);
 // Prefer the observed 20-day support; use 1.5 ATR when support is above price or absent.
 const fromSupport = positive(t.low20) && t.low20 < price;
 const stop = floor4(fromSupport ? t.low20 - t.atr14 * .25 : price - t.atr14 * 1.5);
 if(!positive(stop) || stop >= entry) return empty('لا يمكن اشتقاق وقف صالح من السجل المتاح؛ راجع السهم.');
 const exitFactor = (1 - (PAPER_RULES.slippageBps + spread.bps) / 10000) * (1 - feeRate);
 const unitRisk = unitCost - stop * exitFactor;
 const target = ceil4((unitCost + 2 * unitRisk) / exitFactor);
 const reserve = wallet.initialCash * PAPER_RULES.minCashPct;
 const cashBudget = Math.max(0, wallet.cash - reserve);
 const positionBudget = Math.max(0, wallet.initialCash * PAPER_RULES.maxPositionPct - (owned?.costBasis || 0));
 const riskBudget = Math.min(wallet.initialCash, wallet.cash) * .01;
 const limits = [Math.floor(cashBudget / unitCost), Math.floor(positionBudget / unitCost), Math.floor(riskBudget / unitRisk)];
 const quantity = Math.max(0, Math.min(...limits));
 const limitLabels = ['الاحتياطي النقدي 30%','سقف المركز 10%','المخاطرة 1%'];
 const limiting = limits.map((n,i) => n === quantity ? limitLabels[i] : null).filter(Boolean).join('، ');
 const resistanceWarning = positive(t.high20) && t.high20 > price && t.high20 < target;
 const risk = quantity * unitRisk;
 const totalCost = quantity * unitCost;
 return {symbol,side,quantity,stop,target,status:quantity===0?'NO_CAPACITY':blocked?'REFERENCE':'DRAFT',
  message:quantity===0?'الرصيد أو حدود المخاطرة لا تسمح بسهم كامل إضافي.':blocked?'مسودة مرجعية فقط من آخر سعر متاح؛ أعد تجهيزها بقراءة حديثة قبل المعاينة.':'مسودة حسابية للمراجعة وليست إشارة شراء.',
  reason:`سيناريو تجريبي ${symbol}: سعر مرجعي ${fmt(price)}، ${fromSupport?'وقف أسفل دعم 20 يومًا بهامش 0.25 ATR':'وقف بمسافة 1.5 ATR'}؛ ATR ${fmt(t.atr14)}. هدف بنسبة صافي عائد/مخاطرة 2:1 تقديرية بعد التكاليف. الكمية ${quantity} وفق ${limiting}. ${resistanceWarning?'توجد مقاومة يومية قبل الهدف؛ يلزم تأكيد الاختراق. ':''}هذه مسودة حجم ومخاطرة وليست إشارة دخول.`,
  entry,referencePrice:price,quoteAt:quote.updatedAt||quote.time,source:quote.source,
  technicalSource:technicals.source,historyAt:technicals.endOfHistory,atr:t.atr14,
  totalCost,cashAfter:wallet.cash-totalCost,risk,riskBudget,reserve,positionBudget,limiting,
  rewardRisk:2,resistanceWarning,spreadSource:spread.source,
  context:typeof t.trendLabel==='string'?t.trendLabel:'غير متاح',rsi:Number.isFinite(t.rsi14)?t.rsi14:null};
}
