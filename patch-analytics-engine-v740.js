import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.4.0 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');
const marker = 'ASIRI_ANALYTICS_ENGINE_V740';

if (!server.includes(marker)) {
  const configAnchor = "const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '');";
  const configBlock = `${configAnchor}
const analyticsServiceUrl = String(process.env.ASIRI_ANALYTICS_URL || '').replace(/\\/$/, '');
const analyticsSharedToken = String(process.env.ASIRI_ANALYTICS_TOKEN || '');
const analyticsTimeoutMs = Math.max(5000, Math.min(120000, Number(process.env.ASIRI_ANALYTICS_TIMEOUT_MS || 60000)));
const analyticsEnabled = Boolean(analyticsServiceUrl && analyticsSharedToken);
const fundamentalGateEnabled = analyticsEnabled && String(process.env.ASIRI_FUNDAMENTAL_GATE_ENABLED || 'false').toLowerCase() === 'true'; // ${marker}`;
  server = replaceRequired(server, configAnchor, configBlock, 'analytics configuration');

  const opportunityAnchor = 'async function scanOpportunitySet(symbols, force = false) {';
  const gatewayBlock = `
async function callAsiriAnalytics(pathname, { method = 'GET', body = null } = {}) {
  if (!analyticsEnabled) throw new Error('Asiri Analytics Engine is not configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), analyticsTimeoutMs);
  try {
    const response = await fetch(\`\${analyticsServiceUrl}\${pathname}\`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Asiri-Internal-Token': analyticsSharedToken
      },
      body: body == null ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.detail || payload?.error || \`Analytics HTTP \${response.status}\`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function fundamentalGate(result) {
  const flags = new Set(Array.isArray(result?.risk_flags) ? result.risk_flags : []);
  const severe = [
    'altman_distress_zone',
    'beneish_manipulation_risk',
    'high_debt_to_equity'
  ].filter((flag) => flags.has(flag));
  if (severe.length) return { status: 'VETO', reasons: severe };
  if (Number(result?.score) < 50 || flags.has('insufficient_fundamental_coverage')) {
    return { status: 'REVIEW', reasons: [...flags] };
  }
  return { status: 'PASS', reasons: [] };
}

async function fundamentalResultsFor(symbols) {
  const clean = [...new Set((symbols || []).map(sanitizeSymbol).filter(Boolean))].slice(0, 10);
  if (!clean.length) return new Map();
  const response = await callAsiriAnalytics('/v1/fundamentals', {
    method: 'POST',
    body: { symbols: clean, quarterly: true, include_raw: false }
  });
  return new Map((response.results || []).map((result) => [result.symbol, {
    ...result,
    gate: fundamentalGate(result)
  }]));
}

app.get('/api/analytics/status', async (_req, res) => {
  if (!analyticsEnabled) return res.json({
    enabled: false,
    ready: false,
    fundamentalGateEnabled: false,
    executionAllowed: false,
    tradingEnabled: false
  });
  try {
    const health = await callAsiriAnalytics('/health');
    res.json({
      enabled: true,
      fundamentalGateEnabled,
      ...health,
      executionAllowed: false,
      tradingEnabled: false
    });
  } catch (error) {
    res.status(502).json({
      enabled: true,
      ready: false,
      fundamentalGateEnabled,
      error: error.message,
      executionAllowed: false,
      tradingEnabled: false
    });
  }
});

app.post('/api/analytics/fundamentals', async (req, res) => {
  const symbols = Array.isArray(req.body?.symbols)
    ? req.body.symbols.map(sanitizeSymbol).filter(Boolean).slice(0, 10)
    : [];
  if (!symbols.length) return res.status(400).json({ error: 'أضف رمز سهم واحدًا على الأقل.' });
  if (!analyticsEnabled) return res.status(503).json({ error: 'خدمة التحليل المالي غير مهيأة بعد.' });
  try {
    const result = await callAsiriAnalytics('/v1/fundamentals', {
      method: 'POST',
      body: {
        symbols,
        quarterly: req.body?.quarterly !== false,
        start_date: req.body?.start_date || null,
        include_raw: req.body?.include_raw === true
      }
    });
    res.json({ ...result, executionAllowed: false, tradingEnabled: false });
  } catch (error) {
    res.status(502).json({ error: error.message, executionAllowed: false, tradingEnabled: false });
  }
});

app.get('/api/decision-intelligence/fundamental-gate/:symbol', async (req, res) => {
  const symbol = sanitizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  if (!analyticsEnabled) return res.status(503).json({ error: 'خدمة التحليل المالي غير مهيأة بعد.' });
  try {
    const results = await fundamentalResultsFor([symbol]);
    const analysis = results.get(symbol);
    if (!analysis) return res.status(404).json({ error: 'لا توجد نتيجة مالية متاحة.' });
    res.json({ symbol, analysis, executionAllowed: false, tradingEnabled: false });
  } catch (error) {
    res.status(502).json({ error: error.message, executionAllowed: false, tradingEnabled: false });
  }
});

`;
  server = replaceRequired(server, opportunityAnchor, gatewayBlock + opportunityAnchor, 'analytics gateway');

  const qualifiedAnchor = "    const qualified = tradable.filter((row) => row.candidateAnalysis?.goldenQualified && Number(row.candidateAnalysis?.confidence || 0) >= goldenThreshold);";
  const qualifiedReplacement = `    let qualified = tradable.filter((row) => row.candidateAnalysis?.goldenQualified && Number(row.candidateAnalysis?.confidence || 0) >= goldenThreshold);
    if (fundamentalGateEnabled && qualified.length) {
      const finalists = qualified.slice(0, Math.max(5, goldenMaxAlerts));
      try {
        const fundamentals = await fundamentalResultsFor(finalists.map((row) => row.symbol));
        qualified = finalists
          .map((row) => ({ ...row, fundamentalAnalysis: fundamentals.get(row.symbol) || null }))
          .filter((row) => row.fundamentalAnalysis?.gate?.status !== 'VETO');
      } catch (error) {
        console.error('fundamental-gate', error.message);
        qualified = [];
      }
    }`;
  server = replaceRequired(server, qualifiedAnchor, qualifiedReplacement, 'Golden Alert fundamental gate');

  const payloadAnchor = "          action: analysis.decision || 'مراقبة الدخول وعدم مطاردة السعر',\n          scannerVersion: '5.7.0'";
  const payloadReplacement = "          action: analysis.decision || 'مراقبة الدخول وعدم مطاردة السعر',\n          fundamentalScore: row.fundamentalAnalysis?.score ?? null,\n          fundamentalGate: row.fundamentalAnalysis?.gate?.status ?? (fundamentalGateEnabled ? 'UNAVAILABLE' : 'DISABLED'),\n          fundamentalRiskFlags: row.fundamentalAnalysis?.risk_flags || [],\n          scannerVersion: '7.4.0'";
  server = server.split(payloadAnchor).join(payloadReplacement);

  await fs.writeFile(serverPath, server, 'utf8');
}

console.log('analytics-engine-gateway-v7.4.0', {
  financeToolkitService: true,
  providerLayer: true,
  decisionIntelligenceGateway: true,
  goldenAlertFundamentalGateDefaultEnabled: false,
  executionAllowed: false,
  tradingEnabled: false
});
