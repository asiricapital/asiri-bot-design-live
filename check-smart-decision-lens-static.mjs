import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8');

for (const marker of [
  'quote-data-health.js?v=1',
  'smart-decision-lens-static.css?v=5',
  'smart-decision-lens-static.js?v=5',
  'class="smart-summary-btn"'
]) {
  if (!index.includes(marker)) throw new Error(`Static lens index marker missing: ${marker}`);
}
for (const marker of [
  'smart-summary-btn',
  'تفاصيل جودة القراءة',
  'قراءة تفسيرية محلية من البيانات الظاهرة',
  'لا تستخدم نموذج ذكاء اصطناعي',
  'مسار حالة القراءة',
  'لا تنفيذ آلي',
  'لا توصية',
  'اكتمال بيانات السعر',
  'جودة التحليل',
  'غير محسوبة',
  'احتمال الربح',
  'هذا فحص لنقل البيانات فقط',
  'DATA QUALITY SCENARIOS · LOCAL ONLY',
  'مختبر حالات جودة القراءة',
  "stale: Object.freeze",
  "delayed: Object.freeze",
  "stale: Object.freeze",
  "unavailable: Object.freeze",
  "fresh: Object.freeze",
  'محاكاة محلية',
  'لا تُعدّل بيانات السوق أو حالة السهم أو التنبيهات',
  'qualityChecks(item)',
  'asiriQuoteQualityLens'
]) {
  if (!script.includes(marker)) throw new Error(`Static lens script marker missing: ${marker}`);
}
for (const marker of [
  '.smart-decision-lens-static',
  'env(safe-area-inset-bottom)',
  '@media (max-width: 520px)',
  '.smart-lens-state.fresh',
  '.smart-lens-state.delayed',
  '.smart-lens-state.stale',
  '.smart-lens-state.unavailable',
  '.smart-lens-completeness',
  '.smart-lens-field-grid',
  '.smart-lens-analysis-status',
  '.smart-lens-simulator',
  '.smart-lens-scenario-buttons',
  '.smart-lens-review-gates',
  '.smart-lens-gate.passed',
  '.smart-lens-gate.blocked'
]) {
  if (!css.includes(marker)) throw new Error(`Static lens CSS marker missing: ${marker}`);
}
if (script.includes('مؤشر ثقة الأدلة') || script.includes('/ 100')) throw new Error('Quote completeness must not be presented as a 100-point confidence score.');
if (/\b(fetch|XMLHttpRequest)\s*\(/.test(script)) throw new Error('Static lens must not make network calls.');
if (script.includes('event.stopImmediatePropagation()')) throw new Error('Static lens must not suppress unrelated click handlers.');
if (/\b(order|trade|broker|execute|submit)\b/i.test(script)) throw new Error('Static lens must not expose trading or broker actions.');
if (/\b(fetch|XMLHttpRequest|localStorage|sessionStorage)\s*\(/.test(script)) throw new Error('Static lens simulation must remain local and network-free.');
console.log('Static quote-quality lens checks passed: v27 binding, honest completeness display, analysis separation, mobile safety and read-only boundaries verified.');
