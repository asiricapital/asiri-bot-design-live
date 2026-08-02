// Asiri Capital v6.9.0 — independent runtime and Supabase handshake guard
(() => {
  'use strict';
  if (window.__asiriRuntimeGuardV690) return;
  window.__asiriRuntimeGuardV690 = true;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} تجاوز ${Math.round(ms / 1000)} ثوانٍ`)), ms))
  ]);

  function connectionNode() {
    return document.getElementById('connection');
  }

  function setConnection(text, mode = 'down', detail = '') {
    const node = connectionNode();
    if (!node) return;
    node.textContent = text;
    node.className = `pill ${mode}`;
    if (detail) node.title = detail;
  }

  function errorText(value) {
    if (!value) return 'تعذر تحديد تفاصيل الخطأ';
    return String(value.message || value.reason?.message || value.reason || value)
      .replace(/^Uncaught\s*/i, '')
      .slice(0, 180);
  }

  function resourceUrl(target) {
    return String(target?.src || target?.href || target?.currentSrc || '').trim();
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window) {
      const url = resourceUrl(target);
      const type = String(target.tagName || 'RESOURCE').toUpperCase();
      console.warn('asiri-resource-error-v690', { type, url });
      window.__asiriResourceErrorsV690 = window.__asiriResourceErrorsV690 || [];
      window.__asiriResourceErrorsV690.push({ type, url, at: new Date().toISOString() });
      const node = connectionNode();
      if (node && node.classList.contains('up')) node.title = `تعذر مورد ثانوي: ${url || type}`;
      return;
    }

    const message = errorText(event.error || event.message);
    console.error('asiri-runtime-error-v690', event.error || event.message);
    window.__asiriRuntimeErrorV690 = {
      message,
      filename: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0
    };
    const node = connectionNode();
    if (!node?.classList.contains('up')) {
      setConnection(`خطأ تشغيل: ${message}`, 'down', `${event.filename || ''}:${event.lineno || ''}:${event.colno || ''}`);
    } else {
      node.title = `الحساب متصل مع تحذير تشغيل: ${message}`;
    }
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    const message = errorText(event.reason || event);
    console.error('asiri-runtime-rejection-v690', event.reason);
    window.__asiriRuntimeErrorV690 = { message, promise: true };
    const node = connectionNode();
    if (!node?.classList.contains('up')) setConnection(`خطأ تشغيل: ${message}`, 'down');
    else node.title = `الحساب متصل مع تحذير: ${message}`;
  });

  async function independentHandshake() {
    await wait(700);
    const node = connectionNode();
    if (!node) return;
    if (node.classList.contains('up') && /متصل/.test(node.textContent || '')) return;

    try {
      setConnection('جارٍ توثيق Supabase…', '');
      const response = await withTimeout(fetch('/api/config?runtime=6900', { cache: 'no-store' }), 10000, 'تحميل إعدادات الاتصال');
      const config = await response.json();
      if (!response.ok) throw new Error(config.error || `تعذر تحميل الإعدادات (${response.status})`);
      if (!config.supabase?.enabled) throw new Error('إعدادات Supabase غير مكتملة في Render');
      if (!window.supabase?.createClient) throw new Error('مكتبة Supabase لم تُحمّل');

      const client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const result = await withTimeout(client.auth.getSession(), 10000, 'قراءة جلسة الحساب');
      if (result.error) throw result.error;
      if (!result.data?.session) throw new Error('لا توجد جلسة مستخدم محفوظة');

      window.AsiriRuntimeGuardV689 = { client, session: result.data.session, config };
      window.AsiriRuntimeGuardV690 = window.AsiriRuntimeGuardV689;
      setConnection('Supabase متصل · جارٍ استعادة المحرك', 'up');
      window.dispatchEvent(new CustomEvent('asiri:guard-auth-ready', {
        detail: { userId: result.data.session.user.id }
      }));
    } catch (error) {
      setConnection(`تعذر الاتصال: ${errorText(error)}`, 'down');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', independentHandshake, { once: true });
  } else {
    independentHandshake();
  }
})();