import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

function timeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة مصدر البيانات')), ms))
  ]);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  const number = finiteNumber(value);
  return number != null && number > 0 ? number : null;
}

function quoteTime(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const number = Number(value);
  if (Number.isFinite(number)) {
    const date = new Date(number > 1e12 ? number : number * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function newYorkClock(date = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const hour = Number(values.hour) % 24;
  const minute = Number(values.minute);
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    minutes: hour * 60 + minute
  };
}

function clockSession(date = new Date()) {
  const clock = newYorkClock(date);
  if (['Sat', 'Sun'].includes(clock.weekday)) return { ...clock, session: 'CLOSED' };
  if (clock.minutes >= 240 && clock.minutes < 570) return { ...clock, session: 'PRE_MARKET' };
  if (clock.minutes >= 570 && clock.minutes < 960) return { ...clock, session: 'REGULAR' };
  if (clock.minutes >= 960 && clock.minutes < 1200) return { ...clock, session: 'POST_MARKET' };
  return { ...clock, session: 'CLOSED' };
}

function timestampMatchesNewYorkDate(timestamp, expectedDate) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return newYorkClock(date).date === expectedDate;
}

function derivedChange(price, baseline, suppliedChange, suppliedPercent) {
  const directChange = finiteNumber(suppliedChange);
  const directPercent = finiteNumber(suppliedPercent);
  const reference = positiveNumber(baseline);
  return {
    change: directChange ?? (price != null && reference != null ? price - reference : null),
    changePercent: directPercent ?? (price != null && reference != null ? ((price / reference) - 1) * 100 : null)
  };
}

function selectSessionQuote(q) {
  const rawState = String(q.marketState || 'UNKNOWN').toUpperCase();
  const exchangeClock = clockSession();
  const regularPrice = positiveNumber(q.regularMarketPrice);
  const preMarketPrice = positiveNumber(q.preMarketPrice);
  const postMarketPrice = positiveNumber(q.postMarketPrice);
  const previousClose = positiveNumber(q.regularMarketPreviousClose);
  const regularTimestamp = quoteTime(q.regularMarketTime);
  const preTimestamp = quoteTime(q.preMarketTime);
  const postTimestamp = quoteTime(q.postMarketTime);
  const currentPreMarket = preMarketPrice != null && timestampMatchesNewYorkDate(preTimestamp, exchangeClock.date);
  const currentPostMarket = postMarketPrice != null && timestampMatchesNewYorkDate(postTimestamp, exchangeClock.date);

  const shouldUsePreMarket = currentPreMarket && (exchangeClock.session === 'PRE_MARKET' || ['PRE', 'PREPRE'].includes(rawState));
  if (shouldUsePreMarket) {
    const movement = derivedChange(preMarketPrice, previousClose, q.preMarketChange, q.preMarketChangePercent);
    return {
      price: preMarketPrice,
      ...movement,
      session: 'PRE_MARKET',
      sessionLabel: 'ما قبل الافتتاح',
      updatedAt: preTimestamp,
      source: 'Yahoo Finance • Pre-Market • 10s polling',
      isExtendedHours: true,
      isLiveSession: true,
      isFresh: true
    };
  }

  const shouldUsePostMarket = currentPostMarket && (exchangeClock.session === 'POST_MARKET' || ['POST', 'POSTPOST'].includes(rawState));
  if (shouldUsePostMarket) {
    const movement = derivedChange(postMarketPrice, regularPrice, q.postMarketChange, q.postMarketChangePercent);
    return {
      price: postMarketPrice,
      ...movement,
      session: 'POST_MARKET',
      sessionLabel: 'ما بعد الإغلاق',
      updatedAt: postTimestamp,
      source: 'Yahoo Finance • After-Hours • 10s polling',
      isExtendedHours: true,
      isLiveSession: true,
      isFresh: true
    };
  }

  const movement = derivedChange(regularPrice, previousClose, q.regularMarketChange, q.regularMarketChangePercent);
  const regularOpen = exchangeClock.session === 'REGULAR' && rawState === 'REGULAR';
  return {
    price: regularPrice,
    ...movement,
    session: regularOpen ? 'REGULAR' : 'REGULAR_CLOSE',
    sessionLabel: regularOpen ? 'الجلسة النظامية' : 'آخر إغلاق',
    updatedAt: regularTimestamp,
    source: regularOpen ? 'Yahoo Finance • Regular Session • 10s polling' : 'Yahoo Finance • Last Regular Close',
    isExtendedHours: false,
    isLiveSession: regularOpen,
    isFresh: regularOpen && timestampMatchesNewYorkDate(regularTimestamp, exchangeClock.date)
  };
}

export async function getQuote(symbol) {
  const q = await timeout(yahooFinance.quote(symbol));
  const selected = selectSessionQuote(q);
  return {
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: selected.price,
    change: selected.change,
    changePercent: selected.changePercent,
    open: q.regularMarketOpen ?? null,
    high: q.regularMarketDayHigh ?? null,
    low: q.regularMarketDayLow ?? null,
    previousClose: q.regularMarketPreviousClose ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    volume: q.regularMarketVolume ?? null,
    averageVolume: q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? null,
    marketState: q.marketState ?? 'UNKNOWN',
    session: selected.session,
    sessionLabel: selected.sessionLabel,
    isExtendedHours: selected.isExtendedHours,
    isLiveSession: selected.isLiveSession,
    isFresh: selected.isFresh,
    regularMarketPrice: q.regularMarketPrice ?? null,
    preMarketPrice: q.preMarketPrice ?? null,
    postMarketPrice: q.postMarketPrice ?? null,
    currency: q.currency ?? 'USD',
    exchange: q.fullExchangeName ?? q.exchange ?? '',
    updatedAt: selected.updatedAt,
    observedAt: new Date().toISOString(),
    source: selected.source
  };
}

export async function getHistory(symbol, period1, period2 = new Date(), interval = '1d') {
  const result = await timeout(yahooFinance.chart(symbol, { period1, period2, interval, events: 'div|split' }), 18000);
  return (result.quotes || []).filter(x => x.close != null).map((x) => ({
    date: x.date,
    open: x.open,
    high: x.high,
    low: x.low,
    close: x.close,
    adjclose: x.adjclose,
    volume: x.volume
  }));
}

export async function searchUsEquities(query, count = 12) {
  const q = String(query || '').trim();
  if (!q) return [];
  const result = await timeout(yahooFinance.search(q, { quotesCount: Math.min(25, Math.max(1, count)), newsCount: 0 }), 12000);
  const allowedExchanges = new Set(['NMS','NGM','NCM','NYQ','ASE','PCX','BTS']);
  return (result.quotes || [])
    .filter(x => x && x.symbol && (x.quoteType === 'EQUITY' || x.typeDisp === 'Equity'))
    .filter(x => !x.exchange || allowedExchanges.has(x.exchange))
    .map(x => ({
      symbol: x.symbol,
      name: x.shortname || x.longname || x.symbol,
      exchange: x.exchDisp || x.exchange || '',
      sector: x.sector || '',
      industry: x.industry || ''
    }));
}

export async function getMarketPulse() {
  const indices = [
    ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq'], ['^DJI', 'Dow Jones'], ['^RUT', 'Russell 2000'], ['^VIX', 'VIX']
  ];
  const rows = await Promise.all(indices.map(async ([symbol, label]) => {
    try { return { label, ...(await getQuote(symbol)) }; }
    catch (error) { return { symbol, label, error: error.message }; }
  }));
  const tradable = rows.filter(x => Number.isFinite(x.changePercent) && x.symbol !== '^VIX');
  const avg = tradable.length ? tradable.reduce((a, x) => a + x.changePercent, 0) / tradable.length : null;
  const vix = rows.find(x => x.symbol === '^VIX')?.price;
  let score = 50;
  if (avg != null) score += Math.max(-25, Math.min(25, avg * 12));
  if (Number.isFinite(vix)) score += vix < 18 ? 12 : vix < 24 ? 2 : vix < 30 ? -12 : -22;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const regime = score >= 70 ? 'إيجابي' : score >= 45 ? 'حذر' : 'دفاعي';
  return { rows, score, regime, updatedAt: new Date().toISOString() };
}
