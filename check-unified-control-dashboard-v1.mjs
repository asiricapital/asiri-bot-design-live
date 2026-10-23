import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('./unified-control-dashboard-v1.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./unified-control-dashboard-v1.css', import.meta.url), 'utf8');

test('unified dashboard exposes the three user workflows', () => {
  for (const marker of ['unified-control-dashboard', 'unified-watchlist', 'unified-paper-equity', 'unified-alert-list', 'unified-open-watchlist', 'unified-open-paper', 'unified-open-alerts']) assert.match(html, new RegExp(marker));
  assert.match(html, /unified-control-dashboard-v1\.css/);
  assert.match(html, /unified-control-dashboard-v1\.js/);
});

test('dashboard reads existing state and does not add execution capability', () => {
  for (const marker of ['watchlist', 'stockMarketData', 'paper-lab-equity', 'paper-lab-pnl', 'asiri_live_alerts_v1', 'readOnly: true']) assert.match(js, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(js, /brokerSubmission\s*=\s*true|executionAllowed\s*=\s*true|automaticTrading\s*=\s*true|placeOrder|submitOrder|createOrder/);
  assert.match(html, /READ-ONLY · PAPER ONLY/);
});

test('mobile layout keeps dashboard usable', () => {
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /overflow-wrap:anywhere/);
});

console.log('Unified control dashboard v1 contract passed.');
