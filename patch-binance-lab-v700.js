import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Stock watch lab patch failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');

const configAnchor = `const configNeedle = "app.get('/api/config', (_req, res) => res.json({";`;
if (!bootstrap.includes('ASIRI_STOCK_WATCH_LAB_V200')) {
  const routePatch = `const stockWatchRouteNeedleV200 = "app.use(express.json({ limit: '1mb' }));";
if (!source.includes("app.get('/api/binance-lab/stock-quotes'")) {
  source = replaceRequired(
    source,
    stockWatchRouteNeedleV200,
    \`${'${stockWatchRouteNeedleV200}'}\n\napp.get('/binance-lab', (_req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  res.sendFile(path.join(root, 'binance-tradfi-lab.html'));\n});\n\napp.get('/api/binance-lab/stock-quotes', async (req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  const requested = String(req.query.symbols || '')\n    .split(',')\n    .map(sanitizeSymbol)\n    .filter(Boolean);\n  const symbols = [...new Set(requested)].slice(0, 40);\n  if (!symbols.length) return res.status(400).json({ error: 'أرسل رمز سهم واحدًا على الأقل.' });\n\n  const rows = [];\n  const concurrency = 6;\n  for (let index = 0; index < symbols.length; index += concurrency) {\n    const batch = symbols.slice(index, index + concurrency);\n    const settled = await Promise.all(batch.map(async (symbol) => {\n      try {\n        const quote = await getQuote(symbol);\n        const price = Number(quote.price);\n        return {\n          ok: Number.isFinite(price) && price > 0,\n          symbol,\n          name: quote.name || symbol,\n          price: Number.isFinite(price) ? price : null,\n          sarPrice: Number.isFinite(price) ? price * 3.75 : null,\n          change: Number.isFinite(Number(quote.change)) ? Number(quote.change) : null,\n          changePercent: Number.isFinite(Number(quote.changePercent)) ? Number(quote.changePercent) : null,\n          currency: quote.currency || 'USD',\n          exchange: quote.exchange || null,\n          marketState: quote.marketState || 'UNKNOWN',\n          session: quote.session || null,\n          sessionLabel: quote.sessionLabel || null,\n          isLiveSession: Boolean(quote.isLiveSession),\n          isFresh: Boolean(quote.isFresh),\n          updatedAt: quote.updatedAt || null,\n          observedAt: quote.observedAt || new Date().toISOString(),\n          source: quote.source || 'Yahoo Finance via Asiri Market Engine'\n        };\n      } catch (error) {\n        return { ok: false, symbol, error: String(error?.message || error || 'تعذر قراءة السهم') };\n      }\n    }));\n    rows.push(...settled);\n  }\n\n  res.json({\n    mode: 'US_EQUITY_REFERENCE',\n    readOnly: true,\n    tradingEnabled: false,\n    pollingMs: 10000,\n    sarRate: 3.75,\n    source: 'Asiri Market Engine / Yahoo Finance',\n    observedAt: new Date().toISOString(),\n    rows\n  });\n}); // ASIRI_STOCK_WATCH_LAB_V200\`,
    'Stock watch lab routes'
  );
}

`;
  bootstrap = replaceRequired(bootstrap, configAnchor, routePatch + configAnchor, 'runtime injection');
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('asiri-stock-watch-lab-v2.0', {
  route: '/binance-lab',
  quoteApi: '/api/binance-lab/stock-quotes',
  source: 'Asiri Market Engine / Yahoo Finance',
  pollingMs: 10000,
  readOnly: true,
  tradingEnabled: false
});
