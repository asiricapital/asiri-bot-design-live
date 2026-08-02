import fs from 'node:fs/promises';

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
let gateway = await fs.readFile(gatewayPath, 'utf8');
const marker = 'ASIRI_VERIFIED_PRICE_DIAGNOSTICS_V670';

if (!gateway.includes("from './market.js'")) {
  gateway = gateway.replace("import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport { getQuote } from './market.js';");
}

gateway = gateway.replace(
  "if (!pathname.startsWith('/port/')) throw new Error('Broker Gateway only permits Saxo Portfolio read endpoints.');",
  "if (!pathname.startsWith('/port/') && !pathname.startsWith('/trade/v1/infoprices') && !pathname.startsWith('/ref/v1/instruments')) throw new Error('Broker Gateway only permits approved Saxo read endpoints.');"
);

if (!gateway.includes(marker)) {
  const cacheAnchor = "const storageHealth = { available: null, lastError: null };";
  gateway = gateway.replace(cacheAnchor, `${cacheAnchor}\nconst verifiedInstrumentCacheV670 = new Map(); // ${marker}`);

  const helperAnchor = 'function sendError(res, error) {';
  const helper = `function positivePriceV670(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

async function loadVerifiedUniverseV670(userId) {
  const portfolio = await loadPortfolioRows(userId);
  let watchlist = [];
  try {
    watchlist = await adminRest('watchlist?select=symbol&user_id=eq.' + encodeURIComponent(userId) + '&order=created_at.asc');
  } catch (_error) {
    watchlist = [];
  }
  const bySymbol = new Map();
  for (const row of portfolio || []) {
    const symbol = canonicalSymbol(row.symbol);
    if (symbol) bySymbol.set(symbol, { symbol, quantity: Number(row.quantity || 0), averagePrice: Number(row.avg_price || 0), scope: 'portfolio' });
  }
  for (const row of watchlist || []) {
    const symbol = canonicalSymbol(row.symbol);
    if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, { symbol, quantity: 0, averagePrice: 0, scope: 'watchlist' });
  }
  return [...bySymbol.values()].slice(0, 30);
}

async function accountKeyV670(userId) {
  const accounts = await saxoGet(userId, '/port/v1/accounts/me?$top=100');
  const selected = (accounts?.Data || []).find((row) => row.Active !== false) || accounts?.Data?.[0];
  return selected?.AccountKey || null;
}

function instrumentScoreV670(item, symbol) {
  if (canonicalSymbol(item?.Symbol) !== symbol) return -1000;
  const country = String(item?.ExchangeCountry || '').toLowerCase();
  const exchange = String(item?.ExchangeId || '').toUpperCase();
  const currency = String(item?.CurrencyCode || '').toUpperCase();
  let score = 100;
  if (currency === 'USD') score += 80;
  if (country === 'us' || country.includes('united states')) score += 80;
  if (['NASDAQ','NYSE','NYSEARCA','AMEX','BATS','XNAS','XNYS','XASE','ARCX'].some((code) => exchange.includes(code))) score += 70;
  if (Array.isArray(item?.TradableAs) && item.TradableAs.includes('Stock')) score += 20;
  return score;
}

async function resolveInstrumentV670(userId, symbol, accountKey) {
  const cacheKey = userId + ':' + symbol;
  const cached = verifiedInstrumentCacheV670.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < 86400000) return cached.value;
  const params = new URLSearchParams({ Keywords: symbol, AssetTypes: 'Stock', IncludeNonTradable: 'true', '$top': '50' });
  if (accountKey) params.set('AccountKey', accountKey);
  const payload = await saxoGet(userId, '/ref/v1/instruments?' + params.toString());
  const selected = (payload?.Data || [])
    .filter((item) => String(item?.AssetType || '') === 'Stock' && Number.isFinite(Number(item?.Identifier)))
    .map((item) => ({ item, score: instrumentScoreV670(item, symbol) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)[0]?.item || null;
  const value = selected ? {
    uic: Number(selected.Identifier),
    assetType: selected.AssetType || 'Stock',
    description: selected.Description || symbol,
    exchangeId: selected.ExchangeId || null,
    exchangeCountry: selected.ExchangeCountry || null,
    currency: selected.CurrencyCode || null
  } : null;
  verifiedInstrumentCacheV670.set(cacheKey, { cachedAt: Date.now(), value });
  return value;
}

async function readSaxoVerifiedV670(userId, instrument, accountKey) {
  if (!instrument) return { status: 'unavailable', price: null, error: 'لم يتم العثور على أداة Saxo مطابقة.' };
  const params = new URLSearchParams({
    Uic: String(instrument.uic),
    AssetType: instrument.assetType,
    FieldGroups: 'Quote,PriceInfo,PriceInfoDetails,DisplayAndFormat,InstrumentPriceDetails'
  });
  if (accountKey) params.set('AccountKey', accountKey);
  const row = await saxoGet(userId, '/trade/v1/infoprices?' + params.toString());
  const quote = row?.Quote || {};
  const details = row?.PriceInfoDetails || {};
  const marketOpen = row?.InstrumentPriceDetails?.IsMarketOpen === true || String(quote?.MarketState || '').toLowerCase() === 'open';
  const lastTraded = positivePriceV670(details.LastTraded);
  const bid = positivePriceV670(quote.Bid);
  const ask = positivePriceV670(quote.Ask);
  const mid = positivePriceV670(quote.Mid, bid && ask ? (bid + ask) / 2 : null);
  const referencePrice = positivePriceV670(quote.ReferencePrice);
  const lastClose = positivePriceV670(details.LastClose);
  const delayRaw = quote.DelayedByMinutes;
  const delayedByMinutes = delayRaw === null || delayRaw === undefined || delayRaw === '' ? null : Number(delayRaw);
  let price = null;
  let status = 'unavailable';
  if (marketOpen && positivePriceV670(lastTraded, mid)) {
    price = positivePriceV670(lastTraded, mid);
    status = delayedByMinutes === 0 ? 'saxo-live' : Number.isFinite(delayedByMinutes) && delayedByMinutes > 0 ? 'saxo-delayed' : 'saxo-market';
  } else if (positivePriceV670(referencePrice, lastClose, lastTraded, mid)) {
    price = positivePriceV670(referencePrice, lastClose, lastTraded, mid);
    status = 'saxo-reference';
  }
  return {
    price,
    status,
    bid,
    ask,
    mid,
    lastTraded,
    referencePrice,
    lastClose,
    delayedByMinutes: Number.isFinite(delayedByMinutes) ? delayedByMinutes : null,
    marketOpen,
    marketState: quote.MarketState || null,
    currency: row?.DisplayAndFormat?.Currency || instrument.currency || 'USD',
    updatedAt: row?.LastUpdated && !String(row.LastUpdated).startsWith('0001-') ? row.LastUpdated : new Date().toISOString(),
    errorCode: row?.ErrorCode || quote?.ErrorCode || null,
    error: row?.ErrorMessage || null
  };
}

async function mapLimitV670(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function buildVerifiedDiagnosticsV670(userId) {
  const universe = await loadVerifiedUniverseV670(userId);
  let accountKey = null;
  let accountError = null;
  try { accountKey = await accountKeyV670(userId); } catch (error) { accountError = error.message; }
  const rows = await mapLimitV670(universe, 4, async (local) => {
    const errors = [];
    let instrument = null;
    let saxo = null;
    let yahoo = null;
    if (accountKey) {
      try {
        instrument = await resolveInstrumentV670(userId, local.symbol, accountKey);
        saxo = await readSaxoVerifiedV670(userId, instrument, accountKey);
        if (saxo?.error) errors.push('Saxo: ' + saxo.error);
      } catch (error) { errors.push('Saxo: ' + error.message); }
    } else if (accountError) {
      errors.push('Saxo: ' + accountError);
    }
    try {
      const quote = await getQuote(local.symbol);
      yahoo = {
        price: positivePriceV670(quote?.price),
        currency: quote?.currency || 'USD',
        changePercent: Number.isFinite(Number(quote?.changePercent)) ? Number(quote.changePercent) : null,
        marketState: quote?.marketState || null,
        updatedAt: quote?.updatedAt || new Date().toISOString(),
        source: quote?.source || 'Yahoo Finance'
      };
    } catch (error) { errors.push('Yahoo: ' + error.message); }
    const saxoValid = Number.isFinite(Number(saxo?.price)) && Number(saxo.price) > 0 && saxo.status !== 'unavailable';
    const yahooValid = Number.isFinite(Number(yahoo?.price)) && Number(yahoo.price) > 0;
    const preferred = saxoValid ? {
      price: Number(saxo.price), currency: saxo.currency || instrument?.currency || 'USD', status: saxo.status,
      updatedAt: saxo.updatedAt, source: 'Saxo'
    } : yahooValid ? {
      price: Number(yahoo.price), currency: yahoo.currency || 'USD', status: 'yahoo-fallback',
      updatedAt: yahoo.updatedAt, source: 'Yahoo Finance'
    } : { price: null, currency: 'USD', status: 'unavailable', updatedAt: null, source: null };
    const quantity = Number(local.quantity || 0);
    const averagePrice = Number(local.averagePrice || 0);
    return {
      symbol: local.symbol,
      scope: local.scope,
      quantity,
      averagePrice,
      instrument,
      saxo,
      yahoo,
      preferred: {
        ...preferred,
        marketValue: preferred.price ? preferred.price * quantity : null,
        unrealizedPnl: preferred.price ? (preferred.price - averagePrice) * quantity : null
      },
      error: errors.length ? errors.join(' · ') : null
    };
  });
  const counts = rows.reduce((acc, row) => {
    const key = row.preferred?.status || 'unavailable';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    version: '6.7.0',
    environment: config().environment,
    mode: 'read-only',
    tradingEnabled: false,
    accountKeyAvailable: Boolean(accountKey),
    accountError,
    updatedAt: new Date().toISOString(),
    counts,
    rows
  };
}

`;
  gateway = gateway.replace(helperAnchor, helper + helperAnchor);

  const routeAnchor = "  app.get('/api/broker/status', async (req, res) => {";
  const route = `  app.get('/api/broker/prices/diagnostics', async (req, res) => {
    try {
      const user = await verifyUser(req);
      res.set('Cache-Control', 'no-store');
      res.json(await buildVerifiedDiagnosticsV670(user.id));
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.message });
    }
  });

`;
  gateway = gateway.replace(routeAnchor, route + routeAnchor);
}

await fs.writeFile(gatewayPath, gateway, 'utf8');

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');
if (!server.includes('ASIRI_NO_STORE_V670')) {
  server = server.replace(
    'const app = express();',
    "const app = express();\napp.use((_req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next(); }); // ASIRI_NO_STORE_V670"
  );
}
await fs.writeFile(serverPath, server, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.6.1';", "const VERSION = '6.7.0';");
bootstrap = bootstrap.replace("const VERSION = '6.5.1';", "const VERSION = '6.7.0';");

const styleAnchor = "if (!index.includes('/v661.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v661.css?v=6610\"></head>', 'portfolio center stylesheet');";
if (!bootstrap.includes('/v670.css?v=6700')) {
  bootstrap = bootstrap.replace(styleAnchor, styleAnchor + "\nif (!index.includes('/v670.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v670.css?v=6700\"></head>', 'verified price stylesheet');");
}
const scriptAnchor = "if (!index.includes('/v661.js')) index = replaceRequired(index, '</body>', '<script src=\"/v661.js?v=6610\" type=\"module\"></script></body>', 'portfolio center script');";
if (!bootstrap.includes('/v670.js?v=6700')) {
  bootstrap = bootstrap.replace(scriptAnchor, scriptAnchor + "\nif (!index.includes('/v670.js')) index = replaceRequired(index, '</body>', '<script src=\"/v670.js?v=6700\" type=\"module\"></script></body>', 'verified price script');");
}
const staticAnchor = "app.get('/v661.css', (_req, res) => res.sendFile(path.join(root, 'v661.css')));`;\n";
if (!bootstrap.includes("app.get('/v670.js'")) {
  bootstrap = bootstrap.replace(staticAnchor, "app.get('/v661.css', (_req, res) => res.sendFile(path.join(root, 'v661.css')));\napp.get('/v670.js', (_req, res) => res.sendFile(path.join(root, 'v670.js')));\napp.get('/v670.css', (_req, res) => res.sendFile(path.join(root, 'v670.css')));`;\n");
}
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('verified-price-diagnostics-v6.7.0', { cleanEngine: true, rawSaxoFields: true, yahooComparison: true, falseLiveBlocked: true, tradingEnabled: false });
