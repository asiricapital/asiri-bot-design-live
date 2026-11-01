// Read-only execution readiness panel. paperOnly=true · executionAllowed=false · no activation or broker request exists here.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = 'https://asiri-bot.onrender.com/api/execution-readiness';
  const SAXO_API = 'https://asiri-bot.onrender.com/api/broker/saxo/account-readiness';
  const CONFIG_API = 'https://asiri-bot.onrender.com/api/config';
  const EVIDENCE_BASE = 'https://asiri-bot.onrender.com';
  const labels = { environment: 'بيئة الإنتاج', brokerIdentity: 'هوية الوسيط والحساب', brokerConnectivity: 'اتصال قراءة فقط', durableAudit: 'سجل تدقيق دائم', killSwitch: 'مفتاح الإيقاف', humanConsent: 'موافقة بشرية لكل أمر', riskLimits: 'حدود المخاطر', marketData: 'بيانات سوق حديثة', orderPolicy: 'Limit فقط بلا إعادة محاولة' };
  const blockerLabels = {
    'broker-account-identified': 'لم تُثبت هوية حساب Saxo المرتبط بهذه الجلسة بعد.',
    'broker-read-only-connectivity-verified': 'لم تنجح قراءة Saxo الشخصية الحديثة بعد.',
    'kill-switch-armed-and-tested': 'مفتاح الإيقاف غير مسلح أو غير مختبر.',
    'risk-limits-configured': 'حدود المخاطرة اليومية ولكل أمر غير معتمدة.',
    'fresh-authoritative-market-data': 'لا توجد بيانات سوق مرجعية حديثة معتمدة للتنفيذ.',
    'activation-requires-separate-governed-approval': 'فتح التنفيذ يحتاج مراجعة أمنية وموافقة محكومة منفصلة.'
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const row = (label, ok, yes = 'مكتمل', no = 'غير مكتمل') => `<div class="execution-readiness-gate" data-state="${ok ? 'ready' : 'blocked'}"><span>${esc(label)}</span><b>${esc(ok ? yes : no)}</b></div>`;
  let authClientPromise;
  async function getSessionToken() {
    if (!window.supabase?.createClient) return null;
    if (!authClientPromise) authClientPromise = fetch(CONFIG_API, { cache: 'no-store', headers: { accept: 'application/json' } }).then(r => r.ok ? r.json() : null).then(config => config?.supabase?.enabled && config.supabase.url && config.supabase.publishableKey ? window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null);
    const client = await authClientPromise;
    if (!client) return null;
    return (await client.auth.getSession()).data?.session?.access_token || null;
  }
  async function loadSaxoReadiness() {
    try {
      const token = await getSessionToken();
      if (!token) return { state: 'AUTH_REQUIRED', accountReadVerified: false, message: 'سجّل الدخول بحسابك المعتاد ثم أعد فحص حساب Saxo.' };
      const response = await fetch(SAXO_API, { cache: 'no-store', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) return { state: response.status === 401 ? 'AUTH_REQUIRED' : 'READ_FAILED', accountReadVerified: false, message: response.status === 401 ? 'انتهت جلسة المنصة؛ أعد تسجيل الدخول ثم أعد الفحص.' : 'تعذر قراءة حالة Saxo الشخصية الآن.' };
      return data;
    } catch { return { state: 'READ_FAILED', accountReadVerified: false, message: 'تعذر الوصول إلى فحص Saxo الشخصي؛ لم نعتبر الحساب جاهزًا.' }; }
  }
  function saxoSummary(data) {
    if (data?.accountReadVerified === true) return `<div class="execution-readiness-saxo" data-state="verified"><strong>حساب Saxo: مثبت للقراءة فقط</strong><span>البيئة: ${esc(String(data.environment || 'غير محدد').toUpperCase())} · حسابات نشطة: ${esc(data.activeAccountsCount ?? data.accountsCount ?? 0)}</span><small>تمت قراءة جديدة من Saxo. هذا لا يفتح التنفيذ ولا يرسل أمرًا.</small></div>`;
    return `<div class="execution-readiness-saxo" data-state="blocked"><strong>حساب Saxo: ${esc(data?.state === 'AUTH_REQUIRED' ? 'يتطلب تسجيل الدخول' : 'لم تثبت القراءة بعد')}</strong><span>${esc(data?.message || 'افتح جلسة Saxo المرتبطة ثم أعد فحص الحساب.')}</span><small>بقيت بوابة التنفيذ مقفولة بأمان.</small></div>`;
  }
  async function load() {
    const gates = $('execution-readiness-gates'); if (!gates) return;
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const [response, saxo] = await Promise.all([fetch(API, { signal: controller.signal, cache: 'no-store', headers: { accept: 'application/json' } }), loadSaxoReadiness()]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json(); const ev = data.strategyEvidence; const server = data.serverLiveGates || {};
      const contractOpen = data.ready === true && data.executionAllowed === true && data.brokerSubmission === true && data.automaticTrading === false;
      const serverOpen = server.serverGatesOpenForLiveOrders === true && contractOpen; const conflict = server.serverGatesOpenForLiveOrders === true && !contractOpen;
      const rows = [];
      if (ev) rows.push(row('استراتيجية نجحت في الاختبار العادل ثم التداول الورقي', ev.passed === true && ev.paperTradingPassed === true, 'نجحت', `لم تنجح بعد (${ev.approachesPassed ?? 0} من ${ev.approachesTested ?? 0})`));
      rows.push(row('هوية حساب Saxo المرتبط', saxo.accountReadVerified === true, 'مثبتة للقراءة', saxo.state === 'AUTH_REQUIRED' ? 'تسجيل الدخول مطلوب' : 'لم تثبت القراءة الجديدة'));
      rows.push(row('اتصال Saxo الشخصي', saxo.accountReadVerified === true, 'قراءة حديثة ناجحة', 'غير مثبت'));
      rows.push(...Object.entries(data.gates || {}).filter(([key]) => !['brokerIdentity', 'brokerConnectivity'].includes(key)).map(([key, value]) => row(labels[key] || key, value === true)));
      rows.push(row('عقد التنفيذ الفعلي', contractOpen, 'مغلق بأمان قبل التفعيل', 'غير جاهز — التنفيذ مقفول'));
      const blockers = [...new Set([...(data.blockers || []), ...(saxo.accountReadVerified === true ? [] : ['broker-account-identified', 'broker-read-only-connectivity-verified'])])];
      gates.innerHTML = saxoSummary(saxo) + rows.join('') + `<div class="execution-readiness-blockers"><strong>ما يمنع التفعيل الآن</strong><ul>${blockers.map(item => `<li>${esc(blockerLabels[item] || item)}</li>`).join('')}</ul></div>`;
      const lock = $('execution-lock-toggle'); if (lock) { lock.checked = true; lock.disabled = true; const text = lock.parentElement?.querySelector('span'); if (text) text.textContent = 'التداول الحقيقي مقفول — لا يوجد تفعيل من هذه اللوحة'; }
      const state = $('execution-readiness-state'); if (state) state.textContent = serverOpen ? 'جاهز للمراجعة فقط' : conflict ? 'مقفول — تعارض تمت معالجته' : 'غير جاهز للتداول الحقيقي';
      $('execution-readiness-card')?.setAttribute('data-server-open', 'false'); $('execution-readiness-card')?.setAttribute('data-readiness', serverOpen ? 'review-only' : 'blocked');
      const report = ev?.reportUrl ? ` <a href="${EVIDENCE_BASE}${esc(ev.reportUrl)}" target="_blank" rel="noopener">مختبر الأدلة ↗</a>` : '';
      const next = saxo.accountReadVerified === true ? 'تم إثبات قراءة حساب Saxo؛ راجع بقية بوابات المخاطر والموافقة المستقلة.' : (data.nextReview || 'سجّل الدخول وافحص حساب Saxo المرتبط، ثم استكمل حدود المخاطر واختبار Paper/Shadow.');
      $('execution-readiness-note').innerHTML = `<strong>${serverOpen ? 'جاهز للمراجعة فقط' : 'غير جاهز للتداول الحقيقي'}:</strong> ${esc(next)}${report}<br><small>الأوامر الحقيقية غير مفعلة. لا يوجد إرسال أو تفعيل مباشر من هذه اللوحة.</small>`;
    } catch (error) { gates.innerHTML = `<div class="paper-lab-empty">تعذر قراءة بوابات الأمان: ${esc(error.message)}</div>`; $('execution-readiness-state').textContent = 'غير متاح — مقفول احتياطيًا'; $('execution-readiness-card')?.setAttribute('data-server-open', 'false'); }
    finally { window.clearTimeout(timeout); }
  }
  function init() { $('execution-review-button')?.addEventListener('click', () => document.querySelector('#execution-readiness-gates')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); load(); }
  document.readyState === 'loading' ? window.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
