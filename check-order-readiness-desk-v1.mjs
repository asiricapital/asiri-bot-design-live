import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('order-readiness-desk-v1.js', 'utf8');
const css = fs.readFileSync('order-readiness-desk-v1.css', 'utf8');

test('order readiness desk is wired into the live page', () => {
  assert.match(html, /order-readiness-desk-v1\.css/);
  assert.match(html, /order-readiness-desk-v1\.js/);
  assert.match(js, /panel\.id\s*=\s*['"]order-readiness-desk-v1/);
  assert.match(js, /SAXO OpenAPI|Saxo/);
});

test('desk calculates visible risk and reward metrics', () => {
  for (const marker of ['ordCapital', 'ordRiskPct', 'ordStop', 'ordTarget', 'ordQty', 'ordMaxLoss', 'ordRrr', 'gates']) assert.match(js, new RegExp(marker));
  assert.match(js, /Math\.floor\(riskBudget \/ distance\)/);
  assert.match(js, /rrr >= 2/);
});

test('desk only creates local paper tickets and never submits orders', () => {
  assert.match(js, /paperOnly:true/);
  assert.match(js, /executionAllowed:false/);
  assert.match(js, /localStorage/);
  assert.match(js, /PAPER_CONFIRMED/);
  assert.doesNotMatch(js, /fetch\([^)]*method:\s*['"]POST/i);
  assert.doesNotMatch(js, /\/orders|\/trade|\/submit-order|brokerSubmission/i);
  assert.match(html, /paperOnly=true/);
  assert.match(html, /executionAllowed=false/);
});

test('mobile layout remains usable', () => {
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.match(css, /overflow:auto/);
});
