import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('./saxo-watchlist-ui-v1.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./saxo-watchlist-ui-v1.css', import.meta.url), 'utf8');

test('loads the Saxo read-only watchlist UI assets', () => {
  assert.match(html, /saxo-watchlist-ui-v1\.css/);
  assert.match(html, /saxo-watchlist-ui-v1\.js/);
});

test('uses the authenticated GET bridge and exposes source state', () => {
  assert.match(js, /\/api\/broker\/saxo\/watchlist\/quotes/);
  assert.match(js, /authorization\s*=\s*`Bearer/);
  assert.match(js, /X-ASIRI-SAXO-TICKET/);
  assert.match(js, /symbols=\$\{encodeURIComponent/);
  assert.match(js, /asiri_saxo_bridge_ticket/);
  assert.match(js, /Saxo LIVE/);
  assert.match(js, /observedAt/);
  assert.match(js, /readOnly:\s*true/);
  assert.doesNotMatch(js, /method:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/i);
});

test('decorates existing stock rows without adding execution controls', () => {
  assert.match(js, /stocks-list-wrapper/);
  assert.match(js, /stock-col-price/);
  assert.match(js, /saxo-watchlist-row-meta/);
  assert.doesNotMatch(js, /placeOrder|submitOrder|sendOrder|brokerSubmission/i);
});

test('has a narrow mobile layout and explicit read-only copy', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(js, /قراءة فقط/);
  assert.match(css, /saxo-bound-price/);
});
