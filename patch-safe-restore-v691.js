import fs from 'node:fs/promises';

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');

if (!bootstrap.includes("const VERSION = '6.8.2';")) {
  throw new Error('v6.9.1 safe restore failed: expected v6.8.2 bootstrap version was not found');
}

bootstrap = bootstrap.replace("const VERSION = '6.8.2';", "const VERSION = '6.9.1';");
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('safe-core-restore-v6.9.1', {
  base: 'v6.8.2-known-good',
  accountCenter: true,
  portfolio: true,
  verifiedFeed: true,
  tradeReceipt: true,
  decisionCenterTemporarilyDisabled: true,
  tradingEnabled: false
});
