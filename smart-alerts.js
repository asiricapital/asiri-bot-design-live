(() => {
  const ALERT_KEY = 'asiri_smart_alerts_v2';
  const STATE_KEY = 'asiri_smart_alert_state_v2';
  const COOLDOWN_MS = 15 * 60 * 1000;
  const alerts = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}');
  const fired = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');

  const save = () => {
    localStorage.setItem(ALERT_KEY, JSON.stringify(alerts));
    localStorage.setItem(STATE_KEY, JSON.stringify(fired));
  };

  function ensureStyle() {
    const css = `
    .asiri-alert-btn{margin-top:10px;width:100%;border:1px solid #2b4567;background:#10223a;color:#fff;padding:9px 10px;border-radius:10px;font-weight:800;cursor:pointer}
    .asiri-alert-btn.active{border-color:#f7c948;color:#f7c948;background:#211d0d}
    .asiri-alert-hub{max-width:1320px;margin:0 auto 14px;padding:12px 14px;border:1px solid #22314b;border-radius:15px;background:linear-gradient(180deg,#101d31,#0a1423);display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    .asiri-alert-hub b{font-size:14px}.asiri-alert-hub small{color:#91a1ba}.asiri-alert-count{padding:5px 9px;border-radius:999px;border:1px solid #3b5577;color:#f7c948}
    .asiri-toast{position:fixed;z-index:9999;left:16px;bottom:20px;max-width:420px;background:#101d31;border:1px solid #f7c948;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 20px 60px #0008;animation:asiriIn .25s ease}
    .asiri-toast strong{display:block;color:#f7c948;margin-bottom:5px}.asiri-smart-score{margin-top:8px;font-size:11px;color:#91a1ba}.asiri-smart-score b{color:#fff}
    @keyframes asiriIn{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  function notify(title, body, key) {
    const now = Date.now();
    if (fired[key] && now - fired[key] < COOLDOWN_MS) return;
    fired[key] = now; save();
    const t = document.createElement('div');
    t.className = 'asiri-toast';
    t.innerHTML = `<strong>🔔 ${title}</strong><div>${body}</div>`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 9000);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = .05; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .18);
    } catch {}
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`ASIRI CAPITAL • ${title}`, { body }); } catch {}
    }
  }

  function score(q) {
    const ch = Number(q.changePercent || 0);
    const vol = Number(q.volume || 0), avg = Number(q.averageVolume || 0);
    const vr = avg > 0 ? vol / avg : 0;
    const p = Number(q.price || 0), h = Number(q.high || 0), l = Number(q.low || 0);
    const nearHigh = h > l && p > 0 ? (p - l) / (h - l) : .5;
    let s = 38;
    if (ch >= 2) s += 12; if (ch >= 5) s += 10; if (ch >= 10) s += 8;
    if (vr >= 1) s += 8; if (vr >= 1.5) s += 8; if (vr >= 2) s += 8;
    if (nearHigh >= .8) s += 10;
    if (q.isLiveSession) s += 5;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  function checkQuote(q) {
    if (!q || q.error || !q.symbol || !Number.isFinite(Number(q.price))) return;
    const sym = String(q.symbol).toUpperCase();
    const cfg = alerts[sym] || {};
    const p = Number(q.price), high = Number(q.high), low = Number(q.low);
    const vol = Number(q.volume || 0), avg = Number(q.averageVolume || 0), vr = avg > 0 ? vol / avg : 0;
    const ch = Number(q.changePercent || 0), sc = score(q);

    if (cfg.targetHigh && p >= Number(cfg.targetHigh)) notify(`${sym} وصل الهدف`, `السعر $${p.toFixed(2)} ≥ $${Number(cfg.targetHigh).toFixed(2)}`, `${sym}:targetHigh`);
    if (cfg.stopLow && p <= Number(cfg.stopLow)) notify(`${sym} كسر وقف الخسارة`, `السعر $${p.toFixed(2)} ≤ $${Number(cfg.stopLow).toFixed(2)}`, `${sym}:stopLow`);
    if (cfg.breakout && high > 0 && p >= high * 0.999 && ch >= 2) notify(`${sym} اختراق/قمة يومية`, `السعر قرب أعلى اليوم $${high.toFixed(2)} والتغير ${ch.toFixed(2)}%`, `${sym}:breakout`);
    if (cfg.volume && vr >= Number(cfg.volumeRatio || 1.5)) notify(`${sym} حجم تداول غير اعتيادي`, `الحجم النسبي ≈ ${vr.toFixed(2)}× من المتوسط`, `${sym}:volume`);
    if (cfg.golden && sc >= Number(cfg.goldenScore || 82)) notify(`⚡ Golden Alert • ${sym}`, `درجة الزخم ${sc}/100 • السعر $${p.toFixed(2)} • التغير ${ch.toFixed(2)}% • RVOL ${vr ? vr.toFixed(2) : '—'}×`, `${sym}:golden`);
  }

  function configure(sym) {
    sym = String(sym || '').toUpperCase();
    const old = alerts[sym] || {};
    const targetHigh = prompt(`🎯 ${sym} — هدف علوي (اتركه فارغاً للإلغاء)`, old.targetHigh || '');
    if (targetHigh === null) return;
    const stopLow = prompt(`🛑 ${sym} — وقف/سعر سفلي (اتركه فارغاً للإلغاء)`, old.stopLow || '');
    if (stopLow === null) return;
    const smart = confirm(`⚡ تفعيل التنبيهات الذكية لـ ${sym}؟\nاختراق القمة + ارتفاع الحجم + Golden Alert`);
    alerts[sym] = {
      targetHigh: Number(targetHigh) > 0 ? Number(targetHigh) : null,
      stopLow: Number(stopLow) > 0 ? Number(stopLow) : null,
      breakout: smart,
      volume: smart,
      volumeRatio: 1.5,
      golden: smart,
      goldenScore: 82
    };
    if (!alerts[sym].targetHigh && !alerts[sym].stopLow && !smart) delete alerts[sym];
    save(); decorate(); hub();
  }

  function hub() {
    let el = document.getElementById('asiriAlertHub');
    if (!el) {
      el = document.createElement('div'); el.id = 'asiriAlertHub'; el.className = 'asiri-alert-hub';
      const controls = document.querySelector('.controls');
      if (controls?.parentNode) controls.parentNode.insertBefore(el, controls);
    }
    const count = Object.keys(alerts).length;
    el.innerHTML = `<div><b>🔔 مركز التنبيهات الذكية</b><br><small>أهداف سعرية • وقف خسارة • اختراق • RVOL • Golden Alert</small></div><div class="asiri-alert-count">${count} نشط</div>`;
    el.onclick = async () => {
      if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission().catch(()=>{});
    };
  }

  function decorate() {
    document.querySelectorAll('.stock').forEach(card => {
      const sym = card.querySelector('.sym')?.textContent?.trim().toUpperCase(); if (!sym) return;
      let btn = card.querySelector('.asiri-alert-btn');
      if (!btn) { btn = document.createElement('button'); btn.className = 'asiri-alert-btn'; card.appendChild(btn); }
      const active = !!alerts[sym]; btn.classList.toggle('active', active); btn.textContent = active ? '🔔 تنبيه ذكي مفعّل' : '🔔 إعداد تنبيه'; btn.onclick = () => configure(sym);
      const q = (typeof quotes !== 'undefined' && quotes?.get) ? quotes.get(sym) : null;
      let sc = card.querySelector('.asiri-smart-score'); if (!sc) { sc = document.createElement('div'); sc.className = 'asiri-smart-score'; card.appendChild(sc); }
      if (q && !q.error) {
        const s = score(q), avg = Number(q.averageVolume || 0), vol = Number(q.volume || 0), vr = avg > 0 ? vol / avg : 0;
        sc.innerHTML = `ASIRI Momentum <b>${s}/100</b> • RVOL <b>${vr ? vr.toFixed(2)+'×' : '—'}</b>`;
      } else sc.textContent = '';
    });
  }

  function scan() {
    try {
      if (typeof quotes !== 'undefined' && quotes?.values) for (const q of quotes.values()) checkQuote(q);
      decorate();
    } catch {}
  }

  ensureStyle(); hub(); decorate();
  setInterval(scan, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
})();