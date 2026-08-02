import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.0.0 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '6.9.1';", "const VERSION = '7.0.0';", 'version');

const configAnchor = `const configNeedle = "app.get('/api/config', (_req, res) => res.json({";`;
if (!bootstrap.includes('ASIRI_SAXO_REALTIME_SERVER_V700')) {
  const realtimeServerPatch = `const realtimeImportNeedleV700 = "import { analyzeCandidate } from './candidate.js';";
if (!source.includes("from './saxo-realtime.js'")) {
  source = replaceRequired(source, realtimeImportNeedleV700, \`${'${realtimeImportNeedleV700}'}\\nimport { registerSaxoRealtime } from './saxo-realtime.js';\`, 'Saxo real-time server import');
}
if (!source.includes('registerSaxoRealtime(app);')) {
  source = replaceRequired(source, 'registerBrokerGateway(app);', 'registerBrokerGateway(app);\\nregisterSaxoRealtime(app);', 'Saxo real-time registration');
} // ASIRI_SAXO_REALTIME_SERVER_V700

`;
  bootstrap = replaceRequired(bootstrap, configAnchor, realtimeServerPatch + configAnchor, 'real-time server injection');
}

const scopedAnchor = 'const scopedQueries = [';
if (!bootstrap.includes('ASIRI_SAXO_REALTIME_ASSETS_V700')) {
  const assetsPatch = `if (!index.includes('/v700-realtime.css')) index = index.replace('</head>', '<link rel="stylesheet" href="/v700-realtime.css?v=7000"></head>');
if (!index.includes('/v700-realtime.js')) index = index.replace('</body>', '<script src="/v700-realtime.js?v=7000" defer></script></body>'); // ASIRI_SAXO_REALTIME_ASSETS_V700

`;
  bootstrap = replaceRequired(bootstrap, scopedAnchor, assetsPatch + scopedAnchor, 'real-time assets injection');
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('saxo-realtime-v7.0.0', {
  websocket: true,
  symbols: ['AMPL', 'CRDL'],
  readOnly: true,
  sseBridge: true,
  staleGuardSeconds: 15,
  tradingEnabled: false
});
