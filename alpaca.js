import WebSocket from 'ws';

export function startAlpacaStream({ key, secret, feed = 'iex', symbols, onTrade, onStatus }) {
  if (!key || !secret) throw new Error('مفاتيح Alpaca غير مكتملة');
  let ws;
  let stopped = false;
  let reconnectTimer;

  const connect = () => {
    if (stopped) return;
    const url = `wss://stream.data.alpaca.markets/v2/${feed}`;
    ws = new WebSocket(url);

    ws.on('open', () => {
      onStatus?.({ connected: true, provider: 'Alpaca', at: new Date().toISOString() });
      ws.send(JSON.stringify({ action: 'auth', key, secret }));
    });

    ws.on('message', (raw) => {
      let messages;
      try { messages = JSON.parse(raw.toString()); } catch { return; }
      for (const msg of messages) {
        if (msg.T === 'success' && msg.msg === 'authenticated') {
          ws.send(JSON.stringify({ action: 'subscribe', trades: symbols }));
        }
        if (msg.T === 't') {
          onTrade?.({ symbol: msg.S, price: msg.p, size: msg.s, timestamp: msg.t, source: `Alpaca ${feed.toUpperCase()}` });
        }
        if (msg.T === 'error') onStatus?.({ connected: false, error: msg.msg || 'Alpaca error' });
      }
    });

    ws.on('close', () => {
      onStatus?.({ connected: false, provider: 'Alpaca', at: new Date().toISOString() });
      if (!stopped) reconnectTimer = setTimeout(connect, 5000);
    });
    ws.on('error', (error) => onStatus?.({ connected: false, error: error.message }));
  };

  connect();
  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    ws?.close();
  };
}
