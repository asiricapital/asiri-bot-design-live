(() => {
  const ALERT_KEY = 'asiri_live_alerts_v1';
  const STATE_KEY = 'asiri_live_alert_states_v1';
  let alerts = JSON.parse(localStorage.getItem(ALERT_KEY) || '{}');
  let alertStates = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
  let modal = null;
  let activeSymbol = null;

  function save() {
    localStorage.setItem(ALERT_KEY, JSON.stringify(alerts));
    localStorage.setItem(STATE_KEY, JSON.stringify(alertStates));
    updateHeaderBadge();
  }

  function ensureStyles() {
    if (document.getElementById('asiri-alert-styles')) return;
    const style = document.createElement('style');
    style.id = 'asiri-alert-styles';
    style.textContent = `
      .alert-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #29415f;background:#0b1829;color:#dcecff;border-radius:999px;padding:7px 10px;font-size:11px;cursor:pointer}
      .alert-chip.active{border-color:#f7c948;color:#f7c948;box-shadow:0 0 14px rgba(247,201,72,.12)}
      .alert-triggered{border-color:#ff6578!important;box-shadow:0 0 0 1px rgba(255,101,120,.28),0 0 24px rgba(255,101,120,.15)!important}
      #asiriAlertBadge{margin-inline-start:8px;cursor:pointer}
      .asiri-alert-modal{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.66);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:18px}
      .asiri-alert-modal.show{display:flex}
      .asiri-alert-box{width:min(460px,100%);background:linear-gradient(180deg,#111e32,#091321);border:1px solid #2b405f;border-radius:20px;padding:20px;box-shadow:0 30px 90px rgba(0,0,0,.45)}
      .asiri-alert-title{font-weight:900;font-size:20px;margin-bottom:4px}.asiri-alert-sub{color:#91a1ba;font-size:12px;margin-bottom:16px}
      .asiri-alert-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.asiri-alert-grid label{font-size:11px;color:#91a1ba;display:block;margin-bottom:6px}
      .asiri-alert-grid input{width:100%;background:#07111f;border:1px solid #263a56;color:#fff;padding:12px;border-radius:12px;font-size:16px;outline:none}
      .asiri-alert-actions{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}.asiri-alert-actions button{flex:1;border:0;border-radius:12px;padding:12px;font-weight:800;cursor:pointer}.asiri-save{background:linear-gradient(135deg,#4db8ff,#356cff);color:#fff}.asiri-delete{background:#32141b;color:#ff9cab;border:1px solid #5a2430!important}.asiri-cancel{background:#142238;color:#dcecff;border:1px solid #29415f!important}
      .asiri-toast{position:fixed;z-index:10000;left:18px;bottom:22px;max-width:360px;background:#111e32;border:1px solid #ff6578;border-radius:16px;padding:14px 16px;box-shadow:0 20px 60px rgba(0,0,0,.42);animation:asiriIn .25s ease}.asiri-toast b{display:block;margin-bottom:4px}.asiri-toast span{color:#c8d6ea;font-size:12px}@keyframes asiriIn{from{transform:translateY(12px);opacity:0}to{transform:none;opacity:1}}
      @media(max-width:520px){.asiri-alert-grid{grid-template-columns:1fr}.asiri-alert-actions{flex-direction:column}.asiri-alert-actions button{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'asiri-alert-modal';
    modal.innerHTML = `
      <div class="asiri-alert-box" role="dialog" aria-modal="true">
        <div class="asiri-alert-title">🔔 تنبيه سعري</div>
        <div class="asiri-alert-sub" id="asiriAlertSymbol">—</div>
        <div class="asiri-alert-grid">
          <div><label>تنبيه عند الصعود إلى</label><input id="asiriAlertHigh" type="number" step="0.0001" min="0" placeholder="مثال 1.50"></div>
          <div><label>تنبيه عند الهبوط إلى</label><input id="asiriAlertLow" type="number" step="0.0001" min="0" placeholder="مثال 1.25"></div>
        </div>
        <div class="asiri-alert-actions">
          <button class="asiri-save" id="asiriAlertSave">حفظ التنبيه</button>
          <button class="asiri-delete" id="asiriAlertDelete">حذف</button>
          <button class="asiri-cancel" id="asiriAlertCancel">إلغاء</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    modal.querySelector('#asiriAlertCancel').onclick = closeModal;
    modal.querySelector('#asiriAlertSave').onclick = saveModal;
    modal.querySelector('#asiriAlertDelete').onclick = deleteModal;
    return modal;
  }

  function openModal(symbol) {
    activeSymbol = symbol;
    ensureModal();
    const a = alerts[symbol] || {};
    modal.querySelector('#asiriAlertSymbol').textContent = `${symbol} • السعر الحالي ${currentPriceText(symbol)}`;
    modal.querySelector('#asiriAlertHigh').value = a.high ?? '';
    modal.querySelector('#asiriAlertLow').value = a.low ?? '';
    modal.classList.add('show');
  }
  function closeModal(){ if(modal) modal.classList.remove('show'); activeSymbol=null; }
  function saveModal(){
    if (!activeSymbol) return;
    const high = Number(modal.querySelector('#asiriAlertHigh').value);
    const low = Number(modal.querySelector('#asiriAlertLow').value);
    const next = {};
    if (Number.isFinite(high) && high > 0) next.high = high;
    if (Number.isFinite(low) && low > 0) next.low = low;
    if (!next.high && !next.low) delete alerts[activeSymbol]; else alerts[activeSymbol] = next;
    delete alertStates[activeSymbol];
    save(); closeModal(); render();
  }
  function deleteModal(){ if(activeSymbol){ delete alerts[activeSymbol]; delete alertStates[activeSymbol]; save(); } closeModal(); render(); }

  function currentPriceText(symbol){
    try { const q = quotes.get(symbol); return q && Number.isFinite(Number(q.price)) ? `$${Number(q.price).toFixed(4)}` : '—'; } catch { return '—'; }
  }

  function beep(){
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
      const ctx = new AC(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 880; gain.gain.setValueAtTime(.0001, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.2, ctx.currentTime+.02); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime+.45);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+.48);
    } catch {}
  }

  function notify(symbol, price, kind, target){
    const direction = kind === 'high' ? 'وصل للهدف العلوي' : 'وصل للحد السفلي';
    const title = `تنبيه ${symbol}`; const body = `${direction}: $${Number(price).toFixed(4)} • المستوى $${Number(target).toFixed(4)}`;
    beep();
    if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title,{body}); } catch{} }
    const toast = document.createElement('div'); toast.className='asiri-toast'; toast.innerHTML=`<b>🔔 ${title}</b><span>${body}</span>`; document.body.appendChild(toast); setTimeout(()=>toast.remove(),7000);
  }

  function checkAlerts(){
    let changed=false;
    for (const [symbol,a] of Object.entries(alerts)) {
      let q; try { q=quotes.get(symbol); } catch { continue; }
      const price=Number(q?.price); if(!Number.isFinite(price)||price<=0) continue;
      const st=alertStates[symbol] || {high:false,low:false};
      if (a.high) {
        if (price >= Number(a.high) && !st.high) { st.high=true; notify(symbol,price,'high',a.high); changed=true; }
        else if (price < Number(a.high)*0.997) st.high=false;
      }
      if (a.low) {
        if (price <= Number(a.low) && !st.low) { st.low=true; notify(symbol,price,'low',a.low); changed=true; }
        else if (price > Number(a.low)*1.003) st.low=false;
      }
      alertStates[symbol]=st;
    }
    if(changed) save();
    decorateCards();
  }

  function decorateCards(){
    const cards=[...document.querySelectorAll('.stock')];
    cards.forEach(card=>{
      const symEl=card.querySelector('.sym'); if(!symEl) return; const symbol=symEl.textContent.trim();
      if(!symbol || card.querySelector('.asiri-alert-btn')) return;
      const btn=document.createElement('button'); btn.className='alert-chip asiri-alert-btn'+(alerts[symbol]?' active':''); btn.innerHTML=alerts[symbol]?'🔔 تنبيه نشط':'🔔 تنبيه';
      btn.onclick=e=>{e.stopPropagation();openModal(symbol)};
      const source=card.querySelector('.source'); if(source) source.before(btn); else card.appendChild(btn);
      const st=alertStates[symbol]; if(st?.high||st?.low) card.classList.add('alert-triggered');
    });
  }

  function updateHeaderBadge(){
    let b=document.getElementById('asiriAlertBadge');
    if(!b){ b=document.createElement('span'); b.id='asiriAlertBadge'; b.className='pill'; b.onclick=async()=>{
      if('Notification' in window && Notification.permission==='default') await Notification.requestPermission();
      const count=Object.keys(alerts).length; alert(`التنبيهات النشطة: ${count}\nيمكنك تعيين أو تعديل التنبيه من زر 🔔 داخل بطاقة كل سهم.`);
    }; const row=document.querySelector('.toprow'); if(row) row.appendChild(b); }
    b.textContent=`🔔 ${Object.keys(alerts).length} تنبيه`;
  }

  ensureStyles(); ensureModal(); updateHeaderBadge();
  const originalRender = window.render || (typeof render === 'function' ? render : null);
  if (originalRender) {
    try { render = function(){ originalRender(); setTimeout(decorateCards,0); }; } catch {}
  }
  setInterval(checkAlerts, 1000);
  setTimeout(()=>{decorateCards();checkAlerts();},300);
})();
