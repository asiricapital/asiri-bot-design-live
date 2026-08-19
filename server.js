const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// استخدام نقطة نهاية REST موثوقة وجلب دوري آمن للأسعار لتجنب قيود WebSocket المجانية
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'pp9Wp8ypugygYEp6YFkEssQIUjs90Wu8';
const SYMBOLS = ['SNAP', 'MVIS', 'SG', 'RKLB', 'CHPT', 'BLNK', 'HUMA', 'AGEN', 'ENSC', 'TMCI', 'AMPL', 'RDW', 'INO', 'LASE', 'PLUG', 'CRDL', 'ADMA', 'OPTT', 'INLF'];

let latestPrices = {};

async function fetchMarketPrices() {
    const fetch = (await import('node-fetch')).default;
    for (const sym of SYMBOLS) {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?apiKey=${POLYGON_API_KEY}`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data && data.results && data.results.length > 0) {
                const resObj = data.results[0];
                latestPrices[sym] = {
                    price: resObj.c, // Close price of previous session
                    high: resObj.h,
                    low: resObj.l,
                    volume: resObj.v,
                    time: Date.now()
                };
                broadcastToClients({ type: 'STOCK_TICK', symbol: sym, price: resObj.c, time: Date.now() });
            }
        } catch (e) {
            console.error(`[Market Poller] Error fetching ${sym}:`, e.message);
        }
        // فاصل زمني آمن بين الطلبات لتجنب تجاوز حد الطلبات
        await new Promise(r => setTimeout(r, 800));
    }
}

function broadcastToClients(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('[Client] Browser client connected');
    ws.send(JSON.stringify({ type: 'INITIAL_PRICES', data: latestPrices }));

    ws.on('close', () => {
        console.log('[Client] Browser client disconnected');
    });
});

// بدء التحديث الدوري للسوق كل 60 ثانية
setInterval(fetchMarketPrices, 60000);
setTimeout(fetchMarketPrices, 2000); // تحديث فوري عند الإقلاع

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Asiri Capital Market Bridge running on port ${PORT}`);
});
