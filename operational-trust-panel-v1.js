/* ASIRI OPERATIONAL TRUST PANEL V1 — GET-only observability bridge */
(() => {
  'use strict';
  const API_BASE = 'https://asiri-bot.onrender.com';
  const ENDPOINTS = Object.freeze({
    service: '/api/system/health',
    stream: '/api/market-stream/status',
    notifications: '/api/notifications/status',
    execution: '/api/execution-readiness'
  });
  let requestInFlight = false;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const fmtTime = (value) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'غير متاح';
  };
  const fmtAge = (ms) => {
    const age = Number(ms);
    if (!Number.isFinite(age) || age < 0) return 'عمر المصدر غير متاح';
    const minutes = Math.round(age / 60000);
    if (minutes < 1) return 'أقل من دقيقة';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    return `منذ ${hours} ساعة${hours === 1 ? '' : 'ات'}`;
  };
  const jsonGet = async (path) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_BASE}${path}`, { signal: controller.signal, cache: 'no-store', method: 'GET' });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return await response.json();
    } finally { window.clearTimeout(timeout); }
  };
  const card = (id, state, title, status, evidence) => {
    const node = $(`trust-card-${id}`);
    if (!node) return;
    node.dataset.state = state;
    const statusNode = node.querySelector('[data-trust-status]');
    const evidenceNode = node.querySelector('[data-trust-evidence]');
    if (statusNode) statusNode.textContent = status;
    if (evidenceNode) evidenceNode.textContent = evidence;
  };
  const errorCard = (id, title) => card(id, 'unknown', title, 'تعذر التحقق', 'تعذرت قراءة حالة هذه الخدمة من الصفحة؛ هذا لا يثبت توقفها ولا يمنحها حالة سليمة.');

  function render(data) {
    const service = data.service;
    if (service) {
      const check = Array.isArray(service.checks) ? service.checks.find((item) => item.name === 'market_data') : null;
      card('service', service.ok === true ? 'ok' : 'bad', 'الخدمة تعمل', service.ok === true ? 'الخدمة متاحة' : 'الخدمة تحتاج مراجعة', `الإصدار ${service.version || 'غير معروف'} · فحص ${check?.status || 'غير متاح'}`);
    } else errorCard('service', 'الخدمة');

    const marketRows = window.asiriMarketView?.snapshots?.() || [];
    if (marketRows.length) {
      const fresh = marketRows.filter(item => window.asiriMarketView.health(item).state === 'FRESH').length;
      card('market', fresh ? 'ok' : 'warn', 'مصدر الأسعار', `${fresh}/${marketRows.length} قراءة حديثة`, 'نفس لقطة قائمة المتابعة؛ البقية متأخرة أو قديمة أو ناقصة. لا يعتمد هذا الفحص على البث الاختياري.');
    } else errorCard('market', 'مصدر الأسعار');

    const stream = data.stream;
    if (stream) {
      const disabled = stream.enabled === false || String(stream.state).toUpperCase() === 'DISABLED';
      card('stream', disabled ? 'warn' : 'ok', 'البث المباشر', disabled ? 'معطل حاليًا' : 'متصل', disabled ? 'المزود الاختياري غير مفعل؛ الاعتماد الحالي على HTTP.' : `${stream.provider || 'المزود'} · كل ${Math.round(Number(stream.cadenceMs || 0) / 1000)} ثوانٍ`);
    } else errorCard('stream', 'البث المباشر');

    const notifications = data.notifications;
    if (notifications) {
      const enabled = notifications.backgroundAlertsEnabled === true;
      const scan = Number(notifications.alertScanMs);
      card('notifications', enabled ? 'ok' : 'warn', 'التنبيهات', enabled ? 'مفعلة للمراجعة' : 'غير مفعلة', enabled && Number.isFinite(scan) ? `فحص كل ${Math.round(scan / 60000)} دقيقة · لا تنفيذ` : 'حالة العامل أو الفترة غير مكتملة');
    } else errorCard('notifications', 'التنبيهات');

    const execution = data.execution;
    if (execution) {
      const locked = execution.executionAllowed === false && execution.automaticTrading === false && execution.brokerSubmission === false;
      card('safety', locked ? 'ok' : 'bad', 'حماية التنفيذ', locked ? 'مقفول بأمان' : 'تحتاج مراجعة', locked ? 'قراءة فقط · Paper Only · لا إرسال للوسيط' : 'لم نعتبر حالة التنفيذ آمنة تلقائيًا');
    } else errorCard('safety', 'حماية التنفيذ');

    const refresh = $('operational-trust-updated');
    if (refresh) refresh.textContent = `آخر تحقق من العقود: ${fmtTime(new Date())}`;
    const sourceNode = $('operational-trust-source');
    if (sourceNode) sourceNode.textContent = `مصادر القراءة: ${API_BASE.replace('https://', '')} · GET فقط`;
  }

  async function refresh() {
    if (requestInFlight) return;
    requestInFlight = true;
    const button = $('operational-trust-refresh');
    if (button) { button.disabled = true; button.textContent = 'جاري التحقق…'; }
    try {
      const results = await Promise.allSettled(Object.entries(ENDPOINTS).map(async ([key, path]) => [key, await jsonGet(path)]));
      const data = {};
      results.forEach((result) => { if (result.status === 'fulfilled') data[result.value[0]] = result.value[1]; });
      render(data);
    } finally {
      requestInFlight = false;
      if (button) { button.disabled = false; button.textContent = 'تحديث الحالة'; }
    }
  }

  function init() {
    if (!$('operational-trust-panel')) return;
    $('operational-trust-refresh')?.addEventListener('click', refresh);
    refresh();
    window.setInterval(refresh, 30000);
    window.addEventListener('asiri:quotes-rendered', () => { const rows = window.asiriMarketView?.snapshots?.() || []; if (!rows.length) return; const fresh = rows.filter(item => window.asiriMarketView.health(item).state === 'FRESH').length; card('market', fresh ? 'ok' : 'warn', 'مصدر الأسعار', `${fresh}/${rows.length} قراءة حديثة`, 'من لقطة قائمة المتابعة الحالية؛ حداثة السعر منفصلة عن اتصال المصدر.'); });
  }
  window.asiriOperationalTrust = Object.freeze({ refresh, endpoints: ENDPOINTS });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
