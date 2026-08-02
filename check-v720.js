import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { sanitizeDecisionSnapshot, computeDecisionOutcomes, buildDecisionIntelligenceSummary } from './decision-intelligence.js';

const v711Path = 'check-v711.js';
const generatedPath = '.check-v720-base.mjs';
const v711 = fs.readFileSync(v711Path, 'utf8');
const adapted = v711
  .replace(`.replace("pkg.version !== '7.1.0'", "pkg.version !== '7.1.1'")`, `.replace("pkg.version !== '7.1.0'", "pkg.version !== '7.2.0'")`)
  .replace(`.replace("Expected Asiri Capital v7.1.0", "Expected Asiri Capital v7.1.1")`, `.replace("Expected Asiri Capital v7.1.0", "Expected Asiri Capital v7.2.0")`)
  .replace("if (pkg.version !== '7.1.1') throw new Error('Package version must be 7.1.1');", "if (pkg.version !== '7.2.0') throw new Error('Package version must be 7.2.0');")
  .replace("if (pkg.scripts?.check !== 'node check-v711.js') throw new Error('v7.1.1 release check must be active');", "if (pkg.scripts?.check !== 'node check-v720.js') throw new Error('v7.2.0 release check must be active');");
if (adapted === v711 || !adapted.includes("pkg.version !== '7.2.0'")) throw new Error('Unable to adapt v7.1.1 checks for v7.2.0');
fs.writeFileSync(generatedPath, adapted, 'utf8');
try {
  await import(`${pathToFileURL(`${process.cwd()}/${generatedPath}`).href}?t=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}

const required = [
  'decision-intelligence.js',
  'decision-intelligence-v720.js',
  'decision-intelligence-v720.css',
  'patch-decision-intelligence-v720.js',
  'supabase_migration_decision_intelligence_v720.sql',
  '.github/workflows/decision-intelligence-v720.yml'
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing v7.2 file: ${file}`);

for (const file of ['decision-intelligence.js', 'decision-intelligence-v720.js', 'patch-decision-intelligence-v720.js', 'check-v720.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const startup = fs.readFileSync('startup-v683.js', 'utf8');
const server = fs.readFileSync('decision-intelligence.js', 'utf8');
const client = fs.readFileSync('decision-intelligence-v720.js', 'utf8');
const css = fs.readFileSync('decision-intelligence-v720.css', 'utf8');
const patch = fs.readFileSync('patch-decision-intelligence-v720.js', 'utf8');
const migration = fs.readFileSync('supabase_migration_decision_intelligence_v720.sql', 'utf8');

if (pkg.version !== '7.2.0') throw new Error('Package version must be 7.2.0');
if (pkg.scripts?.check !== 'node check-v720.js') throw new Error('v7.2 release check must be active');
if (!startup.includes("patch-decision-intelligence-v720.js")) throw new Error('Decision Intelligence startup patch is not enabled');

const serverMarkers = [
  "app.post('/api/decision-intelligence/decisions'",
  "app.get('/api/decision-intelligence/summary'",
  "app.post('/api/decision-intelligence/evaluate'",
  'computeDecisionOutcomes',
  'buildDecisionIntelligenceSummary',
  'horizon_sessions',
  'max_favorable_excursion_pct',
  'max_adverse_excursion_pct',
  'evaluationIntervalMs',
  'execution_allowed: false',
  'tradingEnabled: false'
];
for (const marker of serverMarkers) if (!server.includes(marker)) throw new Error(`Decision Intelligence server marker missing: ${marker}`);

const clientMarkers = [
  'ذاكرة القرار وقياس الأداء',
  'حفظ ومتابعة الأداء',
  'asiri_di720_pending_decisions',
  '/api/decision-intelligence/decisions',
  '/api/decision-intelligence/summary',
  '/api/decision-intelligence/evaluate',
  'SCORE CALIBRATION',
  'GATE IMPACT',
  'execution_allowed: false'
];
for (const marker of clientMarkers) if (!client.includes(marker)) throw new Error(`Decision Intelligence client marker missing: ${marker}`);

const cssMarkers = ['.di720-panel', '.di720-kpis', '.di720-calibration-row', '.di720-gate-row', '.di720-outcome-grid', '@media(max-width:390px)'];
for (const marker of cssMarkers) if (!css.includes(marker)) throw new Error(`Decision Intelligence CSS marker missing: ${marker}`);

const migrationMarkers = [
  'decision_intelligence_snapshots',
  'decision_intelligence_outcomes',
  "horizon_sessions in (1, 3, 7)",
  'execution_allowed = false',
  'prevent_decision_intelligence_snapshot_mutation',
  'decision_intelligence_snapshots_immutable_update',
  'decision_intelligence_snapshots_immutable_delete',
  'enable row level security'
];
for (const marker of migrationMarkers) if (!migration.includes(marker)) throw new Error(`Decision Intelligence migration marker missing: ${marker}`);

if (!patch.includes("const VERSION = '7.1.1'") || !patch.includes("const VERSION = '7.2.0'")) throw new Error('v7.2 version transition is incomplete');
if (!patch.includes('decision-intelligence-v720.js?v=7200') || !patch.includes('decision-intelligence-v720.css?v=7200')) throw new Error('v7.2 cache bust is incomplete');
if (!patch.includes('tradingEnabled: false')) throw new Error('v7.2 read-only safety metadata is missing');

const snapshot = sanitizeDecisionSnapshot({
  client_decision_id: '11111111-1111-4111-8111-111111111111',
  symbol: 'ampl', decision_price: 10, technical_score: 92, execution_readiness: 80,
  decision_label: 'مراقبة', target1: 11, target2: 12, stop_loss: 9.4,
  gate_results: [{ key: 'volume', label: 'RVol', passed: true }], execution_allowed: true
}, '22222222-2222-4222-8222-222222222222');
if (snapshot.symbol !== 'AMPL' || snapshot.execution_allowed !== false || snapshot.technical_score !== 92) throw new Error('Decision snapshot sanitizer safety fixture failed');

const history = [
  { date: '2026-01-02T21:00:00Z', open: 10, high: 10.6, low: 9.8, close: 10.4 },
  { date: '2026-01-05T21:00:00Z', open: 10.4, high: 11.2, low: 10.2, close: 11.0 },
  { date: '2026-01-06T21:00:00Z', open: 11, high: 11.5, low: 10.8, close: 11.3 },
  { date: '2026-01-07T21:00:00Z', open: 11.3, high: 11.6, low: 11.1, close: 11.4 },
  { date: '2026-01-08T21:00:00Z', open: 11.4, high: 11.9, low: 11.2, close: 11.8 },
  { date: '2026-01-09T21:00:00Z', open: 11.8, high: 12.2, low: 11.6, close: 12.0 },
  { date: '2026-01-12T21:00:00Z', open: 12, high: 12.4, low: 11.8, close: 12.2 }
];
const decision = { id: 'd1', user_id: snapshot.user_id, symbol: 'AMPL', decision_at: '2026-01-01T21:00:00Z', decision_price: 10, target1: 11, target2: 12, stop_loss: 9.4, technical_score: 92, execution_readiness: 80, gate_results: snapshot.gate_results };
const outcomes = computeDecisionOutcomes(decision, history, new Date('2026-01-13T00:00:00Z'));
if (outcomes.length !== 3 || outcomes.map((row) => row.horizon_sessions).join(',') !== '1,3,7') throw new Error('Decision horizon fixture failed');
if (!outcomes.find((row) => row.horizon_sessions === 3)?.hit_target1) throw new Error('Target tracking fixture failed');
if (outcomes.find((row) => row.horizon_sessions === 7)?.return_pct < 20) throw new Error('Seven-session return fixture failed');

const summary = buildDecisionIntelligenceSummary([decision], outcomes, 'fixture');
if (summary.totals.decisions !== 1 || summary.horizons.length !== 3 || summary.tradingEnabled !== false) throw new Error('Decision Intelligence summary fixture failed');
if (!summary.calibration.technicalScore.length || !summary.gateImpact.length) throw new Error('Calibration or gate impact fixture failed');

const combined = `${server}\n${client}\n${patch}`;
if (/executionAllowed\s*:\s*true|execution_allowed\s*:\s*true|app\.(?:post|put|patch|delete)\([^\n]*(?:order|trade)|fetch\([^\n]*(?:order|trade)/i.test(combined)) {
  throw new Error('Decision Intelligence must remain analysis-only and cannot expose trading execution');
}

console.log('Asiri Capital v7.2.0 checks passed — immutable decision memory, 1/3/7-session outcomes, score calibration, gate impact, local queue fallback and read-only safeguards.');
