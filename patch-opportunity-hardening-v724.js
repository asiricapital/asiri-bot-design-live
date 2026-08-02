import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2.4 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');

if (!server.includes('ASIRI_OPPORTUNITY_HARDENING_V724')) {
  const oldUniverse = `  const excludedSet = new Set([...portfolioSet, ...watchSet, ...legacySet]);
  const symbols = [...new Set([...opportunityUniverse, ...portfolioSet, ...watchSet, ...legacySet])].slice(0, 80);`;

  const newUniverse = `  const excludedSet = new Set([...portfolioSet, ...watchSet, ...legacySet]);
  const userSymbols = [...new Set([...portfolioSet, ...watchSet, ...legacySet])];
  const marketSlots = Math.max(0, 80 - userSymbols.length);
  const marketSymbols = opportunityUniverse
    .filter((symbol) => !excludedSet.has(symbol))
    .slice(0, marketSlots);
  const symbols = [...new Set([...userSymbols, ...marketSymbols])].slice(0, 80); // ASIRI_OPPORTUNITY_HARDENING_V724`;

  server = replaceRequired(server, oldUniverse, newUniverse, 'portfolio reservation in scan universe');
  server = replaceRequired(
    server,
    `        doNotFillGoldenSlots: true,
        priceRange: [1, 10],`,
    `        doNotFillGoldenSlots: true,
        portfolioAlwaysIncludedInScan: true,
        dashboardExcludesWatchCandidates: true,
        priceRange: [1, 10],`,
    'selection policy hardening'
  );
  await fs.writeFile(serverPath, server, 'utf8');
}

const uiPath = new URL('./opportunity-sections-v723.js', import.meta.url);
let ui = await fs.readFile(uiPath, 'utf8');

if (!ui.includes('ASIRI_DASHBOARD_STRONG_OPPORTUNITIES_ONLY_V724')) {
  ui = replaceRequired(
    ui,
    `    const rows = [...(data.goldenQualified || []), ...(data.newOpportunities || []), ...(data.watchCandidates || [])]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 3);`,
    `    const rows = [...(data.goldenQualified || []), ...(data.newOpportunities || [])]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 3); // ASIRI_DASHBOARD_STRONG_OPPORTUNITIES_ONLY_V724`,
    'dashboard opportunity sources'
  );

  ui = replaceRequired(
    ui,
    `<small>فرصة جديدة خارج المحفظة</small>`,
    `<small>\${row.candidateAnalysis?.goldenQualified ? 'Golden Alert مؤهل خارج المحفظة' : 'فرصة جديدة قوية خارج المحفظة'}</small>`,
    'dashboard opportunity label'
  );

  ui = replaceRequired(
    ui,
    `لا توجد فرصة جديدة خارج المحفظة تستحق العرض حاليًا.`,
    `لا توجد فرصة قوية أو Golden Alert خارج المحفظة تستحق العرض حاليًا.`,
    'dashboard empty state'
  );

  await fs.writeFile(uiPath, ui, 'utf8');
}

console.log('opportunity-hardening-v7.2.4', {
  portfolioAlwaysScanned: true,
  dashboardWatchCandidatesExcluded: true,
  weakSlotsNotFilled: true,
  executionAllowed: false,
  tradingEnabled: false
});
