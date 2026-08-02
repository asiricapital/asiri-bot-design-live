import fs from 'node:fs/promises';

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');
const marker = 'ASIRI_ALERT_INSERT_PORTABLE_V672';

if (!server.includes(marker)) {
  const before = [
    'async function adminInsert(table, rows) {',
    "  const r = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=user_id,rule_key`, { method: 'POST', headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });",
    "  if (!r.ok) throw new Error(`Supabase insert ${table}: ${await r.text()}`);",
    '  return r.json();',
    '}'
  ].join('\n');

  const after = [
    'async function adminInsert(table, rows) {',
    '  const list = Array.isArray(rows) ? rows : [rows];',
    '  if (!list.length) return [];',
    '',
    '  async function insertRowsV672(payload) {',
    '    const r = await fetch(`${supabaseUrl}/rest/v1/${table}`, {',
    "      method: 'POST',",
    '      headers: {',
    '        apikey: supabaseServiceRoleKey,',
    '        Authorization: `Bearer ${supabaseServiceRoleKey}`,',
    "        'Content-Type': 'application/json',",
    "        Prefer: 'return=representation'",
    '      },',
    '      body: JSON.stringify(payload)',
    '    });',
    '    if (!r.ok) throw new Error(`Supabase insert ${table}: ${await r.text()}`);',
    '    const data = await r.json();',
    '    return Array.isArray(data) ? data : [data];',
    '  }',
    '',
    "  if (table !== 'alerts') return insertRowsV672(list);",
    '',
    '  const inserted = [];',
    '  for (const row of list) {',
    "    const userId = String(row?.user_id || '').trim();",
    "    const ruleKey = String(row?.rule_key || '').trim();",
    '    if (userId && ruleKey) {',
    '      const existing = await adminFetch(',
    "        'alerts',",
    '        `?select=id&user_id=eq.${encodeURIComponent(userId)}&rule_key=eq.${encodeURIComponent(ruleKey)}&limit=1`',
    '      );',
    '      if (existing.length) continue;',
    '    }',
    '    inserted.push(...await insertRowsV672(row));',
    '  }',
    '  return inserted;',
    `} // ${marker}`
  ].join('\n');

  if (!server.includes(before)) throw new Error('v6.7.2 failed: adminInsert anchor not found');
  server = server.replace(before, after);
}

await fs.writeFile(serverPath, server, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.7.1';", "const VERSION = '6.7.2';");
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('alert-storage-fix-v6.7.2', { portableDeduplication: true, databaseMigrationRequired: false, tradingEnabled: false });
