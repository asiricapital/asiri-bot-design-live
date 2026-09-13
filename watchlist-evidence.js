/* ASIRI watchlist evidence: source-backed quotes and daily closes only. */
(() => {
  'use strict';

  const LIMITS = Object.freeze({ futureToleranceMs: 60_000, observationMaxAgeMs: 10 * 60_000, historyMaxAgeMs: 72 * 60 * 60_000 });
  const CLOSE_LABEL = 'تغيّر آخر إغلاق';
  const REASONS = Object.freeze({
    SOURCE_UNAVAILABLE: 'السجل اليومي غير متاح من المصدر.',
    INVALID_SYMBOL: 'الرمز غير صالح للتحقق من السجل.',
    SYMBOL_MISMATCH: 'السجل لا يطابق الرمز المحدد.',
    MISSING_SOURCE: 'مصدر السجل غير متاح.',
    INVALID_INTERVAL: 'لا يتوفر سجل بشموع يومية موثقة.',
    STALE_HISTORY: 'السجل اليومي متأخر؛ لا يظهر مسار حالي.',
    INVALID_TIME: 'وقت السجل أو رصد المصدر غير صالح.',
    FUTURE_TIME: 'وقت السجل أو رصد المصدر يتجاوز الوقت الحالي.',
    STALE_OBSERVATION: 'يلزم رصد حديث من مصدر السجل.',
    INVALID_CANDLES: 'عدد الشموع لا يطابق عقد السجل اليومي.',
    INSUFFICIENT_POINTS: 'لا تتوفر نقطتان موثقتان لرسم السجل.',
    INVALID_POINTS: 'يحتوي السجل على تاريخ أو إغلاق غير صالح.',
    UNORDERED_POINTS: 'تواريخ السجل غير مرتبة أو مكررة.',
    END_MISMATCH: 'نهاية السجل لا تطابق آخر شمعة.',
    INCOMPLETE_LAST_CANDLE: 'شمعة اليوم قد تكون غير مكتملة؛ تغيّر آخر إغلاق غير متاح.',
    QUOTE_UNAVAILABLE: 'يلزم سعر موثق وحديث أو قراءة آخر إغلاق.',
    PREVIOUS_CLOSE_UNAVAILABLE: 'الإغلاق السابق غير متاح من قراءة المصدر نفسها.',
    SESSION_UNSUPPORTED: 'تغيّر الجلسة الممتدة لا يُعرض كتغيّر يومي.',
    NONFINITE_CHANGE: 'تعذر حساب تغيّر صالح من الإغلاقين.'
  });
  const nyDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

  function positiveNumber(value) { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null; }
  function symbolName(value) { const name = typeof value === 'string' ? value.trim().toUpperCase() : ''; return /^[A-Z][A-Z0-9.-]{0,9}$/.test(name) ? name : ''; }
  function timestamp(value) {
    if (typeof value !== 'string') return null;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!parts) return null;
    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function newYorkDate(value) {
    const parts = Object.fromEntries(nyDateFormatter.formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function unavailableChange(reasonCode, label = CLOSE_LABEL) {
    return { available: false, reasonCode, reason: REASONS[reasonCode] || REASONS.SOURCE_UNAVAILABLE, label, absolute: null, percent: null, previousClose: null, close: null, fromDate: null, toDate: null };
  }
  function unavailable(reasonCode) {
    const reason = REASONS[reasonCode] || REASONS.SOURCE_UNAVAILABLE;
    return { available: false, reasonCode, reason, source: null, observedAt: null, endOfHistory: null, startDate: null, endDate: null, points: [], chart: { available: false, reasonCode, reason, path: null, viewBox: '0 0 100 40', pointCount: 0, startDate: null, endDate: null, label: 'السجل اليومي غير متاح' }, change: unavailableChange(reasonCode) };
  }
  function calculateChange(previousClose, close, metadata) {
    const absolute = close - previousClose;
    const percent = (absolute / previousClose) * 100;
    if (!Number.isFinite(absolute) || !Number.isFinite(percent)) return unavailableChange('NONFINITE_CHANGE', metadata.label);
    return { available: true, reasonCode: 'VERIFIED_CLOSE_CHANGE', reason: null, label: CLOSE_LABEL, absolute, percent, previousClose, close, fromDate: null, toDate: null, ...metadata };
  }

  function evaluate(payload, symbol, nowMs = Date.now()) {
    const expectedSymbol = symbolName(symbol);
    if (!expectedSymbol) return unavailable('INVALID_SYMBOL');
    if (!payload || payload.ok !== true || payload.availability !== 'available') return unavailable('SOURCE_UNAVAILABLE');
    if (symbolName(payload.symbol) !== expectedSymbol) return unavailable('SYMBOL_MISMATCH');
    if (typeof payload.source !== 'string' || !payload.source.trim()) return unavailable('MISSING_SOURCE');
    if (payload.interval !== '1d') return unavailable('INVALID_INTERVAL');
    if (payload.historyStatus !== 'RECENT_DAILY') return unavailable('STALE_HISTORY');
    const observedMs = timestamp(payload.observedAt), endMs = timestamp(payload.endOfHistory);
    if (!Number.isFinite(nowMs) || observedMs === null || endMs === null) return unavailable('INVALID_TIME');
    if (observedMs > nowMs + LIMITS.futureToleranceMs || endMs > nowMs + LIMITS.futureToleranceMs || endMs > observedMs + LIMITS.futureToleranceMs) return unavailable('FUTURE_TIME');
    if (nowMs - observedMs > LIMITS.observationMaxAgeMs) return unavailable('STALE_OBSERVATION');
    if (nowMs - endMs > LIMITS.historyMaxAgeMs || observedMs - endMs > LIMITS.historyMaxAgeMs) return unavailable('STALE_HISTORY');
    const rawPoints = payload.indicators?.sparkline;
    if (!Array.isArray(rawPoints) || rawPoints.length < 2) return unavailable('INSUFFICIENT_POINTS');
    // The endpoint emits 35+ underlying candles and the last at most 60 closes.
    if (!Number.isInteger(payload.candles) || payload.candles < 35 || payload.candles < rawPoints.length || rawPoints.length > 60) return unavailable('INVALID_CANDLES');
    const points = [];
    let priorMs = null, priorSessionDate = null;
    for (const row of rawPoints) {
      const atMs = timestamp(row?.date), close = positiveNumber(row?.close);
      if (atMs === null || close === null) return unavailable('INVALID_POINTS');
      if (atMs > nowMs + LIMITS.futureToleranceMs || atMs > observedMs + LIMITS.futureToleranceMs) return unavailable('FUTURE_TIME');
      const sessionDate = newYorkDate(atMs);
      if (priorMs !== null && (atMs <= priorMs || sessionDate <= priorSessionDate)) return unavailable('UNORDERED_POINTS');
      points.push({ date: new Date(atMs).toISOString(), close });
      priorMs = atMs;
      priorSessionDate = sessionDate;
    }
    if (priorMs !== endMs) return unavailable('END_MISMATCH');
    const first = points[0], last = points.at(-1), previous = points.at(-2);
    const values = points.map((point) => point.close), min = Math.min(...values), max = Math.max(...values), span = max - min;
    // Every vertex is an actual returned close; there are no generated samples.
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${((index / (points.length - 1)) * 100).toFixed(2)},${(span ? 34 - (((point.close - min) / span) * 30) : 19).toFixed(2)}`).join(' ');
    const startDate = newYorkDate(timestamp(first.date)), endDate = newYorkDate(endMs);
    const lastIsCompleted = endDate < newYorkDate(nowMs) && endDate < newYorkDate(observedMs);
    const chartLabel = lastIsCompleted ? 'مسار الإغلاق اليومي' : 'المسار اليومي؛ شمعة اليوم قد تكون غير مكتملة';
    const metadata = { source: payload.source.trim(), observedAt: new Date(observedMs).toISOString(), endOfHistory: new Date(endMs).toISOString(), startDate, endDate };
    return {
      available: true, reasonCode: 'VERIFIED_DAILY_HISTORY', reason: null, ...metadata, points,
      chart: { available: true, reasonCode: 'VERIFIED_DAILY_HISTORY', reason: null, path, viewBox: '0 0 100 40', pointCount: points.length, startDate, endDate, label: chartLabel, lastCandleCompleted: lastIsCompleted },
      change: lastIsCompleted ? calculateChange(previous.close, last.close, { label: CLOSE_LABEL, fromDate: newYorkDate(timestamp(previous.date)), toDate: endDate, source: metadata.source, observedAt: metadata.observedAt }) : unavailableChange('INCOMPLETE_LAST_CANDLE')
    };
  }

  function quoteChange(item, nowMs = Date.now()) {
    const health = window.asiriQuoteDataHealth?.classifyQuote?.(item, nowMs);
    if (!Number.isFinite(nowMs) || !health || !['FRESH', 'DELAYED'].includes(health.state) || item?.error === true || item?.fromSnapshot === true) return unavailableChange('QUOTE_UNAVAILABLE');
    const session = String(item?.session || '').trim().toUpperCase();
    if (!['REGULAR', 'REGULAR_CLOSE'].includes(session)) return unavailableChange('SESSION_UNSUPPORTED');
    const price = positiveNumber(item?.price), previousClose = positiveNumber(item?.previousClose);
    const label = session === 'REGULAR_CLOSE' ? CLOSE_LABEL : 'مقارنة بالإغلاق السابق';
    if (price === null || previousClose === null) return unavailableChange('PREVIOUS_CLOSE_UNAVAILABLE', label);
    return calculateChange(previousClose, price, { label, source: item.source, observedAt: item.observedAt || null, toDate: item.updatedAt || item.time || null, session });
  }

  window.asiriWatchlistEvidence = Object.freeze({ LIMITS, evaluate, quoteChange });
})();
