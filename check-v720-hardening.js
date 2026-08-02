import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'patch-decision-intelligence-v720-hardening.js',
  'patch-decision-intelligence-v720-rls.js',
  'startup-v683.js',
  '.github/workflows/decision-intelligence-v720-hardening.yml'
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing v7.2 hardening file: ${file}`);
}

for (const file of ['patch-decision-intelligence-v720-hardening.js', 'patch-decision-intelligence-v720-rls.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const patch = fs.readFileSync('patch-decision-intelligence-v720-hardening.js', 'utf8');
const rlsPatch = fs.readFileSync('patch-decision-intelligence-v720-rls.js', 'utf8');
const startup = fs.readFileSync('startup-v683.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/decision-intelligence-v720-hardening.yml', 'utf8');

const patchMarkers = [
  'canonical duplicate snapshot lookup',
  'client_decision_id=eq.${encodeURIComponent(snapshot.client_decision_id)}',
  'strict next completed market session filter',
  'decisionSessionDate',
  'strictNextCompletedSession: true',
  'execution_allowed: false',
  'tradingEnabled: false'
];
for (const marker of patchMarkers) {
  if (!patch.includes(marker)) throw new Error(`Hardening marker missing: ${marker}`);
}

const rlsMarkers = [
  'async function userRest(',
  "mode: 'user-session-rls'",
  "persisted: 'supabase-rls'",
  "storageMode: 'user-session-rls'",
  'userSessionRls: true',
  "app.get('/api/decision-intelligence/readiness'",
  'backgroundEvaluatorConfigured',
  'serviceRoleRequiredForUserStorage: false',
  'resolution=ignore-duplicates,return=representation'
];
for (const marker of rlsMarkers) {
  if (!rlsPatch.includes(marker)) throw new Error(`RLS marker missing: ${marker}`);
}

const startupOrder = "await import('./patch-decision-intelligence-v720.js');\nawait import('./patch-decision-intelligence-v720-hardening.js');\nawait import('./patch-decision-intelligence-v720-rls.js');";
if (!startup.includes(startupOrder)) {
  throw new Error('Decision Intelligence patches must load in baseline → hardening → RLS order');
}

if (!workflow.includes('push:') || !workflow.includes('branches: [main]')) {
  throw new Error('Post-merge main verification trigger is missing');
}
if (!workflow.includes('node check-v720-hardening.js')) {
  throw new Error('Hardening verification command is missing');
}
for (const marker of ['canonicalDuplicateLookup', 'strictNextCompletedSession', 'userSessionRls', "storageMode !== 'user-session-rls'", '/api/decision-intelligence/readiness']) {
  if (!workflow.includes(marker)) throw new Error(`Runtime workflow assertion missing: ${marker}`);
}

if (/executionAllowed\s*:\s*true|execution_allowed\s*:\s*true|SAXO_ALLOW_TRADING:\s*["']?true/i.test(`${patch}\n${rlsPatch}\n${workflow}`)) {
  throw new Error('Hardening must remain analysis-only');
}

console.log('Decision Intelligence v7.2 hardening checks passed — canonical IDs, strict next-session outcomes, user-session RLS storage, authenticated schema readiness and read-only safeguards.');
