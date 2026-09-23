import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [html, js] = await Promise.all([
  fs.readFile(new URL('./index.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./opportunity-journey.js', import.meta.url), 'utf8')
]);

assert.match(html, /opportunity-journey\.js\?v=2/);
assert.match(html, /جارٍ القراءة/);
assert.match(js, /data\.posts \?\? data\.postCount/);
assert.match(js, /data\.status === 'live'/);
assert.match(js, /api\/x-sentiment/);

console.log('X live UI contract passed');
