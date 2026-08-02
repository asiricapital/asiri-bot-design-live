const SYNC_HISTORY_KEY = 'asiri_portfolio_sync_history_v1';
const syncState = { client: null, session: null, current: [], imported: [], diff: [] };
const sq = (selector) => document.querySelector(selector);
const sEsc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const sNum = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';

function syncHistory() {
  try { return JSON.parse(localStorage.getItem(SYNC_HISTORY_KEY) || '[]'); }
  catch { return []; }
}
function saveSyncHistory(rows) { localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(rows.slice(0, 30))); }
function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_\-./()]+/g, '');
}
function parseNumber(value) {
  const cleaned = String(value ?? '').replace(/[$,%\s]/g, '').replace(/,/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}
function splitCsvLine(line, delimiter) {
  const result = []; let current = ''; let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"' && quoted) { current += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { result.push(current.trim()); current = ''; continue; }
    current += char;
  }
  result.push(current.trim());
  return result;
}
function detectDelimiter(firstLine) {
  const counts = [',',';','\t'].map((delimiter) => ({ delimiter, count: (firstLine.match(new RegExp(delimiter === '\t' ? '\\t' : `\\${delimiter}`, 'g')) || []).length }));
  return counts.sort((a,b) => b.count - a.count)[0].delimiter;
}
function headerIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) => aliases.includes(header));
}
function parsePortfolioCsv(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('الملف لا يحتوي على صفوف محفظة كافية.');
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const symbolIndex = headerIndex(headers, ['symbol','ticker','stock','security','رمز','رمزالسهم','السهم']);
  const quantityIndex = headerIndex(headers, ['quantity','qty','shares','share','position','الكمية','عددالاسهم','عددالأسهم']);
  const avgIndex = headerIndex(headers, ['avgprice','averageprice','averagecost','avgcost','costbasisperunit','متوسطالشراء','متوسطالسعر','سعرالشراء']);
  if (symbolIndex < 0 || quantityIndex < 0 || avgIndex < 0) throw new Error('يجب أن يتضمن الملف أعمدة الرمز والكمية ومتوسط الشراء.');
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    const symbol = String(cells[symbolIndex] || '').trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, '');
    const quantity = parseNumber(cells[quantityIndex]);
    const avgPrice = parseNumber(cells[avgIndex]);
    if (!symbol || !(quantity > 0) || !(avgPrice >= 0)) continue;
    const existing = rows.find((row) => row.symbol === symbol);
    if (existing) {
      const totalQuantity = existing.quantity + quantity;
      existing.avgPrice = totalQuantity ? ((existing.quantity * existing.avgPrice) + (quantity * avgPrice)) / totalQuantity : avgPrice;
      existing.quantity = totalQuantity;
    } else rows.push({ symbol, quantity, avgPrice });
  }
  if (!rows.length) throw new Error('لم يتم العثور على مراكز صالحة داخل الملف.');
  return rows.sort((a,b) => a.symbol.localeCompare(b.symbol));
}

async function setupSyncClient() {
  if (syncState.client && syncState.session) return;
  const configResponse = await fetch('/api/config', { cache: 'no-store' });
  const config = await configResponse.json();
  if (!config.supabase?.enabled) throw new Error('اتصال Supabase غير متاح.');
  syncState.client = window.supabase.createClient(config.supabase.url, config.supabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  let { data, error } = await syncState.client.auth.getSession();
  if (error) throw error;
  if (!data.session) {
    const anonymous = await syncState.client.auth.signInAnonymously();
    if (anonymous.error) throw anonymous.error;
    data = { session: anonymous.data.session };
  }
  syncState.session = data.session;
}
async function loadCurrentPortfolio() {
  await setupSyncClient();
  const uid = syncState.session.user.id;
  const { data, error } = await syncState.client.from('portfolio').select('*').eq('user_id', uid).order('created_at', { ascending: true });
  if (error) throw error;
  syncState.current = (data || []).map((row) => ({ ...row, symbol: String(row.symbol).toUpperCase(), quantity: Number(row.quantity), avgPrice: Number(row.avg_price) }));
  renderSyncStatus();
  return syncState.current;
}
function buildDiff() {
  const currentMap = new Map(syncState.current.map((row) => [row.symbol, row]));
  const importedMap = new Map(syncState.imported.map((row) => [row.symbol, row]));
  const symbols = [...new Set([...currentMap.keys(), ...importedMap.keys()])].sort();
  syncState.diff = symbols.map((symbol) => {
    const current = currentMap.get(symbol); const incoming = importedMap.get(symbol);
    if (!current && incoming) return { symbol, status: 'ADD', current, incoming };
    if (current && !incoming) return { symbol, status: 'REMOVE', current, incoming };
    const quantityDiff = Math.abs(Number(current.quantity) - Number(incoming.quantity));
    const avgDiff = Math.abs(Number(current.avgPrice) - Number(incoming.avgPrice));
    return { symbol, status: quantityDiff < 0.0001 && avgDiff < 0.005 ? 'MATCH' : 'UPDATE', current, incoming };
  });
  renderDiff();
}
function renderSyncStatus() {
  const symbols = syncState.current.map((row) => row.symbol).sort();
  const badge = sq('#syncCurrentStatus');
  if (!badge) return;
  badge.textContent = `${syncState.current.length} مراكز · ${symbols.join('، ') || 'لا توجد مراكز'}`;
  sq('#syncCurrentUpdated').textContent = new Date().toLocaleString('ar-SA');
  sq('#syncSource').textContent = 'Supabase · حساب المستخدم الحالي';
}
function renderDiff() {
  const table = sq('#syncDiffTable');
  if (!table) return;
  const labels = { MATCH:'متطابق', ADD:'إضافة', UPDATE:'تحديث', REMOVE:'غير موجود في الملف' };
  const counts = { MATCH:0, ADD:0, UPDATE:0, REMOVE:0 };
  syncState.diff.forEach((row) => { counts[row.status] += 1; });
  sq('#syncMatchCount').textContent = counts.MATCH;
  sq('#syncAddCount').textContent = counts.ADD;
  sq('#syncUpdateCount').textContent = counts.UPDATE;
  sq('#syncRemoveCount').textContent = counts.REMOVE;
  table.innerHTML = syncState.diff.length ? `<table class="technical-table"><thead><tr><th>السهم</th><th>الحالة</th><th>الكمية الحالية</th><th>كمية الوسيط</th><th>المتوسط الحالي</th><th>متوسط الوسيط</th></tr></thead><tbody>${syncState.diff.map((row) => `<tr><td><b>${sEsc(row.symbol)}</b></td><td><span class="sync-badge ${row.status.toLowerCase()}">${labels[row.status]}</span></td><td>${row.current ? sNum(row.current.quantity,2) : '—'}</td><td>${row.incoming ? sNum(row.incoming.quantity,2) : '—'}</td><td>${row.current ? '$'+sNum(row.current.avgPrice) : '—'}</td><td>${row.incoming ? '$'+sNum(row.incoming.avgPrice) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">ارفع كشف المحفظة لعرض المقارنة.</p>';
  const hasChanges = syncState.diff.some((row) => row.status !== 'MATCH');
  sq('#applyPortfolioSync').disabled = !syncState.imported.length || !hasChanges;
  sq('#syncPreviewStatus').textContent = !syncState.imported.length ? '' : hasChanges ? 'تم إنشاء معاينة آمنة. لن تتغير المحفظة إلا بعد الضغط على تطبيق المزامنة.' : 'المحفظة متطابقة بالكامل مع الملف.';
}
function renderSyncHistory() {
  const rows = syncHistory(); const box = sq('#portfolioSyncHistory');
  if (!box) return;
  box.innerHTML = rows.length ? rows.map((row) => `<div class="sync-history-item"><div><b>${sEsc(row.fileName || 'مزامنة محفظة')}</b><small>${sEsc(row.summary)}</small></div><small>${new Date(row.at).toLocaleString('ar-SA')}</small></div>`).join('') : '<p class="muted">لا توجد عمليات مزامنة محفوظة على هذا الجهاز.</p>';
}
async function applySync() {
  await setupSyncClient();
  const changes = syncState.diff.filter((row) => row.status !== 'MATCH');
  if (!changes.length) return;
  const allowRemove = Boolean(sq('#syncAllowRemove')?.checked);
  const removals = changes.filter((row) => row.status === 'REMOVE');
  if (removals.length && !allowRemove) {
    sq('#syncApplyStatus').textContent = 'يوجد سهم غير موجود في الملف. فعّل خيار إزالة المراكز الغائبة أو ألغِ المزامنة.';
    return;
  }
  if (!confirm(`تطبيق ${changes.length} تغييرات على المحفظة؟ سيتم تسجيل التعديلات ولن تُنفذ أي أوامر تداول.`)) return;
  const uid = syncState.session.user.id;
  sq('#syncApplyStatus').textContent = 'جارٍ تطبيق المزامنة وحفظ سجل التدقيق…';
  try {
    for (const change of changes) {
      if (change.status === 'ADD') {
        const { data, error } = await syncState.client.from('portfolio').insert({ user_id: uid, symbol: change.symbol, quantity: change.incoming.quantity, avg_price: change.incoming.avgPrice, notes: 'Portfolio Digital Twin import', updated_at: new Date().toISOString() }).select().single();
        if (error) throw error;
        await syncState.client.from('portfolio_adjustments').insert({ user_id: uid, position_id: data.id, symbol: change.symbol, adjusted_quantity: change.incoming.quantity, adjusted_avg_price: change.incoming.avgPrice, reason: 'إضافة من مزامنة كشف الوسيط', notes: 'Portfolio Digital Twin' });
      }
      if (change.status === 'UPDATE') {
        const { error } = await syncState.client.from('portfolio').update({ quantity: change.incoming.quantity, avg_price: change.incoming.avgPrice, updated_at: new Date().toISOString() }).eq('id', change.current.id).eq('user_id', uid);
        if (error) throw error;
        await syncState.client.from('portfolio_adjustments').insert({ user_id: uid, position_id: change.current.id, symbol: change.symbol, adjusted_quantity: change.incoming.quantity, adjusted_avg_price: change.incoming.avgPrice, reason: 'تحديث من مزامنة كشف الوسيط', notes: `قبل المزامنة: ${change.current.quantity} سهم بمتوسط ${change.current.avgPrice}` });
      }
      if (change.status === 'REMOVE' && allowRemove) {
        await syncState.client.from('portfolio_adjustments').insert({ user_id: uid, position_id: change.current.id, symbol: change.symbol, adjusted_quantity: 0, adjusted_avg_price: change.current.avgPrice, reason: 'إزالة من مزامنة كشف الوسيط', notes: 'السهم غير موجود في ملف الوسيط المستورد' });
        const { error } = await syncState.client.from('portfolio').delete().eq('id', change.current.id).eq('user_id', uid);
        if (error) throw error;
      }
    }
    const cash = parseNumber(sq('#syncCashSar')?.value);
    const investments = parseNumber(sq('#syncInvestmentsSar')?.value);
    if (cash !== null || investments !== null) {
      const actualCash = cash || 0; const actualInvestments = investments || 0;
      await syncState.client.from('portfolio_reconciliations').insert({ user_id: uid, actual_cash_sar: actualCash, actual_investments_sar: actualInvestments, actual_total_sar: actualCash + actualInvestments, notes: 'Portfolio Digital Twin CSV sync', reconciled_at: new Date().toISOString() });
    }
    const summary = changes.map((row) => `${row.symbol}:${row.status}`).join(' · ');
    saveSyncHistory([{ at:new Date().toISOString(), fileName:sq('#syncFileName').textContent, summary }, ...syncHistory()]);
    sq('#syncApplyStatus').textContent = 'تمت المزامنة بنجاح. سيتم تحديث لوحة المحفظة الآن.';
    renderSyncHistory();
    await loadCurrentPortfolio(); buildDiff();
    setTimeout(() => window.location.reload(), 1200);
  } catch (error) { sq('#syncApplyStatus').textContent = `فشلت المزامنة: ${error.message}`; }
}
function downloadTemplate() {
  const content = 'symbol,quantity,avg_price\nAMPL,68.59,8.96\nCRDL,30,1.05\n';
  const blob = new Blob([content], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'asiri-portfolio-template.csv'; link.click(); URL.revokeObjectURL(url);
}
async function initPortfolioSync() {
  const page = sq('#portfoliosync'); if (!page) return;
  renderSyncHistory();
  try { await loadCurrentPortfolio(); }
  catch (error) { sq('#syncPreviewStatus').textContent = error.message; }
  sq('#syncFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      syncState.imported = parsePortfolioCsv(await file.text());
      sq('#syncFileName').textContent = file.name;
      buildDiff();
    } catch (error) { syncState.imported = []; buildDiff(); sq('#syncPreviewStatus').textContent = error.message; }
  });
  sq('#applyPortfolioSync')?.addEventListener('click', applySync);
  sq('#downloadSyncTemplate')?.addEventListener('click', downloadTemplate);
  sq('#refreshSyncCurrent')?.addEventListener('click', async () => { await loadCurrentPortfolio(); if (syncState.imported.length) buildDiff(); });
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initPortfolioSync) : initPortfolioSync();
