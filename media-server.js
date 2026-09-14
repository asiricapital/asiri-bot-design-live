import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-media-intelligence-lab',
  mode: 'isolated-preview',
  trading: false,
  time: new Date().toISOString(),
}));
app.get(['/', '/media-intelligence', '/media-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'media-intelligence.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Media Intelligence Lab listening on ${port}`);
});
