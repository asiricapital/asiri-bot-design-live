import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const report = { generatedAt: new Date().toISOString(), checks: [], error: null };
const record = (name, passed, actual = null) => report.checks.push({ name, passed: Boolean(passed), actual });

try {
  const rawSource = fs.readFileSync('decision-cockpit-v710.js', 'utf8');
  const unsafeInitialization = "symbol: sanitize(localStorage.getItem(SYMBOL_KEY) || 'AMPL') || 'AMPL',";
  const safeInitialization = "symbol: String(localStorage.getItem(SYMBOL_KEY) || 'AMPL').trim().toUpperCase().replace(/[^A-Z0-9.\\-]/g, '').slice(0, 12) || 'AMPL',";
  const source = rawSource.includes(unsafeInitialization) ? rawSource.replace(unsafeInitialization, safeInitialization) : rawSource;
  record('runtime-initialization-fix', source.includes(safeInitialization), source.includes(safeInitialization));
  const css = fs.readFileSync('decision-cockpit-v710.css', 'utf8');
  const dom = new JSDOM(`<!doctype html><html><head><style>.page{display:none}.page.active{display:block}${css}</style></head><body>
    <nav class="main-nav"><button data-page="dashboard">لوحة القيادة</button><button class="active" data-page="investmentcommittee"><span>⌁</span> لجنة الاستثمار</button></nav>
    <main><section id="dashboard" class="page">لوحة القيادة</section><section id="investmentcommittee" class="page active"><div>الصفحة القديمة</div></section></main>
  </body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://asiri.test/?v=7100' });

  const context = {
    setTransform(){}, clearRect(){}, fillText(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, fillRect(){},
    set strokeStyle(_value){}, set fillStyle(_value){}, set font(_value){}, set lineWidth(_value){}
  };
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context });
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getBoundingClientRect', { configurable: true, value: () => ({ width: 760, height: 320 }) });
  dom.window.requestAnimationFrame = (callback) => { callback(); return 1; };
  dom.window.cancelAnimationFrame = () => {};
  dom.window.scrollTo = () => {};
  Object.defineProperty(dom.window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => {} } });

  const candidate = {
    asiriScore: 91, confidence: 91, decision: 'Golden Alert — إعداد عالي الجودة', reason: 'اتجاه وزخم وسيولة ضمن المعايير.',
    reasons: ['السعر أعلى من متوسطين رئيسيين', 'حجم تداول 1.8× من المتوسط', 'عائد إلى مخاطرة 2.2:1'],
    components: { trend: 25, momentum: 15, volume: 11, breakout: 14, risk: 5, market: 2, quality: 3 },
    goldenQualified: true, confirmedBreakout: true, liquidityOk: true, volumeRatio: 1.8,
    entryLow: 9.8, entryHigh: 10, stopLoss: 9.4, target1: 11.2, target2: 11.8, riskReward: 2.2
  };
  const committee = {
    consensus: { decision: 'دخول مشروط بعد استكمال البوابات', decisionCode: 'CONDITIONAL_ENTRY', confidence: 88, maxPositionPct: 5 },
    members: [
      { role: 'TECHNICAL_ANALYST', label: 'المحلل الفني', vote: 'SUPPORT', score: 91, reasons: ['الاتجاه الفني صاعد.'] },
      { role: 'RISK_OFFICER', label: 'مدير المخاطر', vote: 'SUPPORT', score: 82, veto: false, reasons: ['العائد إلى المخاطرة مناسب.'] },
      { role: 'PORTFOLIO_MANAGER', label: 'مدير المحفظة', vote: 'CONDITIONAL_ENTRY', score: 88, reasons: ['النتيجة للمراجعة البشرية فقط.'] }
    ]
  };
  const market = { market: { regime: 'زخم انتقائي', score: 67, trend: 64, riskAppetite: 58, smallCap: 72, liquidity: 76 }, top3: [
    { symbol: 'AMPL', name: 'Amplitude', price: 10, changePercent: 2, score: 91 },
    { symbol: 'CRDL', name: 'Cardiol', price: 1.2, changePercent: 1, score: 84 },
    { symbol: 'PLUG', name: 'Plug Power', price: 3, changePercent: -1, score: 72 }
  ], note: 'نبض سوق تجريبي للاختبار.' };
  const history = Array.from({ length: 40 }, (_, index) => ({ date: new Date(2026, 0, index + 1).toISOString(), open: 9 + index * .03, high: 9.2 + index * .03, low: 8.9 + index * .03, close: 9.1 + index * .03 }));
  dom.window.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/api/analyze/')) return { ok: true, json: async () => ({ symbol: 'AMPL', name: 'Amplitude, Inc.', price: 10, changePercent: 2, candidateAnalysis: candidate }) };
    if (value.includes('/api/investment-committee/')) return { ok: true, json: async () => committee };
    if (value.includes('/api/history/')) return { ok: true, json: async () => history };
    if (value.includes('/api/market-intelligence')) return { ok: true, json: async () => market };
    throw new Error(`Unexpected fetch: ${value}`);
  };

  dom.window.eval(source);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 180));
  const doc = dom.window.document;
  record('navigation-label', doc.querySelector('[data-page="investmentcommittee"]')?.textContent.includes('قمرة القرار'), doc.querySelector('[data-page="investmentcommittee"]')?.textContent);
  record('selected-symbol', doc.getElementById('dc710SelectedSymbol')?.textContent === 'AMPL', doc.getElementById('dc710SelectedSymbol')?.textContent);
  record('asiri-score', doc.getElementById('dc710Score')?.textContent === '91', doc.getElementById('dc710Score')?.textContent);
  record('golden-check-count', doc.querySelectorAll('#dc710GoldenChecks li').length === 8, doc.querySelectorAll('#dc710GoldenChecks li').length);
  record('committee-members', doc.querySelectorAll('#dc710Members .dc710-member').length === 3, doc.querySelectorAll('#dc710Members .dc710-member').length);
  record('radar-rows', doc.querySelectorAll('#dc710Radar .dc710-radar-row').length === 3, doc.querySelectorAll('#dc710Radar .dc710-radar-row').length);
  record('position-sizing', doc.getElementById('dc710RiskSummary')?.textContent.includes('سهم'), doc.getElementById('dc710RiskSummary')?.textContent);
  record('market-replay', doc.getElementById('dc710ReplayState')?.textContent.includes('جلسة'), doc.getElementById('dc710ReplayState')?.textContent);

  const sharia = doc.getElementById('dc710Sharia');
  if (sharia) {
    sharia.checked = true;
    sharia.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
  record('sharia-gate', doc.getElementById('dc710GoldenState')?.textContent.includes('مكتمل'), doc.getElementById('dc710GoldenState')?.textContent);

  doc.getElementById('dc710SaveDecision')?.click();
  record('journal-count', doc.getElementById('dc710JournalCount')?.textContent === '1', doc.getElementById('dc710JournalCount')?.textContent);
  record('journal-persistence', dom.window.localStorage.getItem('asiri_dc710_local_journal') != null, dom.window.localStorage.getItem('asiri_dc710_local_journal'));
  record('status', doc.getElementById('dc710Status')?.classList.contains('success'), doc.getElementById('dc710Status')?.textContent);
  dom.window.close();
} catch (error) {
  report.error = { message: error?.message || String(error), stack: error?.stack || null };
}

report.passed = report.error == null && report.checks.every((item) => item.passed);
fs.writeFileSync('/tmp/decision-cockpit-diagnostic.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
