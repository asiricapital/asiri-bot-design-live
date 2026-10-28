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
  const providerName = (quote, fallback = 'Saxo') => {
    const provider = String(quote?.provider || quote?.providerName || fallback).toLowerCase();
    if (provider === 'finnhub') return 'Finnhub LIVE';
    if (provider === 'yahoo') return 'Yahoo موثق';
    if (provider === 'twelve') return 'Twelve Data';
    if (provider === 'alpha') return 'Alpha Vantage';
    return fallback;
  };
  const statusLabel = (status, quote) => {
    const source = providerName(quote);
    const live = /LIVE/.test(source) ? source : `${source} LIVE`; // e.g. "Saxo LIVE", consistent with "Finnhub LIVE"
    return ({ LIVE: live, DELAYED: `${source} متأخر`, STALE: `${source} قديم`, UNAVAILABLE: `${source} غير متاح` }[String(status || '').toUpperCase()] || `${source} غير متاح`);
  };
  const statusClass = (status) => String(status || '').toLowerCase().replace(/[^a-z]/g, '') || 'unavailable';
  const brokerGatewayUrl = `${API_BASE}/?saxo-return=${encodeURIComponent(location.href)}`;

  function ensurePanel() {
    if ($('saxo-watchlist-bridge-v1')) return;
    const wrapper = $('stocks-list-wrapper');
    if (!wrapper) return;
    const panel = document.createElement('section');
    panel.id = 'saxo-watchlist-bridge-v1';
    panel.className = 'saxo-watchlist-bridge';
    panel.innerHTML = `<div class="saxo-watchlist-bridge-head"><div><span class="eyebrow">MULTI-SOURCE LIVE WATCHLIST</span><h3>أسعار قائمة المراقبة الحية</h3><p id="saxo-watchlist-bridge-message">جارٍ تجهيز القراءة الآمنة…</p></div><button id="saxo-watchlist-refresh" type="button" class="secondary">تحديث الآن</button></div><a id="saxo-watchlist-reconnect" class="saxo-watchlist-reconnect" href="${brokerGatewayUrl}" target="_blank" rel="noopener" hidden>فتح بوابة Saxo وإعادة فتح اللوحة</a><div class="saxo-watchlist-bridge-meta"><span id="saxo-watchlist-source">المصدر: Saxo ثم Finnhub عند الحاجة</span><span id="saxo-watchlist-sync">آخر مزامنة: —</span><b>قراءة فقط · لا تنفيذ</b></div>`;
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
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        try { sessionStorage.removeItem('asiri_saxo_bridge_ticket'); } catch {}
        state.bridgeTicket = '';
        throw new Error('انتهت جلسة Saxo؛ أعد فتح اللوحة من بوابة Saxo.');
      }
      throw new Error(payload.error || `تعذر جلب أسعار Saxo (${response.status})`);
    }
    return payload;
  }

  function renderPanel(message, tone = '') {
    ensurePanel();
    const node = $('saxo-watchlist-bridge-message');
    if (node) { node.textContent = message; node.className = tone; }
    const reconnect = $('saxo-watchlist-reconnect');
    if (reconnect) reconnect.hidden = !(tone === 'bad' && (!state.bridgeTicket || message.includes('أعد فتح اللوحة')));
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
      // Write only when the value actually changes, so decorating never re-dirties the DOM it observes.
      if (price && usable) {
        const nextPrice = money(displayPrice);
        if (price.dataset.saxoValue !== nextPrice) { price.textContent = nextPrice; price.dataset.saxoValue = nextPrice; }
        price.classList.add('saxo-bound-price');
        price.dataset.saxoPrice = 'true';
      }
      const nextName = `${statusLabel(status, quote)} · ${quote.exchange || quote.source || 'قراءة موثقة'}`;
      if (name && name.dataset.saxoValue !== nextName) { name.textContent = nextName; name.dataset.saxoValue = nextName; }
      if (action) {
        let meta = action.querySelector('.saxo-watchlist-row-meta');
        if (!meta) { meta = document.createElement('span'); meta.className = 'saxo-watchlist-row-meta'; action.insertBefore(meta, action.firstChild); }
        meta.className = `saxo-watchlist-row-meta ${statusClass(status)}`;
        const nextMeta = `<b>${esc(statusLabel(status, quote))}</b><small>Bid ${esc(money(quote.bid))} · Ask ${esc(money(quote.ask))}</small><small>${esc(time(quote.observedAt || quote.updatedAt))}</small>`;
        if (meta.dataset.saxoValue !== nextMeta) { meta.innerHTML = nextMeta; meta.dataset.saxoValue = nextMeta; }
      }
    });
  }

  async function fetchUnifiedQuotes(symbols) {
    const query = symbols.length ? `?symbols=${encodeURIComponent([...new Set(symbols)].slice(0, 25).join(','))}&force=1` : '';
    const response = await fetch(`${API_BASE}/api/market-data${query}`, { cache: 'no-store', headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `تعذر جلب المصادر الموحدة (${response.status})`);
    const rows = (Array.isArray(payload.rows) ? payload.rows : []).map((quote) => ({
      ...quote,
      status: quote.isFresh === true ? 'LIVE' : quote.dataQuality === 'STALE_TRUSTED' ? 'STALE' : 'DELAYED',
      providerName: quote.provider,
      readOnly: true,
      paperOnly: true,
      executionAllowed: false,
      tradingEnabled: false
    }));
    return { rows, observedAt: payload.updatedAt || new Date().toISOString(), provider: 'Asiri Multi-Source' };
  }

  async function refresh(force = false) {
    if (state.busy && !force) return;
    state.busy = true;
    ensurePanel();
    renderPanel('جارٍ جلب سعر Saxo، ثم Finnhub/المصادر البديلة عند الحاجة…');
    try {
      const symbols = [...document.querySelectorAll('#stocks-list-wrapper [data-symbol], #stocks-list-wrapper .stock-row[id^="row-"]')]
        .map((row) => String(row.dataset.symbol || row.id.replace(/^row-/, '')).trim().toUpperCase()).filter(Boolean);
      let payload;
      let sourceMode = 'Saxo';
      try {
        payload = await fetchQuotes();
        const saxoRows = Array.isArray(payload.rows) ? payload.rows : [];
        const usableSaxo = saxoRows.some((row) => row?.quote && Number.isFinite(Number(row.quote.mid ?? row.quote.last ?? row.quote.bid ?? row.quote.ask)) && String(row.quote.status).toUpperCase() !== 'UNAVAILABLE');
        if (!usableSaxo) { payload = await fetchUnifiedQuotes(symbols); sourceMode = 'Finnhub/موحد'; }
      } catch (saxoError) {
        payload = await fetchUnifiedQuotes(symbols);
        sourceMode = 'Finnhub/موحد';
        payload.fallbackReason = saxoError.message;
      }
      state.quotes.clear();
      for (const row of (Array.isArray(payload.rows) ? payload.rows : [])) {
        const symbol = String(row.symbol || '').toUpperCase();
        const quote = row.quote && typeof row.quote === 'object' ? row.quote : {};
        if (symbol) state.quotes.set(symbol, { ...quote, ...(!row.quote ? row : {}), symbol, exchange: row.instrument?.exchangeId || row.instrument?.description || row.exchange || providerName(row, sourceMode) });
      }
      state.lastSync = payload.observedAt || new Date().toISOString();
      const live = [...state.quotes.values()].filter((q) => String(q.status).toUpperCase() === 'LIVE').length;
      const total = state.quotes.size;
      const sources = [...new Set([...state.quotes.values()].map((q) => providerName(q, sourceMode)))].join('، ');
      $('saxo-watchlist-source')?.replaceChildren(document.createTextNode(`المصدر الحالي: ${sources || sourceMode}`));
      renderPanel(total ? `تم ربط ${total} رمزًا؛ ${live} قراءة LIVE من ${sources || sourceMode}.` : 'لم تصل قراءة صالحة من Saxo أو Finnhub أو المصادر البديلة.', total ? 'good' : 'warn');
      decorateRows();
      window.dispatchEvent(new CustomEvent('asiri:saxo-watchlist-quotes', { detail: { readOnly: true, paperOnly: true, executionAllowed: false, tradingEnabled: false, quotes: [...state.quotes.values()], observedAt: state.lastSync, provider: payload.provider || sourceMode } }));
    } catch (error) {
      renderPanel(`تعذر جلب Saxo وFinnhub: ${error.message} · لم يتم تغيير البيانات السابقة.`, 'bad');
    } finally {
      state.busy = false;
    }
  }

  function init() {
    ensurePanel();
    // decorateRows() mutates the table it observes; pause observation while it runs,
    // otherwise each pass queues another callback and the page locks up once quotes arrive.
    const wrapper = $('stocks-list-wrapper');
    const observeOptions = { childList: true, subtree: true };
    const observer = new MutationObserver(() => {
      observer.disconnect();
      try { decorateRows(); } finally { if (wrapper) observer.observe(wrapper, observeOptions); }
    });
    if (wrapper) observer.observe(wrapper, observeOptions);
    refresh();
    state.timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(true); });
    window.addEventListener('pagehide', () => { if (state.timer) window.clearInterval(state.timer); observer.disconnect(); }, { once: true });
  }

  window.asiriSaxoWatchlistUI = Object.freeze({ refresh: () => refresh(true), readOnly: true, endpoint: `${API_BASE}/api/broker/saxo/watchlist/quotes` });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
