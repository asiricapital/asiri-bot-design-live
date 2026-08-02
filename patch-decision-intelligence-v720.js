import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2.0 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const intelligencePath = new URL('./decision-intelligence.js', import.meta.url);
let intelligence = await fs.readFile(intelligencePath, 'utf8');
if (intelligence.includes("prefer: 'resolution=merge-duplicates,return=representation'")) {
  intelligence = intelligence.replace(
    "prefer: 'resolution=merge-duplicates,return=representation'",
    "prefer: 'resolution=ignore-duplicates,return=representation'"
  );
}
if (!intelligence.includes("prefer: 'resolution=ignore-duplicates,return=representation'")) {
  throw new Error('v7.2.0 failed: immutable snapshot conflict policy is missing');
}

if (!intelligence.includes('const persistenceState = {')) {
  intelligence = replaceRequired(
    intelligence,
    'let evaluatorTimer = null;',
    `let evaluatorTimer = null;\nconst persistenceState = { snapshots: 'unknown', outcomes: 'unknown', lastError: null };`,
    'persistence state declaration'
  );
}

intelligence = intelligence.replace(
  "    return { row: rows?.[0] || memoryRow, persisted: 'supabase', warning: null };",
  "    persistenceState.snapshots = 'supabase'; persistenceState.lastError = null;\n    return { row: rows?.[0] || memoryRow, persisted: 'supabase', warning: null };"
).replace(
  "  } catch (error) {\n    return { row: memoryRow, persisted: 'memory', warning: error.message };\n  }\n}",
  "  } catch (error) {\n    persistenceState.snapshots = 'memory-fallback'; persistenceState.lastError = error.message;\n    return { row: memoryRow, persisted: 'memory', warning: error.message };\n  }\n}"
);

intelligence = intelligence.replace(
  "      return await adminRest(`decision_intelligence_snapshots?select=*&user_id=eq.${encodeURIComponent(userId)}&order=decision_at.desc&limit=${Math.max(1, Math.min(300, limit))}`);\n    } catch { /* memory fallback */ }",
  "      const rows = await adminRest(`decision_intelligence_snapshots?select=*&user_id=eq.${encodeURIComponent(userId)}&order=decision_at.desc&limit=${Math.max(1, Math.min(300, limit))}`);\n      persistenceState.snapshots = 'supabase'; persistenceState.lastError = null;\n      return rows;\n    } catch (error) { persistenceState.snapshots = 'memory-fallback'; persistenceState.lastError = error.message; }"
).replace(
  "      return await adminRest(`decision_intelligence_outcomes?select=*&user_id=eq.${encodeURIComponent(userId)}&order=evaluated_at.desc&limit=${Math.max(1, Math.min(1500, limit))}`);\n    } catch { /* memory fallback */ }",
  "      const rows = await adminRest(`decision_intelligence_outcomes?select=*&user_id=eq.${encodeURIComponent(userId)}&order=evaluated_at.desc&limit=${Math.max(1, Math.min(1500, limit))}`);\n      persistenceState.outcomes = 'supabase'; persistenceState.lastError = null;\n      return rows;\n    } catch (error) { persistenceState.outcomes = 'memory-fallback'; persistenceState.lastError = error.message; }"
);

intelligence = intelligence.replace(
  "      const storage = config().supabaseServiceRoleKey ? 'supabase-or-memory-fallback' : 'memory';\n      res.json(buildDecisionIntelligenceSummary(decisions, outcomes, storage));",
  "      const storage = !config().supabaseServiceRoleKey ? 'memory' : (persistenceState.snapshots === 'supabase' && persistenceState.outcomes === 'supabase' ? 'supabase' : 'memory-fallback');\n      res.json({ ...buildDecisionIntelligenceSummary(decisions, outcomes, storage), persistence: { ...persistenceState } });"
).replace(
  "      evaluator: evaluatorState\n    });",
  "      evaluator: evaluatorState,\n      persistence: { ...persistenceState }\n    });"
);

for (const marker of ["persistenceState.snapshots = 'supabase'", "persistenceState.outcomes = 'supabase'", "'memory-fallback'", "persistence: { ...persistenceState }"]) {
  if (!intelligence.includes(marker)) throw new Error(`v7.2.0 failed: persistence truth marker missing: ${marker}`);
}
await fs.writeFile(intelligencePath, intelligence, 'utf8');

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');
if (!server.includes("from './decision-intelligence.js'")) {
  server = replaceRequired(
    server,
    "import { analyzeCandidate } from './candidate.js';",
    "import { analyzeCandidate } from './candidate.js';\nimport { registerDecisionIntelligence } from './decision-intelligence.js';",
    'Decision Intelligence server import'
  );
}
if (!server.includes('registerDecisionIntelligence(app);')) {
  server = replaceRequired(
    server,
    "app.use(express.json({ limit: '1mb' }));",
    "app.use(express.json({ limit: '1mb' }));\nregisterDecisionIntelligence(app);",
    'Decision Intelligence route registration'
  );
}
await fs.writeFile(serverPath, server, 'utf8');

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');
index = index
  .replace(/\s*<link rel="stylesheet" href="\/decision-intelligence-v720\.css\?v=\d+">/g, '')
  .replace(/\s*<script src="\/decision-intelligence-v720\.js\?v=\d+" defer><\/script>/g, '');
index = replaceRequired(index, '</head>', '<link rel="stylesheet" href="/decision-intelligence-v720.css?v=7200"></head>', 'Decision Intelligence stylesheet');
index = replaceRequired(index, '</body>', '<script src="/decision-intelligence-v720.js?v=7200" defer></script></body>', 'Decision Intelligence script');
await fs.writeFile(indexPath, index, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.1.1';", "const VERSION = '7.2.0';", 'version');

const legacyStyleAnchor = "const styleNeedle = '<link rel=\"stylesheet\" href=\"/style.css?v=5700\">';";
const adaptiveStyleAnchor = "const styleNeedle = index.includes('/style.css?v=5800') ? '<link rel=\"stylesheet\" href=\"/style.css?v=5800\">' : '<link rel=\"stylesheet\" href=\"/style.css?v=5700\">';";
if (bootstrap.includes(legacyStyleAnchor)) bootstrap = bootstrap.replace(legacyStyleAnchor, adaptiveStyleAnchor);
else if (!bootstrap.includes(adaptiveStyleAnchor)) throw new Error('v7.2.0 failed: adaptive stylesheet anchor is missing');

if (!bootstrap.includes("app.get('/decision-intelligence-v720.js'")) {
  const anchor = "app.get('/decision-cockpit-v711.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-cockpit-v711.css')); });";
  bootstrap = replaceRequired(
    bootstrap,
    anchor,
    `${anchor}\napp.get('/decision-intelligence-v720.js', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-intelligence-v720.js')); });\napp.get('/decision-intelligence-v720.css', (_req, res) => { res.setHeader('Cache-Control', 'no-store, max-age=0'); res.sendFile(path.join(root, 'decision-intelligence-v720.css')); });`,
    'Decision Intelligence static routes'
  );
}
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('asiri-decision-intelligence-v7.2.0', {
  immutableSnapshots: true,
  immutableConflictPolicy: 'ignore-duplicates',
  verifiedPersistenceIndicator: true,
  outcomeHorizons: [1, 3, 7],
  scoreCalibration: true,
  gateImpactAnalytics: true,
  localQueueFallback: true,
  backgroundEvaluation: true,
  adaptiveStylesheetAnchor: true,
  assetCacheVersion: 7200,
  tradingEnabled: false
});
