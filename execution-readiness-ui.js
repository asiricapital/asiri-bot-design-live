// Read-only execution readiness panel. No activation or broker request exists here.
(() => {
  const API = 'https://asiri-bot.onrender.com/api/execution-readiness';
  const $ = (id) => document.getElementById(id);
  const labels = { environment:'بيئة الإنتاج', brokerIdentity:'هوية الوسيط والحساب', brokerConnectivity:'اتصال قراءة فقط', durableAudit:'سجل تدقيق دائم', killSwitch:'مفتاح الإيقاف', humanConsent:'موافقة بشرية لكل أمر', riskLimits:'حدود المخاطر', marketData:'بيانات سوق حديثة', orderPolicy:'Limit فقط بلا إعادة محاولة' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load() {
    const gates = $('execution-readiness-gates');
    try {
      const response = await fetch(API, { cache: 'no-store' });
      const data = await response.json();
      const entries = Object.entries(data.gates || {});
      gates.innerHTML = entries.map(([key, value]) => `<div class="execution-readiness-gate" data-state="${value ? 'ready' : 'blocked'}"><span>${esc(labels[key] || key)}</span><b>${value ? 'مكتمل للتحضير' : 'بانتظار المراجعة'}</b></div>`).join('');
      $('execution-readiness-state').textContent = data.state === 'LOCKED' ? 'مقفول عمدًا' : 'غير متاح';
      $('execution-readiness-note').textContent = `الحالة: ${data.state} · executionAllowed=${data.executionAllowed} · automaticTrading=${data.automaticTrading} · brokerSubmission=${data.brokerSubmission}. لا يوجد تفعيل مباشر من هذه اللوحة.`;
    } catch (error) {
      gates.innerHTML = `<div class="paper-lab-empty">تعذر قراءة بوابات الأمان: ${esc(error.message)}</div>`;
    }
  }
  window.addEventListener('DOMContentLoaded', () => { $('execution-review-button')?.addEventListener('click', () => document.querySelector('#execution-readiness-gates')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); load(); });
})();
