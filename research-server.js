import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getQuote, getQuotes, getMarketPulse } from './market.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 16);
}

function symbolsFromQuery(value) {
  const text = String(value || '').toUpperCase();
  const cashTags = [...text.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
  const standalone = [...text.matchAll(/\b([A-Z]{2,5})\b/g)]
    .map((m) => m[1])
    .filter((s) => !['THE','AND','FOR','WITH','FROM','RISK','NEWS','TODAY','ASIRI'].includes(s));
  return [...new Set([...cashTags, ...standalone])].map(cleanSymbol).filter(Boolean).slice(0, 4);
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-research-intelligence-preview',
  engine: 'vane-inspired-ui',
  liveResearch: false,
  liveMarketContext: true,
  trading: false,
  time: new Date().toISOString(),
}));

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getQuote(symbol));
  } catch (error) {
    res.status(502).json({ symbol, error: error?.message || 'تعذر جلب السعر' });
  }
});

app.get('/api/market', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getMarketPulse());
  } catch (error) {
    res.status(502).json({ error: error?.message || 'تعذر جلب حالة السوق' });
  }
});

app.get('/api/research/context', async (req, res) => {
  const symbols = symbolsFromQuery(req.query.q);
  if (!symbols.length) return res.json({ symbols: [], quotes: [], note: 'لم يتم اكتشاف رمز سهم واضح في السؤال.' });
  try {
    const rows = await getQuotes(symbols);
    res.set('Cache-Control', 'no-store');
    res.json({ symbols, quotes: rows, note: 'سياق سوق حي للاستخدام كمرجع فقط؛ ليس توصية تداول.' });
  } catch (error) {
    res.status(502).json({ symbols, quotes: [], error: error?.message || 'تعذر جلب سياق السوق' });
  }
});

app.get(['/', '/research', '/research-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'research-intelligence.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Research Intelligence preview listening on ${port}`);
});
