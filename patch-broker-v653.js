import fs from 'node:fs/promises';

const path = new URL('./broker-gateway.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');

const oldRecord = `async function recordSnapshot(userId, snapshot, source) {
  lastSnapshots.set(userId, snapshot);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return;
  try {
    await adminRest('broker_snapshots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        snapshot,
        positions_count: snapshot.positions.length,
        is_valid: snapshot.validation.isValid,
        warnings: snapshot.validation.warnings,
        captured_at: snapshot.updatedAt
      }
    });
    await adminRest('broker_sync_runs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        status: 'success',
        positions_count: snapshot.positions.length,
        warnings: snapshot.validation.warnings,
        started_at: snapshot.updatedAt,
        completed_at: new Date().toISOString()
      }
    });
  } catch (error) {
    markStorageError(error);
  }
}`;

const newRecord = `async function recordSnapshot(userId, snapshot, source) {
  lastSnapshots.set(userId, snapshot);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) {
    const result = { ok: false, mode: 'memory-only', error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' };
    console.error('broker-persistence-result', result);
    return result;
  }
  try {
    console.log('broker-persistence-attempt', { userId, source, projectRef: safeProjectRef(cfg.supabaseUrl) });
    await adminRest('broker_snapshots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        snapshot,
        positions_count: snapshot.positions.length,
        is_valid: snapshot.validation.isValid,
        warnings: snapshot.validation.warnings,
        captured_at: snapshot.updatedAt
      }
    });
    await adminRest('broker_sync_runs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        status: 'success',
        positions_count: snapshot.positions.length,
        warnings: snapshot.validation.warnings,
        started_at: snapshot.updatedAt,
        completed_at: new Date().toISOString()
      }
    });
    const [snapshots, runs] = await Promise.all([
      adminRest('broker_snapshots?select=id&user_id=eq.' + encodeURIComponent(userId) + '&order=captured_at.desc&limit=1'),
      adminRest('broker_sync_runs?select=id&user_id=eq.' + encodeURIComponent(userId) + '&order=started_at.desc&limit=1')
    ]);
    const result = { ok: true, mode: 'supabase', snapshotVerified: Boolean(snapshots?.length), syncRunVerified: Boolean(runs?.length) };
    console.log('broker-persistence-result', result);
    return result;
  } catch (error) {
    markStorageError(error);
    const result = { ok: false, mode: 'memory-fallback', error: error.message };
    console.error('broker-persistence-result', result);
    return result;
  }
}`;

if (source.includes(oldRecord)) source = source.replace(oldRecord, newRecord);
else if (!source.includes("console.log('broker-persistence-attempt'")) throw new Error('v6.5.3 recordSnapshot anchor not found');

const helperAnchor = `function markStorageError(error) {
  storageHealth.available = false;
  storageHealth.lastError = error.message;
  console.error('broker-storage-error', { message: error.message });
}`;
const helperReplacement = `${helperAnchor}

function safeProjectRef(url) {
  try { return new URL(url).hostname.split('.')[0] || null; } catch { return null; }
}`;
if (source.includes(helperAnchor) && !source.includes('function safeProjectRef')) source = source.replace(helperAnchor, helperReplacement);

const oldMock = `      const snapshot = mockSnapshot(scenario);
      await recordSnapshot(user.id, snapshot, snapshot.source);
      res.json(snapshot);`;
const newMock = `      const snapshot = mockSnapshot(scenario);
      console.log('broker-mock-request', { userId: user.id, scenario });
      const persistence = await recordSnapshot(user.id, snapshot, snapshot.source);
      res.json({ ...snapshot, persistence });`;
if (source.includes(oldMock)) source = source.replace(oldMock, newMock);
else if (!source.includes("console.log('broker-mock-request'")) throw new Error('v6.5.3 mock route anchor not found');

const routeAnchor = `  app.post('/api/broker/mock/snapshot', async (req, res) => {`;
if (!source.includes("app.post('/api/broker/storage/self-test'")) {
  const selfTestRoute = `  app.post('/api/broker/storage/self-test', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const cfg = config();
      const testSource = 'self-test-' + Date.now();
      const body = {
        user_id: user.id,
        provider: 'saxo',
        environment: cfg.environment,
        source: testSource,
        status: 'diagnostic',
        positions_count: 0,
        warnings: [],
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };
      await adminRest('broker_sync_runs', { method: 'POST', prefer: 'return=minimal', body });
      const rows = await adminRest('broker_sync_runs?select=id,source,status&user_id=eq.' + encodeURIComponent(user.id) + '&source=eq.' + encodeURIComponent(testSource) + '&limit=1');
      const verified = Boolean(rows?.length);
      console.log('broker-storage-self-test', { verified, projectRef: safeProjectRef(cfg.supabaseUrl), keyKind: cfg.supabaseServiceRoleKey.startsWith('sb_secret_') ? 'secret' : 'legacy' });
      res.json({ ok: verified, verified, projectRef: safeProjectRef(cfg.supabaseUrl), keyKind: cfg.supabaseServiceRoleKey.startsWith('sb_secret_') ? 'secret' : 'legacy', error: verified ? null : 'Write returned without a readable row.' });
    } catch (error) {
      markStorageError(error);
      res.status(error.statusCode || 500).json({ ok: false, error: error.message, projectRef: safeProjectRef(config().supabaseUrl) });
    }
  });

`;
  if (source.includes(routeAnchor)) source = source.replace(routeAnchor, selfTestRoute + routeAnchor);
  else throw new Error('v6.5.3 route anchor not found');
}

await fs.writeFile(path, source, 'utf8');

const uiPath = new URL('./v62.js', import.meta.url);
let ui = await fs.readFile(uiPath, 'utf8');
const oldStatus = "status.textContent=`نجح الاختبار التجريبي (${sourceLabelB62(brokerSnapshotB62.source)}): ${brokerSnapshotB62.positions?.length||0} مركزًا، دون أي كتابة على المحفظة.`;";
const newStatus = "const persistence=brokerSnapshotB62.persistence||{};status.textContent=persistence.ok?`نجح الاختبار وحُفظ في Supabase (${sourceLabelB62(brokerSnapshotB62.source)}): ${brokerSnapshotB62.positions?.length||0} مركزًا.`:`نجح Mock في الذاكرة لكن فشل التخزين: ${persistence.error||'لم تصل نتيجة التخزين من الخادم'}`;";
if (ui.includes(oldStatus)) ui = ui.replace(oldStatus, newStatus);
else if (!ui.includes('const persistence=brokerSnapshotB62.persistence')) throw new Error('v6.5.3 UI status anchor not found');
await fs.writeFile(uiPath, ui, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replaceAll('6501', '6530');
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('broker-v6.5.3-patch', { applied: true, directPersistenceDiagnostics: true, uiPersistenceResult: true, cacheVersion: 6530 });
