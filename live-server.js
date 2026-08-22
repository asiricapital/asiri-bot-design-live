import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { getQuote, getQuotes, getMarketPulse } from './market.js';
import { createTechnicalsService, technicalUnavailableSnapshot } from './technical-analysis.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 10000);
const technicals = createTechnicalsService();
const clients = new Map();
const symbols = new Set();
const providerUrl = process.env.MARKET_WS_URL || 'wss://socket.polygon.io/stocks';
const providerKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || '';
let provider;
let providerState = providerKey ? 'connecting' : 'polling_only';
let providerLastEventAt = null;
let reconnectTimer;
let pollTimer;
let pollBusy = false;

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 16);
}
function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}
function broadcast(symbol, payload) {
  for (const [socket, wanted] of clients) if (wanted.has(symbol)) send(socket, payload);
}
function statusPayload() {
  const websocketLive = providerState === 'authenticated' || providerState === 'subscribed';
  return {
    type: 'status',
    provider: providerKey ? 'massive_polygon' : 'server_polling',
    state: providerState,
    dataMode: websocketLive ? 'live' : providerState === 'polling_fallback' || providerState === 'polling' ? 'fallback_polling' : 'unavailable',
    readOnly: true,
    executionAllowed: false,
    automaticTrading: false,
    lastEventAt: providerLastEventAt,
    at: new Date().toISOString(),
  };
}
function publishQuote(quote, mode = 'stream') {
  if (!quote?.symbol || quote.error) return;
  providerLastEventAt = quote.updatedAt || new Date().toISOString();
  broadcast(quote.symbol, { type: 'quote', mode, quote });
}
function connectProvider() {
  if (!providerKey) return;
  clearTimeout(reconnectTimer);
  providerState = 'connecting';
  for (const socket of clients.keys()) send(socket, statusPayload());
  provider = new WebSocket(providerUrl);
  provider.on('open', () => {
    providerState = 'connected';
    provider.send(JSON.stringify({ action: 'auth', params: providerKey }));
    for (const symbol of symbols) provider.send(JSON.stringify({ action: 'subscribe', params: `T.${symbol},Q.${symbol}` }));
    for (const socket of clients.keys()) send(socket, statusPayload());
    console.log(JSON.stringify({ event: 'provider_connected', url: providerUrl, readOnly: true }));
  });
  provider.on('message', raw => {
    let messages;
    try { messages = JSON.parse(String(raw)); } catch { return; }
    for (const message of Array.isArray(messages) ? messages : [messages]) {
      if (message.ev === 'status') {
        const text = String(message.message || message.status || '').toLowerCase();
        if (text.includes('authenticated')) providerState = 'authenticated';
        if (text.includes('subscribed')) providerState = 'subscribed';
        const websocketUnavailable = text.includes('auth_failed') || text.includes('authentication') || text.includes('plan') || text.includes('upgrade') || text.includes("doesn't include") || text.includes('forbidden');
        if (websocketUnavailable) {
          providerState = 'polling_fallback';
          pollQuotes();
          console.error(JSON.stringify({ event: 'provider_fallback', mode: 'server_polling', reason: 'websocket_access_unavailable', readOnly: true }));
        } else if (text.includes('error')) providerState = 'provider_error';
        for (const socket of clients.keys()) send(socket, statusPayload());
        console.log(JSON.stringify({ event: 'provider_status', status: message.status, message: message.message }));
        continue;
      }
      if (message.ev !== 'T' && message.ev !== 'Q') continue;
      const symbol = cleanSymbol(message.sym || message.symbol);
      if (!symbol) continue;
      const price = Number(message.p ?? message.bp ?? message.ap);
      if (!Number.isFinite(price)) continue;
      publishQuote({ symbol, price, change: null, changePercent: null, previousClose: null, session: 'REGULAR', sessionLabel: 'بث مباشر من المصدر', isLiveSession: true, isFresh: true, source: 'Massive/Polygon WebSocket', updatedAt: message.t ? new Date(Number(message.t) / 1e6).toISOString() : new Date().toISOString(), observedAt: new Date().toISOString(), volume: message.s ?? null }, 'stream');
    }
  });
  provider.on('error', error => console.error(JSON.stringify({ event: 'provider_error', message: error.message })));
  provider.on('close', (code, reason) => {
    providerState = 'polling_fallback';
    console.error(JSON.stringify({ event: 'provider_closed', code, reason: String(reason), fallback: 'server_polling', readOnly: true }));
    pollQuotes();
    for (const socket of clients.keys()) send(socket, statusPayload());
    reconnectTimer = setTimeout(connectProvider, 5000);
  });
}
async function pollQuotes() {
  const websocketLive = providerState === 'authenticated' || providerState === 'subscribed';
  if (pollBusy || websocketLive || !symbols.size) return;
  pollBusy = true;
  try {
    const rows = await getQuotes([...symbols]);
    providerState = 'polling';
    for (const quote of rows) publishQuote(quote, 'server_polling');
    for (const socket of clients.keys()) send(socket, statusPayload());
  } catch (error) {
    providerState = 'poll_error';
    console.error(JSON.stringify({ event: 'poll_error', message: error.message }));
  } finally { pollBusy = false; }
}
function subscribe(socket, requested) {
  const wanted = new Set((requested || []).map(cleanSymbol).filter(Boolean).slice(0, 40));
  clients.set(socket, wanted);
  for (const symbol of wanted) symbols.add(symbol);
  send(socket, statusPayload());
  if (provider?.readyState === WebSocket.OPEN && providerKey) {
    for (const symbol of wanted) provider.send(JSON.stringify({ action: 'subscribe', params: `T.${symbol},Q.${symbol}` }));
  }
  if (!providerKey || providerState === 'polling_fallback' || providerState === 'polling' || providerState === 'disconnected') pollQuotes();
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'asiri-capital-monitoring', version: '8.0.1-read-only-websocket-fallback', transport: 'websocket', provider: providerKey ? 'massive_polygon' : 'server_polling', providerState, dataMode: providerState === 'authenticated' || providerState === 'subscribed' ? 'live' : providerState === 'polling_fallback' || providerState === 'polling' ? 'fallback_polling' : 'unavailable', readOnly: true, executionAllowed: false, automaticTrading: false, lastEventAt: providerLastEventAt, time: new Date().toISOString() }));
app.get('/api/quote/:symbol', async (req, res) => { const symbol = cleanSymbol(req.params.symbol); if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' }); try { res.set('Cache-Control', 'no-store'); res.json(await getQuote(symbol)); } catch (error) { res.status(502).json({ symbol, error: error.message || 'تعذر جلب السعر' }); } });
app.get('/api/quotes', async (req, res) => { const requested = [...new Set(String(req.query.symbols || '').split(',').map(cleanSymbol).filter(Boolean))].slice(0, 40); if (!requested.length) return res.json([]); try { res.set('Cache-Control', 'no-store'); const rows = await getQuotes(requested); const map = new Map(rows.map(row => [row.symbol, row])); res.json(requested.map(symbol => map.get(symbol) || { symbol, error: 'تعذر جلب السعر' })); } catch (error) { res.status(502).json({ error: error.message || 'تعذر جلب الأسعار' }); } });
app.get('/api/market', async (_req, res) => { try { res.set('Cache-Control', 'no-store'); res.json(await getMarketPulse()); } catch (error) { res.status(502).json({ error: error.message || 'تعذر جلب حالة السوق' }); } });
app.get('/api/technicals/:symbol', async (req, res) => { const symbol = cleanSymbol(req.params.symbol); if (!symbol) return res.status(400).json(technicalUnavailableSnapshot({ symbol, reason: 'INVALID_SYMBOL' })); try { res.set('Cache-Control', 'no-store'); res.json(await technicals.getSnapshot(symbol)); } catch { res.status(503).json(technicalUnavailableSnapshot({ symbol, reason: 'SOURCE_UNAVAILABLE' })); } });
for (const file of ['live-alerts.js', 'smart-alerts.js', 'decision-engine.js']) app.get(`/${file}`, (_req, res) => { res.set('Cache-Control', 'no-store'); res.type('application/javascript').sendFile(path.join(root, file)); });
async function page(_req, res) { try { let html = await fs.readFile(path.join(root, 'live-index.html'), 'utf8'); for (const [file, version] of [['live-alerts.js', '2'], ['smart-alerts.js', '7300'], ['decision-engine.js', '7600']]) if (!html.includes(`/${file}`)) html = html.replace('</body>', `<script src="/${file}?v=${version}"></script></body>`); res.set('Cache-Control', 'no-store'); res.type('html').send(html); } catch { res.status(500).send('تعذر تحميل الواجهة الحية'); } }
app.get('/', page); app.get('/live-index.html', page);
const wss = new WebSocketServer({ server, path: '/stream' });
wss.on('connection', socket => { clients.set(socket, new Set()); send(socket, statusPayload()); socket.on('message', raw => { try { const message = JSON.parse(String(raw)); if (message.type === 'subscribe') subscribe(socket, message.symbols); } catch { send(socket, { type: 'error', error: 'رسالة غير صالحة' }); } }); socket.on('close', () => clients.delete(socket)); });

server.listen(port, '0.0.0.0', () => { console.log(JSON.stringify({ event: 'server_started', port, path: '/stream', readOnly: true, executionAllowed: false, provider: providerKey ? 'massive_polygon' : 'server_polling' })); connectProvider(); pollTimer = setInterval(pollQuotes, 15000); });
