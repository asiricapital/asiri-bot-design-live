import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8');

for (const marker of [
  'smart-decision-lens-static.css?v=1',
  'smart-decision-lens-static.js?v=1',
  'class="smart-summary-btn"'
]) {
  if (!index.includes(marker)) throw new Error(`Static lens index marker missing: ${marker}`);
}
for (const marker of [
  'smart-summary-btn',
  'event.stopImmediatePropagation()',
  'عدسة القرار الذكية',
  'رحلة السهم',
  'لا تنفيذ آلي',
  'المراجعة البشرية إلزامية',
  'مؤشر ثقة الأدلة',
  'ليس احتمال ربح',
  'isCalibrated: false',
  'Math.min(rawScore, 39)',
  'TEST SCENARIOS · LOCAL ONLY',
  'مختبر سيناريوهات الثقة',
  "stale: Object.freeze",
  "failedSource: Object.freeze",
  "gatesPending: Object.freeze",
  "reviewReady: Object.freeze",
  'محاكاة محلية',
  'لا تُعدّل بيانات السوق أو حالة السهم أو التنبيهات',
  'reviewGates(item, view)',
  'هذه البوابة لا تُحاكى',
  'asiriSmartDecisionLens'
]) {
  if (!script.includes(marker)) throw new Error(`Static lens script marker missing: ${marker}`);
}
for (const marker of [
  '.smart-decision-lens-static',
  'env(safe-area-inset-bottom)',
  '@media (max-width: 520px)',
  '.smart-lens-state.ready',
  '.smart-lens-state.attention',
  '.smart-lens-confidence',
  '.smart-lens-meter',
  '.smart-lens-confidence-details',
  '.smart-lens-simulator',
  '.smart-lens-scenario-buttons',
  '.smart-lens-review-gates',
  '.smart-lens-gate.passed',
  '.smart-lens-gate.blocked'
]) {
  if (!css.includes(marker)) throw new Error(`Static lens CSS marker missing: ${marker}`);
}
if (/\b(fetch|XMLHttpRequest)\s*\(/.test(script)) throw new Error('Static lens must not make network calls.');
if (/\b(order|trade|broker|execute|submit)\b/i.test(script)) throw new Error('Static lens must not expose trading or broker actions.');
if (/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\s*\(/.test(script)) throw new Error('Static lens simulation must remain local and network-free.');
console.log('Static smart decision lens checks passed: v27 binding, evidence-confidence simulator, review gates, mobile safety and read-only boundaries verified.');
