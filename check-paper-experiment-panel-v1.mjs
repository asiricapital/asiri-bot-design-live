import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const js = await fs.readFile(new URL('./paper-experiment-panel.js', import.meta.url), 'utf8');
assert.match(html, /<script src="\.\/paper-experiment-panel\.js\?v=1"><\/script>/);
assert.ok(js.includes("https://asiri-bot.onrender.com/api/paper-experiment"));
assert.doesNotMatch(js, /method:\s*['"](POST|PUT|DELETE|PATCH)/i, 'GET only');
assert.doesNotMatch(js, /executionAllowed\s*[:=]\s*true/);
console.log('Paper experiment panel contract passed: GET-only, read-only, wired after the paper lab.');
