import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lens = fs.readFileSync(new URL('./smart-decision-lens-static.js', import.meta.url), 'utf8');
const lensCss = fs.readFileSync(new URL('./smart-decision-lens-static.css', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Function ${name} is missing`);
  const signatureEnd = source.indexOf(') {', start);
  assert.ok(signatureEnd >= 0, `Function ${name} has an unsupported signature`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Function ${name} is incomplete`);
}

for (const [index, match] of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].entries()) {
  new vm.Script(match[1], { filename: `index-inline-${index}.js` });
}

const portfolioMarkers = [
  'ASIRI_BATCH1_PORTFOLIO_V1',
  'id="sec-portfolio"',
  'id="portfolio-list"',
  'id="portfolio-fresh-count"',
  'id="portfolio-cached-count"',
  'id="portfolio-unavailable-count"',
  'function renderPortfolioSummary()',
  "if (tab === 'portfolio') renderPortfolioSummary();",
  'function openPortfolioSymbol(symbol)',
  'هذه قائمة متابعة محلية وليست كشف حساب وسيط'
];
for (const marker of portfolioMarkers) assert.ok(html.includes(marker), `Batch 1 portfolio marker missing: ${marker}`);

assert.ok(html.includes('const WATCHLIST_KEY = \'asiri_ws_portfolio_v27\';'), 'The stable v27 localStorage key must remain unchanged');
assert.ok(html.includes('function normalizeWatchlist(value)'), 'Stored watchlist data must be normalized before rendering');
assert.ok(html.includes("/^[A-Z][A-Z0-9.-]{0,9}$/"), 'Symbols must be restricted before entering rendered markup');
assert.ok(html.includes('escapeMarkup(symbol)'), 'Portfolio symbols must be escaped before innerHTML rendering');
assert.ok(html.includes("source = hasPrice ? item.source : 'غير متاح'"), 'A missing provider must remain explicitly unavailable');
assert.ok(html.includes('price: finiteNumber(saved.price)'), 'A numeric string in an older snapshot must be normalized before rendering');
assert.ok(html.includes('symbols.filter((symbol) => !receivedSymbols.has(symbol)).forEach(markQuoteUnavailable);'), 'A partial quote response must mark missing symbols as unavailable');
assert.ok(html.includes('item.isFresh = false;') && html.includes('item.error = true;'), 'A failed refresh must retain the last price without claiming it is fresh');

const finiteNumber = vm.runInNewContext(`(${extractFunction(html, 'finiteNumber')})`);
assert.equal(finiteNumber(null), null, 'A null quote must not become zero');
assert.equal(finiteNumber(''), null, 'An empty quote must not become zero');
assert.equal(finiteNumber('2.26'), 2.26, 'A stored numeric quote must be normalized safely');

const navigationStart = html.indexOf('function switchMainTab(');
const navigationEnd = html.indexOf('function openJourneyDestination(');
const navigation = html.slice(navigationStart, navigationEnd);
assert.ok(navigationStart >= 0 && navigationEnd > navigationStart, 'Unified navigation block is missing');
assert.ok(navigation.includes('document.getElementById(`sec-${tab}`)'), 'Navigation must resolve its target before changing active state');
assert.ok(navigation.includes("document.querySelectorAll('.nav-item[data-tab]')"), 'Top and bottom navigation state must stay synchronized');
assert.ok(navigation.includes("section.classList.add('active')"), 'Navigation must activate the resolved section');
assert.ok(navigation.includes("mainTabHistory.pop()"), 'The back action must return to the previous section');
assert.ok(html.includes('data-tab="portfolio" onclick="bottomNavClick(\'portfolio\', this)"'), 'Bottom portfolio navigation must target the portfolio section');

const makeClassList = (...initial) => {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle: (name, force) => { if (force) values.add(name); else values.delete(name); },
    contains: (name) => values.has(name)
  };
};
const makeElement = (tab, active = false) => ({
  dataset: tab ? { tab } : {},
  classList: makeClassList(...(active ? ['active'] : [])),
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
  removeAttribute(name) { delete this.attributes[name]; }
});
const sections = { tools: makeElement(null, true), portfolio: makeElement(null) };
const pills = [makeElement('tools', true), makeElement('portfolio')];
const navItems = [makeElement('tools', true), makeElement('portfolio')];
let portfolioRenderCount = 0;
const navigationContext = {
  activeMainTab: 'tools', mainTabHistory: ['tools'],
  document: {
    getElementById: (id) => sections[id.replace('sec-', '')] || null,
    querySelectorAll: (selector) => selector === '.nav-pill' ? pills : selector === '.nav-item[data-tab]' ? navItems : selector === '.app-section' ? Object.values(sections) : []
  },
  window: { scrollTo() {} },
  refreshTechnicalAnalysis() {},
  renderPortfolioSummary() { portfolioRenderCount += 1; }
};
const switchMainTab = vm.runInNewContext(`(${extractFunction(html, 'switchMainTab')})`, navigationContext);
assert.equal(switchMainTab('portfolio', null), true, 'Portfolio navigation must resolve successfully');
assert.equal(sections.portfolio.classList.contains('active'), true, 'Portfolio section must become active');
assert.equal(sections.tools.classList.contains('active'), false, 'Previous section must become inactive');
assert.equal(pills[1].classList.contains('active'), true, 'Top portfolio navigation must become active');
assert.equal(navItems[1].classList.contains('active'), true, 'Bottom portfolio navigation must become active');
assert.equal(portfolioRenderCount, 1, 'Opening the portfolio must refresh its summary');

assert.ok(html.includes('viewport-fit=cover'), 'iPhone viewport must opt into safe-area handling');
assert.ok(!html.includes('user-scalable=no') && !html.includes('maximum-scale=1'), 'Pinch zoom must not be disabled');
assert.ok(html.includes('env(safe-area-inset-bottom)'), 'Bottom content and navigation must respect the iPhone safe area');
assert.ok(/\.nav-item\s*\{[^}]*min-height:\s*44px/s.test(html), 'Bottom navigation touch targets must be at least 44px high');
assert.ok(lensCss.includes('.smart-lens-close { min-height: 44px;'), 'The decision lens close action must be touch-safe');
assert.ok(html.includes('smart-decision-lens-static.css?v=3') && html.includes('smart-decision-lens-static.js?v=3'), 'Safari must receive cache-busted quote-quality assets');
assert.ok(html.includes('repeat(8,minmax(44px,1fr))'), 'Narrow iPhones must keep bottom navigation targets at least 44px wide');

assert.ok(html.includes('>تفاصيل القراءة</button>'), 'The stock action must describe the local quote-quality details');
assert.ok(!html.includes('onclick="openSmartDecisionSummary'), 'The stock action must not have a competing inline summary handler');
assert.ok(!html.includes('/api/live-terminal/smart-summary'), 'The unavailable smart-summary endpoint must not remain in the active page contract');
assert.ok(!html.includes('smartDecisionSummaryModal') && !html.includes('AI-ASSISTED RESEARCH'), 'The legacy AI summary surface must be removed, not merely hidden');
assert.ok(lens.includes('قراءة تفسيرية محلية من البيانات الظاهرة'), 'The quality lens must disclose that it is local and explainable');
assert.ok(lens.includes('لا تستخدم نموذج ذكاء اصطناعي'), 'The lens must not imply that a model generated its content');
assert.ok(!lens.includes('event.stopImmediatePropagation()'), 'The lens must not suppress unrelated click handlers');
assert.ok(!/\b(fetch|XMLHttpRequest)\s*\(/.test(lens), 'The local decision lens must stay network-free');
assert.ok(lens.includes('source: null') && lens.includes("safe(item?.source, 'غير متاح')"), 'An unknown source must not receive evidence credit through a synthetic fallback');
const numericPrice = vm.runInNewContext(`(${extractFunction(lens, 'numericPrice')})`);
assert.equal(numericPrice(null), null, 'The quality lens must not turn a null quote into $0.00');
assert.equal(numericPrice(''), null, 'The quality lens must reject an empty quote');
assert.equal(numericPrice('$6.76'), 6.76, 'The quality lens DOM fallback may parse an explicitly displayed price');

const safetySurface = `${html}\n${lens}`;
assert.ok(!/executionAllowed\s*=\s*true|automaticTrading\s*=\s*true|brokerSubmission\s*=\s*true/i.test(safetySurface), 'Batch 1 must not enable execution or broker submission');

console.log('Batch 1 stability checks passed: working portfolio summary, unified navigation, honest local lens, and iPhone safe-area safeguards.');
