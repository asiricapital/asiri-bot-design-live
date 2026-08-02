import fs from 'node:fs';

for (const file of ['patch-opportunity-hardening-v724.js', 'startup-v683.js']) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const patch = fs.readFileSync('patch-opportunity-hardening-v724.js', 'utf8');
const startup = fs.readFileSync('startup-v683.js', 'utf8');

const required = [
  'ASIRI_OPPORTUNITY_HARDENING_V724',
  'ASIRI_DASHBOARD_STRONG_OPPORTUNITIES_ONLY_V724',
  'const userSymbols =',
  'const marketSlots = Math.max(0, 80 - userSymbols.length)',
  'const symbols = [...new Set([...userSymbols, ...marketSymbols])].slice(0, 80)',
  'portfolioAlwaysIncludedInScan: true',
  'dashboardExcludesWatchCandidates: true',
  "const rows = [...(data.goldenQualified || []), ...(data.newOpportunities || [])]",
  'Golden Alert مؤهل خارج المحفظة',
  'فرصة جديدة قوية خارج المحفظة',
  'weakSlotsNotFilled: true'
];
for (const marker of required) {
  if (!patch.includes(marker)) throw new Error(`Missing v7.2.4 contract: ${marker}`);
}

if (patch.includes('...(data.watchCandidates || [])]\n      .sort')) {
  throw new Error('Dashboard still fills best opportunities with watch candidates.');
}

if (!startup.includes("await import('./patch-opportunity-hardening-v724.js');")) {
  throw new Error('Startup does not load v7.2.4 hardening.');
}

const forbidden = [
  /SAXO_ALLOW_TRADING\s*[:=]\s*['"]?true/i,
  /execution_allowed\s*[:=]\s*['"]?true/i,
  /placeOrder\s*\(/
];
for (const pattern of forbidden) {
  if (pattern.test(patch)) throw new Error(`Trading safety contract failed: ${pattern}`);
}

console.log('Opportunity hardening v7.2.4 verified', {
  portfolioReservedInScan: true,
  dashboardUsesStrongRowsOnly: true,
  watchCandidatesExcludedFromTop: true,
  tradingEnabled: false
});
