const v671Q = (selector) => document.querySelector(selector);

function v671EnsureBar() {
  if (v671Q('#verifiedFeed671')) return v671Q('#verifiedFeed671');
  const bar = document.createElement('section');
  bar.id = 'verifiedFeed671';
  bar.className = 'verified-feed671 waiting';
  bar.innerHTML = `
    <div class="verified-feed671-main">
      <span class="verified-feed671-dot"></span>
      <div><b>Asiri Verified Feed</b><small id="verifiedFeed671Message">بانتظار أول تحديث موحّد…</small></div>
    </div>
    <div class="verified-feed671-metrics">
      <span>المعتمد <b id="verifiedFeed671Valid">0</b></span>
      <span>Saxo LIVE <b id="verifiedFeed671Live">0</b></span>
      <span>بديل/مرجعي <b id="verifiedFeed671Other">0</b></span>
      <span>آخر تحديث <b id="verifiedFeed671Time">—</b></span>
    </div>
    <button id="verifiedFeed671Refresh" type="button" class="ghost">تحديث الأسعار</button>`;
  const target = v671Q('.topbar') || v671Q('header') || v671Q('.app-shell') || document.body.firstElementChild;
  if (target?.parentNode) target.insertAdjacentElement('afterend', bar); else document.body.prepend(bar);
  v671Q('#verifiedFeed671Refresh')?.addEventListener('click', () => {
    const button = v671Q('#verifiedFeed671Refresh');
    if (button) { button.disabled = true; button.textContent = 'جارٍ التحديث…'; }
    window.dispatchEvent(new CustomEvent('asiri:refresh-verified-prices'));
    setTimeout(() => { if (button) { button.disabled = false; button.textContent = 'تحديث الأسعار'; } }, 5000);
  });
  return bar;
}

function v671Render(event) {
  const data = event.detail || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const valid = rows.filter((row) => Number.isFinite(Number(row.preferred?.price)) && Number(row.preferred.price) > 0);
  const live = valid.filter((row) => row.preferred?.status === 'saxo-live').length;
  const other = valid.length - live;
  const unavailable = rows.length - valid.length;
  const bar = v671EnsureBar();
  const state = !rows.length || !valid.length ? 'down' : unavailable ? 'partial' : live === valid.length ? 'live' : 'verified';
  bar.className = `verified-feed671 ${state}`;
  v671Q('#verifiedFeed671Valid').textContent = String(valid.length);
  v671Q('#verifiedFeed671Live').textContent = String(live);
  v671Q('#verifiedFeed671Other').textContent = String(other);
  v671Q('#verifiedFeed671Time').textContent = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('ar-SA') : '—';
  const message = !rows.length ? 'لا توجد رموز مطلوبة للمحرك.'
    : !valid.length ? 'لم يصل أي سعر صالح؛ افتح مختبر الأسعار لمعرفة السبب.'
    : unavailable ? `${valid.length} من ${rows.length} سعرًا معتمدًا — توجد رموز تحتاج مراجعة.`
    : live === valid.length ? 'جميع الأسعار الحالية موثقة من Saxo LIVE.'
    : 'الأسعار موحّدة، ومصدر كل سعر موضح دون تضليل.';
  v671Q('#verifiedFeed671Message').textContent = message;
}

function v671Error(event) {
  const bar = v671EnsureBar();
  bar.className = 'verified-feed671 down';
  v671Q('#verifiedFeed671Message').textContent = event.detail?.message || 'تعذر تحديث محرك الأسعار الموحّد.';
}

function v671Mount() {
  v671EnsureBar();
  window.addEventListener('asiri:verified-prices', v671Render);
  window.addEventListener('asiri:verified-prices-error', v671Error);
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', v671Mount, { once: true }) : v671Mount();
