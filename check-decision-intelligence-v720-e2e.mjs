import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { getHistory } from './market.js';

const PROJECT_REF = String(process.env.SUPABASE_PROJECT_REF || 'hayrsrlrelkctlwuwwnd').trim();
const MANAGEMENT_TOKEN = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();
const PORT = Number(process.env.PORT || 3097);
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const TEST_EMAIL = `asiri-decision-e2e@${PROJECT_REF}.test`;
const CLIENT_DECISION_ID = '72000000-0000-4000-8000-000000000001';
const DECISION_DATE = '2026-07-01';
const DECISION_AT = `${DECISION_DATE}T21:30:00.000Z`;
const SYMBOL = 'PLUG';
const EVIDENCE_PATH = '/tmp/decision-intelligence-v720-e2e-evidence.json';

if (!/^[a-z0-9]{20}$/.test(PROJECT_REF)) throw new Error('Invalid Supabase project ref.');
if (!MANAGEMENT_TOKEN.startsWith('sbp_')) throw new Error('SUPABASE_ACCESS_TOKEN is missing or invalid.');

async function request(url, { method = 'GET', headers = {}, body, expected = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { accept: 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = text || null; }
  if (!expected.includes(response.status)) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || payload?.hint || `HTTP ${response.status}`;
    throw Object.assign(new Error(String(message)), { status: response.status, payload });
  }
  return { status: response.status, payload };
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
  if (!publishableKey) throw new Error('Could not resolve a publishable/anon API key.');
  if (!serviceRoleKey) throw new Error('Could not resolve a service-role/secret API key.');
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

async function ensureTestUser(serviceRoleKey) {
  const password = `Asiri-E2E-${crypto.randomBytes(24).toString('base64url')}!7`;
  const listed = await adminAuth('/admin/users?page=1&per_page=1000', serviceRoleKey);
  const users = Array.isArray(listed.payload?.users) ? listed.payload.users : [];
  let user = users.find((row) => String(row?.email || '').toLowerCase() === TEST_EMAIL.toLowerCase());
  if (!user) {
    const created = await adminAuth('/admin/users', serviceRoleKey, {
      method: 'POST',
      expected: [200, 201],
      body: {
        email: TEST_EMAIL,
        password,
        email_confirm: true,
        user_metadata: { purpose: 'asiri-decision-intelligence-v720-e2e', protected_test_tenant: true }
      }
    });
    user = created.payload;
  } else {
    const updated = await adminAuth(`/admin/users/${encodeURIComponent(user.id)}`, serviceRoleKey, {
      method: 'PUT',
      expected: [200],
      body: {
        password,
        email_confirm: true,
        user_metadata: { ...(user.user_metadata || {}), purpose: 'asiri-decision-intelligence-v720-e2e', protected_test_tenant: true }
      }
    });
    user = updated.payload;
  }
  if (!user?.id) throw new Error('Could not create or update the dedicated E2E user.');
  return { user, password };
}

async function signIn(publishableKey, password) {
  const signed = await request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    expected: [200],
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: { email: TEST_EMAIL, password }
  });
  if (!signed.payload?.access_token) throw new Error('E2E user sign-in did not return an access token.');
  return signed.payload.access_token;
}

async function resolveDecisionPrice() {
  const history = await getHistory(SYMBOL, new Date(`${DECISION_DATE}T00:00:00.000Z`), new Date('2026-07-04T00:00:00.000Z'));
  const row = history.find((item) => new Date(item.date).toISOString().slice(0, 10) === DECISION_DATE);
  const close = Number(row?.close);
  if (!(close > 0)) throw new Error(`Historical close for ${SYMBOL} on ${DECISION_DATE} is unavailable.`);
  return close;
}

function buildSnapshot(decisionPrice) {
  return {
    client_decision_id: CLIENT_DECISION_ID,
    symbol: SYMBOL,
    decision_at: DECISION_AT,
    decision_price: decisionPrice,
    technical_score: 50,
    execution_readiness: 0,
    decision_code: 'E2E_PRODUCTION_VALIDATION',
    decision_label: 'اختبار دورة قرار إنتاجية معزولة',
    action_text: 'مراقبة فقط — لا شراء ولا بيع',
    reason: 'تحقق إنتاجي آلي من حفظ Snapshot عبر RLS وقياس النتائج بعد 1 و3 و7 جلسات باستخدام سعر إغلاق تاريخي حقيقي.',
    next_action: 'التحقق من Return وMFE وMAE ومنع أي تنفيذ تداولي.',
    market_score: 50,
    market_regime: 'Historical E2E validation',
    entry_low: null,
    entry_high: null,
    stop_loss: Number((decisionPrice * 0.95).toFixed(6)),
    target1: Number((decisionPrice * 1.05).toFixed(6)),
    target2: Number((decisionPrice * 1.10).toFixed(6)),
    risk_reward: null,
    volume_ratio: null,
    breakout_confirmed: false,
    liquidity_ok: true,
    risk_veto: true,
    sharia_verified: false,
    fomo_guard: true,
    gate_results: [
      { key: 'E2E_ISOLATION', label: 'مستخدم اختبار معزول', passed: true, manual: false },
      { key: 'NO_EXECUTION', label: 'منع التنفيذ', passed: true, manual: false },
      { key: 'SHARIA_MANUAL', label: 'التحقق الشرعي اليدوي مطلوب', passed: false, manual: true }
    ],
    candidate_snapshot: { e2e: true, historical: true, symbol: SYMBOL, decisionDate: DECISION_DATE },
    committee_snapshot: { verdict: 'SYSTEM_VALIDATION_ONLY', executionAllowed: false },
    market_snapshot: { source: 'Yahoo Finance historical daily bars' },
    risk_snapshot: { isolatedTestTenant: true, riskVeto: true },
    source_version: '7.2.0-e2e'
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

async function directRest(pathname, key, bearer, { method = 'GET', body, expected = [200] } = {}) {
  return request(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    method,
    expected,
    headers: {
      apikey: key,
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      prefer: 'return=representation'
    },
    body
  });
}

const keysResponse = await management(`/v1/projects/${PROJECT_REF}/api-keys?reveal=true`);
const { publishableKey, serviceRoleKey } = selectApiKeys(keysResponse.payload);
const { user, password } = await ensureTestUser(serviceRoleKey);
const accessToken = await signIn(publishableKey, password);
const decisionPrice = await resolveDecisionPrice();
const snapshot = buildSnapshot(decisionPrice);

const runtimeLog = await fs.open('/tmp/decision-intelligence-v720-e2e-runtime.log', 'w');
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
  if (status.payload?.readOnly !== true || status.payload?.tradingEnabled !== false) throw new Error('Runtime read-only contract failed.');
  if (status.payload?.hardening?.userSessionRls !== true) throw new Error('User-session RLS is not active.');

  const readiness = await appRequest('/api/decision-intelligence/readiness', accessToken);
  if (readiness.payload?.schemaReady !== true) throw new Error('Decision Intelligence schema readiness failed.');

  const firstInsert = await appRequest('/api/decision-intelligence/decisions', accessToken, {
    method: 'POST', expected: [201], body: snapshot
  });
  const duplicateInsert = await appRequest('/api/decision-intelligence/decisions', accessToken, {
    method: 'POST', expected: [201], body: snapshot
  });
  if (firstInsert.payload?.persisted !== 'supabase-rls') throw new Error(`Expected supabase-rls persistence, received ${firstInsert.payload?.persisted}.`);
  if (!firstInsert.payload?.row?.id || firstInsert.payload.row.id !== duplicateInsert.payload?.row?.id) throw new Error('Canonical duplicate lookup did not return the same persisted row.');
  if (firstInsert.payload?.row?.execution_allowed !== false) throw new Error('Snapshot execution lock failed.');

  const decisionId = firstInsert.payload.row.id;
  const listed = await appRequest('/api/decision-intelligence/decisions?limit=300', accessToken);
  const listedRow = listed.payload?.rows?.find((row) => row.client_decision_id === CLIENT_DECISION_ID);
  if (!listedRow || listedRow.id !== decisionId) throw new Error('Persisted snapshot was not returned through authenticated RLS reads.');

  const evaluation = await appRequest('/api/decision-intelligence/evaluate', accessToken, { method: 'POST', body: {} });
  if (Number(evaluation.payload?.written) < 3) throw new Error(`Expected at least 3 evaluated horizons, received ${evaluation.payload?.written}.`);

  const summary = await appRequest('/api/decision-intelligence/summary', accessToken);
  const recent = summary.payload?.recent?.find((row) => row.client_decision_id === CLIENT_DECISION_ID);
  const horizons = Array.isArray(recent?.outcomes) ? recent.outcomes.map((row) => Number(row.horizon_sessions)).sort((a, b) => a - b) : [];
  if (JSON.stringify(horizons) !== JSON.stringify([1, 3, 7])) throw new Error(`Expected outcome horizons [1,3,7], received ${JSON.stringify(horizons)}.`);

  const rlsSnapshots = await directRest(`decision_intelligence_snapshots?select=*&client_decision_id=eq.${CLIENT_DECISION_ID}`, publishableKey, accessToken);
  if (rlsSnapshots.payload?.length !== 1 || rlsSnapshots.payload[0]?.id !== decisionId) throw new Error('Direct RLS snapshot verification failed.');
  const rlsOutcomes = await directRest(`decision_intelligence_outcomes?select=*&decision_id=eq.${decisionId}&order=horizon_sessions.asc`, publishableKey, accessToken);
  if (!Array.isArray(rlsOutcomes.payload) || rlsOutcomes.payload.length !== 3) throw new Error('Direct RLS outcome verification failed.');

  let immutableBlocked = false;
  try {
    await directRest(`decision_intelligence_snapshots?id=eq.${decisionId}`, serviceRoleKey, serviceRoleKey, {
      method: 'PATCH', expected: [200, 204], body: { decision_label: 'MUTATION_SHOULD_FAIL' }
    });
  } catch (error) {
    immutableBlocked = /immutable/i.test(String(error.message)) || Number(error.status) >= 400;
  }
  if (!immutableBlocked) throw new Error('Immutable snapshot update was not blocked.');

  const evidence = {
    ok: true,
    generatedAt: new Date().toISOString(),
    projectRef: PROJECT_REF,
    isolatedTestTenant: true,
    symbol: SYMBOL,
    decisionDate: DECISION_DATE,
    decisionPrice,
    clientDecisionId: CLIENT_DECISION_ID,
    canonicalDecisionId: decisionId,
    persistence: firstInsert.payload.persisted,
    storage: summary.payload?.storage,
    readOnly: summary.payload?.readOnly,
    tradingEnabled: summary.payload?.tradingEnabled,
    schemaReady: readiness.payload.schemaReady,
    canonicalDuplicateLookup: firstInsert.payload.row.id === duplicateInsert.payload.row.id,
    immutableUpdateBlocked: immutableBlocked,
    horizons: rlsOutcomes.payload.map((row) => ({
      sessions: Number(row.horizon_sessions),
      outcome: row.outcome_label,
      evaluationPrice: Number(row.evaluation_price),
      returnPct: Number(row.return_pct),
      mfePct: Number(row.max_favorable_excursion_pct),
      maePct: Number(row.max_adverse_excursion_pct),
      hitTarget1: Boolean(row.hit_target1),
      hitTarget2: Boolean(row.hit_target2),
      hitStop: Boolean(row.hit_stop)
    }))
  };
  await fs.writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) child.kill('SIGKILL');
  await runtimeLog.close();
}
