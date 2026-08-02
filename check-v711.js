import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const legacyPath = 'check.js';
const generatedPath = '.check-v711-base.mjs';
const legacy = fs.readFileSync(legacyPath, 'utf8');
const transformed = legacy
  .replace("pkg.version !== '7.1.0'", "pkg.version !== '7.1.1'")
  .replace("Expected Asiri Capital v7.1.0", "Expected Asiri Capital v7.1.1");

if (transformed === legacy) throw new Error('Unable to adapt legacy release check to v7.1.1');
fs.writeFileSync(generatedPath, transformed, 'utf8');
try {
  await import(`${pathToFileURL(`${process.cwd()}/${generatedPath}`).href}?t=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}

const required = [
  'decision-cockpit-v711.js',
  'decision-cockpit-v711.css',
  'patch-decision-cockpit-v711.js',
  '.github/workflows/decision-cockpit-v711.yml'
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing v7.1.1 file: ${file}`);
}

for (const file of ['decision-cockpit-v711.js', 'patch-decision-cockpit-v711.js', 'check-v711.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const startup = fs.readFileSync('startup-v683.js', 'utf8');
const cockpit = fs.readFileSync('decision-cockpit-v711.js', 'utf8');
const css = fs.readFileSync('decision-cockpit-v711.css', 'utf8');
const patch = fs.readFileSync('patch-decision-cockpit-v711.js', 'utf8');

if (pkg.version !== '7.1.1') throw new Error('Package version must be 7.1.1');
if (pkg.scripts?.check !== 'node check-v711.js') throw new Error('v7.1.1 release check must be active');
if (!startup.includes("patch-decision-cockpit-v711.js")) throw new Error('Decision Cockpit v7.1.1 startup patch is not enabled');

const markers = [
  'القرار التنفيذي الآن',
  'dc711TechnicalScore',
  'dc711ReadinessScore',
  'readinessAssessment',
  'FOMO Guard مفعّل',
  'انتظار تراجع — لا تطارد السعر',
  'asiri_dc711_sharia_${symbol}',
  'Technical Score ≥ 88',
  'RVol ≥ 1.15×',
  'R/R ≥ 1.8',
  'Market Pulse ≥ 42',
  'roleLabel',
  'localizeReason',
  "left: width < 520 ? 68 : 74",
  "scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })"
];
for (const marker of markers) {
  if (!cockpit.includes(marker)) throw new Error(`Decision Cockpit v7.1.1 marker missing: ${marker}`);
}

const cssMarkers = [
  '.dc711-executive-strip',
  '.dc711-score-duo',
  '.dc711-sharia-check input{position:absolute;opacity:0',
  '.dc711-checkmark{width:32px;height:32px',
  '.dc711-ltr{display:inline-block;direction:ltr;unicode-bidi:isolate',
  'overflow-x:hidden',
  'scroll-margin-top:210px',
  '@media(max-width:390px)'
];
for (const marker of cssMarkers) {
  if (!css.includes(marker)) throw new Error(`Decision Cockpit mobile CSS marker missing: ${marker}`);
}

if (!patch.includes("const VERSION = '7.1.0'") || !patch.includes("const VERSION = '7.1.1'")) throw new Error('v7.1.1 version transition is incomplete');
if (!patch.includes('decision-cockpit-v711.js?v=7110') || !patch.includes('decision-cockpit-v711.css?v=7110')) throw new Error('v7.1.1 cache bust is incomplete');
if (!patch.includes('assetCacheVersion: 7110') || !patch.includes('tradingEnabled: false')) throw new Error('v7.1.1 safety metadata is incomplete');

const combined = `${cockpit}\n${patch}`;
if (/executionAllowed\s*:\s*true|fetch\([^\n]*(?:order|trade)|app\.(?:post|put|patch|delete)\([^\n]*(?:order|trade)/i.test(combined)) {
  throw new Error('Decision Cockpit v7.1.1 must remain analysis-only');
}

console.log('Asiri Capital v7.1.1 checks passed — executive action, dual scores, FOMO Guard, mobile Sharia card, RTL formulas, localized committee, chart margins and read-only safeguards.');
