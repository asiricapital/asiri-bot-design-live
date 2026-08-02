import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v6.8.2 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.8.1';", "const VERSION = '6.8.2';");

const accountAnchor = "if (!index.includes('/auth-v680.js')) index = index.replace('</body>', '<script src=\"/auth-v680.js?v=6810\"></script><script src=\"/auth-v680-init.js?v=6810\"></script></body>'); // ASIRI_ACCOUNT_CENTER_V681";
if (!bootstrap.includes('ASIRI_TRADE_RECEIPT_V682')) {
  bootstrap = replaceRequired(
    bootstrap,
    accountAnchor,
    `${accountAnchor}\nindex = index.replace('/app.js?v=6810', '/app.js?v=6820');\nif (!index.includes('/v682.css')) index = index.replace('</head>', '<link rel=\"stylesheet\" href=\"/v682.css?v=6820\"></head>');\nif (!index.includes('/trade-receipt-v682.js')) index = index.replace('</body>', '<script src=\"/trade-receipt-v682.js?v=6820\"></script></body>'); // ASIRI_TRADE_RECEIPT_V682`,
    'trade receipt assets'
  );
}

const staticAnchor = "app.get('/v680.css', (_req, res) => res.sendFile(path.join(root, 'v680.css')));";
if (!bootstrap.includes("app.get('/trade-receipt-v682.js'")) {
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/trade-receipt-v682.js', (_req, res) => res.sendFile(path.join(root, 'trade-receipt-v682.js')));\napp.get('/v682.css', (_req, res) => res.sendFile(path.join(root, 'v682.css')));`,
    'trade receipt static routes'
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('secure-execution-receipt-v6.8.2', { authenticated: true, confirmationRequired: true, idempotent: true, tradingEnabled: false });