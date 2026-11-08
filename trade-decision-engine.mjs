// ASIRI Decision Studio research engine. Pure calculations, no broker access.
export function planRisk({ equity, riskPct, entry, stop, target, spread = 0, commission = 0, maxAllocationPct = 10 }) {
  const nums = [equity, riskPct, entry, stop, target, spread, commission, maxAllocationPct].map(Number);
  if (nums.some(x => !Number.isFinite(x)) || nums[0] <= 0 || nums[1] <= 0 || nums[1] > 2 || nums[2] <= 0 || nums[3] <= 0 || nums[4] <= 0 || nums[5] < 0 || nums[6] < 0 || nums[7] <= 0 || nums[7] > 100) return { error: 'أدخل أرقامًا صالحة؛ المخاطرة بحد أقصى 2%.' };
  const [cash, pct, buy, sl, tp, costSpread, fee, allocation] = nums;
  if (!(sl < buy && buy < tp)) return { error: 'خطة الشراء تحتاج وقفًا أقل من الدخول وهدفًا أعلى منه.' };
  const riskBudget = cash * pct / 100;
  const lossPerShare = buy - sl + costSpread + 2 * fee;
  const profitPerShare = tp - buy - costSpread - 2 * fee;
  if (profitPerShare <= 0) return { error: 'التكاليف تستهلك الربح المتوقع؛ عدّل الخطة.' };
  const byRisk = Math.floor(riskBudget / lossPerShare);
  const byAllocation = Math.floor((cash * allocation / 100) / buy);
  const quantity = Math.max(0, Math.min(byRisk, byAllocation));
  return { quantity, riskBudget, plannedLoss: quantity * lossPerShare, plannedProfit: quantity * profitPerShare, rr: profitPerShare / lossPerShare, allocation: quantity * buy / cash * 100, lossPerShare, profitPerShare, eligible: quantity > 0 && profitPerShare / lossPerShare >= 1.5 };
}

export function parseBars(csv) {
  const rows = String(csv).trim().split(/\r?\n/).filter(Boolean);
  if (rows.length < 50) throw new Error('يلزم 50 شمعة على الأقل مع عمود الوقت وOHLC.');
  const separator = rows[0].includes('\t') ? '\t' : ',';
  const headers = rows.shift().split(separator).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const col = names => names.map(n => headers.indexOf(n)).find(i => i >= 0);
  const indices = { time: col(['time','timestamp','date','datetime']), open: col(['open','o']), high: col(['high','h']), low: col(['low','l']), close: col(['close','c']) };
  if (Object.values(indices).some(i => i === undefined)) throw new Error('الأعمدة المطلوبة: time,open,high,low,close.');
  const bars = rows.map((line, j) => {
    const cells = line.split(separator);
    const [open, high, low, close] = ['open','high','low','close'].map(k => Number(cells[indices[k]]));
    const rawTime = cells[indices.time]?.trim();
    const millis = /^\d{10,13}$/.test(rawTime) ? Number(rawTime) * (rawTime.length === 10 ? 1000 : 1) : Date.parse(rawTime);
    if (![millis,open,high,low,close].every(Number.isFinite) || open <= 0 || high < Math.max(open,close) || low > Math.min(open,close) || low <= 0 || high < low) throw new Error(`بيانات غير صحيحة عند السطر ${j+2}.`);
    return { time: millis, open, high, low, close };
  });
  for (let i=1;i<bars.length;i++) if (bars[i].time <= bars[i-1].time) throw new Error('رتّب الشموع تصاعديًا حسب الوقت، دون تكرار.');
  if (bars.length > 50000) throw new Error('حد الاختبار 50,000 شمعة.');
  return bars;
}

function atrAt(bars, index, period) {
  let sum = 0;
  for (let k=index-period+1;k<=index;k++) {
    const b=bars[k], prev=bars[k-1].close;
    sum += Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));
  }
  return sum/period;
}

// Long breakout research baseline. Signal is closed bar i; fills only at OPEN of bar i+1.
export function replayBreakout(bars, opts={}) {
  const lookback=Number(opts.lookback??20), atrPeriod=Number(opts.atrPeriod??14);
  const stopAtr=Number(opts.stopAtr??1.5), rr=Number(opts.rr??2), spread=Number(opts.spread??0), fee=Number(opts.commission??0);
  if (![lookback,atrPeriod,stopAtr,rr,spread,fee].every(Number.isFinite) || lookback<5 || lookback>100 || atrPeriod<5 || atrPeriod>100 || stopAtr<=0 || rr<=0 || spread<0 || fee<0) throw new Error('معلمات الاختبار غير صالحة.');
  const trades=[]; let openTrade=null; const start=Math.max(lookback,atrPeriod)+1;
  for(let i=start;i<bars.length;i++) {
    const bar=bars[i];
    if(openTrade) {
      const hitStop=bar.low<=openTrade.stop, hitTarget=bar.high>=openTrade.target;
      if(hitStop || hitTarget) {
        // Conservatively choose stop if both touched within one OHLC candle.
        const exitPrice=hitStop ? Math.min(bar.open,openTrade.stop) : openTrade.target;
        const net=exitPrice-openTrade.entry-spread-2*fee;
        trades.push({ ...openTrade, exitAt:bar.time, exit:exitPrice, pnl:net, r:net/openTrade.riskPerShare, outcome:hitStop?'STOP':'TARGET' });
        openTrade=null;
      }
      continue;
    }
    const signal=bars[i-1]; let priorHigh=-Infinity;
    for(let j=i-1-lookback;j<i-1;j++) priorHigh=Math.max(priorHigh,bars[j].high);
    if(signal.close<=priorHigh) continue;
    const atr=atrAt(bars,i-1,atrPeriod), entry=bar.open+spread/2;
    if(!Number.isFinite(atr) || atr<=0) continue;
    const stop=entry-stopAtr*atr, target=entry+rr*stopAtr*atr;
    if(stop<=0) continue;
    openTrade={ signalAt:signal.time, entryAt:bar.time, entry, stop, target, riskPerShare:entry-stop+spread+2*fee };
    // Evaluate entry candle as well: the stop can be hit immediately.
    const hitStop=bar.low<=stop, hitTarget=bar.high>=target;
    if(hitStop || hitTarget) {
      const exitPrice=hitStop?Math.min(bar.open,stop):target;
      const net=exitPrice-entry-spread-2*fee;
      trades.push({ ...openTrade, exitAt:bar.time, exit:exitPrice, pnl:net, r:net/openTrade.riskPerShare, outcome:hitStop?'STOP':'TARGET' });
      openTrade=null;
    }
  }
  return trades;
}

export function tradeStats(trades) {
  let equity=0, peak=0, maxDrawdown=0, wins=0, grossWin=0, grossLoss=0;
  for (const t of trades) {
    equity+=t.r; peak=Math.max(peak,equity); maxDrawdown=Math.max(maxDrawdown,peak-equity);
    if (t.r>0) { wins++; grossWin+=t.r; } else grossLoss+=-t.r;
  }
  return { count:trades.length, winRate:trades.length?wins/trades.length:0, netR:equity, maxDrawdownR:maxDrawdown, profitFactor:grossLoss?grossWin/grossLoss:null };
}

export function walkForward(trades,ratio=0.7) {
  const cut=Math.floor(trades.length*ratio);
  return { inSample:tradeStats(trades.slice(0,cut)), outSample:tradeStats(trades.slice(cut)), cut };
}
