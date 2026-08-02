import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(root, 'server.js');
const runtimePath = path.join(root, '.runtime-server.mjs');

let source = await fs.readFile(sourcePath, 'utf8');

function replaceRequired(search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Asiri bootstrap patch failed: ${label}`);
  }
  source = source.replace(search, replacement);
}

replaceRequired(
  "const reportCheckMs = Math.max(60000, Number(process.env.REPORT_CHECK_MS || 60000));",
  "const reportCheckMs = Math.max(60000, Number(process.env.REPORT_CHECK_MS || 60000));\nconst reportUserIdEnv = String(process.env.REPORT_USER_ID || '').trim();",
  'report user environment hook'
);

replaceRequired(
  "let reportState = { running: false, lastCloseReportAt: null, lastPreMarketReportAt: null, lastSundayBriefAt: null, lastError: null };",
  "let reportState = { running: false, lastCloseReportAt: null, lastPreMarketReportAt: null, lastSundayBriefAt: null, lastError: null };\nlet resolvedReportUserId = null;\nlet resolvedReportUserAt = 0;",
  'report user cache'
);

replaceRequired(
  `async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const positions = await adminFetch('portfolio', '?select=*');
  if (!positions.length) return [];
  const settled = await Promise.allSettled(positions.slice(0, 50).map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}`,
  `async function resolveReportUserId(force = false) {
  if (reportUserIdEnv) return reportUserIdEnv;
  if (!force && resolvedReportUserId && Date.now() - resolvedReportUserAt < 300000) return resolvedReportUserId;
  if (!backgroundAlertsEnabled) return null;

  const reconciliations = await adminFetch(
    'portfolio_reconciliations',
    '?select=user_id,reconciled_at&order=reconciled_at.desc&limit=1'
  ).catch(() => []);
  let userId = reconciliations[0]?.user_id || null;

  if (!userId) {
    const latestPosition = await adminFetch(
      'portfolio',
      '?select=user_id,updated_at,created_at&order=updated_at.desc&limit=1'
    ).catch(() => []);
    userId = latestPosition[0]?.user_id || null;
  }

  resolvedReportUserId = userId;
  resolvedReportUserAt = Date.now();
  return userId;
}

async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const userId = await resolveReportUserId();
  if (!userId) return [];
  const positions = await adminFetch('portfolio', \`?select=*&user_id=eq.\${encodeURIComponent(userId)}&order=created_at.asc\`);
  if (!positions.length) return [];
  const settled = await Promise.allSettled(positions.slice(0, 50).map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}`,
  'portfolio report ownership'
);

replaceRequired(
  `  const key = \`${'${type}'}:${'${ny.date}'}\`;
  const report = await buildAutomatedReport(type, test);`,
  `  const userId = await resolveReportUserId(true);
  if (!userId) throw new Error('تعذر تحديد مستخدم التقارير. احفظ مطابقة المحفظة مرة واحدة.');
  const key = \`${'${type}'}:${'${ny.date}'}:${'${userId}'}\`;
  const report = await buildAutomatedReport(type, test);`,
  'per-user report key'
);

replaceRequired(
  `  try {
    const rows = await adminFetch('report_runs', \`?select=id,report_key,report_type,market_date,report_text,payload,delivery_status,sent_at,created_at,error_message&delivery_status=eq.sent\${typeFilter}&order=sent_at.desc&limit=\${limit}\`);
    res.json({ rows, enabled: true });
  } catch (error) { res.status(502).json({ error: error.message }); }`,
  `  try {
    const userId = await resolveReportUserId();
    if (!userId) return res.json({ rows: [], enabled: true });
    const fetchLimit = Math.max(limit, 100);
    const allRows = await adminFetch('report_runs', \`?select=id,report_key,report_type,market_date,report_text,payload,delivery_status,sent_at,created_at,error_message&delivery_status=eq.sent\${typeFilter}&order=sent_at.desc&limit=\${fetchLimit}\`);
    const rows = allRows.filter((row) => String(row.report_key || '').endsWith(\`:\${userId}\`)).slice(0, limit);
    res.json({ rows, enabled: true });
  } catch (error) { res.status(502).json({ error: error.message }); }`,
  'report history ownership'
);

source = source.replaceAll("version: '5.8.0'", "version: '5.8.2'");
source = source.replace('Asiri Capital v5.7.0:', 'Asiri Capital v5.8.2:');

await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href + `?v=${Date.now()}`);
