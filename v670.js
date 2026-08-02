const p670Q = (selector) => document.querySelector(selector);
const p670All = (selector) => [...document.querySelectorAll(selector)];
const p670Esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const p670Num = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 4) }) : '—';
const p670Money = (value, currency = 'USD') => Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(Number(value)) : '—';

const p670State = {
  supabase: null,
  session: null,
  timer: null,
  busy: false,
  rows: [],
  intervalMs: 15000
};

async function p670Session() {
  if (p670State.supabase && p670State.session) return p670State.session;
  const config = await fetch('/api/config', { cache: 'no-store' }).then((response) => response.json());
  if (!config.supabase?.enabled) throw new Error('Supabase غير متصل');
  p670State.supabase = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  p670State.session = (await p670State.supabase.auth.getSession()).data.session;
  if (!p670State.session) {
    const signed = await p670State.supabase.auth.signInAnonymously();
    if (signed.error) throw signed.error;
    p670State.session = signed.data.session;
  }
  return p670State.session;
}

async function p670Api(path) {
  const session = await p670Session();
  p670State.session = (await p670State.supabase.auth.getSession()).data.session || session;
  const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}_=${Date.now()}`, {
    cache: 'no-store',
    headers: { authorization: `Bearer ${p670State.session.access_token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `تعذر طلب الأسعار (${response.status})`);
  return data;
}

function p670EnsurePanel() {
  const page = p670Q('#portfoliocenter');
  if (!page || p670Q('#priceDiagnostics670')) return;
  const panel = document.createElement('section');
  panel.id = 'priceDiagnostics670';
  panel.className = 'panel price-diagnostics670';
  panel.innerHTML = `
    <div class="section-head price-diagnostics670-head">
      <div>
        <span class="eyebrow">ASIRI VERIFIED PRICE ENGINE · v6.7.0</span>
        <h3>مختبر الأسعار المعتمدة</h3>
        <p class="muted">لا تظهر LIVE إلا بعد إثبات سعر Saxo الفعلي وحقوق البيانات. جميع المسارات قراءة فقط.</p>
      </div>
      <button id="priceDiagnostics670Run" type="button">فحص الأسعار الآن</button>
    </div>
    <div class="price-diagnostics670-summary">
      <div><span>حالة المحرك</span><b id="priceDiagnostics670State">بانتظار الفحص</b><small id="priceDiagnostics670Message">—</small></div>
      <div><span>أسعار Saxo LIVE</span><b id="priceDiagnostics670Live">0</b><small>DelayedByMinutes = 0</small></div>
      <div><span>أسعار متأخرة/مرجعية</span><b id="priceDiagnostics670Other">0</b><small>موضحة دون تضليل</small></div>
      <div><span>آخر فحص</span><b id="priceDiagnostics670Updated">—</b><small>تحديث كل 15 ثانية</small></div>
    </div>
    <div id="priceDiagnostics670Rows" class="price-diagnostics670-rows"><p class="muted">اضغط فحص الأسعار الآن.</p></div>
    <div id="priceDiagnostics670Status" class="status">المحرك متوقف حتى بدء أول فحص.</div>`;
  const title = page.querySelector('.page-title');
  if (title) title.insertAdjacentElement('afterend', panel); else page.prepend(panel);
  p670Q('#priceDiagnostics670Run')?.addEventListener('click', () => p670Load(true));
}

function p670StatusLabel(status) {
  return ({
    'saxo-live': 'SAXO LIVE',
    'saxo-delayed': 'SAXO DELAYED',
    'saxo-reference': 'SAXO REFERENCE',
    'yahoo-fallback': 'YAHOO FALLBACK',
    unavailable: 'UNAVAILABLE'
  })[status] || String(status || 'UNAVAILABLE').toUpperCase();
}

function p670StatusClass(status) {
  if (status === 'saxo-live') return 'live';
  if (status === 'saxo-delayed') return 'delayed';
  if (status === 'saxo-reference') return 'reference';
  if (status === 'yahoo-fallback') return 'fallback';
  return 'unavailable';
}

function p670ApplyToTables(rows) {
  const map = new Map(rows.filter((row) => Number.isFinite(Number(row.preferred?.price)) && Number(row.preferred.price) > 0).map((row) => [String(row.symbol || '').toUpperCase(), row]));
  for (const table of p670All('table')) {
    const headers = [...table.querySelectorAll('thead th')].map((cell) => String(cell.textContent || '').trim());
    const priceIndex = headers.findIndex((text) => text === 'السعر' || text.includes('السعر'));
    if (priceIndex < 0) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      const symbol = String(row.cells?.[0]?.textContent || '').trim().toUpperCase();
      const data = map.get(symbol);
      const cell = row.cells?.[priceIndex];
      if (!data || !cell) continue;
      const price = Number(data.preferred.price);
      const currency = data.preferred.currency || 'USD';
      cell.innerHTML = `<b>${p670Money(price, currency)}</b><small class="price-source670 ${p670StatusClass(data.preferred.status)}">${p670StatusLabel(data.preferred.status)}</small>`;
    }
  }

  for (const card of p670All('.card')) {
    const symbol = String(card.querySelector('.symbol')?.textContent || '').trim().toUpperCase();
    const data = map.get(symbol);
    const priceNode = card.querySelector('.price');
    if (!data || !priceNode) continue;
    priceNode.innerHTML = `${p670Money(data.preferred.price, data.preferred.currency || 'USD')}<small class="price-source670 ${p670StatusClass(data.preferred.status)}">${p670StatusLabel(data.preferred.status)}</small>`;
  }
}

function p670Render(data) {
  p670EnsurePanel();
  const rows = Array.isArray(data.rows) ? data.rows : [];
  p670State.rows = rows;
  const live = rows.filter((row) => row.preferred?.status === 'saxo-live').length;
  const other = rows.filter((row) => ['saxo-delayed', 'saxo-reference', 'yahoo-fallback'].includes(row.preferred?.status)).length;
  const valid = rows.filter((row) => Number.isFinite(Number(row.preferred?.price)) && Number(row.preferred.price) > 0).length;
  const engineState = !rows.length ? 'لا توجد أسهم' : live === rows.length ? 'LIVE موثّق' : valid ? 'يعمل بمصادر موضحة' : 'لا توجد أسعار صالحة';
  p670Q('#priceDiagnostics670State').textContent = engineState;
  p670Q('#priceDiagnostics670Message').textContent = `${valid} من ${rows.length} سهم لديه سعر معتمد`;
  p670Q('#priceDiagnostics670Live').textContent = String(live);
  p670Q('#priceDiagnostics670Other').textContent = String(other);
  p670Q('#priceDiagnostics670Updated').textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('ar-SA') : '—';

  const container = p670Q('#priceDiagnostics670Rows');
  container.innerHTML = rows.length ? rows.map((row) => {
    const preferred = row.preferred || {};
    const saxo = row.saxo || {};
    const yahoo = row.yahoo || {};
    const status = preferred.status || 'unavailable';
    return `<article class="price-diagnostic670-card ${p670StatusClass(status)}">
      <div class="price-diagnostic670-top">
        <div><b>${p670Esc(row.symbol)}</b><small>${p670Esc(row.instrument?.description || 'لم يتم تحديد أداة Saxo')}</small></div>
        <span class="price-diagnostic670-badge ${p670StatusClass(status)}">${p670StatusLabel(status)}</span>
      </div>
      <div class="price-diagnostic670-grid">
        <span>السعر المعتمد<b>${p670Money(preferred.price, preferred.currency || 'USD')}</b></span>
        <span>وقت السعر<b>${preferred.updatedAt ? new Date(preferred.updatedAt).toLocaleTimeString('ar-SA') : '—'}</b></span>
        <span>UIC<b>${row.instrument?.uic ?? '—'}</b></span>
        <span>البورصة<b>${p670Esc(row.instrument?.exchangeId || '—')}</b></span>
        <span>Saxo Mid<b>${p670Num(saxo.mid)}</b></span>
        <span>Saxo Last<b>${p670Num(saxo.lastTraded)}</b></span>
        <span>التأخير<b>${Number.isFinite(Number(saxo.delayedByMinutes)) ? `${Number(saxo.delayedByMinutes)} دقيقة` : '—'}</b></span>
        <span>Yahoo للمقارنة<b>${p670Money(yahoo.price, yahoo.currency || 'USD')}</b></span>
      </div>
      ${row.error ? `<p class="price-diagnostic670-error">${p670Esc(row.error)}</p>` : ''}
    </article>`;
  }).join('') : '<p class="muted">لا توجد أسهم في المحفظة المحلية.</p>';

  const statusNode = p670Q('#priceDiagnostics670Status');
  statusNode.textContent = valid ? `تم اعتماد ${valid} سعرًا دون تنفيذ أي صفقة.` : 'لم يتم اعتماد أي سعر؛ راجع تفاصيل كل سهم.';
  statusNode.className = `status ${valid ? 'up' : 'down'}`;
  p670ApplyToTables(rows);
}

async function p670Load(manual = false) {
  if (p670State.busy || document.hidden || !p670Q('#portfoliocenter.active')) return;
  p670State.busy = true;
  p670EnsurePanel();
  const status = p670Q('#priceDiagnostics670Status');
  try {
    if (status) { status.textContent = manual ? 'جارٍ تنفيذ فحص كامل للمصادر…' : 'جارٍ تحديث الأسعار المعتمدة…'; status.className = 'status'; }
    const data = await p670Api('/api/broker/prices/diagnostics');
    p670Render(data);
  } catch (error) {
    if (status) { status.textContent = `تعذر فحص الأسعار: ${error.message}`; status.className = 'status down'; }
    p670Q('#priceDiagnostics670State').textContent = 'خطأ في الفحص';
  } finally {
    p670State.busy = false;
  }
}

function p670Start() {
  p670EnsurePanel();
  if (p670State.timer) clearInterval(p670State.timer);
  p670State.timer = setInterval(() => p670Load(false), p670State.intervalMs);
  setTimeout(() => p670Load(false), 450);
}

function p670Mount() {
  p670EnsurePanel();
  p670Q('.main-nav button[data-page="portfoliocenter"]')?.addEventListener('click', () => setTimeout(p670Start, 300));
  const page = p670Q('#portfoliocenter');
  if (page) new MutationObserver(() => { if (page.classList.contains('active')) p670Start(); }).observe(page, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && p670Q('#portfoliocenter.active')) p670Load(false); });
  if (page?.classList.contains('active')) p670Start();
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', p670Mount, { once: true }) : p670Mount();
