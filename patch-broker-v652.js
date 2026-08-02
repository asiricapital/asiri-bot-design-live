import fs from 'node:fs/promises';

const path = new URL('./broker-gateway.js', import.meta.url);
let source = await fs.readFile(path, 'utf8');

const serviceRoleExpression = "process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ADMIN_KEY || ''";

const replacements = [
  [
    "    supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\\/$/, ''),\n    supabasePublishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || ''),\n    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),\n    encryptionKey: String(process.env.BROKER_TOKEN_ENCRYPTION_KEY || '')",
    `    supabaseUrl: String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\\/$/, ''),\n    supabasePublishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim(),\n    supabaseServiceRoleKey: String(${serviceRoleExpression}).trim(),\n    encryptionKey: String(process.env.BROKER_TOKEN_ENCRYPTION_KEY || '').trim()`
  ],
  [
    "    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),",
    `    supabaseServiceRoleKey: String(${serviceRoleExpression}).trim(),`
  ],
  [
    "  const headers = {\n    apikey: cfg.supabaseServiceRoleKey,\n    authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,\n    accept: 'application/json'\n  };",
    "  const headers = {\n    apikey: cfg.supabaseServiceRoleKey,\n    accept: 'application/json'\n  };\n  // Legacy service_role keys are JWTs and may be sent as Bearer tokens.\n  // New sb_secret_ keys must only be sent through the apikey header.\n  if (!cfg.supabaseServiceRoleKey.startsWith('sb_secret_')) {\n    headers.authorization = `Bearer ${cfg.supabaseServiceRoleKey}`;\n  }"
  ],
  [
    "  const text = await response.text();\n  const payload = text ? JSON.parse(text) : null;\n  if (!response.ok) throw new Error(payload?.message || payload?.hint || payload?.details || `Supabase REST failed (${response.status})`);",
    "  const text = await response.text();\n  let payload = null;\n  try { payload = text ? JSON.parse(text) : null; } catch { payload = text || null; }\n  if (!response.ok) {\n    const detail = typeof payload === 'string' ? payload : [payload?.message, payload?.details, payload?.hint, payload?.code].filter(Boolean).join(' | ');\n    throw new Error(`Supabase REST ${method} ${pathname} failed (${response.status})${detail ? `: ${detail}` : ''}`);\n  }"
  ],
  [
    "function markStorageError(error) {\n  storageHealth.available = false;\n  storageHealth.lastError = error.message;\n}",
    "function markStorageError(error) {\n  storageHealth.available = false;\n  storageHealth.lastError = error.message;\n  console.error('broker-storage-error', { message: error.message });\n}"
  ]
];

for (const [before, after] of replacements) {
  if (source.includes(before)) source = source.replace(before, after);
  else if (!source.includes(after)) console.warn('broker-v6.5.5-patch-anchor-skipped', before.slice(0, 80));
}

await fs.writeFile(path, source, 'utf8');

const keyName = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY'
  : process.env.SUPABASE_SECRET_KEY ? 'SUPABASE_SECRET_KEY'
  : process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY'
  : process.env.SUPABASE_ADMIN_KEY ? 'SUPABASE_ADMIN_KEY'
  : null;
const keyValue = keyName ? String(process.env[keyName] || '') : '';

console.log('broker-v6.5.5-patch', {
  applied: true,
  supportsSecretKey: true,
  detectedKeyName: keyName,
  hasServiceRole: Boolean(keyValue),
  serviceRoleKind: keyValue.startsWith('sb_secret_') ? 'secret-key' : keyValue ? 'legacy-jwt-or-other' : 'missing'
});
