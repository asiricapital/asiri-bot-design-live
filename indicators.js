const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function sma(values, period) {
  if (values.length < period) return null;
  return mean(values.slice(-period));
}

function emaSeries(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const output = [];
  let current = mean(values.slice(0, period));
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) output.push(null);
    else if (i === period - 1) output.push(current);
    else {
      current = (values[i] * k) + (current * (1 - k));
      output.push(current);
    }
  }
  return output;
}

function ema(values, period) {
  return emaSeries(values, period).at(-1) ?? null;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}

function atr(rows, period = 14) {
  if (rows.length <= period) return null;
  const trueRanges = [];
  for (let i = 1; i < rows.length; i += 1) {
    const high = rows[i].high;
    const low = rows[i].low;
    const previousClose = rows[i - 1].close;
    if ([high, low, previousClose].every(Number.isFinite)) {
      trueRanges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
    }
  }
  return mean(trueRanges.slice(-period));
}

function macd(values) {
  if (values.length < 35) return { macd: null, signal: null, histogram: null };
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const line = values.map((_, index) => {
    if (!Number.isFinite(fast[index]) || !Number.isFinite(slow[index])) return null;
    return fast[index] - slow[index];
  });
  const valid = line.filter(Number.isFinite);
  const signalSeries = emaSeries(valid, 9);
  const macdValue = valid.at(-1) ?? null;
  const signalValue = signalSeries.at(-1) ?? null;
  return {
    macd: macdValue,
    signal: signalValue,
    histogram: Number.isFinite(macdValue) && Number.isFinite(signalValue) ? macdValue - signalValue : null
  };
}

function percentChange(values, lookback) {
  if (values.length <= lookback) return null;
  const previous = values.at(-(lookback + 1));
  const latest = values.at(-1);
  return Number.isFinite(previous) && previous !== 0 ? ((latest / previous) - 1) * 100 : null;
}

export function calculateTechnicals(history) {
  const rows = history.filter((row) => Number.isFinite(row.close));
  const closes = rows.map((row) => row.close);
  const latest = closes.at(-1);
  if (!Number.isFinite(latest)) return {};

  const last20 = rows.slice(-20);
  const high20 = Math.max(...last20.map((row) => row.high).filter(Number.isFinite));
  const low20 = Math.min(...last20.map((row) => row.low).filter(Number.isFinite));
  const avgVolume20 = mean(last20.map((row) => row.volume).filter(Number.isFinite));
  const latestVolume = rows.at(-1)?.volume;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(rows, 14);
  const macdData = macd(closes);
  const momentum5 = percentChange(closes, 5);
  const momentum20 = percentChange(closes, 20);
  const momentum60 = percentChange(closes, 60);
  const trendScore = [sma20, sma50, sma200].reduce((score, movingAverage) => score + (movingAverage && latest > movingAverage ? 1 : 0), 0);
  const emaAlignment = [ema9, ema20, ema50].every(Number.isFinite)
    ? (ema9 > ema20 && ema20 > ema50 ? 2 : ema9 < ema20 && ema20 < ema50 ? -2 : 0)
    : 0;
  const breakoutDistancePct = Number.isFinite(high20) && high20 > 0 ? ((latest / high20) - 1) * 100 : null;
  const supportDistancePct = Number.isFinite(low20) && low20 > 0 ? ((latest / low20) - 1) * 100 : null;
  const historicalVolumeRatio = Number.isFinite(latestVolume) && Number.isFinite(avgVolume20) && avgVolume20 > 0 ? latestVolume / avgVolume20 : null;
  const atrPct = atr14 && latest ? (atr14 / latest) * 100 : null;

  let trendStrength = 0;
  if (trendScore === 3) trendStrength += 35;
  else if (trendScore === 2) trendStrength += 22;
  else if (trendScore === 1) trendStrength += 8;
  if (emaAlignment === 2) trendStrength += 25;
  if (Number.isFinite(macdData.histogram)) trendStrength += macdData.histogram > 0 ? 15 : -10;
  if (Number.isFinite(momentum20)) trendStrength += clamp(momentum20, -15, 20);
  trendStrength = Math.round(clamp(trendStrength, 0, 100));

  return {
    sma20,
    sma50,
    sma200,
    ema9,
    ema20,
    ema50,
    rsi14,
    atr14,
    high20,
    low20,
    avgVolume20,
    historicalVolumeRatio,
    momentum5,
    momentum20,
    momentum60,
    atrPct,
    trendScore,
    emaAlignment,
    trendStrength,
    breakoutDistancePct,
    supportDistancePct,
    ...macdData,
    trendLabel: trendScore === 3 && emaAlignment === 2 ? 'صاعد قوي' : trendScore >= 2 ? 'صاعد' : trendScore === 1 ? 'متذبذب' : 'هابط',
    sparkline: rows.slice(-60).map((row) => ({ date: row.date, close: row.close })),
    quality: Math.round(clamp(
      30 + (trendScore * 10) + (emaAlignment * 8) +
      (rsi14 >= 45 && rsi14 <= 68 ? 10 : 0) +
      clamp(momentum20 || 0, -15, 15) +
      (macdData.histogram > 0 ? 8 : 0),
      0,
      100
    ))
  };
}
