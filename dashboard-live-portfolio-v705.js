(() => {
  'use strict';
  if (window.__asiriDashboardLivePortfolioV705) return;
  window.__asiriDashboardLivePortfolioV705 = true;

  const WATCH_KEY = 'asiri_stock_watchlist_v20';
  const LEGACY_KEY = 'asiri_binance_watchlist_v12';
  const BASE = ['AMPL', 'CRDL'];
  const MAX_DASHBOARD = 8;
  const POLL_MS = 10000;

  const state = {
    tickers: [],
    rows: new Map(),
    loading: false,
    nextAt: 0,
    timer: null,
    clock: null,
    client: null,
    imported: false
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const clean = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const number = (value, digits = 2) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';
  const percent = (value) => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? '+' : ''}${number(value, 2)}%`
    : '—';
  const time = (value) => value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleTimeString('ar-SA')
    : '—';
  const age = (value) => {
    if (!value) return '—';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    return seconds < 60 ? `${seconds}ث` : `${Math.floor(seconds / 60)}د`;
  };

  function dashboard() {
    return q('#dashboard');
  }

  function readLocalSymbols() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(WATCH_KEY) || localStorage.getItem(LEGACY_KEY) || '[]');
    } catch {}
    const list = Array.isArray(saved) ? saved.map(clean).filter(Boolean) : [];
    return [...new Set([...BASE, ...list])];
  }

  function readRenderedSymbols() {
    const selectors = [
      '#dashboardPositions .compact-row b:first-child',
      '#cards .symbol',
      '#miWatchTable tbody tr td:first-child b'
    ];
    const found = [];
    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((node) => {
        const symbol = clean(node.textContent);
        if (symbol) found.push(symbol);
      });
    }
    return found;
  }

  function mergeSymbols(symbols) {
    state.tickers = [...new Set([...state.tickers, ...symbols.map(clean).filter(Boolean)])].slice(0, 40);
    try { localStorage.setItem(WATCH_KEY, JSON.stringify(state.tickers)); } catch {}
  }

  function panelHtml() {
    return `
      <div class="lp705-head">
        <div>
          <span class="eyebrow">ASIRI LIVE PORTFOLIO · CONTINUOUS WATCH</span>
          <h3>المراقبة الحية للمحفظة</h3>
          <p>قراءة مستمرة لأسهم المحفظة وقائمة المتابعة عبر محرك Asiri Market.</p>
        </div>
        <div class="lp705-actions">
          <span id="lp705Status" class="lp705-status waiting">جارٍ التجهيز</span>
          <button id="lp705Refresh" type="button">تحديث الآن</button>
          <button id="lp705OpenWatch" type="button" class="secondary">إدارة قائمة المتابعة</button>
        </div>
      </div>
      <div class="lp705-meta">
        <span>المصدر <b>Asiri Market Engine</b></span>
        <span>الدورية <b>كل 10 ثوانٍ</b></span>
        <span>الوضع <b>قراءة فقط</b></span>
        <span>التحديث التالي <b id="lp705Countdown">—</b></span>
      </div>
      <div id="lp705Grid" class="lp705-grid"><p class="muted">جارٍ تحميل الأسهم…</p></div>
      <div class="lp705-foot">
        <span id="lp705SourceNote">السعر يوضح الجلسة والمصدر وعمر القراءة، ولا يتم تنفيذ أي صفقة.</span>
        <span id="lp705LastUpdate">آخر تحديث: —</span>
      </div>`;
  }

  function ensurePanel() {
    const root = dashboard();
    if (!root) return null;
    let panel = q('#lp705Panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'lp705Panel';
      panel.className = 'panel lp705-panel';
      panel.innerHTML = panelHtml();
      q('#lp705Refresh', panel)?.addEventListener('click', () => refresh(true));
      q('#lp705OpenWatch', panel)?.addEventListener('click', () => { window.location.href = '/binance-lab'; });
    }

    const executive = root.querySelector('[data-dashboard-role="executive-decision"], .dash702-executive-first');
    const command = root.querySelector('[data-dashboard-role="commandbar"], .dash702-commandbar, .page-title');
    const anchor = executive || command;
    if (anchor && anchor.nextElementSibling !== panel) anchor.after(panel);
    else if (!root.contains(panel)) root.prepend(panel);
    return panel;
  }

  function rowStatus(row) {
    if (!row) return { label: 'بانتظار القراءة', mode: 'waiting' };
    if (row.error || row.ok === false) return { label: 'تعذر السعر', mode: 'error' };
    if (row.isLiveSession && row.isFresh) return { label: 'جلسة نشطة', mode: 'live' };
    return { label: row.sessionLabel || 'سعر مرجعي', mode: 'reference' };
  }

  function cardHtml(symbol) {
    const row = state.rows.get(symbol);
    const status = rowStatus(row);
    const move = Number(row?.changePercent);
    const moveClass = move > 0 ? 'up' : move < 0 ? 'down' : 'flat';
    return `<article class="lp705-card ${status.mode}" data-lp-symbol="${esc(symbol)}">
      <div class="lp705-card-head">
        <div><strong>${esc(symbol)}</strong><small>${esc(row?.name || 'بانتظار قراءة السهم')}</small></div>
        <span class="lp705-badge ${status.mode}">${esc(status.label)}</span>
      </div>
      <div class="lp705-price-row">
        <div><div class="lp705-usd">${row?.price != null ? '$' + number(row.price, 2) : '—'}</div><div class="lp705-sar">${row?.sarPrice != null ? number(row.sarPrice, 2) + ' ر.س' : '—'}</div></div>
        <div class="lp705-move ${moveClass}">${percent(row?.changePercent)}</div>
      </div>
      <div class="lp705-details">
        <span>الجلسة<b>${esc(row?.sessionLabel || '—')}</b></span>
        <span>السوق<b>${esc(row?.exchange || '—')}</b></span>
        <span>وقت السعر<b>${time(row?.updatedAt)}</b></span>
        <span>عمر القراءة<b data-lp-age>${age(row?.updatedAt || row?.observedAt)}</b></span>
      </div>
      <div class="lp705-source"><span>${esc(row?.source || row?.error || 'Asiri Market Engine')}</span><time>${time(row?.observedAt)}</time></div>
    </article>`;
  }

  function render() {
    ensurePanel();
    const grid = q('#lp705Grid');
    if (!grid) return;
    const visible = state.tickers.slice(0, MAX_DASHBOARD);
    grid.innerHTML = visible.map(cardHtml).join('') || '<p class="muted">لا توجد أسهم في المحفظة أو قائمة المتابعة.</p>';
    const hidden = Math.max(0, state.tickers.length - visible.length);
    const note = q('#lp705SourceNote');
    if (note) note.textContent = hidden
      ? `يظهر أول ${visible.length} أسهم هنا، ويوجد ${hidden} أسهم إضافية في قائمة المتابعة الكاملة.`
      : 'السعر يوضح الجلسة والمصدر وعمر القراءة، ولا يتم تنفيذ أي صفقة.';
  }

  function setStatus(text, mode = 'waiting') {
    const node = q('#lp705Status');
    if (!node) return;
    node.textContent = text;
    node.className = `lp705-status ${mode}`;
  }

  async function importAsiri() {
    if (state.imported) return;
    state.imported = true;
    try {
      if (!window.supabase?.createClient) return;
      const configResponse = await fetch('/api/config?liveportfolio=705', { cache: 'no-store' });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.supabase?.enabled) return;
      if (!state.client) {
        state.client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      }
      const { data: { session } } = await state.client.auth.getSession();
      if (!session) return;
      const results = await Promise.allSettled([
        state.client.from('portfolio').select('symbol'),
        state.client.from('watchlist').select('symbol')
      ]);
      const imported = [];
      for (const result of results) {
        if (result.status !== 'fulfilled' || result.value.error) continue;
        for (const row of result.value.data || []) {
          const symbol = clean(row.symbol);
          if (symbol) imported.push(symbol);
        }
      }
      mergeSymbols(imported);
      render();
    } catch (error) {
      console.warn('live-portfolio-import', error?.message || error);
    }
  }

  async function refresh(force = false) {
    if (state.loading) return;
    ensurePanel();
    mergeSymbols(readRenderedSymbols());
    if (!state.tickers.length) mergeSymbols(BASE);
    state.loading = true;
    setStatus('جارٍ تحديث الأسعار', 'waiting');
    try {
      const response = await fetch(`/api/binance-lab/stock-quotes?symbols=${encodeURIComponent(state.tickers.join(','))}&t=${Date.now()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      for (const row of data.rows || []) state.rows.set(row.symbol, row);
      const success = (data.rows || []).filter((row) => row.ok).length;
      const failures = (data.rows || []).length - success;
      setStatus(`${success} سهم محدث${failures ? ` · ${failures} متعذر` : ''}`, success ? 'live' : 'error');
      state.nextAt = Date.now() + Number(data.pollingMs || POLL_MS);
      const updated = q('#lp705LastUpdate');
      if (updated) updated.textContent = `آخر تحديث: ${time(data.observedAt || new Date().toISOString())}`;
      render();
      window.dispatchEvent(new CustomEvent('asiri:portfolio-watch-updated', { detail: { success, failures, force } }));
    } catch (error) {
      setStatus('تعذر تحديث الأسعار', 'error');
      console.error('live-portfolio-refresh', error);
    } finally {
      state.loading = false;
    }
  }

  function updateClock() {
    const countdown = q('#lp705Countdown');
    if (countdown) {
      const left = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
      countdown.textContent = state.loading ? 'جارٍ التحديث…' : `${left}ث`;
    }
    q('#lp705Grid')?.querySelectorAll('[data-lp-symbol]').forEach((card) => {
      const row = state.rows.get(card.dataset.lpSymbol);
      const node = card.querySelector('[data-lp-age]');
      if (node) node.textContent = age(row?.updatedAt || row?.observedAt);
    });
  }

  function startPolling() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (Date.now() < state.nextAt) return;
      if (!dashboard()?.classList.contains('active')) return;
      refresh(false);
    }, 1000);
    if (!state.clock) state.clock = setInterval(updateClock, 1000);
  }

  async function boot() {
    state.tickers = readLocalSymbols();
    mergeSymbols(readRenderedSymbols());
    ensurePanel();
    render();
    await importAsiri();
    startPolling();
    refresh(false);
    setTimeout(() => { mergeSymbols(readRenderedSymbols()); render(); }, 1800);
    setTimeout(() => { mergeSymbols(readRenderedSymbols()); refresh(false); }, 5000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
