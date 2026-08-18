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

const POLYGON_WS_URL = process.env.POLYGON_WS_URL || 'wss://delayed.polygon.io/stocks';
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'pp9Wp8ypugygYEp6YFkEssQIUjs90Wu8';

let polygonWs = null;
let latestPrices = {};

function connectPolygon() {
    console.log('[Polygon WS] Connecting to streaming server...');
    polygonWs = new WebSocket(POLYGON_WS_URL);

    polygonWs.on('open', () => {
        console.log('[Polygon WS] Connected. Authenticating...');
        polygonWs.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }));
    });

    polygonWs.on('message', (data) => {
        try {
            const messages = JSON.parse(data.toString());
            messages.forEach(msg => {
                if (msg.T === 'status' && msg.status === 'auth_success') {
                    console.log('[Polygon WS] Authenticated successfully. Subscribing...');
                    polygonWs.send(JSON.stringify({ action: 'subscribe', params: 'AM.*,Q.*,T.*' }));
                }

                if (msg.T === 'T' || msg.T === 'Q' || msg.T === 'AM') {
                    const sym = msg.sym || msg.S;
                    const price = msg.p || msg.bp || msg.c;
                    if (sym && price) {
                        latestPrices[sym] = {
                            price: price,
                            time: msg.t || Date.now()
                        };
                        broadcastToClients({ type: 'STOCK_TICK', symbol: sym, price: price, time: latestPrices[sym].time });
                    }
                }
            });
        } catch (e) {
            console.error('[Polygon WS] Error parsing message:', e);
        }
    });

    polygonWs.on('error', (err) => {
        console.error('[Polygon WS] Error:', err.message);
    });

    polygonWs.on('close', () => {
        console.warn('[Polygon WS] Disconnected. Reconnecting in 5 seconds...');
        setTimeout(connectPolygon, 5000);
    });
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

connectPolygon();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Server] Asiri Capital WebSocket Bridge running on port ${PORT}`);
});
