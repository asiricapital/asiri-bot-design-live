await import('./patch-broker-v652.js');
await import('./patch-broker-v653.js');
await import('./patch-broker-v656.js');
await import('./patch-mobile-foundation-v660.js');
await import('./patch-portfolio-center-v661.js');
await import('./patch-price-diagnostics-v670.js');
await import('./patch-unified-prices-v671.js');
await import('./patch-alert-insert-v672.js');
await import('./patch-session-feed-v673.js');
await import('./patch-market-feed-v674.js');
await import('./patch-account-center-v680.js');
await import('./patch-trade-receipt-v682.js');
await import('./patch-safe-restore-v691.js');
await import('./patch-saxo-realtime-v700.js');
await import('./patch-binance-lab-v700.js');
await import('./patch-golden-report-compat-v701.js');
await import('./patch-dashboard-layout-v702.js');
await import('./patch-dashboard-live-v705.js');
await import('./patch-watch-return-v706.js');
await import('./patch-decision-cockpit-v710.js');
await import('./patch-decision-cockpit-v711.js');
await import('./patch-decision-intelligence-v720.js');
await import('./patch-decision-intelligence-v720-hardening.js');
await import('./patch-decision-intelligence-v720-rls.js');
await import('./patch-broker-ui-v721.js');
await import('./patch-broker-mobile-v722.js');
await import('./patch-opportunity-sections-v723.js');
await import('./patch-opportunity-hardening-v724.js');
await import('./patch-analytics-engine-v740.js');

const saxoSimExecutionFeatureEnabled = String(process.env.SAXO_EXECUTION_FEATURE_ENABLED || 'false').toLowerCase() === 'true';
if (saxoSimExecutionFeatureEnabled) {
  await import('./patch-saxo-sim-execution-v731.js');
  await import('./patch-saxo-sim-execution-v732.js');
  await import('./patch-saxo-sim-execution-v730.js');
}

await import('./bootstrap-v65.js');
