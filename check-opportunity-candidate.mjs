import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [html, journey] = await Promise.all([
  fs.readFile(new URL('./index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./opportunity-journey.js', import.meta.url), 'utf8')
]);

assert.match(html, /مرشح اليوم — قيد التحقق/);
assert.match(html, /opt-eligibility/);
assert.match(html, /لا توجد صفقة مؤهلة حاليًا/);
assert.match(journey, /مرشح اليوم — قيد التحقق/);
assert.match(journey, /الشراء غير مؤهل/);
assert.match(journey, /هذه ليست إشارة شراء ولا أمر تنفيذ/);
assert.doesNotMatch(journey, /🚨 تنبيه ASIRI: فرصة حقيقية مكتملة/);

console.log('opportunity candidate clarity contract passed');
console.log('paper-only boundary preserved by UI wording');
