import fs from 'node:fs';
import { buildTechnicalSnapshot, TECHNICALS_MIN_BARS } from './technical-analysis.js';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('./live-server.js', import.meta.url), 'utf8');
const makeBar = (index) => ({
  date: new Date(Date.UTC(2025, 0, index + 1)),
  open: 100 + index,
  high: 102 + index,
  low: 99 + index,
  close: 101 + index,
  volume: 1_000_000 + (index * 1000)
});

const insufficient = buildTechnicalSnapshot({
  symbol: 'TEST',
  history: Array.from({ length: TECHNICALS_MIN_BARS - 1 }, (_, index) => makeBar(index)),
  observedAt: '2025-02-10T00:00:00.000Z'
});
ensure(insufficient.availability === 'unavailable' && insufficient.reason === 'INSUFFICIENT_HISTORY', 'يجب عدم إنشاء مؤشرات عند نقص السجل التاريخي');

const sufficient = buildTechnicalSnapshot({
  symbol: 'TEST',
  history: Array.from({ length: TECHNICALS_MIN_BARS + 6 }, (_, index) => makeBar(index)),
  observedAt: '2025-03-01T00:00:00.000Z'
});
ensure(sufficient.availability === 'available' && Number.isFinite(sufficient.indicators?.sma20), 'يجب حساب المؤشرات من سجل كافٍ فقط');
ensure(sufficient.safety.executionAllowed === false && sufficient.safety.automaticTrading === false, 'يجب أن تبقى حدود التنفيذ مقفلة');

const researchIndex = html.indexOf('data-tab="research"');
const technicalsIndex = html.indexOf('data-tab="technicals"');
const commandIndex = html.indexOf('data-tab="command"');
const technicalsStart = html.indexOf('<div id="sec-technicals"');
const technicalsEnd = html.indexOf('<div id="sec-command"');
const technicalsSection = html.slice(technicalsStart, technicalsEnd);

ensure(researchIndex >= 0 && technicalsIndex > researchIndex && commandIndex > technicalsIndex, 'تبويب التحليل الفني يجب أن يقع بعد مركز الأبحاث وقبل قمة القرار');
ensure(technicalsStart >= 0 && technicalsEnd > technicalsStart, 'قسم التحليل الفني غير موجود في الصفحة الحالية');
ensure(technicalsSection.includes('تحليل فني وسياق البيانات'), 'عنوان التحليل الفني غير موجود');
ensure(technicalsSection.includes('غير متاح'), 'يجب أن تظهر حالة غير متاح عند نقص السجل');
ensure(html.includes("const TECHNICALS_API = '/api/technicals';"), 'يجب أن تستخدم الواجهة مسار المؤشرات المحكوم');
ensure(/if \(tab === 'technicals'\).*document\.getElementById\('sec-technicals'\)\.classList\.add\('active'\)/.test(html), 'التبويب الداخلي للتحليل الفني غير مربوط');
ensure(html.includes("if (type === 'technicals') switchMainTab('technicals'"), 'التنقل السفلي للتحليل الفني غير مربوط');
ensure(server.includes("app.get('/api/technicals/:symbol'"), 'مسار المؤشرات الخادمي غير موجود');
ensure(!/placeOrder|brokerSubmission|\/api\/order|submitOrder/.test(`${technicalsSection}\n${server}`), 'لا ينبغي أن تضيف لوحة التحليل أي مسار أو دالة تنفيذ');

console.log('Technical analysis checks passed.');
