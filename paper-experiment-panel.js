// ASIRI_PAPER_EXPERIMENT_PANEL_V1 · paperOnly=true · executionAllowed=false
// Shows the live $1,000 paper experiment (the one that trades) above the old paper-lab simulator.
// GET only; no controls, no broker path.
(() => {
  const API = 'https://asiri-bot.onrender.com/api/paper-experiment';
  const PAGE = 'https://asiri-bot.onrender.com/paper-experiment';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const money = (v) => (num(v) === null ? '—' : `${num(v) < 0 ? '−' : ''}$${Math.abs(num(v)).toFixed(2)}`);
  const price = (v) => (num(v) === null ? '—' : `$${num(v).toFixed(3)}`);
  const pct = (v) => (num(v) === null ? '—' : `${num(v) >= 0 ? '+' : ''}${num(v).toFixed(2)}%`);
  const when = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('ar-SA-u-ca-gregory', { timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short' }) : '—'; };

  function style() {
    if (document.getElementById('pe-panel-style')) return;
    const s = document.createElement('style'); s.id = 'pe-panel-style';
    s.textContent = `.pe-live{margin:12px 0 14px;padding:14px;border:1px solid rgba(37,214,149,.45);border-radius:14px;background:rgba(3,22,20,.55)}
.pe-live-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.pe-live-head b{font-size:.95rem}.pe-live-head small{display:block;color:#8da6aa;font-size:.66rem;margin-top:2px}
.pe-live-badge{padding:4px 9px;border-radius:999px;border:1px solid rgba(37,214,149,.5);color:#7ff0c3;font-size:.64rem;font-weight:800;white-space:nowrap}
.pe-live-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px}.pe-live-grid div{padding:9px;border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(3,12,22,.55)}
.pe-live-grid small{display:block;color:#8da6aa;font-size:.64rem}.pe-live-grid strong{display:block;margin-top:3px;font-size:.95rem;direction:ltr;text-align:right}
.pe-pos{margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.04);font-size:.7rem;line-height:1.8}.pe-pos b{font-size:.85rem}.pe-pos .loss{color:#fda4af}.pe-pos .gain{color:#7ff0c3}
.pe-note{margin:10px 0 0;color:#8da6aa;font-size:.66rem;line-height:1.7}.pe-note a{color:#7dd3fc;text-decoration:underline}`;
    document.head.append(s);
  }

  function mount() {
    let node = document.getElementById('pe-live');
    if (node) return node;
    const card = document.querySelector('.paper-lab-card'); const head = card?.querySelector('.paper-lab-head');
    if (!head) return null;
    node = document.createElement('section'); node.id = 'pe-live'; node.className = 'pe-live'; node.setAttribute('aria-label', 'تجربة الألف دولار المعتمدة');
    head.after(node);
    return node;
  }

  function render(node, data) {
    const s = data?.experiment?.summary || {}; const st = data?.experiment?.state || {};
    const positions = Array.isArray(st.positions) ? st.positions : [];
    const fills = Array.isArray(st.fills) ? st.fills : [];
    const pos = positions.map((p) => {
      const mark = num(p.mark?.price); const pnl = mark === null ? null : (mark - num(p.entryPrice)) * num(p.quantity);
      const cls = pnl !== null && pnl < 0 ? 'loss' : 'gain';
      return `<div class="pe-pos"><div><b>${esc(p.symbol)}</b> · <bdi>${esc(p.quantity)}</bdi> سهم · الربح/الخسارة <bdi class="${cls}">${money(pnl)}</bdi></div><div>دخول <bdi>${price(p.entryPrice)}</bdi> · الآن <bdi>${price(mark)}</bdi></div><div>وقف <bdi>${price(p.stopPrice)}</bdi> · هدف <bdi>${price(p.targetPrice)}</bdi></div><div>منذ <bdi>${when(p.openedAt)}</bdi></div></div>`;
    }).join('');
    node.innerHTML = `<div class="pe-live-head"><div><b>تجربة الألف دولار المعتمدة</b><small>تعمل تلقائيًا كل 5 دقائق أثناء السوق الأمريكي · آخر تحديث ${when(st.updatedAt || s.calculatedAt)}</small></div><span class="pe-live-badge">${esc(s.status || '—')} · ورقي</span></div>
      <div class="pe-live-grid"><div><small>قيمة المحفظة</small><strong>${money(s.equityUsd)}</strong></div><div><small>العائد</small><strong>${pct(s.returnPct)}</strong></div>
      <div><small>النقد</small><strong>${money(s.cashUsd)}</strong></div><div><small>الصفقات</small><strong>${esc(s.closedTrades ?? 0)} مغلقة · ${esc(s.positionCount ?? positions.length)} مفتوحة</strong></div></div>
      ${pos || (fills.length ? '' : '<p class="pe-note">لا توجد مراكز مفتوحة الآن.</p>')}
      <p class="pe-note">التفاصيل الكاملة وسجل كل صفقة: <a href="${PAGE}" target="_blank" rel="noopener">صفحة التجربة ↗</a>. الأرقام تحت هذا الإطار لمختبر المحاكاة القديم، وقواعده تشترط وقف خسارة ضمن 2% من السعر، لذلك نادرًا ما يدخل صفقات.</p>`;
  }

  async function load() {
    const node = mount(); if (!node) return;
    style();
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      render(node, data);
    } catch (error) {
      node.innerHTML = `<p class="pe-note">تعذر قراءة تجربة الألف دولار الآن (${esc(error.message)}). <a href="${PAGE}" target="_blank" rel="noopener">افتح صفحة التجربة ↗</a></p>`;
    }
  }
  window.addEventListener('DOMContentLoaded', () => { load(); window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000); });
})();
