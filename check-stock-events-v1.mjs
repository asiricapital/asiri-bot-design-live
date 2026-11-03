import assert from 'node:assert/strict';
import {relevantNews} from './stock-events-v1.mjs';
const item=(ticker,link='https://example.com/story')=>({title:'Headline',publisher:'Publisher',publishedAt:'2026-11-03T12:00:00Z',link,relatedTickers:[ticker]});
assert.equal(relevantNews([item('SG'),item('OTHER'),item('SG','javascript:alert(1)')],'SG').length,1);
assert.deepEqual(relevantNews([item('SG')],'OTHER'),[]);
assert.deepEqual(relevantNews([{...item('SG'),publishedAt:'bad'}],'SG'),[]);
assert.deepEqual(relevantNews([{...item('SG'),relatedTickers:[]}],'SG'),[]);
assert.equal(relevantNews(Array.from({length:8},()=>item('SG')),'SG').length,5);
console.log('Stock events checks passed: explicit ticker, HTTPS links, valid timestamp, bounded output.');
