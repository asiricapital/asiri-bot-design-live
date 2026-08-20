import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

const toolsIndex = html.indexOf('data-tab="tools"');
const journeyIndex = html.indexOf('data-tab="journey"');
const commandIndex = html.indexOf('data-tab="command"');
const journeySectionStart = html.indexOf('<div id="sec-journey"');
const journeySectionEnd = html.indexOf('<div id="sec-command"');
const journeySection = html.slice(journeySectionStart, journeySectionEnd);

ensure(toolsIndex >= 0 && journeyIndex > toolsIndex && commandIndex > journeyIndex, 'مسار العميل يجب أن يكون ثاني عنصر في شريط الأولويات');
ensure(journeySectionStart >= 0 && journeySectionEnd > journeySectionStart, 'قسم مسار العميل غير موجود قبل قمة القرار');
ensure(journeySection.includes('ابدأ بالخدمة الأقرب لخطوتك التالية'), 'عنوان مسار العميل غير موجود');
ensure(journeySection.includes('openJourneyDestination'), 'بطاقات المسار يجب أن تربط بوجهة داخلية');
ensure(!journeySection.includes('fetch(') && !journeySection.includes('VERIFIED_QUOTES_API'), 'مسار العميل يجب ألا يستدعي بيانات سوق أو وسيط');
ensure(html.includes("if (tab === 'journey') document.getElementById('sec-journey').classList.add('active');"), 'التبويب الداخلي لمسار العميل غير مربوط');
ensure(html.includes("if (type === 'journey') switchMainTab('journey'"), 'التنقل السفلي لمسار العميل غير مربوط');
ensure(html.includes("const VERIFIED_QUOTES_API = 'https://asiri-bot.onrender.com/api/unified-market/quotes';"), 'مصدر الأسعار الموثقة يجب أن يبقى دون تغيير');

console.log('Customer journey live-terminal checks passed.');
