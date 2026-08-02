(() => {
  'use strict';
  if (window.__asiriRealtimeV700) return;
  window.__asiriRealtimeV700 = true;

  const state = {
    client: null,
    session: null,
    source: null,
    quotes: new Map(),
    status: 'IDLE',
    lastError: null,
    ageTimer: null
  };

  const q = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const fmt = (value, digits = 2) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—';

  function diagnosticsHost() {
    return q('#brokergateway') || q('#portfoliocenter') || q('#settings');
  }

  function ensureUi() {
    const host = diagnosticsHost();
    if (!host) return;

    let panel = q('#rt700Panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'rt700Panel';
      panel.className = 'rt700-panel rt700-diagnostic-panel';
      panel.innerHTML = `
        <div class="rt700-head">
          <div>
            <span class="eyebrow">SAXO CONNECTION DIAGNOSTICS · READ ONLY</span>
            <h3>تشخيص اتصال Saxo</h3>
            <p id="rt700StatusText">الفحص اختياري ولا يؤثر على أسعار لوحة القيادة.</p>
          </div>
          <div class="rt700-actions">
            <span id="rt700State" class="rt700-state idle">IDLE</span>
            <button id="rt700Start" type="button">بدء التشخيص</button>
            <button id="rt700Stop" type="button" class="ghost">إيقاف</button>
          </div>
        </div>
        <div class="rt700-meta">
          <span>الوضع <b>قراءة فقط</b></span>
          <span>البيئة <b id="rt700Environment">—</b></span>
          <span>آخر نبضة <b id="rt700Heartbeat">—</b></span>
          <span>آخر رسالة <b id="rt700LastMessage">—</b></span>
        </div>
        <div id="rt700Quotes" class="rt700-grid">
          ${['AMPL', 'CRDL'].map((symbol) => cardHtml({ symbol, status: 'WAITING' })).join('')}
        </div>
        <p class="rt700-note">هذه أداة تشخيص لصلاحيات Saxo فقط. الأسعار الأساسية في لوحة القيادة تأتي من محرك Asiri Market، ولا يتم إرسال أي أمر تداول.</p>`;
      q('#rt700Start', panel)?.addEventListener('click', () => start(true));
      q('#rt700Stop', panel)?.addEventListener('click', stop);
    }

    if (!host.contains(panel)) {
      const anchor = host.querySelector('.page-title') || host.firstElementChild;
      if (anchor) anchor.insertAdjacentElement('afterend', panel);
      else host.prepend(panel);
    }
  }

  function statusArabic(value) {
    return ({
      LIVE: 'LIVE مباشر', DELAYED: 'متأخر', NO_ACCESS: 'لا توجد صلاحية سعر', NO_MARKET: 'لا يوجد سوق الآن',
      NO_PRICE: 'لا يوجد سعر', UNKNOWN: 'غير مؤكد', WAITING: 'بانتظار البيانات'
    })[value] || value || '—';
  }

  function statusClass(quote) {
    const age = Date.now() - Number(quote?.receivedAtMs || 0);
    if (quote?.status === 'LIVE' && age <= 15000) return 'live';
    if (age > 15000 && quote?.receivedAtMs) return 'stale';
    if (quote?.status === 'DELAYED') return 'delayed';
    if (['NO_ACCESS', 'NO_MARKET', 'NO_PRICE'].includes(quote?.status)) return 'blocked';
    return 'waiting';
  }

  function cardHtml(quote) {
    const cls = statusClass(quote);
    const age = quote?.receivedAtMs ? Math.max(0, Date.now() - Number(quote.receivedAtMs)) : null;
    const spread = Number.isFinite(Number(quote?.ask)) && Number.isFinite(Number(quote?.bid))
      ? Number(quote.ask) - Number(quote.bid)
      : null;
    const change = Number(quote?.changePercent);
    return `<article class="rt700-card ${cls}" data-rt-symbol="${esc(quote.symbol)}">
      <div class="rt700-card-head"><div><strong>${esc(quote.symbol)}</strong><small>${esc(quote.description || quote.exchangeId || '')}</small></div><span class="rt700-badge ${cls}">${esc(age !== null && age > 15000 ? 'STALE' : statusArabic(quote.status))}</span></div>
      <div class="rt700-price">$${fmt(quote.price)}</div>
      <div class="rt700-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${fmt(change)}%` : '—'}</div>
      <div class="rt700-quote-grid">
        <span>Bid<b>$${fmt(quote.bid)}</b></span><span>Ask<b>$${fmt(quote.ask)}</b></span>
        <span>Spread<b>${spread === null ? '—' : '$' + fmt(spread, 3)}</b></span><span>التأخير<b>${quote.delayedByMinutes == null ? '—' : fmt(quote.delayedByMinutes, 0) + ' د'}</b></span>
        <span>نوع السعر<b>${esc(quote.priceTypeBid || quote.priceTypeAsk || '—')}</b></span><span>عمر النبضة<b data-rt-age>${age === null ? '—' : (age / 1000).toFixed(1) + 'ث'}</b></span>
      </div>
      <div class="rt700-source"><span>${esc(quote.source || 'بانتظار Saxo')}</span><time>${quote.updatedAt ? new Date(quote.updatedAt).toLocaleTimeString('ar-SA') : '—'}</time></div>
    </article>`;
  }

  function renderQuotes() {
    const container = q('#rt700Quotes');
    if (!container) return;
    const symbols = ['AMPL', 'CRDL'];
    container.innerHTML = symbols.map((symbol) => cardHtml(state.quotes.get(symbol) || { symbol, status: 'WAITING' })).join('');
  }

  function updateAges() {
    q('#rt700Quotes')?.querySelectorAll('[data-rt-symbol]').forEach((card) => {
      const quote = state.quotes.get(card.dataset.rtSymbol);
      if (!quote?.receivedAtMs) return;
      const age = Date.now() - Number(quote.receivedAtMs);
      const ageNode = card.querySelector('[data-rt-age]');
      if (ageNode) ageNode.textContent = `${(age / 1000).toFixed(1)}ث`;
      const cls = statusClass(quote);
      card.classList.remove('live', 'stale', 'delayed', 'blocked', 'waiting');
      card.classList.add(cls);
      const badge = card.querySelector('.rt700-badge');
      if (badge) {
        badge.className = `rt700-badge ${cls}`;
        badge.textContent = age > 15000 ? 'STALE' : statusArabic(quote.status);
      }
    });
  }

  function setStatus(status, text, mode = '') {
    state.status = status;
    const badge = q('#rt700State');
    if (badge) { badge.textContent = status; badge.className = `rt700-state ${mode || status.toLowerCase()}`; }
    const label = q('#rt700StatusText');
    if (label) label.textContent = text || status;
  }

  async function getAuth() {
    if (!window.supabase?.createClient) throw new Error('مكتبة Supabase غير محملة.');
    const configResponse = await fetch('/api/config?rt=7000', { cache: 'no-store' });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.supabase?.enabled) throw new Error(config.error || 'Supabase غير مفعّل.');
    if (!state.client) {
      state.client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    let session = (await state.client.auth.getSession()).data.session;
    if (!session) {
      for (let i = 0; i < 15 && !session; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        session = (await state.client.auth.getSession()).data.session;
      }
    }
    if (!session?.access_token) throw new Error('سجل الدخول إلى حسابك الثابت أولًا.');
    state.session = session;
    return session;
  }

  function connectEvents(ticket) {
    state.source?.close();
    const source = new EventSource(`/api/realtime/events?ticket=${encodeURIComponent(ticket)}`);
    state.source = source;
    source.addEventListener('snapshot', (event) => {
      const data = JSON.parse(event.data);
      updateSessionStatus(data);
      for (const quote of data.quotes || []) state.quotes.set(quote.symbol, quote);
      renderQuotes();
    });
    source.addEventListener('quote', (event) => {
      const quote = JSON.parse(event.data);
      state.quotes.set(quote.symbol, quote);
      renderQuotes();
      window.dispatchEvent(new CustomEvent('asiri:saxo-live-tick', { detail: quote }));
    });
    source.addEventListener('status', (event) => updateSessionStatus(JSON.parse(event.data)));
    source.addEventListener('heartbeat', (event) => {
      const data = JSON.parse(event.data);
      const node = q('#rt700Heartbeat');
      if (node) node.textContent = data.at ? new Date(data.at).toLocaleTimeString('ar-SA') : 'الآن';
    });
    source.addEventListener('warning', (event) => {
      const data = JSON.parse(event.data);
      state.lastError = data.message || 'تحذير غير معروف';
      const label = q('#rt700StatusText');
      if (label) label.textContent = state.lastError;
    });
    source.onerror = () => {
      if (state.status === 'STOPPED') return;
      setStatus('RECONNECTING', 'انقطع مسار التشخيص؛ جارٍ إعادة فتحه…', 'reconnecting');
    };
  }

  function updateSessionStatus(data) {
    const environment = q('#rt700Environment');
    const heartbeat = q('#rt700Heartbeat');
    const message = q('#rt700LastMessage');
    if (environment) environment.textContent = data.environment || '—';
    if (heartbeat) heartbeat.textContent = data.lastHeartbeatAt ? new Date(data.lastHeartbeatAt).toLocaleTimeString('ar-SA') : '—';
    if (message) message.textContent = data.lastMessageAt ? new Date(data.lastMessageAt).toLocaleTimeString('ar-SA') : '—';
    const mode = data.state === 'STREAMING' ? 'live' : data.state?.includes('ERROR') || data.state === 'REAUTH_REQUIRED' ? 'blocked' : 'waiting';
    const text = data.state === 'STREAMING'
      ? 'اتصال Saxo يعمل. صلاحية كل سعر موضحة داخل البطاقة.'
      : data.error || `حالة التشخيص: ${data.state || '—'}`;
    setStatus(data.state || 'UNKNOWN', text, mode);
  }

  async function start(manual = false) {
    ensureUi();
    const button = q('#rt700Start');
    if (button) button.disabled = true;
    setStatus('STARTING', manual ? 'جارٍ تشغيل تشخيص Saxo…' : 'جارٍ تشغيل التشخيص…', 'waiting');
    try {
      const session = await getAuth();
      const response = await fetch('/api/realtime/start', {
        method: 'POST',
        headers: { authorization: `Bearer ${session.access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ symbols: ['AMPL', 'CRDL'] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `تعذر تشغيل التشخيص (${response.status})`);
      updateSessionStatus(data);
      for (const quote of data.quotes || []) state.quotes.set(quote.symbol, quote);
      renderQuotes();
      connectEvents(data.ticket);
    } catch (error) {
      state.lastError = error.message;
      setStatus('ERROR', error.message, 'blocked');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function stop() {
    try {
      const session = await getAuth();
      await fetch('/api/realtime/stop', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } });
    } catch {}
    state.source?.close();
    state.source = null;
    setStatus('STOPPED', 'تم إيقاف تشخيص Saxo.', 'idle');
  }

  function boot() {
    ensureUi();
    if (!state.ageTimer) state.ageTimer = setInterval(updateAges, 1000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
