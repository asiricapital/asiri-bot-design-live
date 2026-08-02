import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.7.3 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const appPath = new URL('./app.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');
const marker = 'ASIRI_SESSION_AWARE_FEED_V673';

if (!app.includes(marker)) {
  const verifiedBefore = `  const verified = state.verifiedPrices.get(String(quote.symbol).toUpperCase());
  const price = Number(verified?.preferred?.price);
  if (!Number.isFinite(price) || price <= 0) return quote;
  const merged = {
    ...quote,
    price,
    currency: verified.preferred.currency || quote.currency || 'USD',
    updatedAt: verified.preferred.updatedAt || quote.updatedAt || new Date().toISOString(),
    source: verifiedPriceStatusLabelV671(verified.preferred.status),
    verifiedPriceStatus: verified.preferred.status,
    verifiedPriceSource: verified.preferred.source,
    verifiedInstrument: verified.instrument || null
  };`;

  const verifiedAfter = `  const verified = state.verifiedPrices.get(String(quote.symbol).toUpperCase());
  const verifiedPrice = Number(verified?.preferred?.price);
  const quotePrice = Number(quote?.price);
  const verifiedStatus = String(verified?.preferred?.status || '');
  const quoteSession = String(quote?.session || '');
  const keepExtendedSession = ['PRE_MARKET', 'POST_MARKET'].includes(quoteSession)
    && verifiedStatus === 'saxo-reference'
    && Number.isFinite(quotePrice)
    && quotePrice > 0;
  const price = keepExtendedSession ? quotePrice : verifiedPrice;
  if (!Number.isFinite(price) || price <= 0) return quote;
  const merged = {
    ...quote,
    price,
    currency: keepExtendedSession ? (quote.currency || 'USD') : (verified.preferred.currency || quote.currency || 'USD'),
    updatedAt: keepExtendedSession ? (quote.updatedAt || new Date().toISOString()) : (verified.preferred.updatedAt || quote.updatedAt || new Date().toISOString()),
    source: keepExtendedSession ? quote.source : verifiedPriceStatusLabelV671(verified.preferred.status),
    verifiedPriceStatus: keepExtendedSession ? 'extended-hours-market' : verified.preferred.status,
    verifiedPriceSource: keepExtendedSession ? quote.source : verified.preferred.source,
    verifiedInstrument: verified.instrument || null
  }; // ${marker}`;

  app = replaceRequired(app, verifiedBefore, verifiedAfter, 'verified price priority');

  const watchPriceBefore = '<td>$${fmt(x.price)}</td><td class="${cls(x.changePercent)}">';
  const watchPriceAfter = '<td data-price-session="${x.session||x.marketState||\'UNKNOWN\'}"><b>$${fmt(x.price)}</b><small class="mi-price-session ${x.session===\'REGULAR\'?\'live\':(x.session===\'PRE_MARKET\'||x.session===\'POST_MARKET\')?\'extended\':\'close\'}">${x.sessionLabel||x.marketState||\'—\'} · ${x.updatedAt?new Date(x.updatedAt).toLocaleTimeString(\'ar-SA\'): \'—\'}</small></td><td class="${cls(x.changePercent)}">';
  app = replaceRequired(app, watchPriceBefore, watchPriceAfter, 'watchlist price cell');

  const topPriceBefore = '<span>السعر<b>$${fmt(x.price)}</b></span>';
  const topPriceAfter = '<span>السعر<b>$${fmt(x.price)}</b><small class="mi-price-session ${x.session===\'REGULAR\'?\'live\':(x.session===\'PRE_MARKET\'||x.session===\'POST_MARKET\')?\'extended\':\'close\'}">${x.sessionLabel||x.marketState||\'—\'}</small></span>';
  app = replaceRequired(app, topPriceBefore, topPriceAfter, 'top opportunity price');

  const pollingBefore = "  if (state.session) state.refreshTimer = setInterval(async () => { await refreshAnalysis().catch(console.error); await persistDerivedAlerts().catch(console.error); }, state.settings.pollMs);";
  const pollingAfter = `  if (state.session) state.refreshTimer = setInterval(async () => {
    if (document.hidden || state.marketIntelligenceRefreshing) return;
    state.marketIntelligenceRefreshing = true;
    try {
      await refreshAnalysis().catch(console.error);
      await loadMarketIntelligence(true).catch(console.error);
      await refreshMarket().catch(console.error);
      await persistDerivedAlerts().catch(console.error);
    } finally {
      state.marketIntelligenceRefreshing = false;
    }
  }, Math.max(10000, state.settings.pollMs));`;
  app = replaceRequired(app, pollingBefore, pollingAfter, 'dashboard polling');

  const stateBefore = '  verifiedPricesAt: 0, // ASIRI_UNIFIED_VERIFIED_STATE_V671';
  const stateAfter = '  verifiedPricesAt: 0, // ASIRI_UNIFIED_VERIFIED_STATE_V671\n  marketIntelligenceRefreshing: false,';
  app = replaceRequired(app, stateBefore, stateAfter, 'refresh state');
}

await fs.writeFile(appPath, app, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.7.2';", "const VERSION = '6.7.3';");

const styleAnchor = "if (!index.includes('/v671.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v671.css?v=6710\"></head>', 'unified price stylesheet');";
if (!bootstrap.includes('/v673.css?v=6730')) {
  bootstrap = replaceRequired(
    bootstrap,
    styleAnchor,
    styleAnchor + "\nif (!index.includes('/v673.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v673.css?v=6730\"></head>', 'session feed stylesheet');",
    'v673 stylesheet injection'
  );
}

const staticAnchor = "app.get('/v671.css', (_req, res) => res.sendFile(path.join(root, 'v671.css')));";
if (!bootstrap.includes("app.get('/v673.css'")) {
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    staticAnchor + "\napp.get('/v673.css', (_req, res) => res.sendFile(path.join(root, 'v673.css')));",
    'v673 static route'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('session-aware-feed-v6.7.3', { preMarket: true, regular: true, afterHours: true, autoRefreshSeconds: 10, falseLiveBlocked: true, tradingEnabled: false });
