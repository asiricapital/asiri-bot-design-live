import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2 RLS failed: ${label} anchor not found`);
  return text.replace(before, after);
}

function replaceRegexRequired(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`v7.2 RLS failed: ${label} pattern not found`);
  return text.replace(pattern, replacement);
}

const intelligencePath = new URL('./decision-intelligence.js', import.meta.url);
let intelligence = await fs.readFile(intelligencePath, 'utf8');

if (!intelligence.includes('async function userRest(')) {
  const userRest = `async function userRest(authorization, pathname, { method = 'GET', body = null, prefer = null } = {}) {
  const cfg = config();
  const bearer = String(authorization || '');
  if (!bearer.startsWith('Bearer ')) throw Object.assign(new Error('جلسة المستخدم مطلوبة.'), { statusCode: 401 });
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) throw Object.assign(new Error('Supabase RLS storage is not configured.'), { statusCode: 503 });
  const headers = {
    apikey: cfg.supabasePublishableKey,
    authorization: bearer,
    accept: 'application/json'
  };
  if (body !== null) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const response = await fetch(\`${'${cfg.supabaseUrl}'}/rest/v1/${'${pathname}'}\`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = text || null; }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.hint || payload?.details || \`Supabase RLS REST failed (${'${response.status}'})\`);
    error.statusCode = [401, 403].includes(response.status) ? response.status : 502;
    throw error;
  }
  return payload;
}
`;
  intelligence = replaceRequired(
    intelligence,
    '\nexport function sanitizeDecisionSnapshot',
    `\n${userRest}\nexport function sanitizeDecisionSnapshot`,
    'user-scoped RLS REST client'
  );
}

intelligence = intelligence.replace(
  "const persistenceState = { snapshots: 'unknown', outcomes: 'unknown', lastError: null };",
  "const persistenceState = { mode: 'user-session-rls', snapshots: 'unknown', outcomes: 'unknown', lastError: null };"
);

intelligence = replaceRegexRequired(
  intelligence,
  /async function persistSnapshot\(snapshot\) \{[\s\S]*?\n\}\n\nasync function loadDecisions/,
  `async function persistSnapshot(snapshot, authorization) {
  const memoryRow = storeMemorySnapshot(snapshot);
  const cfg = config();
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    persistenceState.snapshots = 'memory-fallback';
    persistenceState.lastError = 'SUPABASE_URL أو SUPABASE_PUBLISHABLE_KEY غير متاح.';
    return { row: memoryRow, persisted: 'memory', warning: persistenceState.lastError };
  }
  try {
    const rows = await userRest(authorization, 'decision_intelligence_snapshots?on_conflict=user_id,client_decision_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: snapshot
    });
    const persistedRow = rows?.[0] || (await userRest(authorization, \`decision_intelligence_snapshots?select=*&user_id=eq.${'${encodeURIComponent(snapshot.user_id)}'}&client_decision_id=eq.${'${encodeURIComponent(snapshot.client_decision_id)}'}&limit=1\`))?.[0] || memoryRow;
    persistenceState.snapshots = 'supabase-rls';
    persistenceState.lastError = null;
    return { row: persistedRow, persisted: 'supabase-rls', warning: null };
  } catch (error) {
    persistenceState.snapshots = 'memory-fallback';
    persistenceState.lastError = error.message;
    return { row: memoryRow, persisted: 'memory', warning: error.message };
  }
}

async function loadDecisions`,
  'RLS snapshot persistence'
);

intelligence = replaceRegexRequired(
  intelligence,
  /async function loadDecisions\(userId, limit = 100\) \{[\s\S]*?\n\}\n\nasync function loadOutcomes/,
  `async function loadDecisions(userId, limit = 100, authorization = null) {
  const cfg = config();
  if (authorization && cfg.supabaseUrl && cfg.supabasePublishableKey) {
    try {
      const rows = await userRest(authorization, \`decision_intelligence_snapshots?select=*&user_id=eq.${'${encodeURIComponent(userId)}'}&order=decision_at.desc&limit=${'${Math.max(1, Math.min(300, limit))}'}\`);
      persistenceState.snapshots = 'supabase-rls';
      persistenceState.lastError = null;
      return rows;
    } catch (error) {
      persistenceState.snapshots = 'memory-fallback';
      persistenceState.lastError = error.message;
    }
  }
  memoryKey(userId);
  return memorySnapshots.get(userId).slice(0, limit);
}

async function loadOutcomes`,
  'RLS decision reads'
);

intelligence = replaceRegexRequired(
  intelligence,
  /async function loadOutcomes\(userId, limit = 900\) \{[\s\S]*?\n\}\n\nfunction rowTime/,
  `async function loadOutcomes(userId, limit = 900, authorization = null) {
  const cfg = config();
  if (authorization && cfg.supabaseUrl && cfg.supabasePublishableKey) {
    try {
      const rows = await userRest(authorization, \`decision_intelligence_outcomes?select=*&user_id=eq.${'${encodeURIComponent(userId)}'}&order=evaluated_at.desc&limit=${'${Math.max(1, Math.min(1500, limit))}'}\`);
      persistenceState.outcomes = 'supabase-rls';
      persistenceState.lastError = null;
      return rows;
    } catch (error) {
      persistenceState.outcomes = 'memory-fallback';
      persistenceState.lastError = error.message;
    }
  }
  memoryKey(userId);
  return memoryOutcomes.get(userId).slice(0, limit);
}

function rowTime`,
  'RLS outcome reads'
);

intelligence = replaceRegexRequired(
  intelligence,
  /async function evaluateUser\(userId\) \{[\s\S]*?\n\}/,
  `async function evaluateUser(userId, authorization = null) {
  const decisions = await loadDecisions(userId, 300, authorization);
  const written = await evaluateRows(decisions);
  return {
    decisions: decisions.length,
    written,
    outcomePersistence: config().supabaseServiceRoleKey ? 'supabase-service-evaluator' : 'memory-only'
  };
}`,
  'user evaluation RLS reads'
);

intelligence = intelligence
  .replace('const result = await persistSnapshot(snapshot);', 'const result = await persistSnapshot(snapshot, req.headers.authorization);')
  .replace('const rows = await loadDecisions(user.id, limit);', 'const rows = await loadDecisions(user.id, limit, req.headers.authorization);')
  .replace('const result = await evaluateUser(user.id);', 'const result = await evaluateUser(user.id, req.headers.authorization);')
  .replace("if (String(req.query.refresh || '') === '1') await evaluateUser(user.id);", "if (String(req.query.refresh || '') === '1') await evaluateUser(user.id, req.headers.authorization);")
  .replace('loadDecisions(user.id, 300), loadOutcomes(user.id, 1200)', 'loadDecisions(user.id, 300, req.headers.authorization), loadOutcomes(user.id, 1200, req.headers.authorization)');

intelligence = intelligence.replace(
  '      supabaseConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey),',
  "      supabaseConfigured: Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey),\n      storageMode: 'user-session-rls',\n      backgroundEvaluatorConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey),"
);

intelligence = intelligence.replace(
  'hardening: { canonicalDuplicateLookup: true, strictNextCompletedSession: true }',
  'hardening: { canonicalDuplicateLookup: true, strictNextCompletedSession: true, userSessionRls: true }'
);

intelligence = intelligence.replace(
  "const storage = !config().supabaseServiceRoleKey ? 'memory' : (persistenceState.snapshots === 'supabase' && persistenceState.outcomes === 'supabase' ? 'supabase' : 'memory-fallback');",
  "const storage = persistenceState.snapshots === 'supabase-rls' && persistenceState.outcomes === 'supabase-rls' ? 'supabase-rls' : (persistenceState.snapshots === 'memory-fallback' || persistenceState.outcomes === 'memory-fallback' ? 'memory-fallback' : 'memory');"
);

if (!intelligence.includes("app.get('/api/decision-intelligence/readiness'")) {
  intelligence = replaceRequired(
    intelligence,
    "  app.post('/api/decision-intelligence/decisions', async (req, res) => {",
    `  app.get('/api/decision-intelligence/readiness', async (req, res) => {
    try {
      await verifyUser(req);
      const authorization = req.headers.authorization;
      const probes = { snapshots: false, outcomes: false };
      const errors = {};
      try { await userRest(authorization, 'decision_intelligence_snapshots?select=id&limit=1'); probes.snapshots = true; }
      catch (error) { errors.snapshots = error.message; }
      try { await userRest(authorization, 'decision_intelligence_outcomes?select=id&limit=1'); probes.outcomes = true; }
      catch (error) { errors.outcomes = error.message; }
      const cfg = config();
      res.status(probes.snapshots && probes.outcomes ? 200 : 503).json({
        ok: probes.snapshots && probes.outcomes,
        schemaReady: probes.snapshots && probes.outcomes,
        probes,
        errors,
        storageMode: 'user-session-rls',
        backgroundEvaluatorConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey),
        migrationRequired: 'supabase_migration_decision_intelligence_v720.sql',
        readOnly: true,
        tradingEnabled: false
      });
    } catch (error) { handlerError(res, error); }
  });

  app.post('/api/decision-intelligence/decisions', async (req, res) => {`,
    'authenticated migration readiness endpoint'
  );
}

const markers = [
  'async function userRest(',
  "mode: 'user-session-rls'",
  "persisted: 'supabase-rls'",
  'userSessionRls: true',
  "storageMode: 'user-session-rls'",
  "app.get('/api/decision-intelligence/readiness'",
  'backgroundEvaluatorConfigured',
  'execution_allowed: false',
  'tradingEnabled: false'
];
for (const marker of markers) {
  if (!intelligence.includes(marker)) throw new Error(`v7.2 RLS failed: marker missing: ${marker}`);
}

await fs.writeFile(intelligencePath, intelligence, 'utf8');

console.log('asiri-decision-intelligence-v7.2-rls', {
  userSessionRls: true,
  serviceRoleRequiredForUserStorage: false,
  backgroundEvaluatorOptional: true,
  readinessProbe: true,
  tradingEnabled: false
});
