import fs from 'node:fs/promises';

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.6.2';", "const VERSION = '6.6.3';");
bootstrap = bootstrap.replace("const VERSION = '6.6.1';", "const VERSION = '6.6.3';");
bootstrap = bootstrap.replace("const VERSION = '6.5.1';", "const VERSION = '6.6.3';");
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
let gateway = await fs.readFile(gatewayPath, 'utf8');
const marker = 'ASIRI_LIVE_PRICE_LOCAL_SYMBOL_RESOLUTION_V663';

const guardV662 = "if (!pathname.startsWith('/port/') && !pathname.startsWith('/trade/v1/infoprices')) throw new Error('Broker Gateway only permits approved Saxo read endpoints.');";
const guardV663 = "if (!pathname.startsWith('/port/') && !pathname.startsWith('/trade/v1/infoprices') && !pathname.startsWith('/ref/v1/instruments')) throw new Error('Broker Gateway only permits approved Saxo read endpoints.');";
if (gateway.includes(guardV662)) gateway = gateway.replace(guardV662, guardV663);

if (!gateway.includes(marker)) {
  const cacheAnchor = "const storageHealth = { available: null, lastError: null };";
  if (gateway.includes(cacheAnchor)) {
    gateway = gateway.replace(cacheAnchor, `${cacheAnchor}\nconst instrumentResolutionCacheV663 = new Map(); // ${marker}`);
  } else {
    console.warn('v6.6.3: instrument cache anchor not found');
  }

  const buildAnchor = 'async function buildLivePrices(userId, snapshot) {';
  const helper = `async function resolveAsiriInstrumentV663(userId, row, accountKey) {
  const symbol = canonicalSymbol(row?.symbol);
  if (!symbol) return { error: 'رمز محفظة Asiri غير صالح.' };
  const cached = instrumentResolutionCacheV663.get(symbol);
  if (cached && Date.now() - cached.cachedAt < 24 * 60 * 60 * 1000) return cached.value;
  try {
    const params = new URLSearchParams({
      Keywords: symbol,
      AssetTypes: 'Stock',
      IncludeNonTradable: 'true',
      '$top': '20'
    });
    if (accountKey) params.set('AccountKey', accountKey);
    const payload = await saxoGet(userId, \`/ref/v1/instruments?\${params.toString()}\`);
    const candidates = (payload?.Data || []).filter((item) =>
      String(item?.SummaryType || '').toLowerCase() === 'instrument' &&
      String(item?.AssetType || '') === 'Stock' &&
      Number.isFinite(Number(item?.Identifier)) &&
      canonicalSymbol(item?.Symbol) === symbol
    );
    const selected = candidates.find((item) => Number(item.PrimaryListing) === Number(item.Identifier)) ||
      candidates.find((item) => String(item.ExchangeCountry || '').toLowerCase().includes('united states')) ||
      candidates[0];
    if (!selected) {
      const value = { error: \`لم يعثر Saxo على رمز مطابق لـ \${symbol}.\` };
      instrumentResolutionCacheV663.set(symbol, { cachedAt: Date.now(), value });
      return value;
    }
    const value = {
      position: {
        symbol,
        description: selected.Description || symbol,
        assetType: selected.AssetType || 'Stock',
        uic: Number(selected.Identifier),
        quantity: Number(row?.quantity || 0),
        averagePrice: Number(row?.avg_price || 0),
        currentPrice: 0,
        marketValue: 0,
        unrealizedPnl: 0,
        currency: selected.CurrencyCode || 'USD',
        resolvedFrom: 'asiri-portfolio'
      }
    };
    instrumentResolutionCacheV663.set(symbol, { cachedAt: Date.now(), value });
    return value;
  } catch (error) {
    return { error: \`تعذر تحويل \${symbol} إلى UIC: \${error.message}\` };
  }
}

async function buildLiveUniverseV663(userId, snapshot, localRows, accountKey) {
  const bySymbol = new Map();
  for (const position of snapshot?.positions || []) {
    const symbol = canonicalSymbol(position?.symbol);
    if (symbol && Number.isFinite(Number(position?.uic)) && position?.assetType) bySymbol.set(symbol, position);
  }
  const errors = [];
  for (const row of (localRows || []).slice(0, 40)) {
    const symbol = canonicalSymbol(row?.symbol);
    if (!symbol || bySymbol.has(symbol)) continue;
    const resolved = await resolveAsiriInstrumentV663(userId, row, accountKey);
    if (resolved?.position) bySymbol.set(symbol, resolved.position);
    else if (resolved?.error) errors.push({ symbol, error: resolved.error });
  }
  return { positions: [...bySymbol.values()], errors };
}

`;
  if (gateway.includes(buildAnchor)) gateway = gateway.replace(buildAnchor, helper + buildAnchor);
  else console.warn('v6.6.3: buildLivePrices anchor not found');

  const buildStartV662 = `async function buildLivePrices(userId, snapshot) {
  const positions = (snapshot?.positions || []).filter((position) => Number.isFinite(Number(position.uic)) && position.assetType);
  if (!positions.length) return { prices: [], errors: [], maxDelayMinutes: null, realTime: false };
  const accountKey = snapshot?.accounts?.find((account) => account.active !== false)?.accountKey || null;`;
  const buildStartV663 = `async function buildLivePrices(userId, snapshot, localRows = []) {
  const accountKey = snapshot?.accounts?.find((account) => account.active !== false)?.accountKey || null;
  const universe = await buildLiveUniverseV663(userId, snapshot, localRows, accountKey);
  const positions = universe.positions.filter((position) => Number.isFinite(Number(position.uic)) && position.assetType);
  if (!positions.length) return { prices: [], errors: universe.errors, maxDelayMinutes: null, realTime: false };`;
  if (gateway.includes(buildStartV662)) gateway = gateway.replace(buildStartV662, buildStartV663);
  else console.warn('v6.6.3: buildLivePrices opening block not found');

  const errorsV662 = '  const errors = [];';
  const errorsV663 = '  const errors = [...universe.errors];';
  const buildIndex = gateway.indexOf('async function buildLivePrices(userId, snapshot, localRows = [])');
  if (buildIndex >= 0) {
    const errorsIndex = gateway.indexOf(errorsV662, buildIndex);
    if (errorsIndex >= 0) gateway = gateway.slice(0, errorsIndex) + errorsV663 + gateway.slice(errorsIndex + errorsV662.length);
  }

  const routeCallV662 = '      const live = await buildLivePrices(user.id, snapshot);';
  const routeCallV663 = `      const localRows = await loadPortfolioRows(user.id);
      const live = await buildLivePrices(user.id, snapshot, localRows);`;
  if (gateway.includes(routeCallV662)) gateway = gateway.replace(routeCallV662, routeCallV663);
  else console.warn('v6.6.3: live price route call anchor not found');
}

await fs.writeFile(gatewayPath, gateway, 'utf8');
console.log('live-price-engine-v6.6.3', {
  localPortfolioSymbols: true,
  saxoInstrumentResolution: true,
  saxoInfoPrices: true,
  readOnly: true,
  tradingEnabled: false
});
