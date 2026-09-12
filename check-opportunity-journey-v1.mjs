import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class TokenList {
  constructor() { this.tokens = new Set(); }
  toggle(token, force) {
    if (force) this.tokens.add(token);
    else this.tokens.delete(token);
  }
  contains(token) { return this.tokens.has(token); }
}

function element(id = '') {
  return {
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    dataset: {},
    hidden: false,
    classList: new TokenList(),
    setAttribute(name, value) { this[name] = value; },
    querySelector() { return null; },
    insertAdjacentHTML() {}
  };
}

async function verifyRuntime(js) {
  const ids = Object.fromEntries([
    'opportunity-day-card', 'opt-symbol', 'opt-price', 'opt-reason',
    'opt-momentum', 'opt-liquidity', 'opt-current-stage', 'opt-data-truth',
    'opt-quote-state', 'opt-source', 'opt-observed-at', 'opt-technical-state',
    'opt-data-note', 'opt-decision-room', 'opt-decision-status',
    'opt-decision-mode', 'opt-decision-evidence-count', 'opt-decision-next',
    'opt-decision-signals', 'opt-decision-blockers', 'telegram-alert-preview'
  ].map((id) => [id, element(id)]));

  const journeyBox = element();
  journeyBox.dataset.version = '2';
  ids['opportunity-day-card'].querySelector = (selector) => (
    selector === '.opportunity-journey-box' ? journeyBox : null
  );

  const nodes = ['observe', 'quote', 'technical', 'risk', 'review'].map((step) => {
    const node = element();
    node.dataset.step = step;
    node.state = element();
    node.querySelector = (selector) => selector === '.node-state' ? node.state : null;
    return node;
  });

  let fetchedUrl = '';
  const document = {
    readyState: 'complete',
    hidden: false,
    getElementById: (id) => ids[id] || null,
    querySelectorAll: (selector) => selector === '#opt-journey-path .journey-node' ? nodes : [],
    addEventListener() {}
  };
  const window = {
    asiriQuoteDataHealth: { classifyQuote: () => ({ state: 'FRESH' }) },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 2,
    clearInterval() {},
    addEventListener() {}
  };
  const context = {
    window,
    document,
    stockMarketData: {
      SNAP: {
        symbol: 'SNAP',
        price: 5.68,
        isFresh: true,
        source: 'Verified Provider',
        observedAt: '2026-09-12T15:00:00Z',
        volume: 1320000,
        averageVolume: 1000000
      }
    },
    fetch: async (url) => {
      fetchedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
        ok: true,
          availability: 'available',
          source: 'Verified Provider',
          candles: 252,
          historyStatus: 'CURRENT',
          indicators: {
            rsi14: 57.4,
            historicalVolumeRatio: 1.32,
            trendLabel: 'صاعد'
          }
        })
      };
    },
    AbortController,
    console,
    Date,
    Intl,
    Number,
    Object,
    String,
    Map,
    Boolean,
    encodeURIComponent
  };

  vm.runInNewContext(js, context);
  await window.asiriOpportunity.refresh();

  if (!fetchedUrl.startsWith('https://asiri-bot.onrender.com/api/live-terminal/technicals/SNAP')) {
    throw new Error(`Unexpected technical endpoint: ${fetchedUrl}`);
  }
  if (ids['opt-symbol'].textContent !== 'SNAP') throw new Error('Symbol did not render.');
  if (ids['opt-price'].textContent !== '$5.68') throw new Error('Verified price did not render.');
  if (ids['opt-momentum'].textContent !== '57') throw new Error('RSI did not render.');
  if (ids['opt-liquidity'].textContent !== '1.32×') throw new Error('Volume ratio did not render.');
  if (ids['opt-quote-state'].textContent !== 'حديثة الآن') throw new Error('Quote truth state did not render.');
  if (!ids['opt-technical-state'].textContent.includes('252 شمعة')) throw new Error('Technical history state did not render.');
  if (!ids['opt-reason'].textContent.includes('لا يوجد أمر تنفيذ')) throw new Error('Human-review safety copy is missing.');
  if (ids['opt-decision-status'].textContent !== 'جاهز لفحص المخاطر') throw new Error('Decision room did not select the safe next gate.');
  if (ids['opt-decision-mode'].textContent !== 'فحص المخاطر') throw new Error('Decision room mode is inaccurate.');
  if (ids['opt-decision-evidence-count'].textContent !== '4 إشارات فعلية') throw new Error('Decision evidence count is inaccurate.');
  if (!ids['opt-decision-signals'].innerHTML.includes('الاتجاه التاريخي: صاعد')) throw new Error('Decision evidence omits the verified trend.');
  if (!ids['opt-decision-blockers'].innerHTML.includes('المراجعة البشرية مطلوبة')) throw new Error('Decision blockers omit human review.');
  if (!nodes[3].classList.contains('active')) throw new Error('Risk gate should be the active step.');
  if (!nodes[4].classList.contains('blocked')) throw new Error('Human review must remain blocked.');
  if (ids['opt-current-stage'].textContent !== 'التالي: فحص المخاطر') throw new Error('Current stage is inaccurate.');
  if (!ids['telegram-alert-preview'].hidden) throw new Error('Telegram preview must stay hidden before risk completion.');

  window.asiriQuoteDataHealth.classifyQuote = () => ({ state: 'DELAYED' });
  await window.asiriOpportunity.refresh();
  if (ids['opt-decision-status'].textContent !== 'مراقبة فقط') throw new Error('Delayed quotes must remain watch-only.');
  if (!ids['opt-decision-blockers'].innerHTML.includes('السعر ليس لحظيًا')) throw new Error('Delayed-quote blocker is missing.');
}

async function verify() {
  const js = await readFile(new URL('./opportunity-journey.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('./opportunity-journey.css', import.meta.url), 'utf8');

  // Parse the browser bundle without executing it in Node.
  new Function(js);

  const requiredJs = [
    'https://asiri-bot.onrender.com/api/live-terminal/technicals',
    "payload?.availability === 'available'",
    'id="opt-data-truth"',
    'id="opt-current-stage"',
    'id="opt-decision-room"',
    'ASIRI DECISION ROOM',
    'لماذا؟ وما الذي ينقص؟',
    'لا شراء، لا بيع، ولا تنفيذ آلي',
    'buildDecisionBrief',
    "data-step=\"quote\"",
    "data-step=\"technical\"",
    "data-step=\"risk\"",
    "data-step=\"review\"",
    'قيد التحقق',
    'لا يوجد أمر تنفيذ',
    'window.asiriOpportunity'
  ];

  const requiredCss = [
    '.opportunity-data-truth',
    "content: 'REVIEW CANDIDATE'",
    '.truth-status.fresh',
    '.journey-stage-pill',
    '.journey-node.active',
    '.opportunity-decision-room',
    '.decision-room-summary',
    '.decision-room-details',
    '.decision-status.watch',
    'env(safe-area-inset-bottom, 0px)',
    'scroll-snap-type: x proximity'
  ];

  for (const token of requiredJs) {
    if (!js.includes(token)) throw new Error(`Missing journey v2 logic: ${token}`);
  }
  for (const token of requiredCss) {
    if (!css.includes(token)) throw new Error(`Missing journey v2 style: ${token}`);
  }

  const forbiddenClaims = ['فرصة حقيقية مكتملة', 'جاهز للمراجعة البشرية\\n', 'TOP OPPORTUNITY', 'توصية شراء', 'توصية بيع'];
  for (const token of forbiddenClaims) {
    if (js.includes(token)) throw new Error(`Unsafe completion claim remains: ${token}`);
  }

  await verifyRuntime(js);
  console.log('Opportunity Journey v3 contract passed: decision room, evidence trace, safety gates and mobile layout verified.');
}

verify().catch((error) => {
  console.error(error);
  process.exit(1);
});
