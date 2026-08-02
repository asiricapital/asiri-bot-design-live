import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2 hardening failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const intelligencePath = new URL('./decision-intelligence.js', import.meta.url);
let intelligence = await fs.readFile(intelligencePath, 'utf8');

const canonicalLookupMarker = 'client_decision_id=eq.${encodeURIComponent(snapshot.client_decision_id)}';
if (!intelligence.includes(canonicalLookupMarker)) {
  intelligence = replaceRequired(
    intelligence,
    "    return { row: rows?.[0] || memoryRow, persisted: 'supabase', warning: null };",
    "    const persistedRow = rows?.[0] || (await adminRest(`decision_intelligence_snapshots?select=*&user_id=eq.${encodeURIComponent(snapshot.user_id)}&client_decision_id=eq.${encodeURIComponent(snapshot.client_decision_id)}&limit=1`))?.[0] || memoryRow;\n    return { row: persistedRow, persisted: 'supabase', warning: null };",
    'canonical duplicate snapshot lookup'
  );
}

const strictSessionMarker = 'const decisionSessionDate = new Date(decisionTime).toISOString().slice(0, 10);';
if (!intelligence.includes(strictSessionMarker)) {
  intelligence = replaceRequired(
    intelligence,
    '  const sessions = normalizeHistory(historyRows).filter((row) => row.time > decisionTime && row.time <= now.getTime());',
    "  const decisionSessionDate = new Date(decisionTime).toISOString().slice(0, 10);\n  const sessions = normalizeHistory(historyRows).filter((row) => row.time <= now.getTime() && new Date(row.time).toISOString().slice(0, 10) > decisionSessionDate);",
    'strict next completed market session filter'
  );
}

const statusMarker = 'strictNextCompletedSession: true';
if (!intelligence.includes(statusMarker)) {
  intelligence = replaceRequired(
    intelligence,
    "      migrationRequired: 'supabase_migration_decision_intelligence_v720.sql',",
    "      migrationRequired: 'supabase_migration_decision_intelligence_v720.sql',\n      hardening: { canonicalDuplicateLookup: true, strictNextCompletedSession: true },",
    'hardening status metadata'
  );
}

for (const marker of [canonicalLookupMarker, strictSessionMarker, statusMarker, 'execution_allowed: false', 'tradingEnabled: false']) {
  if (!intelligence.includes(marker)) throw new Error(`v7.2 hardening failed: marker missing: ${marker}`);
}

await fs.writeFile(intelligencePath, intelligence, 'utf8');

console.log('asiri-decision-intelligence-v7.2-hardening', {
  canonicalDuplicateLookup: true,
  strictNextCompletedSession: true,
  tradingEnabled: false
});
