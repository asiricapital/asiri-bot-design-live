(async function () {
  try {
    const config = await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json());
    if (!config.supabase?.enabled || !window.supabase || !window.AsiriStableAuthV680) return;
    const client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const mountCurrent = async () => {
      const { data } = await client.auth.getSession();
      if (data?.session) window.AsiriStableAuthV680.mount(client, data.session);
    };
    client.auth.onAuthStateChange((_event, session) => {
      if (session) window.AsiriStableAuthV680.mount(client, session);
    });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await mountCurrent();
      const { data } = await client.auth.getSession();
      if (data?.session) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.warn('stable-auth-init-v6.8.1', error.message);
  }
})();
