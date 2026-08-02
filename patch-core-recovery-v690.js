import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.9.0 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.8.9';", "const VERSION = '6.9.0';");

const guardAsset = `if (!index.includes('/runtime-guard-v689.js')) index = index.replace('</head>', '<script src="/runtime-guard-v689.js?v=6890" defer></script></head>'); // ASIRI_RUNTIME_GUARD_V689`;
if (!bootstrap.includes('ASIRI_CORE_RECOVERY_V690')) {
  bootstrap = replaceRequired(
    bootstrap,
    guardAsset,
    `${guardAsset}\nindex = index.replace('/runtime-guard-v689.js?v=6890', '/runtime-guard-v689.js?v=6900');\nif (!index.includes('/core-recovery-v690.js')) index = index.replace('</head>', '<script src="/core-recovery-v690.js?v=6900" defer></script></head>'); // ASIRI_CORE_RECOVERY_V690`,
    'recovery assets'
  );
}

const guardRoute = `app.get('/runtime-guard-v689.js', (_req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  res.sendFile(path.join(root, 'runtime-guard-v689.js'));\n});`;
if (!bootstrap.includes("app.get('/core-recovery-v690.js'")) {
  bootstrap = replaceRequired(
    bootstrap,
    guardRoute,
    `${guardRoute}\napp.get('/core-recovery-v690.js', (_req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  res.sendFile(path.join(root, 'core-recovery-v690.js'));\n});`,
    'recovery route'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('core-recovery-v6.9.0', { resourceErrorsSeparated: true, supabaseRecovery: true, verifiedFeedRecovery: true, noStore: true });