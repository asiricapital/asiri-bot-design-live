import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const required = [
  'ASIRI_SMART_DECISION_SUMMARY_UI_V1',
  'id="smartDecisionSummaryModal"',
  'SMART_SUMMARY_API',
  '/api/live-terminal/smart-summary',
  'openSmartDecisionSummary',
  'closeSmartDecisionSummary',
  'renderSmartDecisionSummaryUnavailable',
  'QUOTE_UNAVAILABLE_OR_STALE',
  'TECHNICAL_CONTEXT_UNAVAILABLE_OR_STALE',
  'AI_NOT_CONFIGURED',
  'executionAllowed=false',
  'automaticTrading=false',
  'ملخص ذكي',
  'لا ينشئ توصية شراء أو بيع'
];
for (const marker of required) assert.ok(html.includes(marker), `Smart summary UI marker missing: ${marker}`);

const summaryBlock = html.slice(html.indexOf('function openSmartDecisionSummary'), html.indexOf('function removeStock'));
const renderingBlock = html.slice(html.indexOf('function renderSmartDecisionSummary('), html.indexOf('async function openSmartDecisionSummary'));
assert.ok(summaryBlock.includes('item.isFresh !== true'), 'Smart summary must reject a non-fresh quote before requesting analysis');
assert.ok(summaryBlock.includes('item.error === true'), 'Smart summary must reject a failed quote before requesting analysis');
assert.ok(renderingBlock.includes('availability !== \'available\''), 'Smart summary must require an available API payload');
assert.ok(renderingBlock.includes('brokerSubmission !== false'), 'Smart summary must reject a payload without an explicit broker lock');
assert.ok(!/fetch\([^\n]*(?:order|trade|broker|testnet)/i.test(summaryBlock), 'Smart summary UI must not call an execution path');
assert.ok(!/automaticTrading\s*=\s*true|executionAllowed\s*=\s*true|brokerSubmission\s*=\s*true/i.test(summaryBlock), 'Smart summary UI must remain read-only');

console.log('Smart decision summary UI checks passed: on-demand UI, explicit unavailable states, and no execution route.');
