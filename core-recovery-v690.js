// Asiri Capital v6.9.0 — lightweight connection and verified-feed recovery
(() => {
  'use strict';
  if (window.__asiriCoreRecoveryV690) return;
  window.__asiriCoreRecoveryV690 = true;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setConnection = (text, mode = 'up', detail = '') => {
    const node = document.getElementById('connection');
    if (!node) return;
    node.textContent = text;
    node.className = `pill ${mode}`;
    if (detail) node.title = detail;
  };

  async function resolveGuard() {
    for (let i = 0; i < 50; i += 1) {
      const guard = window.AsiriRuntimeGuardV690 || window.AsiriRuntimeGuardV689;
      if (guard?.client && guard?.session) return guard;
      await wait(200);
    }
    throw new Error('لم تكتمل جلسة Supabase');
  }

  async function refresh() {
    try {
      const guard = await resolveGuard();
      const { client } = guard;
      const sessionResult = await client.auth.getSession();
      const session = sessionResult.data?.session || guard.session;
      if (!session) throw new Error('الحساب بحاجة إلى إعادة تسجيل الدخول');

      const portfolioResult = await client
        .from('portfolio')
        .select('symbol')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: true });
      if (portfolioResult.error) throw portfolioResult.error;

      const symbols = [...new Set((portfolioResult.data || []).map((row) => String(row.symbol || '').trim().toUpperCase()).filter(Boolean))];
      const query = symbols.length ? `?symbols=${encodeURIComponent(symbols.join(','))}&_=${Date.now()}` : `?_=${Date.now()}`;
      const response = await fetch(`/api/broker/prices/diagnostics${query}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${session['access_token']}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `تعذر تحديث الأسعار (${response.status})`);

      window.dispatchEvent(new CustomEvent('asiri:verified-prices', { detail: data }));
      window.__asiriRecoveredVerifiedDataV690 = data;
      setConnection(`Supabase متصل · ${symbols.length} مركز`, 'up', 'Recovery Core v6.9.0');
      return data;
    } catch (error) {
      console.error('asiri-core-recovery-v690', error);
      setConnection(`تعذر الاستعادة: ${error.message}`, 'down');
      throw error;
    }
  }

  function start() {
    refresh().catch(() => {});
    window.addEventListener('asiri:guard-auth-ready', () => refresh().catch(() => {}));
    window.addEventListener('asiri:refresh-verified-prices', () => refresh().catch(() => {}));
    setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();