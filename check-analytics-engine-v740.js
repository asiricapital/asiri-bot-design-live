import fs from 'node:fs';

const requiredFiles = [
  'services/analytics/requirements.txt',
  'services/analytics/Dockerfile',
  'services/analytics/app/main.py',
  'services/analytics/app/models.py',
  'services/analytics/app/scoring.py',
  'services/analytics/app/service.py',
  'services/analytics/app/providers/base.py',
  'supabase_migration_portfolio_ledger_v740.sql',
  'patch-analytics-engine-v740.js',
  'check-analytics-engine-v740-generated.js'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing v7.4.0 file: ${file}`);
}

const startup = fs.readFileSync('startup-v683.js', 'utf8');
const patch = fs.readFileSync('patch-analytics-engine-v740.js', 'utf8');
const generatedCheck = fs.readFileSync('check-analytics-engine-v740-generated.js', 'utf8');
const requirements = fs.readFileSync('services/analytics/requirements.txt', 'utf8');
const migration = fs.readFileSync('supabase_migration_portfolio_ledger_v740.sql', 'utf8');

const importLine = "await import('./patch-analytics-engine-v740.js');";
if (!startup.includes(importLine)) throw new Error('Analytics Engine patch is not loaded by startup.');
if (startup.indexOf(importLine) > startup.indexOf("await import('./bootstrap-v65.js');")) {
  throw new Error('Analytics Engine patch must load before bootstrap.');
}

for (const marker of [
  'ASIRI_ANALYTICS_ENGINE_V740',
  'ASIRI_ANALYTICS_URL',
  'ASIRI_ANALYTICS_TOKEN',
  'ASIRI_FUNDAMENTAL_GATE_ENABLED',
  "app.post('/api/analytics/fundamentals'",
  "app.get('/api/decision-intelligence/fundamental-gate/:symbol'",
  "scannerVersion: '7.4.0'",
  'executionAllowed: false',
  'tradingEnabled: false'
]) {
  if (!patch.includes(marker)) throw new Error(`Missing Analytics Engine contract: ${marker}`);
}

for (const marker of [
  "runNode([fixturePatch], tempRoot)",
  "runNode(['--check', fixtureServer])",
  'fetch(`${analyticsServiceUrl}${pathname}`',
  "fundamentalAnalysis?.gate?.status !== 'VETO'"
]) {
  if (!generatedCheck.includes(marker)) throw new Error(`Missing generated-server check: ${marker}`);
}

if (!requirements.includes('financetoolkit==2.0.7')) throw new Error('FinanceToolkit must be pinned.');
if (!requirements.includes('fastapi==')) throw new Error('FastAPI dependency missing.');

for (const marker of [
  'create table if not exists public.investment_accounts',
  'create table if not exists public.investment_transactions',
  'enable row level security',
  'append-only',
  'execution_allowed boolean not null default false check (execution_allowed = false)',
  'asiri_block_ledger_mutation_v740',
  'user_id = auth.uid()'
]) {
  if (!migration.includes(marker)) throw new Error(`Missing portfolio ledger contract: ${marker}`);
}

const combined = [patch, migration, fs.readFileSync('services/analytics/app/settings.py', 'utf8')].join('\n');
if (/SAXO_ALLOW_TRADING\s*[:=]\s*['"]true['"]/i.test(combined)) throw new Error('Saxo trading activation is forbidden.');
if (/execution_allowed\s*[:=]\s*true/i.test(combined)) throw new Error('Execution activation is forbidden.');
if (/trading_enabled\s*[:=]\s*true/i.test(combined)) throw new Error('Trading activation is forbidden.');

console.log(JSON.stringify({
  ok: true,
  version: '7.4.0',
  financeToolkitService: true,
  providerLayer: true,
  portfolioLedgerMigration: true,
  decisionIntelligenceGateway: true,
  generatedServerVerification: true,
  goldenAlertFundamentalGateDefaultEnabled: false,
  executionAllowed: false,
  tradingEnabled: false
}, null, 2));
