import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const client = fs.readFileSync('operational-trust-panel-v1.js', 'utf8');
const css = fs.readFileSync('operational-trust-panel-v1.css', 'utf8');
for (const marker of [
  'operational-trust-panel',
  'trust-card-service',
  'trust-card-market',
  'trust-card-stream',
  'trust-card-notifications',
  'trust-card-safety',
  'هل الأسعار حية أم مجرد آخر إغلاق؟',
  'operational-trust-panel-v1.js'
]) assert.ok(html.includes(marker), `Missing HTML marker: ${marker}`);
for (const endpoint of [
  '/api/system/health',
  '/api/market-stream/status',
  '/api/market-stream/snapshot',
  '/api/notifications/status',
  '/api/execution-readiness'
]) assert.ok(client.includes(endpoint), `Missing read endpoint: ${endpoint}`);
assert.match(client, /Promise\.allSettled/);
assert.match(client, /method:\s*'GET'/);
assert.doesNotMatch(client, /method:\s*'POST'|brokerSubmission\s*:\s*true|automaticTrading\s*:\s*true|executionAllowed\s*:\s*true/);
assert.match(client, /آخر إغلاق — ليس حيًا/);
assert.ok(css.includes('@media(max-width:390px)'), 'Mobile layout contract missing');
assert.match(html, /paperOnly=true.*executionAllowed=false.*tradingEnabled=false/);
console.log('Operational trust panel contract passed: five read-only evidence cards, conservative freshness labels, mobile CSS.');
