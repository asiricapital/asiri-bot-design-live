const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
}

function unavailable(symbol, reason = 'SOURCE_UNAVAILABLE') {
  return {
    symbol,
    status: 'unavailable',
    score: null,
    label: 'غير متاح',
    posts: 0,
    asOf: null,
    source: 'X public posts',
    reason
  };
}

function classify(posts) {
  const positive = /bull|bullish|buy|breakout|moon|upside|strong|عود|صاعد|شراء|اختراق|قوي/i;
  const negative = /bear|bearish|sell|downside|short|dump|weak|هبوط|هابط|بيع|ضعيف|تخارج/i;
  let weighted = 0;
  let weightTotal = 0;
  for (const post of posts) {
    const text = String(post.text || '');
    const weight = 1 + Math.log1p(Number(post.public_metrics?.like_count || 0) + Number(post.public_metrics?.retweet_count || 0));
    const direction = positive.test(text) && !negative.test(text) ? 1 : negative.test(text) && !positive.test(text) ? -1 : 0;
    weighted += direction * weight;
    weightTotal += weight;
  }
  const score = weightTotal ? Math.round(50 + (weighted / weightTotal) * 50) : 50;
  return { score: Math.max(0, Math.min(100, score)), label: score >= 60 ? 'إيجابي' : score <= 40 ? 'سلبي' : 'مختلط' };
}

export function createXSentimentService({ fetchImpl = globalThis.fetch, token = process.env.X_API_BEARER_TOKEN } = {}) {
  return {
    async getSnapshot(rawSymbol) {
      const symbol = cleanSymbol(rawSymbol);
      if (!symbol) return unavailable(symbol, 'INVALID_SYMBOL');
      if (!token || typeof fetchImpl !== 'function') return unavailable(symbol, 'NOT_CONFIGURED');
      const cached = cache.get(symbol);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return { ...cached.value, status: 'live' };
      const query = encodeURIComponent(`$${symbol} -is:retweet lang:en`);
      const url = `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=10&tweet.fields=created_at,public_metrics`;
      try {
        const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return unavailable(symbol, `X_HTTP_${response.status}`);
        const body = await response.json();
        const posts = Array.isArray(body.data) ? body.data : [];
        const sentiment = classify(posts);
        const value = { symbol, status: 'live', ...sentiment, posts: posts.length, asOf: new Date().toISOString(), source: 'X public posts' };
        cache.set(symbol, { fetchedAt: Date.now(), value });
        return value;
      } catch {
        return cached ? { ...cached.value, status: 'stale', reason: 'X_REQUEST_FAILED' } : unavailable(symbol, 'X_REQUEST_FAILED');
      }
    }
  };
}

export { cleanSymbol, unavailable, classify };
