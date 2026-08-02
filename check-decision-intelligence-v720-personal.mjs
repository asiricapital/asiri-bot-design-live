import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { getHistory, getMarketPulse, getQuote } from './market.js';

const PROJECT_REF = String(process.env.SUPABASE_PROJECT_REF || 'hayrsrlrelkctlwuwwnd').trim();
const MANAGEMENT_TOKEN = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const PORT = Number(process.env.PORT || 3098);
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const CLIENT_DECISION_ID = '72000000-0000-4000-8000-000000000101';
const SYMBOL = 'PLUG';
const EVIDENCE_PATH = '/tmp/decision-intelligence-v720-personal-evidence.json';

if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) throw new Error('Invalid Supabase project ref.');
if (!MANAGEMENT_TOKEN.startsWith('sbp_')) throw new Error('SUPABASE_ACCESS_TOKEN is missing or invalid.');

async function request(url, { method = 'GET', headers = {}, body, expected = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    redirect: 'manual'
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = text || null; }
  if (!expected.includes(response.status)) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || payload?.hint || `HTTP ${response.status}`;
    throw Object.assign(new Error(String(message)), { status: response.status });
  }
  return { status: response.status, payload, headers: response.headers };
}

async function management(pathname, options = {}) {
  return request(`https://api.supabase.com${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${MANAGEMENT_TOKEN}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function keyValue(item) {
  return String(item?.api_key || item?.key || item?.value || '').trim();
}

function selectApiKeys(items) {
  const rows = Array.isArray(items) ? items : [];
  const publicItem = rows.find((item) => String(item?.name || '').toLowerCase() === 'anon')
    || rows.find((item) => String(item?.type || '').toLowerCase() === 'publishable');
  const adminItem = rows.find((item) => String(item?.name || '').toLowerCase() === 'service_role')
    || rows.find((item) => String(item?.type || '').toLowerCase() === 'secret');
  const publishableKey = keyValue(publicItem);
  const serviceRoleKey = keyValue(adminItem);
  if (!publishableKey || !serviceRoleKey) throw new Error('Could not resolve required Supabase API keys.');
  return { publishableKey, serviceRoleKey };
}

async function adminAuth(pathname, serviceRoleKey, options = {}) {
  return request(`${SUPABASE_URL}/auth/v1${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function maskEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const [local, domain] = value.split('@');
  if (!local || !domain) return 'unknown';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function isTestUser(user) {
  const email = String(user?.email || '').toLowerCase();
  const metadata = user?.user_metadata || {};
  return email.includes('asiri-decision-e2e@')
    || email.endsWith('.test')
    || metadata.protected_test_tenant === true
    || String(metadata.purpose || '').includes('decision-intelligence-v720-e2e');
}

async function resolvePersonalUser(serviceRoleKey) {
  const listed = await adminAuth('/admin/users?page=1&per_page=1000', serviceRoleKey);
  const users = Array.isArray(listed.payload?.users) ? listed.payload.users : [];
  const candidates = users
    .filter((user) => user?.id && user?.email && !isTestUser(user) && !user?.banned_until)
    .sort((a, b) => new Date(b.last_sign_in_at || b.updated_at || 0) - new Date(a.last_sign_in_at || a.updated_at || 0));

  if (candidates.length !== 1) {
    const diagnostic = {
      ok: false,
      reason: 'PERSONAL_USER_NOT_UNIQUE',
      candidateCount: candidates.length,
      candidates: candidates.map((user) => ({
        email: maskEmail(user.email),
        confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        hasSignedIn: Boolean(user.last_sign_in_at)
      }))
    };
    await fs.writeFile(EVIDENCE_PATH, `${JSON.stringify(diagnostic, null, 2)}\n`, 'utf8');
    throw new Error(`Expected exactly one non-test registered user, found ${candidates.length}.`);
  }
  return candidates[0];
}

async function createUserSession(user, publishableKey, serviceRoleKey) {
  const generated = await adminAuth('/admin/generate_link', serviceRoleKey, {
    method: 'POST',
    expected: [200],
    body: { type: 'magiclink', email: user.email }
  });
  const tokenHash = generated.payload?.hashed_token || generated.payload?.properties?.hashed_token;
  const emailOtp = generated.payload?.email_otp || generated.payload?.properties?.email_otp;
  if (!tokenHash && !emailOtp) throw new Error('Supabase did not return a verifiable token for the personal account.');

  const attempts = [];
  if (tokenHash) {
    attempts.push({ token_hash: tokenHash, type: 'email' });
    attempts.push({ token_hash: tokenHash, type: 'magiclink' });
  }
  if (emailOtp) attempts.push({ email: user.email, token: emailOtp, type: 'email' });

  for (const body of attempts) {
    try {
      const verified = await request(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        expected: [200],
        headers: { apikey: publishableKey, 'content-type': 'application/json' },
        body
      });
      if (verified.payload?.access_token) return verified.payload.access_token;
    } catch { /* try the next compatible verification form */ }
  }
  throw new Error('Could not establish a temporary authenticated session for the personal account.');
}

function average(values) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function rsi14(closes) {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let index = closes.length - 14; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function buildPersonalSnapshot() {
  const [quote, pulse] = await Promise.all([getQuote(SYMBOL), getMarketPulse()]);
  const now = new Date();
  const period1 = new Date(now.getTime() - 140 * 24 * 60 * 60 * 1000);
  const history = await getHistory(SYMBOL, period1, now);
  const closes = history.map((row) => Number(row.close)).filter(Number.isFinite);
  const volumes = history.map((row) => Number(row.volume)).filter(Number.isFinite);
  const price = Number(quote.price);
  if (!(price > 0) || closes.length < 50) throw new Error(`Insufficient live/history data for ${SYMBOL}.`);

  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const rsi = rsi14(closes);
  const averageVolume20 = average(volumes.slice(-20));
  const volume = Number(quote.volume);
  const volumeRatio = Number.isFinite(volume) && averageVolume20 > 0 ? volume / averageVolume20 : null;
  const previous20High = Math.max(...history.slice(-21, -1).map((row) => Number(row.high)).filter(Number.isFinite));
  const breakoutConfirmed = Number.isFinite(previous20High) && price > previous20High && Number(volumeRatio) >= 1.5;
  const liquidityOk = Number(averageVolume20) >= 1_000_000;

  let technicalScore = 50;
  technicalScore += price > sma20 ? 10 : -10;
  technicalScore += sma20 > sma50 ? 10 : -10;
  technicalScore += rsi != null && rsi >= 45 && rsi <= 65 ? 8 : rsi != null && rsi > 75 ? -12 : 0;
  technicalScore += Number(volumeRatio) >= 1.5 ? 10 : Number(volumeRatio) < 0.7 ? -5 : 0;
  technicalScore += breakoutConfirmed ? 12 : 0;
  technicalScore = Math.round(clamp(technicalScore));

  const decisionAt = new Date().toISOString();
  return {
    client_decision_id: CLIENT_DECISION_ID,
    symbol: SYMBOL,
    decision_at: decisionAt,
    decision_price: price,
    technical_score: technicalScore,
    execution_readiness: 0,
    decision_code: 'PERSONAL_WAIT_SHARIA_AND_CONFIRMATION',
    decision_label: 'انتظار — أول قرار شخصي موثّق',
    action_text: 'مراقبة PLUG فقط — لا شراء ولا بيع في هذه المرحلة.',
    reason: 'تم توثيق أول قرار شخصي بالسعر الفعلي، مع إبقاء بوابة المخاطر مفعلة لأن التحقق الشرعي غير مكتمل ولا توجد موافقة تنفيذ.',
    next_action: 'إعادة تقييم القرار بعد الجلسات المكتملة وقياس العائد وMFE وMAE بعد 1 و3 و7 جلسات.',
    market_score: Number(pulse.score),
    market_regime: String(pulse.regime || 'غير محدد'),
    entry_low: null,
    entry_high: null,
    stop_loss: null,
    target1: null,
    target2: null,
    risk_reward: null,
    volume_ratio: volumeRatio == null ? null : Number(volumeRatio.toFixed(4)),
    breakout_confirmed: breakoutConfirmed,
    liquidity_ok: liquidityOk,
    risk_veto: true,
    sharia_verified: false,
    fomo_guard: true,
    gate_results: [
      { key: 'LIVE_DATA', label: 'توفر سعر فعلي', passed: true, manual: false },
      { key: 'LIQUIDITY', label: 'السيولة', passed: liquidityOk, manual: false },
      { key: 'TECHNICAL_CONFIRMATION', label: 'التأكيد الفني', passed: technicalScore >= 65, manual: false },
      { key: 'SHARIA_VERIFICATION', label: 'التحقق الشرعي', passed: false, manual: true },
      { key: 'NO_EXECUTION', label: 'منع التنفيذ', passed: true, manual: false }
    ],
    candidate_snapshot: {
      personalDecision: true,
      symbol: SYMBOL,
      name: quote.name,
      price,
      session: quote.session,
      sessionLabel: quote.sessionLabel,
      updatedAt: quote.updatedAt,
      source: quote.source,
      sma20,
      sma50,
      rsi14: rsi,
      averageVolume20,
      volumeRatio,
      previous20High,
      technicalScore
    },
    committee_snapshot: {
      verdict: 'WAIT',
      rationale: 'التوثيق شخصي، لكن التنفيذ محظور حتى التحقق الشرعي والتأكيد الفني.',
      executionAllowed: false
    },
    market_snapshot: pulse,
    risk_snapshot: {
      personalAccount: true,
      riskVeto: true,
      shariaVerified: false,
      fomoGuard: true,
      brokerExecution: false
    },
    source_version: '7.2.0-personal-first'
  };
}

async function waitForRuntime(child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Asiri runtime exited before readiness with code ${child.exitCode}.`);
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`, { cache: 'no-store' });
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Asiri runtime did not become ready within 60 seconds.');
}

async function appRequest(pathname, accessToken, { method = 'GET', body, expected = [200] } = {}) {
  return request(`http://127.0.0.1:${PORT}${pathname}`, {
    method,
    expected,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body
  });
}

const keysResponse = await management(`/v1/projects/${PROJECT_REF}/api-keys?reveal=true`);
const { publishableKey, serviceRoleKey } = selectApiKeys(keysResponse.payload);
const personalUser = await resolvePersonalUser(serviceRoleKey);
const accessToken = await createUserSession(personalUser, publishableKey, serviceRoleKey);
const snapshot = await buildPersonalSnapshot();

const runtimeLog = await fs.open('/tmp/decision-intelligence-v720-personal-runtime.log', 'w');
const child = spawn(process.execPath, ['startup-v683.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SAXO_ALLOW_TRADING: 'false',
    DECISION_INTELLIGENCE_EVALUATION_MS: '3600000'
  },
  stdio: ['ignore', runtimeLog.fd, runtimeLog.fd]
});

try {
  await waitForRuntime(child);
  const status = await appRequest('/api/decision-intelligence/status', accessToken);
  const readiness = await appRequest('/api/decision-intelligence/readiness', accessToken);
  if (status.payload?.readOnly !== true || status.payload?.tradingEnabled !== false) throw new Error('Runtime read-only contract failed.');
  if (readiness.payload?.schemaReady !== true) throw new Error('Decision Intelligence schema readiness failed.');

  const inserted = await appRequest('/api/decision-intelligence/decisions', accessToken, {
    method: 'POST', expected: [201], body: snapshot
  });
  if (inserted.payload?.persisted !== 'supabase-rls') throw new Error(`Expected supabase-rls persistence, received ${inserted.payload?.persisted}.`);
  if (!inserted.payload?.row?.id || inserted.payload.row.execution_allowed !== false) throw new Error('Personal snapshot execution lock failed.');

  const evaluation = await appRequest('/api/decision-intelligence/evaluate', accessToken, { method: 'POST', body: {} });
  const summary = await appRequest('/api/decision-intelligence/summary', accessToken);
  const recent = summary.payload?.recent?.find((row) => row.client_decision_id === CLIENT_DECISION_ID);
  if (!recent || recent.id !== inserted.payload.row.id) throw new Error('Personal snapshot was not returned through authenticated RLS reads.');

  const completedHorizons = Array.isArray(recent.outcomes)
    ? recent.outcomes.map((row) => Number(row.horizon_sessions)).filter((value) => [1, 3, 7].includes(value)).sort((a, b) => a - b)
    : [];
  const pendingHorizons = [1, 3, 7].filter((value) => !completedHorizons.includes(value));
  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    projectRef: PROJECT_REF,
    personalAccount: true,
    isolatedTestTenant: false,
    account: maskEmail(personalUser.email),
    accountFingerprint: crypto.createHash('sha256').update(String(personalUser.id)).digest('hex').slice(0, 12),
    symbol: recent.symbol,
    decisionAt: recent.decision_at,
    decisionPrice: Number(recent.decision_price),
    decisionLabel: recent.decision_label,
    technicalScore: Number(recent.technical_score),
    marketScore: recent.market_score == null ? null : Number(recent.market_score),
    marketRegime: recent.market_regime,
    persistence: inserted.payload.persisted,
    storage: summary.payload?.storage,
    schemaReady: readiness.payload.schemaReady,
    executionAllowed: recent.execution_allowed,
    readOnly: summary.payload?.readOnly,
    tradingEnabled: summary.payload?.tradingEnabled,
    evaluatorWrittenThisRun: Number(evaluation.payload?.written || 0),
    completedHorizons,
    pendingHorizons,
    nextEvaluation: 'GitHub Actions schedule after the US market close on weekdays'
  };
  await fs.writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) child.kill('SIGKILL');
  await runtimeLog.close();
}
