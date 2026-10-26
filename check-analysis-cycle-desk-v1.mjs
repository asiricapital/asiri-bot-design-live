import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('analysis-cycle-desk-v1.js', 'utf8');
const css = fs.readFileSync('analysis-cycle-desk-v1.css', 'utf8');

test('analysis cycle desk is loaded and has a mobile surface', () => {
  assert.match(html, /analysis-cycle-desk-v1\.css/);
  assert.match(html, /analysis-cycle-desk-v1\.js/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(js, /ASIRI DAILY ANALYSIS CYCLE/);
});

test('cycle actions remain paper-only and read-only', () => {
  assert.match(js, /readOnly:true/);
  assert.match(js, /paperOnly:true/);
  assert.match(js, /executionAllowed:false/);
  assert.doesNotMatch(js, /SAXO_EXECUTION_FEATURE_ENABLED\s*=\s*true/);
  assert.doesNotMatch(js, /\/trade\/v2|\/orders?\b|placeOrder|submitOrder|brokerSubmission/i);
});

test('cycle has the four user-facing stages and safe failure guidance', () => {
  for (const marker of ['السعر', 'التحليل', 'الخطة', 'المحاكاة', 'السعر غير متاح', 'لا يُنشئ هذا المركز أمرًا']) assert.match(js, new RegExp(marker));
  assert.match(js, /asiri:saxo-watchlist-quotes/);
  assert.match(js, /paper-lab-run/);
});
