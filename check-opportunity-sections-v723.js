import fs from 'node:fs';

const requiredFiles = [
  'patch-opportunity-sections-v723.js',
  'opportunity-sections-v723.js',
  'opportunity-sections-v723.css',
  'startup-v683.js'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${file}`);
}

const patch = fs.readFileSync('patch-opportunity-sections-v723.js', 'utf8');
const runtime = fs.readFileSync('opportunity-sections-v723.js', 'utf8');
const css = fs.readFileSync('opportunity-sections-v723.css', 'utf8');
const startup = fs.readFileSync('startup-v683.js', 'utf8');

const patchMarkers = [
  'ASIRI_OPPORTUNITY_SECTIONS_V723',
  'portfolioSet',
  'watchSet',
  '!excludedSet.has(row.symbol)',
  'strongestHoldings',
  'goldenQualified',
  'newOpportunities',
  'watchCandidates',
  'doNotFillGoldenSlots: true',
  "rows: goldenQualified",
  'opportunity-sections-v723.css',
  'opportunity-sections-v723.js'
];
for (const marker of patchMarkers) if (!patch.includes(marker)) throw new Error(`Missing patch contract: ${marker}`);

const runtimeMarkers = [
  'portfolioStrengthResults',
  'goldenQualifiedResults',
  'newOpportunityResults',
  'watchCandidateResults',
  'فرصة جديدة خارج المحفظة',
  'لا يمكن تجهيز الشراء؛ السهم غير مؤهل',
  "analysis.goldenQualified !== true",
  "state.client.from('portfolio').select('symbol')",
  "state.client.from('watchlist').select('symbol')"
];
for (const marker of runtimeMarkers) if (!runtime.includes(marker)) throw new Error(`Missing runtime contract: ${marker}`);

if (!startup.includes("await import('./patch-opportunity-sections-v723.js');")) throw new Error('Startup order missing v7.2.3 patch.');
if (!css.includes('.opportunity-v723-page') || !css.includes('#goldenResults[hidden]')) throw new Error('Opportunity CSS contract missing.');

const forbidden = [
  /SAXO_ALLOW_TRADING\s*[:=]\s*['"]?true/i,
  /execution_allowed\s*[:=]\s*['"]?true/i,
  /auto.?trade/i,
  /placeOrder\s*\(/
];
for (const pattern of forbidden) {
  if (pattern.test(patch) || pattern.test(runtime)) throw new Error(`Trading safety contract failed: ${pattern}`);
}

console.log('Opportunity Sections v7.2.3 contracts verified', {
  portfolioSeparated: true,
  watchlistExcluded: true,
  goldenSlotsNotFilled: true,
  tradingEnabled: false
});
