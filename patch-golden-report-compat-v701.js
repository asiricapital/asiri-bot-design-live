import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.0.1 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const serverPath = new URL('./server.js', import.meta.url);
let source = await fs.readFile(serverPath, 'utf8');

if (!source.includes('ASIRI_GOLDEN_REPORT_COMPAT_V701')) {
  const scanAnchor = 'async function runGoldenAlertScan() {';
  const helper = `async function claimGoldenAlertKey(reportKey, marketDate, report) {
  try {
    return await claimReportKey(reportKey, 'golden-alert', marketDate, report);
  } catch (error) {
    const message = String(error?.message || error || '');
    const isLegacyConstraint = message.includes('report_runs_report_type_check') || message.includes('"23514"');
    if (!isLegacyConstraint) throw error;
    console.warn('golden-alert-dedupe-fallback', 'Supabase report_runs constraint does not yet allow golden-alert; Telegram delivery will continue with in-memory duplicate protection.');
    return true;
  }
} // ASIRI_GOLDEN_REPORT_COMPAT_V701

`;
  source = replaceRequired(source, scanAnchor, helper + scanAnchor, 'Golden Alert scan function');

  const oldClaim = `runId = await claimReportKey(
            reportKey,
            'golden-alert',
            day,
            telegramReport
          );`;
  const newClaim = `runId = await claimGoldenAlertKey(
            reportKey,
            day,
            telegramReport
          );`;
  source = replaceRequired(source, oldClaim, newClaim, 'Golden Alert report claim');
}

await fs.writeFile(serverPath, source, 'utf8');

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = replaceRequired(bootstrap, "const VERSION = '7.0.0';", "const VERSION = '7.0.1';", 'version');
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('golden-report-compat-v7.0.1', {
  telegramContinuesOnLegacyConstraint: true,
  persistentDedupeRequiresMigration: true,
  tradingEnabled: false
});
