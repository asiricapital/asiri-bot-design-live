/* ASIRI Saxo Live Watchlist UI bridge — read-only presentation only. */
(() => {
  'use strict';
  const API_BASE = 'https://asiri-bot.onrender.com';
  const POLL_MS = 30_000;
  const params = new URLSearchParams(location.search);
  const ticketFromUrl = params.get('saxo_ticket');
  if (ticketFromUrl) { try { sessionStorage.setItem('asiri_saxo_bridge_ticket', ticketFromUrl); } catch {} params.delete('saxo_ticket'); history.replaceState({}, document.title, `${location.pathname}?${params.toString()}${location.hash}`); }
  const bridgeTicket = (() => { try { return sessionStorage.getItem('asiri_saxo_bridge_ticket') || ''; } catch { return ''; } })();
  const state = { client: null, session: null, timer: null, busy: false, quotes: new Map(), lastSync: null, bridgeTicket };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const money = (value) => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';
  const time = (value) => { const d = new Date(value || ''); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'غير متاح'; };
  const statusLabel = (status) => ({ LIVE: 'Saxo LIVE', DELAYED: 'Saxo متأخر', STALE: 'Saxo قديم', UNAVAILABLE: 'Saxo غير متاح' }[String(status || '').toUpperCase()] || 'Saxo غير متاح');
  const statusClass = (status) => String(status || '').toLowerCase().replace(/[^a-z]/g, '') || 'unavailable';

  function ensurePanel() {
    if ($('saxo-watchlist-bridge-v1')) return;
    const wrapper = $('stocks-list-wrapper');
    if (!wrapper) return;
    const panel = document.createElement('section');
    panel.id = 'saxo-watchlist-bridge-v1';
    panel.className = 'saxo-watchlist-bridge';
    panel.innerHTML = `<div class="saxo-watchlist-bridge-head"><div><span class="eyebrow">SAXO LIVE WATCHLIST</span><h3>أسعار قائمة المراقبة من Saxo</h3><p id="saxo-watchlist-bridge-message">جارٍ تجهيز القراءة الآمنة…</p></div><button id="saxo-watchlist-refresh" type="button" class="secondary">تحديث الآن</button></div><div class="saxo-watchlist-bridge-meta"><span>المصدر: Saxo OpenAPI</span><span id="saxo-watchlist-sync">آخر مزامنة: —</span><b>قراءة فقط · لا تنفيذ</b></div>`;
    wrapper.parentNode.insertBefore(panel, wrapper);
    $('saxo-watchlist-refresh')?.addEventListener('click', () => refresh(true));
  }

  async function session() {
    if (state.client && state.session) return state.session;
    const config = await fetch(`${API_BASE}/api/config?saxo-watchlist-ui=1`, { cache: 'no-store' }).then((r) => r.json());
    if (!config?.supabase?.enabled || !window.supabase?.createClient) throw new Error('جلسة Supabase غير متاحة.');
    state.client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
    state.session = (await state.client.auth.getSession()).data.session;
    if (!state.session) {
      const signed = await state.client.auth.signInAnonymously();
      if (signed.error) throw signed.error;
      state.session = signed.data.session;
    }
    return state.session;
  }

  async function fetchQuotes() {
    const headers = { accept: 'application/json' };
    if (state.bridgeTicket) headers['X-ASIRI-SAXO-TICKET'] = state.bridgeTicket;
    else {
      const current = await session();
      state.session = (await state.client.auth.getSession()).data.session || current;
      headers.authorization = `Bearer ${state.session.access_token}`;
    }
    const symbols = [...document.querySelectorAll('#stocks-list-wrapper [data-symbol], #stocks-list-wrapper .stock-row[id^="row-"]')]
      .map((row) => String(row.dataset.symbol || row.id.replace(/^row-/, '')).trim().toUpperCase()).filter(Boolean);
    const query = symbols.length ? `?symbols=${encodeURIComponent([...new Set(symbols)].slice(0, 30).join(','))}` : '';
    const response = await fetch(`${API_BASE}/api/broker/saxo/watchlist/quotes${query}`, {
      cache: 'no-store',
      headers
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `تعذر جلب أسعار Saxo (${response.status})`);
    return payload;
  }

  function renderPanel(message, tone = '') {
    ensurePanel();
    const node = $('saxo-watchlist-bridge-message');
    if (node) { node.textContent = message; node.className = tone; }
    if ($('saxo-watchlist-sync') && state.lastSync) $('saxo-watchlist-sync').textContent = `آخر مزامنة: ${time(state.lastSync)}`;
  }

  function decorateRows() {
    document.querySelectorAll('#stocks-list-wrapper .stock-row[data-symbol], #stocks-list-wrapper .stock-row[id^="row-"]').forEach((row) => {
      const symbol = String(row.dataset.symbol || row.id.replace(/^row-/, '')).toUpperCase();
      const quote = state.quotes.get(symbol);
      const price = row.querySelector('.stock-col-price');
      const name = row.querySelector('.stock-col-name .name');
      const action = row.querySelector('.stock-col-action');
      if (!quote) return;
      const status = String(quote.status || 'UNAVAILABLE').toUpperCase();
      const usable = Number.isFinite(Number(quote.mid ?? quote.last ?? quote.bid ?? quote.ask)) && status !== 'UNAVAILABLE';
      const displayPrice = quote.mid ?? quote.last ?? quote.bid ?? quote.ask;
      if (price && usable) {
        price.textContent = money(displayPrice);
        price.classList.add('saxo-bound-price');
        price.dataset.saxoPrice = 'true';
      }
      if (name) name.textContent = `${statusLabel(status)} · ${quote.exchange || 'Saxo'}`;
      if (action) {
        let meta = action.querySelector('.saxo-watchlist-row-meta');
        if (!meta) { meta = document.createElement('span'); meta.className = 'saxo-watchlist-row-meta'; action.insertBefore(meta, action.firstChild); }
        meta.className = `saxo-watchlist-row-meta ${statusClass(status)}`;
        meta.innerHTML = `<b>${esc(statusLabel(status))}</b><small>Bid ${esc(money(quote.bid))} · Ask ${esc(money(quote.ask))}</small><small>${esc(time(quote.observedAt || quote.updatedAt))}</small>`;
      }
    });
  }

  async function refresh(force = false) {
    if (state.busy && !force) return;
    state.busy = true;
    ensurePanel();
    renderPanel('جارٍ جلب أسعار قائمة المراقبة من Saxo…');
    try {
      const payload = await fetchQuotes();
      state.quotes.clear();
      for (const row of (Array.isArray(payload.rows) ? payload.rows : [])) {
        const symbol = String(row.symbol || '').toUpperCase();
        const quote = row.quote && typeof row.quote === 'object' ? row.quote : {};
        if (symbol) state.quotes.set(symbol, { ...quote, symbol, exchange: row.instrument?.exchangeId || row.instrument?.description || 'Saxo' });
      }
      state.lastSync = payload.observedAt || new Date().toISOString();
      const live = [...state.quotes.values()].filter((q) => String(q.status).toUpperCase() === 'LIVE').length;
      const total = state.quotes.size;
      renderPanel(total ? `تم ربط ${total} رمزًا؛ ${live} قراءة LIVE من Saxo.` : 'لم تصل أسعار من Saxo؛ افتح اللوحة من Broker Gateway لإعادة الربط.', total ? 'good' : 'warn');
      decorateRows();
      window.dispatchEvent(new CustomEvent('asiri:saxo-watchlist-quotes', { detail: { readOnly: true, quotes: [...state.quotes.values()], observedAt: state.lastSync, provider: payload.provider || 'Saxo OpenAPI' } }));
    } catch (error) {
      renderPanel(`تعذر جلب Saxo: ${error.message} · لم يتم تغيير البيانات السابقة.`, 'bad');
    } finally {
      state.busy = false;
    }
  }

  function init() {
    ensurePanel();
    const observer = new MutationObserver(() => decorateRows());
    const wrapper = $('stocks-list-wrapper');
    if (wrapper) observer.observe(wrapper, { childList: true, subtree: true });
    refresh();
    state.timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(true); });
    window.addEventListener('pagehide', () => { if (state.timer) window.clearInterval(state.timer); observer.disconnect(); }, { once: true });
  }

  window.asiriSaxoWatchlistUI = Object.freeze({ refresh: () => refresh(true), readOnly: true, endpoint: `${API_BASE}/api/broker/saxo/watchlist/quotes` });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
