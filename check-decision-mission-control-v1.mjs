import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('decision-mission-control-v1.js', 'utf8');
const css = fs.readFileSync('decision-mission-control-v1.css', 'utf8');

test('mission control is wired into the page', () => {
  assert.match(html, /decision-mission-control-v1\.css/);
  assert.match(html, /decision-mission-control-v1\.js/);
  assert.match(js, /TRADING MISSION CONTROL/);
  assert.match(js, /ماذا أفعل الآن؟/);
});

test('mission control ranks usable quotes without pretending to issue a buy signal', () => {
  for (const marker of ['موثوقية البيانات', 'الأولوية للمراجعة', 'جودة القراءة', 'افتح التحليل', 'خطة ورقية', 'statusText']) assert.match(js, new RegExp(marker));
  assert.match(js, /هذا ترشيح للمراجعة وليس إشارة شراء/);
  assert.match(js, /spread/);
  assert.match(js, /observedAt/);
});

test('mission control connects only to read-only and paper-only actions', () => {
  assert.match(js, /readOnly:true/);
  assert.match(js, /paperOnly:true/);
  assert.match(js, /order-readiness-desk-v1/);
  assert.doesNotMatch(js, /fetch\([^)]*method:\s*['"](POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(js, /\/orders|\/trade|submit-order|brokerSubmission/i);
});

test('mobile layout exposes a usable priority queue', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /grid-template-columns:1fr/);
});
