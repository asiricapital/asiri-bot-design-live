import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const required = [
  "const statusText = verified",
  "أسعار موثقة ${verified}/${symbols.length} • آخر تحديث ${observedAt}",
  "document.getElementById('last-sync-label').textContent = verified",
  "آخر تحديث موثق من محرك السوق • ${verified} أصل • ${observedAt}",
  "const retryText = 'تعذر تحديث الأسعار الموثقة — ستتم المحاولة تلقائياً'",
  "document.getElementById('last-sync-label').textContent = retryText",
  "fetch(`${VERIFIED_QUOTES_API}?stocks=${encodeURIComponent(symbols.join(','))}",
  "cache: 'no-store'"
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing live price status contract: ${token}`);
}

const forbidden = [
  'executionAllowed: true',
  'automaticTrading: true',
  'brokerSubmission: true',
  'Math.random()',
  'synthetic price'
];
for (const token of forbidden) {
  if (source.includes(token)) throw new Error(`Unsafe live price status contract: ${token}`);
}

console.log('Live price status synchronization contract passed.');
