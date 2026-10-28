// Read-only execution readiness panel. paperOnly=true · executionAllowed=false · no activation or broker request exists here.
(() => {
  'use strict';
  const API = 'https://asiri-bot.onrender.com/api/execution-readiness';
  const EVIDENCE_BASE = 'https://asiri-bot.onrender.com';
  const labels = {
    environment: 'بيئة الإنتاج', brokerIdentity: 'هوية الوسيط والحساب', brokerConnectivity: 'اتصال قراءة فقط',
    durableAudit: 'سجل تدقيق دائم', killSwitch: 'مفتاح الإيقاف', humanConsent: 'موافقة بشرية لكل أمر',
    riskLimits: 'حدود المخاطر', marketData: 'بيانات سوق حديثة', orderPolicy: 'Limit فقط بلا إعادة محاولة'
  };
  const blockerLabels = {
    'broker-account-identified': 'لم تُثبت هوية حساب Saxo المرتبط.',
    'broker-read-only-connectivity-verified': 'لم يُثبت اتصال Saxo للقراءة فقط.',
    'kill-switch-armed-and-tested': 'مفتاح الإيقاف غير مسلح أو غير مختبر.',
    'risk-limits-configured': 'حدود المخاطرة اليومية ولكل أمر غير معتمدة.',
    'fresh-authoritative-market-data': 'لا توجد بيانات سوق مرجعية حديثة معتمدة للتنفيذ.',
    'activation-requires-separate-governed-approval': 'فتح التنفيذ يحتاج مراجعة أمنية وموافقة محكومة منفصلة.'
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const row = (label, ok, yes = 'مكتمل', no = 'غير مكتمل') => `<div class="execution-readiness-gate" data-state="${ok ? 'ready' : 'blocked'}"><span>${esc(label)}</span><b>${esc(ok ? yes : no)}</b></div>`;
  async function load() {
    const gates = $('execution-readiness-gates');
    try {
      const response = await fetch(API, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const ev = data.strategyEvidence;
      const server = data.serverLiveGates || {};
      // Readiness is never inferred from configuration flags. It requires the server contract,
      // every gate, and the explicit readiness result to agree. Any disagreement stays blocked.
      const contractOpen = data.ready === true && data.executionAllowed === true && data.brokerSubmission === true && data.automaticTrading === false;
      const serverOpen = server.serverGatesOpenForLiveOrders === true && contractOpen;
      const conflict = server.serverGatesOpenForLiveOrders === true && !contractOpen;
      const rows = [];
      if (ev) rows.push(row('استراتيجية نجحت في الاختبار العادل ثم التداول الورقي', ev.passed === true && ev.paperTradingPassed === true, 'نجحت', `لم تنجح بعد (${ev.approachesPassed ?? 0} من ${ev.approachesTested ?? 0})`));
      rows.push(...Object.entries(data.gates || {}).map(([key, value]) => row(labels[key] || key, value === true)));
      rows.push(row('عقد التنفيذ الفعلي', contractOpen, 'مغلق بأمان قبل التفعيل', 'غير جاهز — التنفيذ مقفول'));
      gates.innerHTML = rows.join('') + `<div class="execution-readiness-blockers"><strong>ما يمنع التفعيل الآن</strong><ul>${(data.blockers || ['readiness-contract-not-open']).map((item) => `<li>${esc(blockerLabels[item] || item)}</li>`).join('')}</ul></div>`;
      const lock = $('execution-lock-toggle');
      if (lock) { lock.checked = true; lock.disabled = true; const text = lock.parentElement?.querySelector('span'); if (text) text.textContent = 'التداول الحقيقي مقفول — لا يوجد تفعيل من هذه اللوحة'; }
      const state = $('execution-readiness-state');
      if (state) state.textContent = serverOpen ? 'جاهز للمراجعة فقط' : conflict ? 'مقفول — تعارض تمت معالجته' : 'غير جاهز للتداول الحقيقي';
      $('execution-readiness-card')?.setAttribute('data-server-open', 'false');
      $('execution-readiness-card')?.setAttribute('data-readiness', serverOpen ? 'review-only' : 'blocked');
      const report = ev?.reportUrl ? ` <a href="${EVIDENCE_BASE}${esc(ev.reportUrl)}" target="_blank" rel="noopener">مختبر الأدلة ↗</a>` : '';
      const next = data.nextReview || 'استكمال ربط القراءة فقط، حدود المخاطر، واختبار Paper/Shadow قبل أي مراجعة مستقبلية.';
      $('execution-readiness-note').innerHTML = `<strong>${serverOpen ? 'جاهز للمراجعة فقط' : 'غير جاهز للتداول الحقيقي'}:</strong> ${esc(next)}${report}<br><small>الأوامر الحقيقية غير مفعلة. لا يوجد إرسال أو تفعيل مباشر من هذه اللوحة.</small>`;
    } catch (error) {
      gates.innerHTML = `<div class="paper-lab-empty">تعذر قراءة بوابات الأمان: ${esc(error.message)}</div>`;
      $('execution-readiness-state').textContent = 'غير متاح — مقفول احتياطيًا';
      $('execution-readiness-card')?.setAttribute('data-server-open', 'false');
    }
  }
  window.addEventListener('DOMContentLoaded', () => { $('execution-review-button')?.addEventListener('click', () => document.querySelector('#execution-readiness-gates')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); load(); });
})();
