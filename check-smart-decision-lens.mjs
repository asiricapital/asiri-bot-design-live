import fs from 'node:fs';

const lens = fs.readFileSync('smart-decision-lens.js', 'utf8');
const css = fs.readFileSync('smart-decision-lens.css', 'utf8');
const server = fs.readFileSync('live-server.js', 'utf8');

for (const marker of [
  'ASIRI Smart Decision Lens',
  'asiriSmartDecisionLens',
  'عدسة القرار الذكية',
  'رُصدت',
  'مراقبة',
  'شروط مكتملة',
  'مراجعة بشرية',
  'ما الذي ننتظره الآن؟',
  'قراءة وشرح فقط',
  'مراجعة بشرية إلزامية',
  'لا تنفيذ آلي',
  'لا توصف كبث حي',
  'smart\\s*summary',
  'quotes?.get',
  "document.addEventListener('pointerup', interceptLensTrigger, true)",
  "document.addEventListener('click', interceptLensTrigger, true)",
  'event.stopImmediatePropagation()',
  "event.key === 'Escape'"
]) if (!lens.includes(marker)) throw new Error(`Smart decision lens marker missing: ${marker}`);

for (const forbidden of ['fetch(', 'POST', 'PUT', 'PATCH', 'DELETE', 'broker', 'order', 'execute', 'telegram', 'localStorage.setItem']) {
  if (lens.includes(forbidden)) throw new Error(`Smart decision lens must remain presentation-only: ${forbidden}`);
}

for (const marker of [
  '.asiri-decision-lens',
  '.adl-sheet',
  '.adl-rail',
  '.adl-next',
  '.adl-footer',
  '@media(max-width:580px)',
  'env(safe-area-inset-bottom)',
  'prefers-reduced-motion'
]) if (!css.includes(marker)) throw new Error(`Smart decision lens CSS marker missing: ${marker}`);

for (const marker of ['smart-decision-lens.js', 'smart-decision-lens.css', 'Cache-Control']) {
  if (!server.includes(marker)) throw new Error(`Smart decision lens server marker missing: ${marker}`);
}

console.log('Smart decision lens checks passed: Arabic bottom sheet, quote disclosure, safe close interactions, and presentation-only boundary preserved.');
