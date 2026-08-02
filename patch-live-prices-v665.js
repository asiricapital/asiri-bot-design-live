import fs from 'node:fs/promises';

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
let gateway = await fs.readFile(gatewayPath, 'utf8');
const marker = 'ASIRI_UNIFIED_PRICE_FALLBACK_V665';

if (!gateway.includes("from './market.js'")) {
  gateway = gateway.replace("import crypto from 'node:crypto';", "import crypto from 'node:crypto';\nimport { getQuote } from './market.js';");
}

if (!gateway.includes(marker)) {
  const cacheAnchor = "const storageHealth = { available: null, lastError: null };";
  if (gateway.includes(cacheAnchor)) {
    gateway = gateway.replace(cacheAnchor, `${cacheAnchor}\nconst yahooFallbackCacheV665 = new Map(); // ${marker}`);
  }

  const helperAnchor = 'function sendError(res, error) {';
  const helper = `async function yahooQuoteV665(symbol) {
  const cached = yahooFallbackCacheV665.get(symbol);
  if (cached && Date.now() - cached.cachedAt < 10_000) return cached.value;
  const quote = await getQuote(symbol);
  yahooFallbackCacheV665.set(symbol, { cachedAt: Date.now(), value: quote });
  return quote;
}

async function applyYahooFallbackV665(live, localRows, snapshot) {
  const result = { ...(live || {}), prices: [...(live?.prices || [])], errors: [...(live?.errors || [])] };
  const bySymbol = new Map(result.prices.map((item) => [canonicalSymbol(item.symbol), item]));
  for (const row of (localRows || []).slice(0, 40)) {
    const symbol = canonicalSymbol(row?.symbol);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (existing?.available && Number.isFinite(Number(existing.price)) && Number(existing.price) > 0) continue;
    try {
      const quote = await yahooQuoteV665(symbol);
      const price = Number(quote?.price);
      if (!Number.isFinite(price) || price <= 0) throw new Error('لم يصل آخر سعر صالح من Yahoo.');
      const quantity = Number(row?.quantity || 0);
      const averagePrice = Number(row?.avg_price || 0);
      const fallback = {
        symbol,
        uic: existing?.uic ?? null,
        assetType: existing?.assetType || 'Stock',
        price,
        bid: null,
        ask: null,
        quantity,
        averagePrice,
        marketValue: price * quantity,
        unrealizedPnl: (price - averagePrice) * quantity,
        percentChange: Number.isFinite(Number(quote?.changePercent)) ? Number(quote.changePercent) : null,
        high: Number.isFinite(Number(quote?.high)) ? Number(quote.high) : null,
        low: Number.isFinite(Number(quote?.low)) ? Number(quote.low) : null,
        volume: Number.isFinite(Number(quote?.volume)) ? Number(quote.volume) : null,
        delayedByMinutes: null,
        currency: quote?.currency || existing?.currency || snapshot?.balance?.currency || 'USD',
        lastUpdated: quote?.updatedAt || new Date().toISOString(),
        marketState: quote?.marketState || 'UNKNOWN',
        available: true,
        priceKind: 'fallback',
        source: 'yahoo-fallback'
      };
      if (existing) Object.assign(existing, fallback);
      else result.prices.push(fallback);
      bySymbol.set(symbol, existing || fallback);
    } catch (error) {
      result.errors.push({ symbol, error: `تعذر تسعير ${symbol}: ${error.message}` });
    }
  }
  const valid = result.prices.filter((item) => item.available && Number.isFinite(Number(item.price)) && Number(item.price) > 0);
  const saxoMarket = valid.filter((item) => item.priceKind === 'market');
  const reference = valid.filter((item) => item.priceKind === 'reference');
  const fallback = valid.filter((item) => item.priceKind === 'fallback');
  const delays = saxoMarket.map((item) => item.delayedByMinutes).filter(Number.isFinite);
  result.validCount = valid.length;
  result.liveCount = saxoMarket.filter((item) => item.delayedByMinutes === 0).length;
  result.delayedCount = saxoMarket.filter((item) => Number(item.delayedByMinutes) > 0).length;
  result.referenceCount = reference.length;
  result.fallbackCount = fallback.length;
  result.maxDelayMinutes = delays.length ? Math.max(...delays) : null;
  result.realTime = saxoMarket.length > 0 && reference.length === 0 && fallback.length === 0 && delays.length === saxoMarket.length && delays.every((delay) => delay === 0);
  return result;
}

`;
  if (gateway.includes(helperAnchor)) gateway = gateway.replace(helperAnchor, helper + helperAnchor);
  else console.warn('v6.6.5: helper anchor not found');

  const routeCall = '      const live = await buildLivePrices(user.id, snapshot, localRows);';
  const routeReplacement = '      const live = await applyYahooFallbackV665(await buildLivePrices(user.id, snapshot, localRows), localRows, snapshot);';
  if (gateway.includes(routeCall)) gateway = gateway.replace(routeCall, routeReplacement);
  else if (!gateway.includes('applyYahooFallbackV665(await buildLivePrices')) console.warn('v6.6.5: live route call anchor not found');

  gateway = gateway.replace("        refreshMs: 2000,", "        refreshMs: live.fallbackCount > 0 ? 10000 : 2000,");
}

await fs.writeFile(gatewayPath, gateway, 'utf8');

const clientPath = new URL('./v662.js', import.meta.url);
let client = await fs.readFile(clientPath, 'utf8');
if (!client.includes('ASIRI_UNIFIED_PRICE_CLIENT_V665')) {
  client = client.replace(
    "badge.textContent=state==='live'?'LIVE':state==='delayed'?'DELAYED':state==='reference'?'REFERENCE':'OFFLINE';",
    "badge.textContent=state==='live'?'LIVE':state==='delayed'?'DELAYED':state==='reference'?'REFERENCE':state==='fallback'?'FALLBACK':'OFFLINE';"
  );

  client = client.replace(
    "  const hasMarket=validPrices.some((item)=>item.priceKind==='market');\n  const state=!validPrices.length?'down':hasReference&&!hasMarket?'reference':delay===0?'live':'delayed';\n  const message=!validPrices.length?'لم يرسل Saxo سعرًا صالحًا للأسهم المحددة.':state==='reference'?'السوق لا يرسل عرضًا جاريًا؛ يتم عرض السعر المرجعي بوضوح.':delay===0?'الأسعار السوقية تصل من Saxo دون تأخير معلن.':`Saxo يعلن تأخيرًا قدره ${delay} دقيقة.`;",
    "  const hasMarket=validPrices.some((item)=>item.priceKind==='market');\n  const hasFallback=validPrices.some((item)=>item.priceKind==='fallback'||item.source==='yahoo-fallback');\n  const state=!validPrices.length?'down':hasMarket?(delay===0?'live':'delayed'):hasReference?'reference':hasFallback?'fallback':'down';\n  const message=!validPrices.length?'لم يصل سعر صالح من المصادر.':state==='fallback'?'Saxo لم يرسل سعرًا صالحًا؛ يتم عرض آخر سعر متاح من Yahoo بوضوح.':state==='reference'?'السوق لا يرسل عرضًا جاريًا؛ يتم عرض السعر المرجعي بوضوح.':delay===0?'الأسعار السوقية تصل من Saxo دون تأخير معلن.':`Saxo يعلن تأخيرًا قدره ${delay} دقيقة.`;"
  );

  client = client.replace(
    "pc662Q('#pc662Delay').textContent=!validPrices.length?'—':state==='reference'?'سعر مرجعي':delay===0?'0 دقيقة':`${delay} دقيقة`;",
    "pc662Q('#pc662Delay').textContent=!validPrices.length?'—':state==='fallback'?'آخر سعر متاح':state==='reference'?'سعر مرجعي':delay===0?'0 دقيقة':`${delay} دقيقة`;"
  );
  client = client.replace(
    "pc662Q('#pc662Rights').textContent=!validPrices.length?'لم يتوفر سعر صالح':state==='reference'?'آخر سعر/إغلاق وليس بثًا حيًا':delay===0?'حقوق أسعار فورية متاحة':'يلزم اشتراك بيانات فورية لدى Saxo';",
    "pc662Q('#pc662Rights').textContent=!validPrices.length?'لم يتوفر سعر صالح':state==='fallback'?'Yahoo fallback — ليس بث Saxo':state==='reference'?'آخر سعر/إغلاق وليس بثًا حيًا':delay===0?'حقوق أسعار فورية متاحة':'يلزم اشتراك بيانات فورية لدى Saxo';"
  );

  client = client.replace(
    "    const isReference=price.source==='saxo-reference'||price.priceKind==='reference';\n    const sourceClass=isReference?'pc662-price-reference':Number(price.delayedByMinutes||0)===0?'pc662-price-live':'pc662-price-delayed';\n    const sourceText=isReference?'SAXO REFERENCE':Number(price.delayedByMinutes||0)===0?'SAXO LIVE':`DELAYED ${Number(price.delayedByMinutes||0)}m`;",
    "    const isReference=price.source==='saxo-reference'||price.priceKind==='reference';\n    const isFallback=price.source==='yahoo-fallback'||price.priceKind==='fallback';\n    const sourceClass=isFallback?'pc662-price-fallback':isReference?'pc662-price-reference':Number(price.delayedByMinutes||0)===0?'pc662-price-live':'pc662-price-delayed';\n    const sourceText=isFallback?'YAHOO FALLBACK':isReference?'SAXO REFERENCE':Number(price.delayedByMinutes||0)===0?'SAXO LIVE':`DELAYED ${Number(price.delayedByMinutes||0)}m`;"
  );

  client = client.replace(
    "if(pc662Q('#pc661Source'))pc662Q('#pc661Source').textContent=state==='reference'?'Saxo Reference Price':delay===0?'Saxo Live Price':'Saxo Delayed Price';",
    "if(pc662Q('#pc661Source'))pc662Q('#pc661Source').textContent=state==='fallback'?'Yahoo Fallback Price':state==='reference'?'Saxo Reference Price':delay===0?'Saxo Live Price':'Saxo Delayed Price';"
  );

  client = client.replace('} // ASIRI_LIVE_PRICE_CLIENT_VALIDATION_V664', '} // ASIRI_LIVE_PRICE_CLIENT_VALIDATION_V664\n// ASIRI_UNIFIED_PRICE_CLIENT_V665');
  client = client.replace('pc662State.timer=setInterval(pc662Tick,2000);', 'pc662State.timer=setInterval(pc662Tick,5000);');
}
await fs.writeFile(clientPath, client, 'utf8');

const cssPath = new URL('./v662.css', import.meta.url);
let css = await fs.readFile(cssPath, 'utf8');
if (!css.includes('ASIRI_UNIFIED_PRICE_FALLBACK_CSS_V665')) {
  css += `\n/* ASIRI_UNIFIED_PRICE_FALLBACK_CSS_V665 */\n.pc662-badge.fallback{border-color:rgba(92,174,255,.68)!important;color:#7ec1ff!important}.pc662-pulse.fallback{background:#7ec1ff!important;box-shadow:0 0 0 7px rgba(126,193,255,.13)!important}.pc662-price-fallback{color:#7ec1ff!important}\n`;
}
await fs.writeFile(cssPath, css, 'utf8');

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');
if (!server.includes('ASIRI_NO_STORE_CACHE_V665')) {
  server = server.replace(
    "const app = express();",
    "const app = express();\napp.use((_req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next(); }); // ASIRI_NO_STORE_CACHE_V665"
  );
}
await fs.writeFile(serverPath, server, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.6.4';", "const VERSION = '6.6.5';");
bootstrap = bootstrap.replace("const VERSION = '6.5.1';", "const VERSION = '6.6.5';");
bootstrap = bootstrap.replaceAll('/v662.js?v=6640', '/v662.js?v=6650');
bootstrap = bootstrap.replaceAll('/v662.css?v=6640', '/v662.css?v=6650');
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('live-price-engine-v6.6.5', { unifiedSource: true, saxoFirst: true, yahooFallback: true, noStoreCache: true, tradingEnabled: false });
