import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.7.4 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const appPath = new URL('./app.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');
const marker = 'ASIRI_MARKET_FEED_SEPARATION_V674';

if (!app.includes(marker)) {
  const intelligenceOverrideBefore = "await fetchVerifiedPricesV671((d.rows||[]).map((row)=>row.symbol)).catch(console.error);d.rows=(d.rows||[]).map(applyVerifiedPriceV671);d.top3=(d.top3||[]).map(applyVerifiedPriceV671);if(d.golden?.closest)d.golden.closest=applyVerifiedPriceV671(d.golden.closest);state.marketIntelligence=d;renderMarketIntelligence()";
  const intelligenceOverrideAfter = `state.marketIntelligence=d;renderMarketIntelligence();window.dispatchEvent(new CustomEvent('asiri:market-feed-updated',{detail:d})) /* ${marker} */`;
  app = replaceRequired(app, intelligenceOverrideBefore, intelligenceOverrideAfter, 'market intelligence broker override');

  const propagationBefore = `  if (state.marketIntelligence) {
    state.marketIntelligence.rows = (state.marketIntelligence.rows || []).map(applyVerifiedPriceV671);
    state.marketIntelligence.top3 = (state.marketIntelligence.top3 || []).map(applyVerifiedPriceV671);
    if (state.marketIntelligence.golden?.closest) state.marketIntelligence.golden.closest = applyVerifiedPriceV671(state.marketIntelligence.golden.closest);
  }
`;
  const propagationAfter = `  // Market Intelligence keeps its own session-aware market feed.
  // Broker verification remains available for portfolio/reconciliation only.
`;
  app = replaceRequired(app, propagationBefore, propagationAfter, 'verified propagation separation');

  const rerenderBefore = `  if (state.marketIntelligence) renderMarketIntelligence();`;
  const rerenderAfter = `  // Do not redraw Market Intelligence from broker reference prices.`;
  app = replaceRequired(app, rerenderBefore, rerenderAfter, 'market intelligence rerender separation');
}

await fs.writeFile(appPath, app, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.7.3';", "const VERSION = '6.7.4';");

const appCacheAnchor = "index = index.replaceAll('Asiri Capital v6.5.0', `Asiri Capital v${VERSION}`);";
if (!bootstrap.includes('ASIRI_APP_CACHE_V674')) {
  bootstrap = replaceRequired(
    bootstrap,
    appCacheAnchor,
    `${appCacheAnchor}\nindex = index.replace(/\\/app\\.js\\?v=\\d+/, '/app.js?v=6740'); // ASIRI_APP_CACHE_V674`,
    'app cache version'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('market-feed-v6.7.4', {
  dashboardSource: 'session-aware-market-feed',
  brokerRole: 'portfolio-and-reconciliation-only',
  preMarket: true,
  regular: true,
  afterHours: true,
  staleTimestampBlocked: true,
  refreshSeconds: 10,
  tradingEnabled: false
});
