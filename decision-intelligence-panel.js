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
  const finite = (value) => Number.isFinite(Number(value));
  const scoreLabel = (score) => score >= 80 ? 'موثوق نسبيًا' : score >= 60 ? 'يحتاج مراجعة' : 'غير صالح';

  function renderJournal(rows) {
    const box = $('decision-journal-list');
    if (!box) return;
    box.innerHTML = rows.length ? rows.slice().reverse().map((row) => `<li><b>${row.symbol}</b><span>${row.change}</span><small>${formatTime(row.at)}</small></li>`).join('') : '<li class="empty">لم تُسجل تغيرات بعد</li>';
  }

  function renderReasons(reasons) {
    const box = $('quality-reasons');
    if (box) box.innerHTML = reasons.map((reason) => `<li>${reason}</li>`).join('');
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

  function analyzeQuality({ health, market, x, symbol, price, technical, liquidity }) {
    const priceReady = price !== 'غير متاح' && price !== '—' && finite(String(price).replace(/[^0-9.-]/g, ''));
    const technicalReady = technical !== '—' && technical !== 'غير متاح';
    const liquidityReady = liquidity !== '—' && liquidity !== 'غير متاح';
    const marketReady = Boolean(market);
    const backendReady = Boolean(health);
    const xReady = x?.status === 'live';
    const corePoints = (backendReady ? 25 : 0) + (marketReady ? 25 : 0) + (priceReady ? 20 : 0) + (technicalReady ? 15 : 0) + (liquidityReady ? 15 : 0);
    const reliability = Math.round(corePoints);
    const fields = [priceReady, technicalReady, liquidityReady, marketReady, xReady];
    const completeness = Math.round(fields.filter(Boolean).length / fields.length * 100);
    const timestamp = market?.updatedAt || market?.time || health?.time || null;
    const ageMs = timestamp ? Math.max(0, Date.now() - new Date(timestamp).getTime()) : null;
    const fresh = ageMs !== null && Number.isFinite(ageMs) && ageMs <= 120000;
    const ageLabel = ageMs === null ? 'لا يوجد توقيت موثق' : ageMs < 60000 ? 'أقل من دقيقة' : `${Math.round(ageMs / 60000)} دقيقة`;
    let agreement = 'غير قابل للمقارنة'; let agreementDetail = 'لا توجد قراءتان سعريتان مستقلتان'; let conflict = false;
    const marketRow = Array.isArray(market?.rows) ? market.rows.find((row) => String(row.symbol).toUpperCase() === symbol) : null;
    const marketPrice = marketRow?.price;
    const cardPrice = String(price).replace(/[^0-9.-]/g, '');
    if (finite(marketPrice) && finite(cardPrice) && Number(cardPrice) > 0) {
      const delta = Math.abs(Number(marketPrice) - Number(cardPrice)) / Number(cardPrice);
      conflict = delta > 0.01; agreement = conflict ? 'تعارض' : 'متوافق'; agreementDetail = `فرق القراءة ${ (delta * 100).toFixed(2) }%`;
    }
    const reasons = [];
    if (!backendReady) reasons.push('الـbackend غير متصل؛ لا توجد قراءة مصدر موثقة.');
    if (!marketReady) reasons.push('محرك السوق غير متاح حاليًا.');
    if (!priceReady) reasons.push('السعر الحالي غير مكتمل أو غير صالح للعرض.');
    if (!technicalReady) reasons.push('المؤشرات الفنية بانتظار سجل تاريخي مكتمل.');
    if (!liquidityReady) reasons.push('نسبة السيولة غير متاحة؛ لا يُفترض بها قيمة بديلة.');
    if (!fresh) reasons.push(timestamp ? `البيانات أقدم من حد الحداثة: ${ageLabel}.` : 'لم يصل توقيت مصدر موثق.');
    if (conflict) reasons.push('يوجد اختلاف سعري يتجاوز 1% بين القراءات المتاحة.');
    if (!xReady) reasons.push(x?.reason === 'X_HTTP_402' ? 'X يحتاج تفعيل خطة/رصيد API؛ لم يدخل في الإشارة.' : 'قراءة X غير متاحة؛ لم تدخل في الإشارة.');
    if (!reasons.length) reasons.push('المصادر الأساسية مكتملة وحديثة ومتوافقة للعرض.');
    const readiness = reliability >= 80 && completeness >= 80 && fresh && !conflict ? 'جاهز للعرض' : reliability >= 60 && !conflict ? 'يحتاج مراجعة بشرية' : 'غير صالح لاتخاذ القرار';
    return { reliability, completeness, fresh, ageLabel, agreement, agreementDetail, conflict, readiness, reasons, xReady };
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
    const quality = analyzeQuality({ health, market, x, symbol, price, technical, liquidity });
    text('quality-market-state', market ? 'متصل' : 'غير متاح'); tone('quality-market-state', market ? 'good' : 'bad');
    text('quality-price-state', price !== 'غير متاح' && price !== '—' ? 'موثّق للعرض' : 'غير متاح'); tone('quality-price-state', price !== 'غير متاح' && price !== '—' ? 'good' : 'bad');
    text('quality-technical-state', technical !== '—' ? 'متاح' : 'بانتظار السجل'); tone('quality-technical-state', technical !== '—' ? 'good' : 'warn');
    text('quality-x-state', quality.xReady ? 'حي' : x?.reason === 'X_HTTP_402' ? 'صلاحية API مطلوبة' : 'غير متاح'); tone('quality-x-state', quality.xReady ? 'good' : 'warn');
    text('quality-reliability-score', `${quality.reliability}/100`); text('quality-reliability-label', scoreLabel(quality.reliability)); tone('quality-reliability-score', quality.reliability >= 80 ? 'good' : quality.reliability >= 60 ? 'warn' : 'bad');
    text('quality-completeness-score', `${quality.completeness}%`); text('quality-completeness-label', `${[quality.completeness >= 80 ? 'مكتمل نسبيًا' : 'حقول ناقصة']}`); tone('quality-completeness-score', quality.completeness >= 80 ? 'good' : 'warn');
    text('quality-freshness-state', quality.fresh ? 'حديثة' : 'قديمة/غير مؤكدة'); text('quality-freshness-age', quality.ageLabel); tone('quality-freshness-state', quality.fresh ? 'good' : 'warn');
    text('quality-agreement-state', quality.agreement); text('quality-agreement-detail', quality.agreementDetail); tone('quality-agreement-state', quality.agreement === 'متوافق' ? 'good' : quality.agreement === 'تعارض' ? 'bad' : 'warn');
    text('quality-readiness-state', quality.readiness); tone('quality-readiness-state', quality.readiness === 'جاهز للعرض' ? 'good' : quality.readiness === 'غير صالح لاتخاذ القرار' ? 'bad' : 'warn'); renderReasons(quality.reasons);
    text('quality-last-update', formatTime(now)); text('decision-current-symbol', symbol); text('decision-current-reading', `${price} · RSI ${technical} · ${liquidity}`); text('decision-source-state', health ? 'متصل' : 'غير متاح');
    const reason = quality.readiness === 'غير صالح لاتخاذ القرار' ? quality.reasons[0] : quality.xReady ? `تغيرت قراءة X إلى ${label}` : `تحديث جودة: ${quality.readiness}`;
    recordChange({ symbol, label: quality.readiness, reason, at: now, signature: `${symbol}|${price}|${technical}|${liquidity}|${label}|${quality.readiness}` });
  }
  window.asiriDecisionIntelligence = { refresh, analyzeQuality };
  window.addEventListener('load', () => { renderJournal(readJournal()); setTimeout(refresh, 1800); setInterval(refresh, 15000); });
})();
