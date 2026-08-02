import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.8.1 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.7.4';", "const VERSION = '6.8.1';");

const cacheAnchor = "index = index.replace(/\\/app\\.js\\?v=\\d+/, '/app.js?v=6740'); // ASIRI_APP_CACHE_V674";
if (!bootstrap.includes('ASIRI_ACCOUNT_CENTER_V681')) {
  bootstrap = replaceRequired(
    bootstrap,
    cacheAnchor,
    `${cacheAnchor}\nindex = index.replace('/app.js?v=6740', '/app.js?v=6810');\nif (!index.includes('/v680.css')) index = index.replace('</head>', '<link rel=\"stylesheet\" href=\"/v680.css?v=6810\"></head>');\nif (!index.includes('/auth-v680.js')) index = index.replace('</body>', '<script src=\"/auth-v680.js?v=6810\"></script><script src=\"/auth-v680-init.js?v=6810\"></script></body>'); // ASIRI_ACCOUNT_CENTER_V681`,
    'account center assets'
  );
}

const staticAnchor = "app.get('/v671.css', (_req, res) => res.sendFile(path.join(root, 'v671.css')));";
if (!bootstrap.includes("app.get('/auth-v680.js'")) {
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/auth-v680.js', (_req, res) => res.sendFile(path.join(root, 'auth-v680.js')));\napp.get('/auth-v680-init.js', (_req, res) => res.sendFile(path.join(root, 'auth-v680-init.js')));\napp.get('/v680.css', (_req, res) => res.sendFile(path.join(root, 'v680.css')));`,
    'account center static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('account-recovery-stable-auth-v6.8.1', { emailLinking: true, existingAccountLogin: true, recoveryCenter: true, tradingEnabled: false });
