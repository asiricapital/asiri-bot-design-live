import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const requiredFiles = [
  'patch-broker-ui-v721.js',
  'broker-ui-v721.css',
  'startup-v683.js',
  'ui-pages-v64.js',
  'bootstrap-v65.js'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing Broker UI v7.2.1 file: ${file}`);
}

execFileSync(process.execPath, ['--check', 'patch-broker-ui-v721.js'], { stdio: 'pipe' });

const startup = fs.readFileSync('startup-v683.js', 'utf8');
const patch = fs.readFileSync('patch-broker-ui-v721.js', 'utf8');
const css = fs.readFileSync('broker-ui-v721.css', 'utf8');
const ui = fs.readFileSync('ui-pages-v64.js', 'utf8');
const bootstrap = fs.readFileSync('bootstrap-v65.js', 'utf8');

const patchIndex = startup.indexOf("patch-broker-ui-v721.js");
const bootstrapIndex = startup.indexOf("bootstrap-v65.js");
if (patchIndex < 0) throw new Error('Broker UI v7.2.1 startup patch is not enabled');
if (bootstrapIndex < 0 || patchIndex > bootstrapIndex) throw new Error('Broker UI patch must run before bootstrap');

const requiredPatchMarkers = [
  'ASIRI_BROKER_EXPERIENCE_V2_721',
  'BROKER CONNECTION CENTER',
  'Saxo Gateway',
  'اتصال محكوم وآمن',
  "tradingEnabled: false",
  "executionAllowed: false",
  '/broker-ui-v721.css?v=7210'
];
for (const marker of requiredPatchMarkers) {
  if (!patch.includes(marker)) throw new Error(`Broker UI patch marker missing: ${marker}`);
}

const requiredIds = [
  'brokergateway', 'broker62Connected', 'broker62Env', 'broker62Mode',
  'broker62Last', 'broker62Storage', 'broker62Token', 'broker62Source',
  'broker62ConfigState', 'broker62StorageWarning', 'broker62Connect',
  'broker62Snapshot', 'broker62RefreshStatus', 'broker62Developer',
  'broker62Disconnect', 'broker62ActionStatus', 'broker62MockScenario',
  'broker62RunMock', 'broker62Steps', 'broker62SnapshotEmpty',
  'broker62SnapshotContent', 'broker62SnapshotSource', 'broker62Cash',
  'broker62Available', 'broker62Total', 'broker62PositionCount',
  'broker62Warnings', 'broker62SaxoPositions', 'broker62Match',
  'broker62New', 'broker62Change', 'broker62Missing', 'broker62DiffTable'
];
for (const id of requiredIds) {
  const matches = patch.match(new RegExp(`id=\\"${id}\\"`, 'g')) || [];
  if (matches.length !== 1) throw new Error(`Broker UI must contain exactly one #${id}; found ${matches.length}`);
}

const cssMarkers = [
  "IBM Plex Sans Arabic",
  '.broker-v2-header',
  '.broker-v2-connection-card',
  '.broker-v2-security-card',
  '.broker-v2-actions',
  '.broker-v2-summary',
  '.broker-v2-roadmap',
  '.recon656-center',
  '@media (max-width: 680px)',
  '@media (max-width: 420px)'
];
for (const marker of cssMarkers) {
  if (!css.includes(marker)) throw new Error(`Broker UI CSS marker missing: ${marker}`);
}

const brokerExportPattern = /export const brokerGatewayPage = `[\s\S]*?`;\n\nexport const investmentCommitteePage/;
if (!brokerExportPattern.test(ui) && !ui.includes('ASIRI_BROKER_EXPERIENCE_V2_721')) {
  throw new Error('Current broker page export cannot be upgraded safely');
}
if (!bootstrap.includes("const extraStyles = '") || !bootstrap.includes("app.get('/v65.css'")) {
  throw new Error('Bootstrap anchors required by Broker UI v7.2.1 are missing');
}

const combined = `${patch}\n${css}`;
if (/SAXO_ALLOW_TRADING\s*=\s*true|executionAllowed\s*:\s*true|execution_allowed\s*:\s*true|\/api\/broker\/(?:order|trade)/i.test(combined)) {
  throw new Error('Broker UI v7.2.1 must remain read-only and cannot enable trading');
}

console.log('Broker Connection Experience v7.2.1 checks passed — Arabic typography, premium mobile layout, preserved broker IDs and read-only safeguards.');
