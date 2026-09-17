import assert from 'node:assert/strict';
import { classify, createXSentimentService, unavailable } from './x-sentiment.js';

assert.equal(unavailable('SNAP').status, 'unavailable');
assert.equal(classify([{ text: '$SNAP bullish breakout', public_metrics: { like_count: 2, retweet_count: 1 } }]).label, 'إيجابي');

const disabled = createXSentimentService({ token: '' });
const missing = await disabled.getSnapshot('SNAP');
assert.equal(missing.status, 'unavailable');
assert.equal(missing.reason, 'NOT_CONFIGURED');

let requested;
const service = createXSentimentService({ token: 'fixture-token', fetchImpl: async (url, options) => {
  requested = { url, options };
  return { ok: true, async json() { return { data: [{ text: '$SNAP bullish', public_metrics: { like_count: 3, retweet_count: 1 } }] }; } };
} });
const live = await service.getSnapshot('SNAP');
assert.equal(live.status, 'live');
assert.equal(live.posts, 1);
assert.equal(live.source, 'X public posts');
assert.match(requested.url, /api\.x\.com\/2\/tweets\/search\/recent/);
assert.equal(requested.options.headers.Authorization, 'Bearer fixture-token');
console.log('X sentiment contract passed');
