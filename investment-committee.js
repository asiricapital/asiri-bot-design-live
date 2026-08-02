const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null;

function technicalAnalyst({ quote = {}, technicals = {}, candidate = {} }) {
  const candidateScore = clamp(candidate.confidence ?? candidate.asiriScore ?? 0);
  const trendScore = Number(technicals.trendScore || 0);
  const momentum20 = Number(technicals.momentum20 || 0);
  const volumeRatio = Number(candidate.volumeRatio ?? technicals.historicalVolumeRatio ?? 0);
  const rsi = Number(technicals.rsi14);

  let score = candidateScore * 0.62;
  score += clamp(50 + trendScore * 12, 0, 100) * 0.18;
  score += clamp(50 + momentum20 * 2.2, 0, 100) * 0.12;
  score += clamp(volumeRatio * 45, 0, 100) * 0.08;
  score = clamp(score);

  let vote = 'WAIT';
  if (score >= 78 && trendScore >= 2) vote = 'SUPPORT';
  else if (score < 48 || trendScore <= 0) vote = 'OPPOSE';

  const reasons = [];
  if (trendScore >= 2) reasons.push('الاتجاه الفني صاعد عبر أكثر من متوسط رئيسي.');
  else if (trendScore <= 0) reasons.push('الاتجاه الفني غير مؤكد أو ضعيف.');
  if (momentum20 > 0) reasons.push(`زخم 20 جلسة موجب (${round(momentum20)}%).`);
  if (volumeRatio >= 1.15) reasons.push(`الحجم النسبي داعم (${round(volumeRatio)}×).`);
  else reasons.push('الحجم لم يصل بعد إلى مستوى التأكيد المفضل.');
  if (Number.isFinite(rsi)) reasons.push(`RSI 14 عند ${round(rsi)}.`);
  if (candidate.confirmedBreakout) reasons.push('الاختراق الفني مؤكد وفق قواعد المحرك الحالي.');

  return {
    role: 'TECHNICAL_ANALYST',
    label: 'المحلل الفني',
    vote,
    score: round(score, 0),
    reasons: reasons.slice(0, 5),
    evidence: {
      price: round(quote.price, 2),
      trendScore,
      momentum20: round(momentum20),
      volumeRatio: round(volumeRatio),
      rsi14: round(rsi),
      confirmedBreakout: Boolean(candidate.confirmedBreakout)
    }
  };
}

function riskOfficer({ quote = {}, technicals = {}, candidate = {}, market = {} }) {
  const atrPct = Number(technicals.atrPct);
  const riskReward = Number(candidate.riskReward);
  const marketScore = clamp(market.score ?? 50);
  const liquidityOk = candidate.liquidityOk !== false;
  const stopLoss = Number(candidate.stopLoss);
  const changePercent = Math.abs(Number(quote.changePercent || 0));

  let riskScore = 28;
  if (!Number.isFinite(atrPct)) riskScore += 12;
  else if (atrPct > 14) riskScore += 38;
  else if (atrPct > 10) riskScore += 25;
  else if (atrPct > 7) riskScore += 14;
  else riskScore -= 4;

  if (!Number.isFinite(riskReward)) riskScore += 10;
  else if (riskReward < 1.25) riskScore += 28;
  else if (riskReward < 1.8) riskScore += 14;
  else riskScore -= 6;

  if (!liquidityOk) riskScore += 18;
  if (marketScore < 35) riskScore += 22;
  else if (marketScore < 45) riskScore += 10;
  else if (marketScore >= 70) riskScore -= 7;
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) riskScore += 18;
  if (changePercent >= 12) riskScore += 12;
  riskScore = clamp(riskScore);

  const vetoReasons = [];
  if (Number.isFinite(atrPct) && atrPct > 14) vetoReasons.push('التذبذب أعلى من الحد المقبول للصفقة المنضبطة.');
  if (Number.isFinite(riskReward) && riskReward < 1.25) vetoReasons.push('العائد إلى المخاطرة غير كافٍ.');
  if (marketScore < 35) vetoReasons.push('نبض السوق دفاعي جدًا.');
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) vetoReasons.push('لا يوجد وقف خسارة صالح.');

  const veto = vetoReasons.length > 0;
  const vote = veto || riskScore >= 72 ? 'OPPOSE' : riskScore >= 50 ? 'CAUTION' : 'SUPPORT';
  const maxPositionPct = riskScore >= 75 ? 2 : riskScore >= 60 ? 3 : riskScore >= 45 ? 5 : 8;

  const reasons = [
    `درجة المخاطرة ${round(riskScore, 0)}/100.`,
    Number.isFinite(atrPct) ? `ATR النسبي ${round(atrPct)}%.` : 'بيانات ATR غير مكتملة.',
    Number.isFinite(riskReward) ? `العائد إلى المخاطرة ${round(riskReward)}:1.` : 'العائد إلى المخاطرة غير متاح.',
    liquidityOk ? 'السيولة اجتازت الحد الأدنى.' : 'السيولة أقل من الحد المفضل.',
    ...vetoReasons
  ];

  return {
    role: 'RISK_OFFICER',
    label: 'مدير المخاطر',
    vote,
    score: round(100 - riskScore, 0),
    riskScore: round(riskScore, 0),
    veto,
    vetoReasons,
    maxPositionPct,
    reasons: reasons.slice(0, 6),
    evidence: {
      atrPct: round(atrPct),
      riskReward: round(riskReward),
      marketScore: round(marketScore, 0),
      liquidityOk,
      stopLoss: round(stopLoss, 2)
    }
  };
}

function portfolioManager({ candidate = {}, market = {}, technical, risk }) {
  const marketScore = clamp(market.score ?? 50);
  const technicalScore = clamp(technical.score);
  const riskReadiness = clamp(risk.score);
  const confidence = clamp(technicalScore * 0.5 + riskReadiness * 0.32 + marketScore * 0.18);

  let decisionCode = 'WAIT';
  let decision = 'انتظار';
  if (risk.veto || technical.vote === 'OPPOSE') {
    decisionCode = 'AVOID';
    decision = 'تجنب حاليًا';
  } else if (candidate.goldenQualified && technical.vote === 'SUPPORT' && marketScore >= 42) {
    decisionCode = 'CONDITIONAL_ENTRY';
    decision = 'دخول مشروط بعد استكمال البوابات';
  } else if (technicalScore >= 70 && risk.vote !== 'OPPOSE') {
    decisionCode = 'WATCH';
    decision = 'مراقبة عالية الأولوية';
  }

  const gates = [
    { id: 'SHARIA', label: 'التحقق الشرعي في عوائد', status: 'PENDING', blocking: true },
    { id: 'PRICE_ZONE', label: 'السعر داخل منطقة الدخول', status: candidate.entryLow && candidate.entryHigh ? 'AVAILABLE' : 'MISSING', blocking: true },
    { id: 'STOP_LOSS', label: 'وقف خسارة صالح', status: candidate.stopLoss ? 'AVAILABLE' : 'MISSING', blocking: true },
    { id: 'RISK_VETO', label: 'عدم وجود اعتراض من مدير المخاطر', status: risk.veto ? 'BLOCKED' : 'CLEAR', blocking: true }
  ];
  const blocked = gates.some((gate) => gate.blocking && !['AVAILABLE', 'CLEAR'].includes(gate.status));

  return {
    role: 'PORTFOLIO_MANAGER',
    label: 'مدير المحفظة',
    vote: decisionCode,
    score: round(confidence, 0),
    decisionCode,
    decision,
    executionAllowed: false,
    executionStatus: blocked ? 'BLOCKED' : 'REVIEW_ONLY',
    maxPositionPct: risk.maxPositionPct,
    gates,
    reasons: [
      `تصويت الفني: ${technical.vote}.`,
      `تصويت المخاطر: ${risk.vote}.`,
      `نبض السوق: ${round(marketScore, 0)}/100.`,
      blocked ? 'لا يمكن اعتبار الإشارة قابلة للتنفيذ قبل إغلاق جميع البوابات.' : 'النتيجة للمراجعة البشرية فقط؛ لا توجد صلاحية تداول.'
    ]
  };
}

export function runInvestmentCommittee({ symbol, quote = {}, technicals = {}, candidate = {}, market = {} }) {
  const technical = technicalAnalyst({ quote, technicals, candidate });
  const risk = riskOfficer({ quote, technicals, candidate, market });
  const manager = portfolioManager({ candidate, market, technical, risk });

  const supportVotes = [technical.vote, risk.vote].filter((vote) => vote === 'SUPPORT').length;
  const oppositionVotes = [technical.vote, risk.vote].filter((vote) => vote === 'OPPOSE').length;

  return {
    version: '6.4.0-phase-1',
    symbol: String(symbol || quote.symbol || '').toUpperCase(),
    generatedAt: new Date().toISOString(),
    mode: 'analysis-only',
    writeEnabled: false,
    tradingEnabled: false,
    dataCoverage: {
      technical: true,
      risk: true,
      portfolio: true,
      fundamentals: false,
      news: false,
      sharia: 'manual-verification-required'
    },
    consensus: {
      supportVotes,
      oppositionVotes,
      confidence: manager.score,
      decisionCode: manager.decisionCode,
      decision: manager.decision,
      executionAllowed: false,
      maxPositionPct: manager.maxPositionPct
    },
    members: [technical, risk, manager],
    plan: {
      entryLow: round(candidate.entryLow, 2),
      entryHigh: round(candidate.entryHigh, 2),
      stopLoss: round(candidate.stopLoss, 2),
      target1: round(candidate.target1, 2),
      target2: round(candidate.target2, 2),
      riskReward: round(candidate.riskReward),
      holdingPeriod: candidate.holdingPeriod || null
    },
    safeguards: [
      'لا توجد أي واجهة شراء أو بيع في لجنة الاستثمار.',
      'التحقق الشرعي في تطبيق عوائد إلزامي قبل أي تنفيذ.',
      'حجم المركز المقترح حد أقصى للمراجعة وليس أمرًا آليًا.',
      'مرحلة 1 لا تتضمن محلل أخبار أو محلل أساسي بعد.'
    ]
  };
}
