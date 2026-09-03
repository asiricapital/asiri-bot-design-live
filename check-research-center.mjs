import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const toolsIndex = html.indexOf('data-tab="tools"');
const journeyIndex = html.indexOf('data-tab="journey"');
const researchIndex = html.indexOf('data-tab="research"');
const commandIndex = html.indexOf('data-tab="command"');
const researchStart = html.indexOf('<div id="sec-research"');
const researchEnd = html.indexOf('<div id="sec-command"');
const researchSection = html.slice(researchStart, researchEnd);

ensure(toolsIndex >= 0 && journeyIndex > toolsIndex && researchIndex > journeyIndex && commandIndex > researchIndex, 'مركز الأبحاث يجب أن يأتي بعد مسار العميل وقبل قمة القرار');
ensure(researchStart >= 0 && researchEnd > researchStart, 'قسم مركز الأبحاث غير موجود في الصفحة الحالية');
ensure(researchSection.includes('مركز أبحاث ومراجعة موثّقة'), 'عنوان مركز الأبحاث غير موجود');
ensure(researchSection.includes('SEC EDGAR'), 'رابط المصدر التنظيمي الرسمي غير موجود');
ensure(researchSection.includes('NO BROKER LINK'), 'يجب أن يوضح المركز عدم وجود ربط وسيط');
ensure(!researchSection.includes('fetch(') && !researchSection.includes('VERIFIED_QUOTES_API'), 'المركز لا يجب أن يضيف مصدر أسعار أو وسيطاً جديداً');
ensure(html.includes('document.getElementById(`sec-${tab}`)') && html.includes('pill.dataset.tab === tab'), 'التبويب الداخلي الموحد لمركز الأبحاث غير مربوط');
ensure(html.includes("research: 'research'") && html.includes('data-tab="research"'), 'التنقل السفلي لمركز الأبحاث غير مربوط');
ensure(html.includes("const VERIFIED_QUOTES_API = 'https://asiri-bot.onrender.com/api/unified-market/quotes';"), 'مصدر الأسعار الموثقة يجب أن يبقى دون تغيير');
ensure(!researchSection.includes('brokerSubmission') && !researchSection.includes('placeOrder') && !researchSection.includes('/api/order'), 'لا ينبغي أن يضيف مركز الأبحاث أي مسار تنفيذ أو أمر وسيط');

console.log('Research center checks passed.');
