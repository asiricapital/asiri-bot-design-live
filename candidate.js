const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n, d = 2) => Number.isFinite(n) ? Number(n.toFixed(d)) : null;

function scoreComponent(value, max) {
  return Math.round(clamp(value, -max, max));
}

export function analyzeCandidate(quote, technicals = {}, market = {}) {
  const price = Number(quote.price);
  const quoteVolumeRatio = quote.averageVolume && quote.volume ? quote.volume / quote.averageVolume : null;
  const volumeRatio = Number.isFinite(quoteVolumeRatio) ? quoteVolumeRatio : technicals.historicalVolumeRatio;
  const marketScore = Number(market.score ?? 50);

  const components = {
    trend: 0,
    momentum: 0,
    volume: 0,
    breakout: 0,
    risk: 0,
    market: 0,
    quality: 0
  };

  components.trend += Number(technicals.trendScore || 0) * 7;
  components.trend += technicals.emaAlignment === 2 ? 12 : technicals.emaAlignment === -2 ? -10 : 0;
  components.trend += Number.isFinite(technicals.macdHistogram ?? technicals.histogram)
    ? ((technicals.macdHistogram ?? technicals.histogram) > 0 ? 7 : -6)
    : 0;
  components.trend = scoreComponent(components.trend, 32);

  if (Number.isFinite(technicals.rsi14)) {
    components.momentum += technicals.rsi14 >= 48 && technicals.rsi14 <= 68 ? 9 : technicals.rsi14 > 76 ? -9 : technicals.rsi14 < 35 ? -4 : 2;
  }
  components.momentum += scoreComponent((technicals.momentum20 || 0) * 0.55, 12);
  components.momentum += scoreComponent((technicals.momentum5 || 0) * 0.4, 5);
  components.momentum = scoreComponent(components.momentum, 24);

  if (Number.isFinite(volumeRatio)) {
    components.volume = volumeRatio >= 2 ? 14 : volumeRatio >= 1.5 ? 11 : volumeRatio >= 1.15 ? 7 : volumeRatio >= 0.8 ? 1 : -7;
  }

  const nearBreakout = Number.isFinite(technicals.breakoutDistancePct) && technicals.breakoutDistancePct >= -2.2;
  const confirmedBreakout = Number.isFinite(technicals.breakoutDistancePct) && technicals.breakoutDistancePct >= -0.3 && volumeRatio >= 1.25;
  if (confirmedBreakout) components.breakout = 14;
  else if (nearBreakout) components.breakout = 7;
  else if (Number.isFinite(technicals.breakoutDistancePct) && technicals.breakoutDistancePct < -12) components.breakout = -5;

  if (Number.isFinite(technicals.atrPct)) {
    components.risk += technicals.atrPct >= 2 && technicals.atrPct <= 8 ? 7 : technicals.atrPct > 14 ? -10 : technicals.atrPct > 10 ? -5 : 2;
  }
  components.market = marketScore >= 70 ? 7 : marketScore >= 52 ? 2 : marketScore < 40 ? -10 : -3;
  components.quality = Number.isFinite(technicals.quality) ? Math.round((technicals.quality - 50) * 0.12) : 0;

  let score = 42 + Object.values(components).reduce((sum, value) => sum + value, 0);
  if (quote.changePercent != null) score += clamp(Number(quote.changePercent) * 0.55, -5, 5);
  score = Math.round(clamp(score, 0, 100));

  const support = Number.isFinite(technicals.low20) ? technicals.low20 : null;
  const resistance = Number.isFinite(technicals.high20) ? technicals.high20 : null;
  const atrValue = Number.isFinite(technicals.atr14)
    ? technicals.atr14
    : (Number.isFinite(technicals.atrPct) && Number.isFinite(price) ? price * technicals.atrPct / 100 : null);

  const breakoutEntry = confirmedBreakout && resistance ? Math.max(price, resistance * 1.002) : null;
  const pullbackEntry = Number.isFinite(technicals.ema20) && technicals.ema20 < price ? technicals.ema20 : price;
  const baseEntry = breakoutEntry || pullbackEntry || price;
  const entryLow = Number.isFinite(baseEntry) ? baseEntry * 0.992 : null;
  const entryHigh = Number.isFinite(baseEntry) ? baseEntry * 1.008 : null;
  const stopCandidate = Number.isFinite(baseEntry) && Number.isFinite(atrValue) ? baseEntry - (atrValue * 1.25) : null;
  const structuralStop = support ? support * 0.985 : null;
  const stopLoss = [stopCandidate, structuralStop].filter(Number.isFinite).length
    ? Math.max(0.01, Math.min(...[stopCandidate, structuralStop].filter(Number.isFinite)))
    : null;
  const risk = stopLoss && entryHigh > stopLoss ? entryHigh - stopLoss : null;
  const target1 = risk ? entryHigh + (risk * 2) : resistance;
  const target2 = risk ? entryHigh + (risk * 3) : null;
  const riskReward = risk && target1 ? (target1 - entryHigh) / risk : null;

  const liquidityOk = Number(quote.averageVolume || 0) >= 250000 || Number(quote.volume || 0) >= 250000;
  const riskRewardOk = !Number.isFinite(riskReward) || riskReward >= 1.8;
  const goldenQualified = score >= 88 && technicals.trendScore >= 2 && volumeRatio >= 1.15 && riskRewardOk && liquidityOk && marketScore >= 42;

  let decision = 'انتظار';
  let action = 'WAIT';
  let reason = 'الإشارة غير مكتملة؛ انتظر تأكيد الاتجاه والحجم.';
  if (goldenQualified) {
    decision = confirmedBreakout ? 'Golden Alert — اختراق مؤكد' : 'Golden Alert — إعداد عالي الجودة';
    action = 'GOLDEN_BUY_SETUP';
    reason = confirmedBreakout
      ? 'اختراق قريب من قمة 20 جلسة مدعوم بحجم وزخم واتجاه إيجابي.'
      : 'اتجاه وزخم وسيولة وعائد إلى مخاطرة ضمن معايير Golden Alert.';
  } else if (score >= 78 && technicals.trendScore >= 2) {
    decision = 'مرشح قوي للمراقبة';
    action = 'WATCH_BUY';
    reason = 'الجودة مرتفعة لكن ينقصها تأكيد واحد أو أكثر قبل التنفيذ.';
  } else if (score >= 62) {
    decision = 'مراقبة';
    action = 'WATCH';
    reason = 'الإعداد متوسط الجودة ويحتاج تحسنًا في الحجم أو الزخم.';
  } else if (technicals.trendScore === 0 || score < 45) {
    decision = 'تجنب حاليًا';
    action = 'AVOID';
    reason = 'لا توجد أفضلية فنية كافية مقارنة بالمخاطرة.';
  }

  const reasons = [];
  if (technicals.trendScore >= 2) reasons.push('السعر أعلى من متوسطين رئيسيين أو أكثر');
  if (technicals.emaAlignment === 2) reasons.push('ترتيب EMA 9/20/50 صاعد');
  if (technicals.histogram > 0) reasons.push('MACD إيجابي');
  if (technicals.rsi14 >= 48 && technicals.rsi14 <= 68) reasons.push('RSI في نطاق زخم صحي');
  if (technicals.momentum20 > 0) reasons.push('زخم 20 جلسة موجب');
  if (volumeRatio >= 1.15) reasons.push(`حجم تداول ${round(volumeRatio, 1)}× من المتوسط`);
  if (confirmedBreakout) reasons.push('اختراق/ملامسة قمة 20 جلسة مع تأكيد حجم');
  else if (nearBreakout) reasons.push('قريب من مقاومة 20 جلسة');
  if (riskReward >= 1.8) reasons.push(`عائد إلى مخاطرة ${round(riskReward, 1)}:1`);
  if (marketScore >= 70) reasons.push('نبض السوق داعم');
  if (!liquidityOk) reasons.push('تنبيه: السيولة أقل من المستوى المفضل');
  if (!reasons.length) reasons.push(reason);

  return {
    version: '2.0',
    asiriScore: score,
    confidence: score,
    decision,
    action,
    reason,
    reasons,
    components,
    goldenQualified,
    confirmedBreakout,
    liquidityOk,
    volumeRatio: round(volumeRatio),
    support: round(support),
    resistance: round(resistance),
    entryLow: round(entryLow),
    entryHigh: round(entryHigh),
    stopLoss: round(stopLoss),
    target1: round(target1),
    target2: round(target2),
    riskReward: round(riskReward),
    holdingPeriod: '3–10 جلسات',
    riskLevel: technicals.atrPct > 10 ? 'مرتفعة' : technicals.atrPct > 6 ? 'متوسطة' : 'منخفضة',
    shariaStatus: 'يحتاج التحقق في تطبيق عوائد قبل الشراء'
  };
}
