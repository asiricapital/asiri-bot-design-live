// Read-only execution readiness panel. No activation or broker request exists here.
(() => {
  const API = 'https://asiri-bot.onrender.com/api/execution-readiness';
  const EVIDENCE_BASE = 'https://asiri-bot.onrender.com';
  const $ = (id) => document.getElementById(id);
  const labels = { environment:'بيئة الإنتاج', brokerIdentity:'هوية الوسيط والحساب', brokerConnectivity:'اتصال قراءة فقط', durableAudit:'سجل تدقيق دائم', killSwitch:'مفتاح الإيقاف', humanConsent:'موافقة بشرية لكل أمر', riskLimits:'حدود المخاطر', marketData:'بيانات سوق حديثة', orderPolicy:'Limit فقط بلا إعادة محاولة' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function load() {
    const gates = $('execution-readiness-gates');
    try {
      const response = await fetch(API, { cache: 'no-store' });
      const data = await response.json();
      // Real server gates, strategy evidence first; open server locks are stated plainly.
      const stateText = { killSwitch: ['مفعّل', 'معطّل'], environment: ['LIVE', 'تجريبي'] };
      const row = (label, ok, yes, no) => `<div class="execution-readiness-gate" data-state="${ok ? 'ready' : 'blocked'}"><span>${esc(label)}</span><b>${esc(ok ? yes : no)}</b></div>`;
      const ev = data.strategyEvidence;
      const evidenceRow = ev ? row('استراتيجية نجحت في الاختبار العادل ثم التداول الورقي', ev.passed === true && ev.paperTradingPassed === true, 'نجحت', `لم تنجح بعد (${ev.approachesPassed ?? 0} من ${ev.approachesTested ?? 0})`) : '';
      gates.innerHTML = evidenceRow + Object.entries(data.gates || {}).map(([key, value]) => row(labels[key] || key, value === true, ...(stateText[key] || ['مكتمل', 'غير مكتمل']))).join('');
      const serverOpen = data.serverLiveGates?.serverGatesOpenForLiveOrders === true;
      const lock = $('execution-lock-toggle');
      if (lock) { lock.checked = !serverOpen; const text = lock.parentElement?.querySelector('span'); if (text) text.textContent = serverOpen ? 'أقفال الخادم مفتوحة' : 'التداول الحقيقي مقفول'; }
      $('execution-readiness-state').textContent = serverOpen ? 'أقفال الخادم مفتوحة' : data.state === 'LOCKED' ? 'مقفول عمدًا' : 'غير متاح';
      $('execution-readiness-card')?.setAttribute('data-server-open', String(serverOpen));
      const report = ev?.reportUrl ? ` <a href="${EVIDENCE_BASE}${esc(ev.reportUrl)}" target="_blank" rel="noopener">مختبر الأدلة ↗</a>` : '';
      $('execution-readiness-note').innerHTML = (serverOpen
        ? 'أقفال الخادم مفتوحة: الأوامر الحقيقية على Saxo ممكنة، وكل أمر يحتاج موافقتك. لا توجد استراتيجية مثبتة بعد، فالتداول على مسؤوليتك.'
        : `الحالة: ${esc(data.state)} · executionAllowed=${esc(data.executionAllowed)} · automaticTrading=${esc(data.automaticTrading)} · brokerSubmission=${esc(data.brokerSubmission)}.`) + ' لا يوجد تفعيل مباشر من هذه اللوحة.' + report;
    } catch (error) {
      gates.innerHTML = `<div class="paper-lab-empty">تعذر قراءة بوابات الأمان: ${esc(error.message)}</div>`;
    }
  }
  window.addEventListener('DOMContentLoaded', () => { $('execution-review-button')?.addEventListener('click', () => document.querySelector('#execution-readiness-gates')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); load(); });
})();
