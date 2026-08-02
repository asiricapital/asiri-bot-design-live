import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const required = [
  'patch-broker-mobile-v722.js',
  'broker-mobile-v722.css',
  'v700-realtime.js',
  'startup-v683.js',
  'bootstrap-v65.js'
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing Broker mobile v7.2.2 file: ${file}`);
}

execFileSync(process.execPath, ['--check', 'patch-broker-mobile-v722.js'], { stdio: 'pipe' });

const patch = fs.readFileSync('patch-broker-mobile-v722.js', 'utf8');
const css = fs.readFileSync('broker-mobile-v722.css', 'utf8');
const realtime = fs.readFileSync('v700-realtime.js', 'utf8');
const startup = fs.readFileSync('startup-v683.js', 'utf8');

const startupOrder = "await import('./patch-broker-ui-v721.js');\nawait import('./patch-broker-mobile-v722.js');\nawait import('./bootstrap-v65.js');";
if (!startup.includes(startupOrder)) throw new Error('Broker mobile patch must load after v7.2.1 UI and before bootstrap');

for (const marker of [
  'ASIRI_BROKER_MOBILE_START_V722',
  'rt700DisclosureV722',
  'broker-v2-roadmap',
  '/broker-mobile-v722.css?v=7220',
  'tradingEnabled: false',
  'executionAllowed: false'
]) {
  if (!patch.includes(marker)) throw new Error(`Broker mobile patch marker missing: ${marker}`);
}

for (const marker of [
  '.rt700-disclosure-v722',
  'body:has(#brokergateway.active)',
  '#brokergateway.active .broker-v2-header',
  'overflow-x: clip',
  '@media (max-width: 680px)',
  '@media (max-width: 420px)'
]) {
  if (!css.includes(marker)) throw new Error(`Broker mobile CSS marker missing: ${marker}`);
}

const placementAnchor = `const anchor = host.querySelector('.page-title') || host.firstElementChild;`;
if (!realtime.includes(placementAnchor)) throw new Error('Saxo realtime baseline placement anchor is missing');

const combined = `${patch}\n${css}`;
if (/SAXO_ALLOW_TRADING\s*=\s*true|executionAllowed\s*:\s*true|execution_allowed\s*:\s*true|\/api\/broker\/(?:order|trade)/i.test(combined)) {
  throw new Error('Broker mobile v7.2.2 must remain read-only');
}

console.log('Broker mobile v7.2.2 checks passed — full-width shell, collapsed diagnostics, preserved realtime and read-only safeguards.');
