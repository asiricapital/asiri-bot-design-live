import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'asiri-analytics-v740-'));
const fixturePatch = path.join(tempRoot, 'patch-analytics-engine-v740.js');
const fixtureServer = path.join(tempRoot, 'server.js');

const patchSource = await fs.readFile('patch-analytics-engine-v740.js', 'utf8');
await fs.writeFile(fixturePatch, patchSource, 'utf8');

const serverFixture = `
const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '');
const goldenThreshold = 88;
const goldenMaxAlerts = 5;
const goldenScannerState = {};
const app = { get() {}, post() {} };
function sanitizeSymbol(value) { return String(value || '').toUpperCase(); }

async function scanOpportunitySet(symbols, force = false) {
  return { symbols, force };
}

async function scanGoldenUniverse() {
  const tradable = [];
  const qualified = tradable.filter((row) => row.candidateAnalysis?.goldenQualified && Number(row.candidateAnalysis?.confidence || 0) >= goldenThreshold);
  return qualified;
}

function buildAlert(row, analysis) {
  return {
    payload: {
      action: analysis.decision || 'مراقبة الدخول وعدم مطاردة السعر',
      scannerVersion: '5.7.0'
    }
  };
}
`;
await fs.writeFile(fixtureServer, serverFixture, 'utf8');

function runNode(args, cwd = process.cwd()) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error([
      `Command failed: node ${args.join(' ')}`,
      result.stdout,
      result.stderr
    ].filter(Boolean).join('\n'));
  }
  return result;
}

try {
  runNode(['--check', fixturePatch]);
  runNode([fixturePatch], tempRoot);
  runNode(['--check', fixtureServer]);

  const generated = await fs.readFile(fixtureServer, 'utf8');
  const required = [
    'ASIRI_ANALYTICS_ENGINE_V740',
    "app.get('/api/analytics/status'",
    "app.post('/api/analytics/fundamentals'",
    "app.get('/api/decision-intelligence/fundamental-gate/:symbol'",
    'fetch(`${analyticsServiceUrl}${pathname}`',
    'let qualified = tradable.filter',
    "fundamentalAnalysis?.gate?.status !== 'VETO'",
    "scannerVersion: '7.4.0'",
    'executionAllowed: false',
    'tradingEnabled: false'
  ];
  for (const marker of required) {
    if (!generated.includes(marker)) throw new Error(`Generated server missing marker: ${marker}`);
  }

  if (generated.includes('fetch(\\`')) throw new Error('Generated server retained escaped template delimiters.');
  if (generated.includes('\\${analyticsServiceUrl}')) throw new Error('Generated server retained escaped interpolation.');

  console.log(JSON.stringify({
    ok: true,
    version: '7.4.0',
    generatedServerSyntax: true,
    internalGatewayInterpolation: true,
    fundamentalVetoInjected: true,
    executionAllowed: false,
    tradingEnabled: false
  }, null, 2));
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
