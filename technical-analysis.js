import { calculateTechnicals } from './indicators.js';
import { getHistory } from './market.js';

export const TECHNICALS_INTERVAL = '1d';
export const TECHNICALS_LOOKBACK_DAYS = 420;
export const TECHNICALS_MIN_BARS = 35;
export const TECHNICALS_CACHE_TTL_MS = 120_000;
export const TECHNICALS_SOURCE = 'Yahoo Finance • Daily OHLCV';

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeHistory(history) {
  return (Array.isArray(history) ? history : []).filter((row) => (
    Number.isFinite(Number(row?.close)) && validDate(row?.date)
  ));
}

function historyStatus(endOfHistory, observedAt) {
  const end = validDate(endOfHistory);
  const observed = validDate(observedAt);
  if (!end || !observed) return { code: 'UNAVAILABLE', ageMinutes: null };
  const ageMinutes = Math.max(0, Math.round((observed.getTime() - end.getTime()) / 60_000));
  return {
    code: ageMinutes <= (72 * 60) ? 'RECENT_DAILY' : 'STALE',
    ageMinutes
  };
}

export function technicalUnavailableSnapshot({ symbol, reason = 'SOURCE_UNAVAILABLE', observedAt = new Date().toISOString() } = {}) {
  return {
    ok: false,
    symbol,
    availability: 'unavailable',
    reason,
    source: TECHNICALS_SOURCE,
    interval: TECHNICALS_INTERVAL,
    observedAt,
    endOfHistory: null,
    candles: 0,
    minimumCandles: TECHNICALS_MIN_BARS,
    historyStatus: 'UNAVAILABLE',
    historyAgeMinutes: null,
    indicators: null,
    safety: { technicalAnalysisOnly: true, executionAllowed: false, automaticTrading: false }
  };
}

export function buildTechnicalSnapshot({ symbol, history, observedAt = new Date().toISOString() } = {}) {
  const rows = normalizeHistory(history);
  const lastBar = rows.at(-1);
  const endOfHistory = validDate(lastBar?.date)?.toISOString() ?? null;
  const status = historyStatus(endOfHistory, observedAt);
  const base = {
    ok: true,
    symbol,
    source: TECHNICALS_SOURCE,
    interval: TECHNICALS_INTERVAL,
    observedAt,
    endOfHistory,
    candles: rows.length,
    minimumCandles: TECHNICALS_MIN_BARS,
    historyStatus: status.code,
    historyAgeMinutes: status.ageMinutes,
    safety: { technicalAnalysisOnly: true, executionAllowed: false, automaticTrading: false }
  };

  if (rows.length < TECHNICALS_MIN_BARS) {
    return { ...base, availability: 'unavailable', reason: 'INSUFFICIENT_HISTORY', indicators: null };
  }

  const indicators = calculateTechnicals(rows);
  if (!Number.isFinite(indicators?.sma20)) {
    return { ...base, availability: 'unavailable', reason: 'INVALID_HISTORY', indicators: null };
  }

  return { ...base, availability: 'available', reason: null, indicators };
}

export function createTechnicalsService({ historyFetcher = getHistory, now = () => new Date(), cacheTtlMs = TECHNICALS_CACHE_TTL_MS } = {}) {
  const cache = new Map();

  return {
    async getSnapshot(symbol) {
      const observedAt = now();
      const observedMs = observedAt.getTime();
      const cached = cache.get(symbol);
      if (cached && (observedMs - cached.savedAtMs) < cacheTtlMs) {
        return {
          ...cached.snapshot,
          cache: { status: 'HIT', ageSeconds: Math.floor((observedMs - cached.savedAtMs) / 1000) }
        };
      }

      const period1 = new Date(observedMs - (TECHNICALS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
      const history = await historyFetcher(symbol, period1, observedAt, TECHNICALS_INTERVAL);
      const snapshot = buildTechnicalSnapshot({ symbol, history, observedAt: observedAt.toISOString() });
      cache.set(symbol, { snapshot, savedAtMs: observedMs });
      return { ...snapshot, cache: { status: 'MISS', ageSeconds: 0 } };
    }
  };
}
