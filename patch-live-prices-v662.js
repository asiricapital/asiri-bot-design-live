import fs from 'node:fs/promises';

const bootstrapPath=new URL('./bootstrap-v65.js',import.meta.url);
let bootstrap=await fs.readFile(bootstrapPath,'utf8');
bootstrap=bootstrap.replace("const VERSION = '6.6.1';","const VERSION = '6.6.2';");
bootstrap=bootstrap.replace("const VERSION = '6.5.1';","const VERSION = '6.6.2';");

const styleAnchor="if (!index.includes('/v661.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v661.css?v=6610\"></head>', 'portfolio center stylesheet');";
if(!bootstrap.includes('/v662.css?v=6620')){
  const addition="\nif (!index.includes('/v662.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v662.css?v=6620\"></head>', 'live price stylesheet');";
  if(bootstrap.includes(styleAnchor))bootstrap=bootstrap.replace(styleAnchor,styleAnchor+addition);
  else console.warn('v6.6.2: stylesheet anchor not found');
}

const scriptAnchor="if (!index.includes('/v661.js')) index = replaceRequired(index, '</body>', '<script src=\"/v661.js?v=6610\" type=\"module\"></script></body>', 'portfolio center script');";
if(!bootstrap.includes('/v662.js?v=6620')){
  const addition="\nif (!index.includes('/v662.js')) index = replaceRequired(index, '</body>', '<script src=\"/v662.js?v=6620\" type=\"module\"></script></body>', 'live price script');";
  if(bootstrap.includes(scriptAnchor))bootstrap=bootstrap.replace(scriptAnchor,scriptAnchor+addition);
  else console.warn('v6.6.2: script anchor not found');
}

if(!bootstrap.includes("app.get('/v662.js'")){
  const staticAnchor="app.get('/v661.css', (_req, res) => res.sendFile(path.join(root, 'v661.css')));`;\n";
  const replacement="app.get('/v661.css', (_req, res) => res.sendFile(path.join(root, 'v661.css')));\napp.get('/v662.js', (_req, res) => res.sendFile(path.join(root, 'v662.js')));\napp.get('/v662.css', (_req, res) => res.sendFile(path.join(root, 'v662.css')));`;\n";
  if(bootstrap.includes(staticAnchor))bootstrap=bootstrap.replace(staticAnchor,replacement);
  else console.warn('v6.6.2: static route anchor not found');
}
await fs.writeFile(bootstrapPath,bootstrap,'utf8');

const gatewayPath=new URL('./broker-gateway.js',import.meta.url);
let gateway=await fs.readFile(gatewayPath,'utf8');
const oldGuard="if (!pathname.startsWith('/port/')) throw new Error('Broker Gateway only permits Saxo Portfolio read endpoints.');";
const newGuard="if (!pathname.startsWith('/port/') && !pathname.startsWith('/trade/v1/infoprices')) throw new Error('Broker Gateway only permits approved Saxo read endpoints.');";
if(gateway.includes(oldGuard))gateway=gateway.replace(oldGuard,newGuard);

if(!gateway.includes('async function buildLivePrices')){
  const anchor='function sendError(res, error) {';
  const helper=`function liveNumeric(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number !== 0) return number;
  }
  return null;
}

async function buildLivePrices(userId, snapshot) {
  const positions = (snapshot?.positions || []).filter((position) => Number.isFinite(Number(position.uic)) && position.assetType);
  if (!positions.length) return { prices: [], errors: [], maxDelayMinutes: null, realTime: false };
  const accountKey = snapshot?.accounts?.find((account) => account.active !== false)?.accountKey || null;
  const groups = new Map();
  for (const position of positions) {
    const assetType = String(position.assetType);
    if (!groups.has(assetType)) groups.set(assetType, []);
    groups.get(assetType).push(position);
  }
  const prices = [];
  const errors = [];
  for (const [assetType, group] of groups) {
    try {
      const params = new URLSearchParams({
        Uics: [...new Set(group.map((position) => Number(position.uic)))].join(','),
        AssetType: assetType,
        FieldGroups: 'Quote,PriceInfo,PriceInfoDetails,DisplayAndFormat'
      });
      if (accountKey) params.set('AccountKey', accountKey);
      const payload = await saxoGet(userId, \`/trade/v1/infoprices/list?\${params.toString()}\`);
      for (const row of payload?.Data || []) {
        const position = group.find((item) => Number(item.uic) === Number(row.Uic));
        if (!position) continue;
        const quote = row.Quote || {};
        const details = row.PriceInfoDetails || {};
        const price = liveNumeric(quote.Mid, details.LastTraded, quote.Bid, quote.Ask, position.currentPrice);
        const quantity = Number(position.quantity || 0);
        const averagePrice = Number(position.averagePrice || 0);
        const delayedRaw = Number(quote.DelayedByMinutes);
        const delayedByMinutes = Number.isFinite(delayedRaw) ? delayedRaw : null;
        prices.push({
          symbol: position.symbol,
          uic: Number(position.uic),
          assetType: position.assetType,
          price,
          bid: liveNumeric(quote.Bid),
          ask: liveNumeric(quote.Ask),
          quantity,
          averagePrice,
          marketValue: Number.isFinite(price) ? price * quantity : Number(position.marketValue || 0),
          unrealizedPnl: Number.isFinite(price) ? (price - averagePrice) * quantity : Number(position.unrealizedPnl || 0),
          percentChange: Number.isFinite(Number(row.PriceInfo?.PercentChange)) ? Number(row.PriceInfo.PercentChange) : null,
          high: liveNumeric(row.PriceInfo?.High),
          low: liveNumeric(row.PriceInfo?.Low),
          volume: Number.isFinite(Number(details.Volume)) ? Number(details.Volume) : null,
          delayedByMinutes,
          currency: row.DisplayAndFormat?.Currency || position.currency || snapshot?.balance?.currency || 'USD',
          lastUpdated: row.LastUpdated || new Date().toISOString(),
          source: delayedByMinutes === 0 ? 'saxo-live' : 'saxo-delayed'
        });
      }
    } catch (error) {
      errors.push({ assetType, error: error.message });
    }
  }
  const delays = prices.map((price) => price.delayedByMinutes).filter(Number.isFinite);
  return {
    prices,
    errors,
    maxDelayMinutes: delays.length ? Math.max(...delays) : null,
    realTime: prices.length > 0 && delays.length === prices.length && delays.every((delay) => delay === 0)
  };
}

`;
  if(gateway.includes(anchor))gateway=gateway.replace(anchor,helper+anchor);
  else console.warn('v6.6.2: live price helper anchor not found');
}

if(!gateway.includes("app.get('/api/broker/saxo/live-prices'")){
  const anchor="  app.get('/api/broker/saxo/snapshot', async (req, res) => {";
  const route=`  app.get('/api/broker/saxo/live-prices', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const snapshot = lastSnapshots.get(user.id) || await loadLatestStoredSnapshot(user.id);
      if (!snapshot) return res.status(404).json({ error: 'اقرأ محفظة Saxo أولًا لإنشاء قائمة الأسعار.' });
      const live = await buildLivePrices(user.id, snapshot);
      const positionsValue = live.prices.reduce((sum, price) => sum + Number(price.marketValue || 0), 0);
      const unrealizedPnl = live.prices.reduce((sum, price) => sum + Number(price.unrealizedPnl || 0), 0);
      const cashBalance = Number(snapshot.balance?.cashBalance || 0);
      res.json({
        provider: 'Saxo',
        mode: 'fast-read-only',
        transport: 'secure-polling',
        tradingEnabled: false,
        refreshMs: 2000,
        updatedAt: new Date().toISOString(),
        currency: snapshot.balance?.currency || 'USD',
        ...live,
        summary: { positionsValue, unrealizedPnl, cashBalance, estimatedTotalValue: cashBalance + positionsValue }
      });
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.message });
    }
  });

`;
  if(gateway.includes(anchor))gateway=gateway.replace(anchor,route+anchor);
  else console.warn('v6.6.2: live price route anchor not found');
}
await fs.writeFile(gatewayPath,gateway,'utf8');

console.log('live-price-engine-v6.6.2',{saxoInfoPrices:true,refreshMs:2000,delayRightsVisible:true,tradingEnabled:false});
