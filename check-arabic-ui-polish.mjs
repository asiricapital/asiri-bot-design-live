import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const polish = fs.readFileSync(new URL('./arabic-ui-polish-v1.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./arabic-ui-polish-v1.css', import.meta.url), 'utf8');

assert.match(html, /<html lang="ar" dir="rtl">/);
assert.match(html, /<title>ASIRI \| غرفة أبحاث السوق<\/title>/);
assert.match(html, /arabic-ui-polish-v1\.css\?v=1/);
assert.match(html, /arabic-ui-polish-v1\.js\?v=1/);
assert.match(polish, /document\.documentElement\.lang = 'ar'/);
assert.match(polish, /document\.documentElement\.dir = 'rtl'/);
assert.match(polish, /executionAllowed|التنفيذ/);
assert.match(css, /direction: rtl/);
assert.doesNotMatch(polish, /fetch\s*\(/);
assert.doesNotMatch(polish, /placeOrder|submitOrder|SAXO_EXECUTION_FEATURE_ENABLED/i);

console.log('Arabic UI polish contract passed: RTL, Arabic labels, presentation-only boundary.');
