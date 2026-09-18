import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html = await fs.readFile(new URL('./index.html', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('./favorite-star.css', import.meta.url), 'utf8');
for (const marker of ['favorite-scenario-card','scenario-watch-low','scenario-watch-high','scenario-confirm','scenario-target','scenario-invalidation','saveFavoriteScenario','renderFavoriteScenario','FAVORITE_SCENARIO_KEY']) assert.match(html, new RegExp(marker));
for (const marker of ['scenario-sound-toggle','toggleScenarioSound','playScenarioTone','notifyScenarioTransition','SCENARIO_ALERT_STATE_KEY','scenario-alert-toast']) assert.match(html + css, new RegExp(marker));
for (const marker of ['داخل منطقة المراقبة','تأكيد الاتجاه للمراجعة','بلوغ هدف المراجعة','إعادة تقييم','لا تنشئ شراءً أو بيعًا']) assert.ok(html.includes(marker), `Missing scenario state: ${marker}`);
assert.match(css, /favorite-scenario-reading/);
console.log('Favorite advisory scenario contract passed');
