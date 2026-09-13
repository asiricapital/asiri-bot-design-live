import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(process.env.ASIRI_TEST_MODULES || import.meta.url);
const {JSDOM} = require('jsdom');
const html = readFileSync(new URL('./index.html',import.meta.url),'utf8');
const source = file=>readFileSync(new URL(file,import.meta.url),'utf8');
const delay = ()=>new Promise(resolve=>setImmediate(resolve));
const observedAt = new Date().toISOString();
const quote = symbol=>({ok:true,symbol,price:7.1,previousClose:6.76,currency:'USD',source:'Yahoo Finance • Last Regular Close',session:'REGULAR_CLOSE',isLiveSession:false,isFresh:false,updatedAt:new Date(Date.now()-86400000).toISOString(),observedAt});
let quoteResponse=quote;
const dom = new JSDOM(html,{runScripts:'outside-only',url:'https://asiri-bot-design-live.onrender.com',pretendToBeVisual:true});
const w=dom.window, d=w.document;
w.localStorage.setItem('asiri_ws_portfolio_v27',JSON.stringify(['SG','CHPT','ADMA']));
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.setInterval=()=>1;
let pendingTechnical;
w.fetch = async url => {
 if (String(url).includes('/technicals/')) return new Promise(resolve=>{pendingTechnical={url,resolve};});
 const symbols = new URL(url).searchParams.get('stocks').split(',');
 return {ok:true,json:async()=>({stocks:symbols.map(quoteResponse),observedAt})};
};
for (const file of ['quote-data-health.js','watchlist-evidence.js','watchlist-view.js']) w.eval(source(file));
for (const [,js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) w.eval(js);
w.eval(source('smart-decision-lens-static.js'));
await delay();
const click=selector=>{const el=d.querySelector(selector);assert.ok(el,selector);el.click();return el;};
const input=(id,value)=>{const el=d.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));};
const shown=()=>[...d.querySelectorAll('#stocks-list-wrapper > article')].map(row=>row.dataset.symbol);
assert.deepEqual(shown(),['SG','CHPT','ADMA']);
assert.match(d.getElementById('row-SG').textContent,/\+\$0.34/);
assert.match(d.getElementById('watchlist-session-summary').textContent,/خارج الجلسة/);
assert.equal(d.querySelector('#row-SG .watchlist-details').hidden,true);
input('watchlist-search',' chp ');assert.deepEqual(shown(),['CHPT']);
input('watchlist-search','<svg onload=alert(1)>');assert.equal(shown().length,0);assert.equal(d.querySelector('.watchlist-empty svg'),null);
input('watchlist-search','');
click('#row-CHPT .watchlist-pin');assert.deepEqual(shown(),['CHPT','SG','ADMA']);
assert.match(w.localStorage.getItem('asiri_watchlist_view_v1'),/CHPT/);
click('#watchlist-favorites');assert.deepEqual(shown(),['CHPT']);click('#row-CHPT .watchlist-pin');assert.equal(shown().length,0);assert.equal(d.activeElement.id,'watchlist-favorites');click('#watchlist-favorites');click('#row-CHPT .watchlist-pin');
const sort=d.getElementById('watchlist-sort');sort.value='name';sort.dispatchEvent(new w.Event('change'));assert.deepEqual(shown(),['CHPT','ADMA','SG']);
for(const [value,label] of [['change-desc','الأكثر ارتفاعًا (%)'],['change-asc','الأكثر انخفاضًا (%)']])assert.equal(sort.querySelector(`option[value="${value}"]`)?.textContent,label,'Daily percent sort options must have explicit direction and units');
sort.value='change-desc';sort.dispatchEvent(new w.Event('change'));
quoteResponse=symbol=>({...quote(symbol),previousClose:100,price:({SG:90,CHPT:120,ADMA:100})[symbol]??100});
await w.refreshVerifiedQuotes();assert.deepEqual(shown(),['CHPT','ADMA','SG']);
assert.equal(JSON.parse(w.localStorage.getItem('asiri_watchlist_view_v1')).sort,'change-desc','Chosen percent sort is persisted');
click('#row-SG .watchlist-toggle');const row=d.getElementById('row-SG');
const menu=row.querySelector('details');menu.open=true;const focused=row.querySelector('[data-action="research"]');focused.focus();
const rowNodes=new Map(shown().map(symbol=>[symbol,d.getElementById(`row-${symbol}`)]));
quoteResponse=symbol=>({...quote(symbol),previousClose:100,price:({SG:130,CHPT:95,ADMA:100})[symbol]??100});
await w.refreshVerifiedQuotes();
assert.deepEqual(shown(),['SG','ADMA','CHPT'],'Polling reranks signed percent values even when a losing row is pinned');
for(const [symbol,node] of rowNodes)assert.equal(d.getElementById(`row-${symbol}`),node,`Polling retains the ${symbol} card DOM node after moving it`);
assert.equal(d.querySelector('#row-CHPT .watchlist-pin').textContent,'★','Percent sorting preserves the pinned star');
assert.equal(d.getElementById('row-SG'),row,'Polling must retain the card DOM node');
assert.equal(row.querySelector('.watchlist-details').hidden,false,'Polling retains expansion');
assert.equal(menu.open,true,'Polling retains open menu');assert.equal(d.activeElement,focused,'Polling retains keyboard focus');
quoteResponse=quote;
click('#row-SG .smart-summary-btn');assert.ok(d.querySelector('#asiri-smart-decision-lens-static'),'Original evidence lens remains reachable');
// Direct research navigation must preserve the selected symbol.
click('#row-SG [data-action="research"]');assert.equal(d.getElementById('research-symbol').value,'SG');assert.ok(d.getElementById('sec-research').classList.contains('active'));
w.switchMainTab('tools',null);
w.confirm=()=>false;click('#row-SG [data-action="remove"]');assert.ok(d.getElementById('row-SG'));
w.confirm=()=>true;click('#row-SG [data-action="remove"]');assert.equal(d.getElementById('row-SG'),null);assert.equal(d.getElementById('watchlist-undo').hidden,false);
w.updateVerifiedStockPrice(quote('SG'));assert.equal(d.getElementById('row-SG'),null,'Late quote cannot resurrect a deletion');
click('#watchlist-undo-button');await delay();assert.ok(d.getElementById('row-SG'));assert.equal(d.getElementById('watchlist-undo').hidden,true);
assert.deepEqual(JSON.parse(w.localStorage.getItem('asiri_ws_portfolio_v27')),['SG','CHPT','ADMA']);
input('watchlist-search','NO_MATCH');w.openAddStockModal();d.getElementById('modalSymbolInput').value='MSFT';w.confirmAddStock();assert.ok(shown().includes('MSFT'),'Adding a symbol clears hiding search');
// The on-demand history chart renders only validated returned vertices and rejects a symbol mismatch.
click('#row-SG .watchlist-toggle');
const historyButton=click('#row-SG [data-action="history"]');await delay();assert.equal(historyButton.disabled,true);
const history={ok:true,availability:'available',symbol:'SG',source:'Verified daily source',interval:'1d',historyStatus:'RECENT_DAILY',observedAt:new Date().toISOString(),candles:35,endOfHistory:new Date(Date.now()-86400000).toISOString(),indicators:{sparkline:[]}};
history.indicators.sparkline=[{date:new Date(Date.now()-2*86400000).toISOString(),close:6.76},{date:history.endOfHistory,close:7.1}];
pendingTechnical.resolve({ok:true,json:async()=>history});await delay();assert.ok(d.querySelector('#row-SG .watchlist-chart svg'));assert.equal(historyButton.disabled,false);
const sessionEnd=w.asiriWatchlistEvidence.evaluate(history,'SG').endDate;assert.ok([...d.querySelectorAll('#row-SG .watchlist-chart bdi')].some(el=>el.textContent===sessionEnd),'Trading session dates must be shown without local timezone conversion');
click('#row-SG [data-action="history"]');await delay();pendingTechnical.resolve({ok:true,json:async()=>({...history,symbol:'CHPT'})});await delay();assert.equal(d.querySelector('#row-SG .watchlist-chart svg'),null);assert.match(d.querySelector('#row-SG .watchlist-chart').textContent,/لا يطابق/);
click('#row-SG .watchlist-toggle');
// Rapid symbol changes must reject the first technical response and request the latest symbol.
click('#row-SG .watchlist-toggle');click('#row-SG [data-action="technicals"]');await delay();assert.match(pendingTechnical.url,/\/SG/);
const first=pendingTechnical;
w.switchMainTab('tools',null);click('#row-CHPT .watchlist-toggle');click('#row-CHPT [data-action="technicals"]');
first.resolve({ok:true,json:async()=>({symbol:'SG',availability:'unavailable'})});await delay();assert.match(pendingTechnical.url,/\/CHPT/);
pendingTechnical.resolve({ok:true,json:async()=>({symbol:'CHPT',availability:'unavailable'})});await delay();assert.equal(d.getElementById('technicals-symbol').value,'CHPT');
// Numeric ranking uses verified daily changes and the latest New York trading date,
// independently of pins, filtering, raw provider percentages and dollar movement.
const rankingNow=Date.parse('2026-03-03T21:00:00.000Z');
const rankingQuote=(symbol,percent,extra={})=>({...quote(symbol),previousClose:100,price:100+percent,updatedAt:'2026-03-03T20:00:00.000Z',observedAt:new Date(rankingNow).toISOString(),...extra});
const rankingSymbols=['MISSING','LOSS','ZERO','GAIN','TIE','STALE','ERROR','SNAPSHOT','PRE','POST','OLDHIGH','OLDLOW','ABSOLUTE','NOQUOTE'];
const rankingData={
 MISSING:rankingQuote('MISSING',80,{previousClose:null,changePercent:9000}),
 LOSS:rankingQuote('LOSS',-7,{changePercent:9999}),
 ZERO:rankingQuote('ZERO',0,{changePercent:5000}),
 GAIN:rankingQuote('GAIN',12,{changePercent:-9999}),
 TIE:rankingQuote('TIE',12),
 STALE:rankingQuote('STALE',70,{observedAt:new Date(rankingNow-3*60000).toISOString()}),
 ERROR:rankingQuote('ERROR',60,{error:true}),
 SNAPSHOT:rankingQuote('SNAPSHOT',50,{fromSnapshot:true}),
 PRE:rankingQuote('PRE',40,{session:'PRE',isLiveSession:true,isFresh:true}),
 POST:rankingQuote('POST',30,{session:'POST',isLiveSession:true,isFresh:true}),
 OLDHIGH:rankingQuote('OLDHIGH',90,{updatedAt:'2026-03-03T00:30:00.000Z'}),
 OLDLOW:rankingQuote('OLDLOW',-90,{updatedAt:'2026-03-02T20:00:00.000Z'}),
 ABSOLUTE:rankingQuote('ABSOLUTE',0,{previousClose:1000,price:1020,changePercent:8000})
};
const select=(options={},symbols=rankingSymbols,data=rankingData)=>Array.from(w.asiriWatchlist.selectSymbols(symbols,data,options,w.asiriQuoteDataHealth.classifyQuote,rankingNow));
const unavailable=['MISSING','STALE','ERROR','SNAPSHOT','PRE','POST','OLDHIGH','OLDLOW','NOQUOTE'];
const desc=['GAIN','TIE','ABSOLUTE','ZERO','LOSS',...unavailable];
const asc=['LOSS','ZERO','ABSOLUTE','GAIN','TIE',...unavailable];
for(const symbol of ['MISSING','STALE','ERROR','SNAPSHOT','PRE','POST','NOQUOTE'])assert.equal(w.asiriWatchlistEvidence.quoteChange(rankingData[symbol],rankingNow).available,false,`${symbol} fixture must be ineligible for a daily change`);
assert.equal(w.asiriWatchlistEvidence.quoteChange(rankingData.ZERO,rankingNow).percent,0,'A verified zero remains available');
assert.equal(w.asiriWatchlistEvidence.quoteChange(rankingData.OLDHIGH,rankingNow).available,true,'An older close can be individually verified while excluded from today’s ranking');
assert.deepEqual(select({sort:'change-desc'}),desc,'Highest percent first: signed values, stable ties, then unavailable and prior-session readings');
assert.deepEqual(select({sort:'change-asc'}),asc,'Lowest percent first: signed values with zero above positive values, then unavailable readings');
for(const [mode,expected] of [['change-desc',desc],['change-asc',asc]])assert.deepEqual(select({sort:mode,pins:['LOSS','MISSING','TIE','OLDHIGH']}),expected,'Pins do not override numeric ranking, valid ties or unavailable ordering');
assert.deepEqual(select({sort:'change-desc',favoritesOnly:true,pins:['LOSS','MISSING','TIE']}),['TIE','LOSS','MISSING'],'Favorites-only composes with percentage ranking');
assert.deepEqual(select({sort:'change-asc',favoritesOnly:true,pins:['OLDLOW','OLDHIGH','MISSING'],query:' old '}),['OLDHIGH','OLDLOW'],'Filtering all current quotes out must retain the full watchlist comparison date');
assert.deepEqual(select({sort:'change-desc',query:' a '}),['GAIN','ABSOLUTE','STALE','SNAPSHOT'],'Search composes with ranking without promoting invalid daily changes');
assert.deepEqual(select({sort:'change-desc',filter:'STALE'}),['STALE','ERROR','SNAPSHOT'],'Data-state filtering retains original order for unavailable daily changes');
const invalidCalendar=rankingQuote('INVALID',99,{updatedAt:'2026-02-30T20:00:00.000Z'});
assert.equal(w.asiriWatchlistEvidence.quoteChange(invalidCalendar,rankingNow).available,true,'Malformed calendar-date fixture must reach the comparison-date gate');
assert.deepEqual(select({sort:'change-desc'},['INVALID','VALID'],{INVALID:invalidCalendar,VALID:rankingQuote('VALID',1,{updatedAt:'2026-03-02T20:00:00.000Z'})}),['VALID','INVALID'],'Calendar rollover must not turn an invalid source date into a ranked change');
assert.deepEqual(select({sort:'change-desc'},['CLOSE','REGULAR'],{CLOSE:rankingQuote('CLOSE',1),REGULAR:rankingQuote('REGULAR',5,{session:'REGULAR',isLiveSession:true,isFresh:true})}),['REGULAR','CLOSE'],'Regular-session and last-close quotes on the same New York date share the comparison baseline');
assert.deepEqual(rankingSymbols,['MISSING','LOSS','ZERO','GAIN','TIE','STALE','ERROR','SNAPSHOT','PRE','POST','OLDHIGH','OLDLOW','ABSOLUTE','NOQUOTE'],'Sorting must not mutate the saved watchlist order');
// Recreate the view from saved browser preferences to exercise reload behavior.
for(const mode of ['change-desc','change-asc']){
 const reloaded=new JSDOM(html,{runScripts:'outside-only',url:'https://example.com',pretendToBeVisual:true});const rw=reloaded.window,rd=rw.document;
 rw.Date.now=()=>rankingNow;
 rw.localStorage.setItem('asiri_watchlist_view_v1',JSON.stringify({sort:mode,pins:['LOSS','MISSING','TIE']}));
 for(const file of ['quote-data-health.js','watchlist-evidence.js','watchlist-view.js'])rw.eval(source(file));
 const view=rw.asiriWatchlist.create({document:rd,window:rw,getState:()=>({symbols:rankingSymbols,data:rankingData,filter:'ALL'})});view.render();
 const reloadShown=()=>[...rd.querySelectorAll('#stocks-list-wrapper > article')].map(card=>card.dataset.symbol);
 assert.equal(rd.getElementById('watchlist-sort').value,mode,'Reload restores the selected percentage sort');
 assert.deepEqual(reloadShown(),mode==='change-desc'?desc:asc,'Reload restores numeric ordering while retaining pins');
 assert.equal(rd.querySelector('#row-LOSS .watchlist-pin').getAttribute('aria-pressed'),'true');
 rd.getElementById('watchlist-favorites').click();
 assert.deepEqual(reloadShown(),mode==='change-desc'?['TIE','LOSS','MISSING']:['LOSS','TIE','MISSING']);
 const search=rd.getElementById('watchlist-search');search.value=' lo ';search.dispatchEvent(new rw.Event('input',{bubbles:true}));assert.deepEqual(reloadShown(),['LOSS']);
 reloaded.window.close();
}
// Preferences fail gracefully when Safari/storage access is unavailable.
const memoryOnly = new JSDOM(html,{runScripts:'outside-only',url:'https://example.com'});const mw=memoryOnly.window;
Object.defineProperty(mw,'localStorage',{get(){throw new Error('blocked')}});mw.scrollTo=()=>{};mw.requestAnimationFrame=()=>1;mw.setInterval=()=>1;mw.fetch=async()=>({ok:true,json:async()=>({stocks:[]})});
for(const file of ['quote-data-health.js','watchlist-evidence.js','watchlist-view.js'])mw.eval(source(file));
for(const [,js] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))mw.eval(js);
await delay();memoryOnly.window.document.querySelector('.watchlist-pin').click();assert.match(memoryOnly.window.document.getElementById('watchlist-preference-note').textContent,/تعذر حفظ/);
memoryOnly.window.close();dom.window.close();
console.log('Watchlist DOM integration passed: verified percent and session ranking, sort reload, favorites/search composition, focus-preserving quote reorder, deletion/undo, lens, symbol navigation, blocked storage.');
