import crypto from 'node:crypto';
import { getHistory } from './market.js';

const HORIZONS = [1, 3, 7];
const memorySnapshots = new Map();
const memoryOutcomes = new Map();
const evaluatorState = {
  running: false,
  lastStartedAt: null,
  lastCompletedAt: null,
  evaluatedDecisions: 0,
  writtenOutcomes: 0,
  lastError: null
};
let evaluatorTimer = null;

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const finiteOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const sanitizeSymbol = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
const safeText = (value, max = 2000) => String(value || '').trim().slice(0, max) || null;
const safeObject = (value, fallback) => value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
const safeArray = (value) => Array.isArray(value) ? value.slice(0, 50) : [];

function config() {
  return {
    supabaseUrl: String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, ''),
    supabasePublishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim(),
    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    evaluationIntervalMs: Math.max(3_600_000, Number(process.env.DECISION_INTELLIGENCE_EVALUATION_MS || 21_600_000))
  };
}

async function verifyUser(req) {
  const cfg = config();
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('جلسة المستخدم مطلوبة.'), { statusCode: 401 });
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) throw Object.assign(new Error('Supabase authentication is not configured.'), { statusCode: 503 });
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: cfg.supabasePublishableKey, accept: 'application/json' },
    cache: 'no-store'
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) throw Object.assign(new Error('جلسة المستخدم غير صالحة أو منتهية.'), { statusCode: 401 });
  return user;
}

async function adminRest(pathname, { method = 'GET', body = null, prefer = null } = {}) {
  const cfg = config();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) throw new Error('Supabase service role is not configured.');
  const headers = {
    apikey: cfg.supabaseServiceRoleKey,
    authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
    accept: 'application/json'
  };
  if (body !== null) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${pathname}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch { payload = text || null; }
  if (!response.ok) throw new Error(payload?.message || payload?.hint || payload?.details || `Supabase REST failed (${response.status})`);
  return payload;
}

export function sanitizeDecisionSnapshot(input = {}, userId = null) {
  const symbol = sanitizeSymbol(input.symbol);
  const decisionPrice = finiteOrNull(input.decision_price ?? input.decisionPrice);
  if (!symbol) throw new Error('رمز السهم غير صالح.');
  if (!(decisionPrice > 0)) throw new Error('سعر القرار غير صالح.');
  const entryLow = finiteOrNull(input.entry_low ?? input.entryLow);
  const entryHigh = finiteOrNull(input.entry_high ?? input.entryHigh);
  const stopLoss = finiteOrNull(input.stop_loss ?? input.stopLoss);
  const target1 = finiteOrNull(input.target1);
  const target2 = finiteOrNull(input.target2);
  return {
    user_id: userId,
    client_decision_id: /^[0-9a-f-]{36}$/i.test(String(input.client_decision_id || '')) ? input.client_decision_id : crypto.randomUUID(),
    symbol,
    decision_at: input.decision_at && !Number.isNaN(new Date(input.decision_at).getTime()) ? new Date(input.decision_at).toISOString() : new Date().toISOString(),
    decision_price: decisionPrice,
    technical_score: clamp(input.technical_score ?? input.technicalScore),
    execution_readiness: clamp(input.execution_readiness ?? input.executionReadiness),
    decision_code: safeText(input.decision_code ?? input.decisionCode, 80),
    decision_label: safeText(input.decision_label ?? input.decisionLabel, 300) || 'مراجعة',
    action_text: safeText(input.action_text ?? input.actionText, 500),
    reason: safeText(input.reason, 3000),
    next_action: safeText(input.next_action ?? input.nextAction, 1000),
    market_score: finiteOrNull(input.market_score ?? input.marketScore) == null ? null : clamp(input.market_score ?? input.marketScore),
    market_regime: safeText(input.market_regime ?? input.marketRegime, 200),
    entry_low: entryLow,
    entry_high: entryHigh,
    stop_loss: stopLoss,
    target1,
    target2,
    risk_reward: finiteOrNull(input.risk_reward ?? input.riskReward),
    volume_ratio: finiteOrNull(input.volume_ratio ?? input.volumeRatio),
    breakout_confirmed: Boolean(input.breakout_confirmed ?? input.breakoutConfirmed),
    liquidity_ok: Boolean(input.liquidity_ok ?? input.liquidityOk),
    risk_veto: Boolean(input.risk_veto ?? input.riskVeto),
    sharia_verified: Boolean(input.sharia_verified ?? input.shariaVerified),
    fomo_guard: Boolean(input.fomo_guard ?? input.fomoGuard),
    gate_results: safeArray(input.gate_results ?? input.gateResults).map((gate) => ({
      key: safeText(gate?.key, 80),
      label: safeText(gate?.label, 240),
      passed: Boolean(gate?.passed),
      manual: Boolean(gate?.manual)
    })),
    candidate_snapshot: safeObject(input.candidate_snapshot ?? input.candidateSnapshot, {}),
    committee_snapshot: safeObject(input.committee_snapshot ?? input.committeeSnapshot, {}),
    market_snapshot: safeObject(input.market_snapshot ?? input.marketSnapshot, {}),
    risk_snapshot: safeObject(input.risk_snapshot ?? input.riskSnapshot, {}),
    source_version: safeText(input.source_version ?? input.sourceVersion, 40) || '7.2.0',
    execution_allowed: false
  };
}

function memoryKey(userId) {
  if (!memorySnapshots.has(userId)) memorySnapshots.set(userId, []);
  if (!memoryOutcomes.has(userId)) memoryOutcomes.set(userId, []);
  return userId;
}

function storeMemorySnapshot(snapshot) {
  const key = memoryKey(snapshot.user_id);
  const rows = memorySnapshots.get(key);
  const existing = rows.find((row) => row.client_decision_id === snapshot.client_decision_id);
  if (existing) return existing;
  const row = { id: crypto.randomUUID(), ...snapshot, created_at: new Date().toISOString() };
  rows.unshift(row);
  memorySnapshots.set(key, rows.slice(0, 300));
  return row;
}

async function persistSnapshot(snapshot) {
  const memoryRow = storeMemorySnapshot(snapshot);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return { row: memoryRow, persisted: 'memory', warning: 'SUPABASE_SERVICE_ROLE_KEY غير متاح.' };
  try {
    const rows = await adminRest('decision_intelligence_snapshots?on_conflict=user_id,client_decision_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: snapshot
    });
    return { row: rows?.[0] || memoryRow, persisted: 'supabase', warning: null };
  } catch (error) {
    return { row: memoryRow, persisted: 'memory', warning: error.message };
  }
}

async function loadDecisions(userId, limit = 100) {
  const cfg = config();
  if (cfg.supabaseServiceRoleKey) {
    try {
      return await adminRest(`decision_intelligence_snapshots?select=*&user_id=eq.${encodeURIComponent(userId)}&order=decision_at.desc&limit=${Math.max(1, Math.min(300, limit))}`);
    } catch { /* memory fallback */ }
  }
  memoryKey(userId);
  return memorySnapshots.get(userId).slice(0, limit);
}

async function loadOutcomes(userId, limit = 900) {
  const cfg = config();
  if (cfg.supabaseServiceRoleKey) {
    try {
      return await adminRest(`decision_intelligence_outcomes?select=*&user_id=eq.${encodeURIComponent(userId)}&order=evaluated_at.desc&limit=${Math.max(1, Math.min(1500, limit))}`);
    } catch { /* memory fallback */ }
  }
  memoryKey(userId);
  return memoryOutcomes.get(userId).slice(0, limit);
}

function rowTime(row) {
  const value = row?.date || row?.time || row?.timestamp || row?.datetime;
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

function normalizeHistory(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    time: rowTime(row),
    open: finiteOrNull(row.open),
    high: finiteOrNull(row.high),
    low: finiteOrNull(row.low),
    close: finiteOrNull(row.close)
  })).filter((row) => row.time && [row.open, row.high, row.low, row.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

export function computeDecisionOutcomes(decision, historyRows, now = new Date()) {
  const decisionTime = new Date(decision.decision_at).getTime();
  const decisionPrice = Number(decision.decision_price);
  if (!Number.isFinite(decisionTime) || !(decisionPrice > 0)) return [];
  const sessions = normalizeHistory(historyRows).filter((row) => row.time > decisionTime && row.time <= now.getTime());
  return HORIZONS.flatMap((horizon) => {
    if (sessions.length < horizon) return [];
    const window = sessions.slice(0, horizon);
    const final = window.at(-1);
    const maxHigh = Math.max(...window.map((row) => row.high));
    const minLow = Math.min(...window.map((row) => row.low));
    const returnPct = ((final.close - decisionPrice) / decisionPrice) * 100;
    const mfe = ((maxHigh - decisionPrice) / decisionPrice) * 100;
    const mae = ((minLow - decisionPrice) / decisionPrice) * 100;
    const target1 = Number(decision.target1);
    const target2 = Number(decision.target2);
    const stop = Number(decision.stop_loss);
    const hitTarget1 = Number.isFinite(target1) && target1 > 0 && maxHigh >= target1;
    const hitTarget2 = Number.isFinite(target2) && target2 > 0 && maxHigh >= target2;
    const hitStop = Number.isFinite(stop) && stop > 0 && minLow <= stop;
    let outcome = 'FLAT';
    if ((hitTarget1 || hitTarget2) && hitStop) outcome = 'MIXED';
    else if (hitTarget1 || hitTarget2) outcome = 'WIN';
    else if (hitStop) outcome = 'LOSS';
    else if (returnPct >= 1) outcome = 'POSITIVE';
    else if (returnPct <= -1) outcome = 'NEGATIVE';
    return {
      user_id: decision.user_id,
      decision_id: decision.id,
      horizon_sessions: horizon,
      evaluated_at: new Date(final.time).toISOString(),
      evaluation_price: final.close,
      return_pct: returnPct,
      max_favorable_excursion_pct: mfe,
      max_adverse_excursion_pct: mae,
      hit_target1: hitTarget1,
      hit_target2: hitTarget2,
      hit_stop: hitStop,
      outcome_label: outcome,
      source: 'asiri-market-history'
    };
  });
}

async function persistOutcomes(userId, rows) {
  if (!rows.length) return 0;
  const key = memoryKey(userId);
  const memory = memoryOutcomes.get(key);
  for (const row of rows) {
    const index = memory.findIndex((item) => item.decision_id === row.decision_id && item.horizon_sessions === row.horizon_sessions);
    const stored = { id: index >= 0 ? memory[index].id : crypto.randomUUID(), ...row, updated_at: new Date().toISOString() };
    if (index >= 0) memory[index] = stored; else memory.unshift(stored);
  }
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return rows.length;
  try {
    await adminRest('decision_intelligence_outcomes?on_conflict=decision_id,horizon_sessions', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: rows
    });
  } catch { /* memory fallback already updated */ }
  return rows.length;
}

async function evaluateRows(decisions, { force = false } = {}) {
  const grouped = new Map();
  for (const decision of decisions) {
    if (!decision?.id || !decision?.symbol) continue;
    if (!grouped.has(decision.symbol)) grouped.set(decision.symbol, []);
    grouped.get(decision.symbol).push(decision);
  }
  let written = 0;
  for (const [symbol, rows] of grouped.entries()) {
    const oldest = Math.min(...rows.map((row) => new Date(row.decision_at).getTime()).filter(Number.isFinite));
    if (!Number.isFinite(oldest)) continue;
    let history = [];
    try { history = await getHistory(symbol, new Date(oldest - 2 * 86_400_000)); }
    catch { continue; }
    for (const decision of rows) {
      const outcomes = computeDecisionOutcomes(decision, history);
      if (!outcomes.length && !force) continue;
      written += await persistOutcomes(decision.user_id, outcomes);
    }
  }
  return written;
}

async function evaluateUser(userId) {
  const decisions = await loadDecisions(userId, 300);
  const written = await evaluateRows(decisions);
  return { decisions: decisions.length, written };
}

async function evaluateAllDue() {
  if (evaluatorState.running) return;
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return;
  evaluatorState.running = true;
  evaluatorState.lastStartedAt = new Date().toISOString();
  evaluatorState.lastError = null;
  try {
    const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
    const decisions = await adminRest(`decision_intelligence_snapshots?select=*&decision_at=gte.${encodeURIComponent(since)}&order=decision_at.asc&limit=600`);
    evaluatorState.evaluatedDecisions = decisions.length;
    evaluatorState.writtenOutcomes = await evaluateRows(decisions);
    evaluatorState.lastCompletedAt = new Date().toISOString();
  } catch (error) {
    evaluatorState.lastError = error.message;
  } finally {
    evaluatorState.running = false;
  }
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

function summarizeHorizon(outcomes, horizon) {
  const rows = outcomes.filter((row) => Number(row.horizon_sessions) === horizon);
  const positive = rows.filter((row) => Number(row.return_pct) > 0).length;
  const wins = rows.filter((row) => ['WIN', 'POSITIVE'].includes(row.outcome_label)).length;
  return {
    horizon,
    samples: rows.length,
    positiveRate: rows.length ? positive / rows.length * 100 : null,
    winRate: rows.length ? wins / rows.length * 100 : null,
    averageReturnPct: average(rows.map((row) => row.return_pct)),
    averageMfePct: average(rows.map((row) => row.max_favorable_excursion_pct)),
    averageMaePct: average(rows.map((row) => row.max_adverse_excursion_pct))
  };
}

function scoreBucket(value) {
  const score = Number(value);
  if (score >= 88) return '88–100';
  if (score >= 75) return '75–87';
  if (score >= 60) return '60–74';
  return '0–59';
}

function buildCalibration(decisions, outcomes, scoreField, horizon = 7) {
  const outcomeMap = new Map(outcomes.filter((row) => Number(row.horizon_sessions) === horizon).map((row) => [row.decision_id, row]));
  const groups = new Map();
  for (const decision of decisions) {
    const outcome = outcomeMap.get(decision.id);
    if (!outcome) continue;
    const bucket = scoreBucket(decision[scoreField]);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(Number(outcome.return_pct));
  }
  return ['0–59', '60–74', '75–87', '88–100'].map((bucket) => {
    const values = groups.get(bucket) || [];
    return { bucket, samples: values.length, averageReturnPct: average(values), positiveRate: values.length ? values.filter((value) => value > 0).length / values.length * 100 : null };
  });
}

function buildGateImpact(decisions, outcomes, horizon = 7) {
  const outcomeMap = new Map(outcomes.filter((row) => Number(row.horizon_sessions) === horizon).map((row) => [row.decision_id, row]));
  const gates = new Map();
  for (const decision of decisions) {
    const outcome = outcomeMap.get(decision.id);
    if (!outcome) continue;
    for (const gate of safeArray(decision.gate_results)) {
      const key = gate.key || gate.label;
      if (!key) continue;
      if (!gates.has(key)) gates.set(key, { key, label: gate.label || key, passed: [], failed: [] });
      gates.get(key)[gate.passed ? 'passed' : 'failed'].push(Number(outcome.return_pct));
    }
  }
  return [...gates.values()].map((gate) => ({
    key: gate.key,
    label: gate.label,
    passedSamples: gate.passed.length,
    failedSamples: gate.failed.length,
    passedAverageReturnPct: average(gate.passed),
    failedAverageReturnPct: average(gate.failed),
    impactPct: gate.passed.length && gate.failed.length ? average(gate.passed) - average(gate.failed) : null
  })).sort((a, b) => Math.abs(Number(b.impactPct || 0)) - Math.abs(Number(a.impactPct || 0)));
}

export function buildDecisionIntelligenceSummary(decisions = [], outcomes = [], storage = 'memory') {
  const horizons = HORIZONS.map((horizon) => summarizeHorizon(outcomes, horizon));
  const sevenDay = horizons.find((row) => row.horizon === 7);
  return {
    generatedAt: new Date().toISOString(),
    storage,
    readOnly: true,
    tradingEnabled: false,
    totals: {
      decisions: decisions.length,
      evaluatedDecisions: new Set(outcomes.map((row) => row.decision_id)).size,
      outcomes: outcomes.length,
      pendingDecisions: Math.max(0, decisions.length - new Set(outcomes.map((row) => row.decision_id)).size)
    },
    horizons,
    overall: {
      averageSevenSessionReturnPct: sevenDay?.averageReturnPct ?? null,
      sevenSessionPositiveRate: sevenDay?.positiveRate ?? null,
      fomoGuardCount: decisions.filter((row) => row.fomo_guard).length,
      shariaVerifiedCount: decisions.filter((row) => row.sharia_verified).length,
      riskVetoCount: decisions.filter((row) => row.risk_veto).length
    },
    calibration: {
      technicalScore: buildCalibration(decisions, outcomes, 'technical_score'),
      executionReadiness: buildCalibration(decisions, outcomes, 'execution_readiness')
    },
    gateImpact: buildGateImpact(decisions, outcomes).slice(0, 12),
    recent: decisions.slice(0, 12).map((decision) => ({
      ...decision,
      outcomes: outcomes.filter((row) => row.decision_id === decision.id).sort((a, b) => a.horizon_sessions - b.horizon_sessions)
    }))
  };
}

function handlerError(res, error) {
  res.status(error?.statusCode || 500).json({ error: error?.message || 'تعذر تشغيل Decision Intelligence.' });
}

function startEvaluator() {
  if (evaluatorTimer) return;
  const interval = config().evaluationIntervalMs;
  evaluatorTimer = setInterval(() => evaluateAllDue().catch(() => {}), interval);
  evaluatorTimer.unref?.();
  setTimeout(() => evaluateAllDue().catch(() => {}), 15_000).unref?.();
}

export function registerDecisionIntelligence(app) {
  app.get('/api/decision-intelligence/status', (_req, res) => {
    const cfg = config();
    res.json({
      ok: true,
      version: '7.2.0',
      readOnly: true,
      tradingEnabled: false,
      supabaseConfigured: Boolean(cfg.supabaseUrl && cfg.supabaseServiceRoleKey),
      migrationRequired: 'supabase_migration_decision_intelligence_v720.sql',
      evaluationIntervalMs: cfg.evaluationIntervalMs,
      evaluator: evaluatorState
    });
  });

  app.post('/api/decision-intelligence/decisions', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const snapshot = sanitizeDecisionSnapshot(req.body, user.id);
      const result = await persistSnapshot(snapshot);
      res.status(201).json({ ok: true, readOnly: true, tradingEnabled: false, ...result });
    } catch (error) { handlerError(res, error); }
  });

  app.get('/api/decision-intelligence/decisions', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const limit = Math.max(1, Math.min(300, Number(req.query.limit || 100)));
      const rows = await loadDecisions(user.id, limit);
      res.json({ ok: true, rows, count: rows.length, readOnly: true });
    } catch (error) { handlerError(res, error); }
  });

  app.post('/api/decision-intelligence/evaluate', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const result = await evaluateUser(user.id);
      res.json({ ok: true, ...result, evaluator: evaluatorState, readOnly: true, tradingEnabled: false });
    } catch (error) { handlerError(res, error); }
  });

  app.get('/api/decision-intelligence/summary', async (req, res) => {
    try {
      const user = await verifyUser(req);
      if (String(req.query.refresh || '') === '1') await evaluateUser(user.id);
      const [decisions, outcomes] = await Promise.all([loadDecisions(user.id, 300), loadOutcomes(user.id, 1200)]);
      const storage = config().supabaseServiceRoleKey ? 'supabase-or-memory-fallback' : 'memory';
      res.json(buildDecisionIntelligenceSummary(decisions, outcomes, storage));
    } catch (error) { handlerError(res, error); }
  });

  startEvaluator();
  console.log('decision-intelligence-v7.2.0', {
    immutableSnapshots: true,
    horizons: HORIZONS,
    backgroundEvaluation: true,
    tradingEnabled: false
  });
}
