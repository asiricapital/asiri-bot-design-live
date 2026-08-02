import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2.3 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

function replaceRange(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`v7.2.3 failed: ${label} range not found`);
  return text.slice(0, start) + replacement + text.slice(end);
}

const serverPath = new URL('./server.js', import.meta.url);
let server = await fs.readFile(serverPath, 'utf8');

if (!server.includes('ASIRI_OPPORTUNITY_SECTIONS_V723')) {
  const opportunityReplacement = String.raw`async function scanOpportunitySet(symbols, force = false) {
  const results = [];
  const batchSize = 8;
  for (let index = 0; index < symbols.length; index += batchSize) {
    const batch = symbols.slice(index, index + batchSize);
    const settled = await Promise.allSettled(batch.map(async (symbol) => {
      const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol, force)]);
      return { ...quote, technicals, candidateAnalysis: analyzeCandidate(quote, technicals, marketPulse) };
    }));
    for (const item of settled) if (item.status === 'fulfilled') results.push(item.value);
  }
  return results;
}

function candidateScore(row) {
  return Number(row?.candidateAnalysis?.confidence ?? row?.candidateAnalysis?.asiriScore ?? 0);
}

app.get('/api/opportunities', async (req, res) => {
  const portfolioSet = new Set(String(req.query.portfolio || '').split(',').map(sanitizeSymbol).filter(Boolean));
  const watchSet = new Set(String(req.query.watchlist || '').split(',').map(sanitizeSymbol).filter(Boolean));
  const legacySet = new Set(String(req.query.symbols || '').split(',').map(sanitizeSymbol).filter(Boolean));
  const excludedSet = new Set([...portfolioSet, ...watchSet, ...legacySet]);
  const symbols = [...new Set([...opportunityUniverse, ...portfolioSet, ...watchSet, ...legacySet])].slice(0, 80);

  try {
    const scannedRows = await scanOpportunitySet(symbols);
    const ranked = scannedRows
      .filter((row) => Number.isFinite(Number(row.price)))
      .sort((a, b) => candidateScore(b) - candidateScore(a));

    const lowPriceLiquid = ranked
      .filter((row) => Number(row.price) >= 1 && Number(row.price) <= 10)
      .filter((row) => row.candidateAnalysis?.liquidityOk === true);

    const externalPool = lowPriceLiquid
      .filter((row) => !excludedSet.has(row.symbol))
      .filter((row) => candidateScore(row) >= 60);

    const goldenQualified = externalPool
      .filter((row) => row.candidateAnalysis?.goldenQualified === true)
      .filter((row) => candidateScore(row) >= goldenThreshold)
      .slice(0, 3);

    const newOpportunities = externalPool
      .filter((row) => row.candidateAnalysis?.goldenQualified !== true)
      .filter((row) => candidateScore(row) >= 78)
      .slice(0, 5);

    const watchCandidates = externalPool
      .filter((row) => row.candidateAnalysis?.goldenQualified !== true)
      .filter((row) => candidateScore(row) < 78)
      .slice(0, 5);

    const strongestHoldings = ranked
      .filter((row) => portfolioSet.has(row.symbol))
      .slice(0, 3);

    const currentWatchlist = ranked
      .filter((row) => watchSet.has(row.symbol) && !portfolioSet.has(row.symbol))
      .slice(0, 5);

    res.json({
      version: '7.2.3',
      updatedAt: new Date().toISOString(),
      scanned: scannedRows.length,
      universeSize: symbols.length,
      strongestHoldings,
      goldenQualified,
      newOpportunities,
      watchCandidates,
      currentWatchlist,
      rows: goldenQualified,
      counts: {
        holdings: strongestHoldings.length,
        golden: goldenQualified.length,
        newOpportunities: newOpportunities.length,
        watchCandidates: watchCandidates.length,
        excludedOwnedOrWatched: excludedSet.size
      },
      selectionPolicy: {
        newCandidatesExcludePortfolio: true,
        newCandidatesExcludeWatchlist: true,
        doNotFillGoldenSlots: true,
        priceRange: [1, 10],
        liquidityRequired: true,
        goldenThreshold
      },
      note: 'الفرص الجديدة تستبعد المحفظة وقائمة المراقبة. لا تُملأ مراكز Golden Alert بأسهم غير مؤهلة. تحقق من التوافق الشرعي في عوائد قبل أي تنفيذ.'
    });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
}); // ASIRI_OPPORTUNITY_SECTIONS_V723


`;

  server = replaceRange(
    server,
    "app.get('/api/opportunities', async (req, res) => {",
    'function miBucket',
    opportunityReplacement,
    'opportunities endpoint'
  );
  await fs.writeFile(serverPath, server, 'utf8');
}

const indexPath = new URL('./index.html', import.meta.url);
let index = await fs.readFile(indexPath, 'utf8');

if (!index.includes('ASIRI_OPPORTUNITY_SECTIONS_UI_V723')) {
  const newGoldenPage = String.raw`    <section id="golden" class="page opportunity-v723-page">
      <!-- ASIRI_OPPORTUNITY_SECTIONS_UI_V723 -->
      <div class="page-title"><div><span class="eyebrow">SMART OPPORTUNITY ENGINE</span><h2>الفرص الذكية</h2><p class="muted">فصل كامل بين محفظتك والفرص الجديدة والمرشحين للمراقبة.</p></div><button id="scanGolden">إعادة فحص السوق</button></div>
      <section class="panel golden-criteria"><h3>سياسة الترشيح الجديدة</h3><p>يفحص المحرك السوق العام أولًا، ويستبعد أسهم المحفظة وقائمة المراقبة من الفرص الجديدة. لا يظهر Golden Alert إلا عند اكتمال جميع شروطه، ولا تُملأ المراكز الثلاثة بأسهم أضعف.</p><div id="opportunityCounts" class="opportunity-v723-counts"></div></section>
      <div id="opportunityStatus" class="status"></div>

      <section class="panel opportunity-v723-section opportunity-v723-holdings"><div class="section-head"><div><span class="eyebrow">MY PORTFOLIO STRENGTH</span><h3>أقوى مراكز محفظتي</h3></div><span class="opportunity-v723-badge">مملوكة</span></div><p class="muted">ترتيب فني للمراكز المملوكة فقط، ولا تُعرض كفرص شراء جديدة.</p><div id="portfolioStrengthResults" class="golden-grid"></div></section>

      <section class="panel opportunity-v723-section opportunity-v723-golden"><div class="section-head"><div><span class="eyebrow">GOLDEN QUALIFIED ONLY</span><h3>Golden Alerts المؤهلة فقط</h3></div><span class="opportunity-v723-badge golden">شروط مكتملة</span></div><p class="muted">قد يظهر صفر أو سهم واحد أو أكثر. لن يضيف النظام سهمًا ضعيفًا لإكمال العدد.</p><div id="goldenQualifiedResults" class="golden-grid"></div></section>

      <section class="panel opportunity-v723-section"><div class="section-head"><div><span class="eyebrow">NEW OUTSIDE PORTFOLIO</span><h3>أفضل فرص جديدة خارج المحفظة</h3></div><span class="opportunity-v723-badge new">جديدة</span></div><p class="muted">تستبعد تلقائيًا أسهم المحفظة وقائمة المراقبة الحالية.</p><div id="newOpportunityResults" class="golden-grid"></div></section>

      <section class="panel opportunity-v723-section"><div class="section-head"><div><span class="eyebrow">WATCH CANDIDATES</span><h3>مرشحون للمراقبة</h3></div><span class="opportunity-v723-badge watch">انتظار التأكيد</span></div><p class="muted">إعدادات واعدة لم تكتمل بعد؛ لا تعتبر إشارات شراء.</p><div id="watchCandidateResults" class="golden-grid"></div></section>

      <div id="goldenResults" hidden aria-hidden="true"></div>
    </section>

    `;

  index = replaceRange(index, '<section id="golden" class="page">', '<section id="alertcenter" class="page">', newGoldenPage, 'golden page');
  index = index.replace('<h3>أفضل 3 فرص</h3>', '<h3>أفضل فرص جديدة خارج المحفظة</h3>');
  await fs.writeFile(indexPath, index, 'utf8');
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');

if (!bootstrap.includes('/opportunity-sections-v723.css')) {
  const scopedAnchor = 'const scopedQueries = [';
  const assetPatch = `if (!index.includes('/opportunity-sections-v723.css')) index = index.replace('</head>', '<link rel="stylesheet" href="/opportunity-sections-v723.css?v=7230"></head>');\nif (!index.includes('/opportunity-sections-v723.js')) index = index.replace('</body>', '<script src="/opportunity-sections-v723.js?v=7230" defer></script></body>'); // ASIRI_OPPORTUNITY_ASSETS_V723\n\n`;
  bootstrap = replaceRequired(bootstrap, scopedAnchor, assetPatch + scopedAnchor, 'opportunity assets');

  const staticAnchor = "app.get('/broker-mobile-v722.css', (_req, res) => res.sendFile(path.join(root, 'broker-mobile-v722.css')));";
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/opportunity-sections-v723.css', (_req, res) => res.sendFile(path.join(root, 'opportunity-sections-v723.css')));\napp.get('/opportunity-sections-v723.js', (_req, res) => res.sendFile(path.join(root, 'opportunity-sections-v723.js')));`,
    'opportunity static routes'
  );
  await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
}

console.log('opportunity-sections-v7.2.3', {
  portfolioSeparated: true,
  watchlistExcludedFromNew: true,
  goldenSlotsNotFilled: true,
  executionAllowed: false,
  tradingEnabled: false
});
