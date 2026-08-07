import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getQuote, getMarketPulse } from './market.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 16);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'asiri-capital-live', alerts: true, time: new Date().toISOString() });
});

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  try {
    const quote = await getQuote(symbol);
    res.set('Cache-Control', 'no-store');
    res.json(quote);
  } catch (error) {
    res.status(502).json({ symbol, error: error.message || 'تعذر جلب السعر' });
  }
});

app.get('/api/quotes', async (req, res) => {
  const symbols = [...new Set(String(req.query.symbols || '')
    .split(',').map(cleanSymbol).filter(Boolean))].slice(0, 40);
  if (!symbols.length) return res.json([]);
  const settled = await Promise.allSettled(symbols.map(getQuote));
  const rows = settled.map((result, i) => result.status === 'fulfilled'
    ? result.value
    : { symbol: symbols[i], error: result.reason?.message || 'تعذر جلب السعر' });
  res.set('Cache-Control', 'no-store');
  res.json(rows);
});

app.get('/api/market', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getMarketPulse());
  } catch (error) {
    res.status(502).json({ error: error.message || 'تعذر جلب حالة السوق' });
  }
});

app.get('/live-alerts.js', (_req, res) => res.sendFile(path.join(root, 'live-alerts.js')));

async function renderLivePage(_req, res) {
  try {
    let html = await fs.readFile(path.join(root, 'live-index.html'), 'utf8');
    if (!html.includes('/live-alerts.js')) {
      html = html.replace('</body>', '<script src="/live-alerts.js?v=1"></script></body>');
    }
    res.set('Cache-Control', 'no-store');
    res.type('html').send(html);
  } catch (error) {
    res.status(500).send('تعذر تحميل الواجهة الحية');
  }
}

app.get('/', renderLivePage);
app.get('/live-index.html', renderLivePage);

app.listen(port, '0.0.0.0', () => {
  console.log(`Asiri Capital Live listening on ${port}`);
});
