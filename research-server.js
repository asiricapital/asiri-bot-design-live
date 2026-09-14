import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-research-intelligence-preview',
  engine: 'vane-inspired-ui',
  liveResearch: false,
  trading: false,
  time: new Date().toISOString(),
}));

app.get(['/', '/research', '/research-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'research-intelligence.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Research Intelligence preview listening on ${port}`);
});
