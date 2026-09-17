(() => {
  'use strict';
  const API = 'https://asiri-bot.onrender.com';
  const SAFETY = Object.freeze({ executionAllowed: false, automaticTrading: false });
  const JOURNAL_KEY = 'asiri_decision_journal_v1';
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const tone = (id, state) => { const node = $(id); if (node) node.dataset.state = state; };
  const readJournal = () => { try { const value = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const saveJournal = (rows) => { try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(rows.slice(-12))); } catch {} };
  const formatTime = (value) => value ? new Date(value).toLocaleString('ar-SA') : '—';

  function renderJournal(rows) {
    const box = $('decision-journal-list');
    if (!box) return;
    box.innerHTML = rows.length ? rows.slice().reverse().map((row) => `<li><b>${row.symbol}</b><span>${row.change}</span><small>${formatTime(row.at)}</small></li>`).join('') : '<li class="empty">لم تُسجل تغيرات بعد</li>';
  }

  function recordChange(snapshot) {
    const rows = readJournal();
    const previous = rows[rows.length - 1];
    if (previous && previous.signature === snapshot.signature) return;
    if (previous && previous.symbol === snapshot.symbol) {
      rows.push({ symbol: snapshot.symbol, change: `تغير القرار السياقي: ${previous.label || '—'} ← ${snapshot.label || '—'} · ${snapshot.reason}`, label: snapshot.label, signature: snapshot.signature, at: snapshot.at });
      saveJournal(rows);
      text('decision-change-banner', `تغير مهم في ${snapshot.symbol}: ${snapshot.reason}`);
      $('decision-change-banner')?.removeAttribute('hidden');
    }
    renderJournal(rows);
  }

  async function refresh() {
    if (SAFETY.executionAllowed || SAFETY.automaticTrading) return;
    const symbol = ($('opt-symbol')?.textContent || '').trim();
    if (!symbol || symbol === '—') return;
    const [healthResult, marketResult, xResult] = await Promise.allSettled([
      fetch(`${API}/health`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/api/market`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`${API}/api/x-sentiment/${encodeURIComponent(symbol)}`, { cache: 'no-store' }).then((r) => r.json())
    ]);
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
    const market = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const x = xResult.status === 'fulfilled' ? xResult.value : null;
    const now = new Date().toISOString();
    const price = $('opt-price')?.textContent || '—';
    const technical = $('opt-momentum')?.textContent || '—';
    const liquidity = $('opt-liquidity')?.textContent || '—';
    const label = x?.label || 'غير متاح';
    const sourceState = health ? 'متصل' : 'غير متاح';
    text('quality-market-state', market ? 'متصل' : 'غير متاح'); tone('quality-market-state', market ? 'good' : 'bad');
    text('quality-price-state', price !== 'غير متاح' && price !== '—' ? 'موثّق للعرض' : 'غير متاح'); tone('quality-price-state', price !== 'غير متاح' && price !== '—' ? 'good' : 'bad');
    text('quality-technical-state', technical !== '—' ? 'متاح' : 'بانتظار السجل'); tone('quality-technical-state', technical !== '—' ? 'good' : 'warn');
    text('quality-x-state', x?.status === 'live' ? 'حي' : x?.reason === 'X_HTTP_402' ? 'صلاحية API مطلوبة' : 'غير متاح'); tone('quality-x-state', x?.status === 'live' ? 'good' : 'warn');
    text('quality-last-update', formatTime(now));
    text('decision-current-symbol', symbol);
    text('decision-current-reading', `${price} · RSI ${technical} · ${liquidity}`);
    text('decision-source-state', sourceState);
    const reason = x?.status === 'live' ? `تغيرت قراءة X إلى ${label}` : `تم تحديث قراءة السوق؛ X ${x?.reason === 'X_HTTP_402' ? 'ينتظر تفعيل API' : 'غير متاح'}`;
    recordChange({ symbol, label, reason, at: now, signature: `${symbol}|${price}|${technical}|${liquidity}|${label}` });
  }

  window.asiriDecisionIntelligence = { refresh };
  window.addEventListener('load', () => { renderJournal(readJournal()); setTimeout(refresh, 1800); setInterval(refresh, 15000); });
})();
