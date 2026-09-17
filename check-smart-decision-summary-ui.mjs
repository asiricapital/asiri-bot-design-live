import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lens = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');

for (const marker of [
  'ASIRI_SMART_DECISION_SUMMARY_UI_V1',
  'class="smart-summary-btn"',
  'تفاصيل القراءة'
]) assert.ok(html.includes(marker), `Quote-quality UI marker missing: ${marker}`);

assert.ok(!html.includes('onclick="openSmartDecisionSummary'), 'Only the external decision-lens handler may own the stock action');
assert.ok(!html.includes('/api/live-terminal/smart-summary'), 'The unavailable smart-summary route must not be called or advertised');
assert.ok(!html.includes('smartDecisionSummaryModal'), 'The inactive legacy AI summary modal must not remain in the page');
assert.ok(!html.includes('AI-ASSISTED RESEARCH'), 'The page must not imply a model generated the local lens');

for (const marker of [
  "event.target.closest('.smart-summary-btn')",
  'تفاصيل جودة القراءة',
  'قراءة تفسيرية محلية من البيانات الظاهرة',
  'لا تستخدم نموذج ذكاء اصطناعي',
  'لا تنفيذ آلي',
  'لا توصية'
]) assert.ok(lens.includes(marker), `Local quote-quality lens marker missing: ${marker}`);

assert.ok(!lens.includes('event.stopImmediatePropagation()'), 'The local lens must not suppress unrelated click handlers');
assert.ok(!/\b(fetch|XMLHttpRequest)\s*\(/.test(lens), 'The local lens must not make network calls');
assert.ok(!/\b(order|trade|broker|execute|submit)\b/i.test(lens), 'The local lens must not expose trading or broker actions');

console.log('Quote-quality UI checks passed: one local handler, explicit non-AI disclosure, no unavailable endpoint, and no execution route.');
