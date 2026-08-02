import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.7.1 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const gatewayPath = new URL('./broker-gateway.js', import.meta.url);
let gateway = await fs.readFile(gatewayPath, 'utf8');
const gatewayMarker = 'ASIRI_REQUESTED_VERIFIED_SYMBOLS_V671';
if (!gateway.includes(gatewayMarker)) {
  gateway = replaceRequired(
    gateway,
    'async function buildVerifiedDiagnosticsV670(userId) {\n  const universe = await loadVerifiedUniverseV670(userId);',
    `async function buildVerifiedDiagnosticsV670(userId, requestedSymbols = []) {\n  const universe = await loadVerifiedUniverseV670(userId);\n  const existingSymbolsV671 = new Set(universe.map((row) => canonicalSymbol(row.symbol)));\n  for (const requested of requestedSymbols.slice(0, 30)) {\n    const symbol = canonicalSymbol(requested);\n    if (symbol && !existingSymbolsV671.has(symbol)) {\n      universe.push({ symbol, quantity: 0, averagePrice: 0, scope: 'requested' });\n      existingSymbolsV671.add(symbol);\n    }\n  } // ${gatewayMarker}`,
    'verified diagnostics function'
  );
  gateway = replaceRequired(
    gateway,
    '      res.json(await buildVerifiedDiagnosticsV670(user.id));',
    `      const requestedSymbolsV671 = String(req.query.symbols || '').split(',').map(canonicalSymbol).filter(Boolean).slice(0, 30);\n      res.json(await buildVerifiedDiagnosticsV670(user.id, requestedSymbolsV671));`,
    'verified diagnostics route'
  );
}
await fs.writeFile(gatewayPath, gateway, 'utf8');

const appPath = new URL('./app.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');
const appMarker = 'ASIRI_UNIFIED_VERIFIED_STATE_V671';
if (!app.includes(appMarker)) {
  app = replaceRequired(
    app,
    "  notificationStatus: { telegramEnabled: false, backgroundAlertsEnabled: false },",
    "  notificationStatus: { telegramEnabled: false, backgroundAlertsEnabled: false },\n  verifiedPrices: new Map(),\n  verifiedPriceRows: [],\n  verifiedPricesAt: 0, // ASIRI_UNIFIED_VERIFIED_STATE_V671",
    'application state'
  );

  const helperAnchor = 'async function refreshAnalysis() {';
  const helper = `function verifiedPriceStatusLabelV671(status) {\n  return ({\n    'saxo-live': 'Saxo LIVE · Verified',\n    'saxo-delayed': 'Saxo Delayed · Verified',\n    'saxo-market': 'Saxo Market · Verified',\n    'saxo-reference': 'Saxo Reference · Verified',\n    'yahoo-fallback': 'Yahoo Fallback · Verified'\n  })[status] || 'Verified Price';\n}\n\nfunction applyVerifiedPriceV671(quote) {\n  if (!quote?.symbol) return quote;\n  const verified = state.verifiedPrices.get(String(quote.symbol).toUpperCase());\n  const price = Number(verified?.preferred?.price);\n  if (!Number.isFinite(price) || price <= 0) return quote;\n  const merged = {\n    ...quote,\n    price,\n    currency: verified.preferred.currency || quote.currency || 'USD',\n    updatedAt: verified.preferred.updatedAt || quote.updatedAt || new Date().toISOString(),\n    source: verifiedPriceStatusLabelV671(verified.preferred.status),\n    verifiedPriceStatus: verified.preferred.status,\n    verifiedPriceSource: verified.preferred.source,\n    verifiedInstrument: verified.instrument || null\n  };\n  if (quote.position) {\n    const quantity = Number(quote.position.quantity || 0);\n    const averagePrice = Number(quote.position.avgPrice ?? quote.position.averagePrice ?? 0);\n    const marketValue = price * quantity;\n    const costValue = averagePrice * quantity;\n    const pnl = marketValue - costValue;\n    merged.analysis = {\n      ...(quote.analysis || {}),\n      marketValue,\n      costValue,\n      pnl,\n      pnlPct: averagePrice > 0 ? ((price / averagePrice) - 1) * 100 : null,\n      stopDistancePct: Number(quote.position.stopLoss) > 0 ? ((price / Number(quote.position.stopLoss)) - 1) * 100 : null\n    };\n  }\n  return merged;\n}\n\nfunction propagateVerifiedPricesV671() {\n  for (const [symbol, quote] of [...state.values.entries()]) state.values.set(symbol, applyVerifiedPriceV671(quote));\n  for (const [symbol, quote] of [...state.watchValues.entries()]) state.watchValues.set(symbol, applyVerifiedPriceV671(quote));\n  state.opportunities = (state.opportunities || []).map(applyVerifiedPriceV671);\n  state.replacements = (state.replacements || []).map(applyVerifiedPriceV671);\n  if (state.marketIntelligence) {\n    state.marketIntelligence.rows = (state.marketIntelligence.rows || []).map(applyVerifiedPriceV671);\n    state.marketIntelligence.top3 = (state.marketIntelligence.top3 || []).map(applyVerifiedPriceV671);\n    if (state.marketIntelligence.golden?.closest) state.marketIntelligence.golden.closest = applyVerifiedPriceV671(state.marketIntelligence.golden.closest);\n  }\n  if (state.values.size) renderPortfolio();\n  if (state.watchlist.length) renderWatchlist();\n  if (state.opportunities.length) renderGolden();\n  if (state.marketIntelligence) renderMarketIntelligence();\n}\n\nasync function fetchVerifiedPricesV671(symbols = [], force = false) {\n  if (!state.session?.access_token) return state.verifiedPrices;\n  const requested = [...new Set((symbols || []).map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))].slice(0, 30);\n  const missing = requested.some((symbol) => !state.verifiedPrices.has(symbol));\n  if (!force && !missing && Date.now() - state.verifiedPricesAt < 5000) return state.verifiedPrices;\n  const query = requested.length ? '?symbols=' + encodeURIComponent(requested.join(',')) : '';\n  try {\n    const response = await fetch('/api/broker/prices/diagnostics' + query + (query ? '&' : '?') + '_=' + Date.now(), {\n      cache: 'no-store',\n      headers: { authorization: 'Bearer ' + state.session.access_token }\n    });\n    const data = await response.json().catch(() => ({}));\n    if (!response.ok) throw new Error(data.error || 'تعذر تحميل الأسعار المعتمدة');\n    state.verifiedPriceRows = Array.isArray(data.rows) ? data.rows : [];\n    state.verifiedPrices.clear();\n    for (const row of state.verifiedPriceRows) {\n      const price = Number(row.preferred?.price);\n      if (row.symbol && Number.isFinite(price) && price > 0) state.verifiedPrices.set(String(row.symbol).toUpperCase(), row);\n    }\n    state.verifiedPricesAt = Date.now();\n    window.dispatchEvent(new CustomEvent('asiri:verified-prices', { detail: data }));\n    propagateVerifiedPricesV671();\n    return state.verifiedPrices;\n  } catch (error) {\n    window.dispatchEvent(new CustomEvent('asiri:verified-prices-error', { detail: { message: error.message } }));\n    throw error;\n  }\n}\n\nwindow.addEventListener('asiri:refresh-verified-prices', () => {\n  const symbols = [...new Set([...(state.positions || []).map((row) => row.symbol), ...(state.watchlist || []).map((row) => row.symbol), ...(state.opportunities || []).map((row) => row.symbol)])];\n  fetchVerifiedPricesV671(symbols, true).catch(console.error);\n});\n\n`;
  app = replaceRequired(app, helperAnchor, helper + helperAnchor, 'verified price helpers');

  app = replaceRequired(
    app,
    `async function refreshAnalysis() {\n  if (!state.positions.length) { state.values.clear(); renderPortfolio(); return; }\n  const r = await fetch('/api/portfolio-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions: state.positions }) });\n  const rows = await r.json();\n  if (!r.ok) throw new Error(rows.error || 'تعذر تحديث المحفظة');\n  state.values.clear(); rows.forEach((q) => state.values.set(q.symbol, q)); renderPortfolio(); renderUrgentActions();\n}`,
    `async function refreshAnalysis() {\n  if (!state.positions.length) { state.values.clear(); renderPortfolio(); return; }\n  const r = await fetch('/api/portfolio-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions: state.positions }) });\n  const rows = await r.json();\n  if (!r.ok) throw new Error(rows.error || 'تعذر تحديث المحفظة');\n  await fetchVerifiedPricesV671(state.positions.map((row) => row.symbol)).catch(console.error);\n  state.values.clear(); rows.map(applyVerifiedPriceV671).forEach((q) => state.values.set(q.symbol, q)); renderPortfolio(); renderUrgentActions();\n}`,
    'portfolio refresh'
  );

  app = replaceRequired(
    app,
    `async function analyzeWatchlist() {\n  state.watchValues.clear();\n  await Promise.all(state.watchlist.slice(0, 20).map(async (w) => {\n    try { const r = await fetch(\`/api/analyze/\${encodeURIComponent(w.symbol)}\`, { cache: 'no-store' }); const q = await r.json(); if (r.ok) state.watchValues.set(w.symbol, q); }\n    catch { /* keep row */ }\n  }));\n  renderWatchlist();\n}`,
    `async function analyzeWatchlist() {\n  state.watchValues.clear();\n  await Promise.all(state.watchlist.slice(0, 20).map(async (w) => {\n    try { const r = await fetch(\`/api/analyze/\${encodeURIComponent(w.symbol)}\`, { cache: 'no-store' }); const q = await r.json(); if (r.ok) state.watchValues.set(w.symbol, q); }\n    catch { /* keep row */ }\n  }));\n  await fetchVerifiedPricesV671(state.watchlist.map((row) => row.symbol)).catch(console.error);\n  for (const [symbol, quote] of [...state.watchValues.entries()]) state.watchValues.set(symbol, applyVerifiedPriceV671(quote));\n  renderWatchlist();\n}`,
    'watchlist refresh'
  );

  app = replaceRequired(
    app,
    `async function analyzeSymbol(symbol) {\n  searchStatus.textContent = \`جارٍ تحليل \${symbol}…\`; stockAnalysis.innerHTML = '';\n  try { const r = await fetch(\`/api/analyze/\${encodeURIComponent(symbol)}\`, { cache: 'no-store' }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'تعذر التحليل'); renderCandidate(data); searchStatus.textContent = \`تم التحديث: \${new Date().toLocaleTimeString('ar-SA')}\`; }\n  catch (e) { searchStatus.textContent = e.message; }\n}`,
    `async function analyzeSymbol(symbol) {\n  searchStatus.textContent = \`جارٍ تحليل \${symbol}…\`; stockAnalysis.innerHTML = '';\n  try {\n    const r = await fetch(\`/api/analyze/\${encodeURIComponent(symbol)}\`, { cache: 'no-store' });\n    let data = await r.json();\n    if (!r.ok) throw new Error(data.error || 'تعذر التحليل');\n    await fetchVerifiedPricesV671([symbol]).catch(console.error);\n    data = applyVerifiedPriceV671(data);\n    renderCandidate(data);\n    searchStatus.textContent = \`تم التحديث: \${new Date().toLocaleTimeString('ar-SA')} · \${data.source || 'المصدر الأساسي'}\`;\n  } catch (e) { searchStatus.textContent = e.message; }\n}`,
    'single stock analysis'
  );

  app = replaceRequired(
    app,
    '    state.opportunities = data.rows || [];',
    `    state.opportunities = data.rows || [];\n    await fetchVerifiedPricesV671(state.opportunities.map((row) => row.symbol)).catch(console.error);\n    state.opportunities = state.opportunities.map(applyVerifiedPriceV671);`,
    'opportunities prices'
  );

  app = replaceRequired(
    app,
    '    state.replacements = data.rows || [];',
    `    state.replacements = data.rows || [];\n    await fetchVerifiedPricesV671(state.replacements.map((row) => row.symbol)).catch(console.error);\n    state.replacements = state.replacements.map(applyVerifiedPriceV671);`,
    'replacement prices'
  );

  app = replaceRequired(
    app,
    'state.marketIntelligence=d;renderMarketIntelligence()',
    `await fetchVerifiedPricesV671((d.rows||[]).map((row)=>row.symbol)).catch(console.error);d.rows=(d.rows||[]).map(applyVerifiedPriceV671);d.top3=(d.top3||[]).map(applyVerifiedPriceV671);if(d.golden?.closest)d.golden.closest=applyVerifiedPriceV671(d.golden.closest);state.marketIntelligence=d;renderMarketIntelligence()`,
    'market intelligence prices'
  );
}
await fs.writeFile(appPath, app, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.7.0';", "const VERSION = '6.7.1';");

const styleAnchor = "if (!index.includes('/v670.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v670.css?v=6700\"></head>', 'verified price stylesheet');";
if (!bootstrap.includes('/v671.css?v=6710')) {
  bootstrap = replaceRequired(bootstrap, styleAnchor, styleAnchor + "\nif (!index.includes('/v671.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v671.css?v=6710\"></head>', 'unified price stylesheet');", 'v671 stylesheet injection');
}
const scriptAnchor = "if (!index.includes('/v670.js')) index = replaceRequired(index, '</body>', '<script src=\"/v670.js?v=6700\" type=\"module\"></script></body>', 'verified price script');";
if (!bootstrap.includes('/v671.js?v=6710')) {
  bootstrap = replaceRequired(bootstrap, scriptAnchor, scriptAnchor + "\nif (!index.includes('/v671.js')) index = replaceRequired(index, '</body>', '<script src=\"/v671.js?v=6710\" type=\"module\"></script></body>', 'unified price script');", 'v671 script injection');
}
const staticAnchor = "app.get('/v670.css', (_req, res) => res.sendFile(path.join(root, 'v670.css')));";
if (!bootstrap.includes("app.get('/v671.js'")) {
  bootstrap = replaceRequired(bootstrap, staticAnchor, staticAnchor + "\napp.get('/v671.js', (_req, res) => res.sendFile(path.join(root, 'v671.js')));\napp.get('/v671.css', (_req, res) => res.sendFile(path.join(root, 'v671.css')));", 'v671 static routes');
}
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('unified-verified-prices-v6.7.1', { portfolio: true, dashboard: true, watchlist: true, opportunities: true, analysis: true, globalStatusBar: true, tradingEnabled: false });
