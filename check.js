import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInvestmentCommittee } from './investment-committee.js';
import { parseSaxoMessageFrame } from './saxo-realtime.js';

const requiredFiles = [
  'server.js','bootstrap-v65.js','broker-gateway.js','saxo-realtime.js','investment-committee.js','ui-pages-v64.js','ui-page-v65.js',
  'market.js','indicators.js','decision.js','candidate.js','app.js',
  'v59.js','v60.js','v61.js','v62.js','v64.js','v65.js','v65-data.js','v700-realtime.js','index.html','style.css',
  'v59.css','v60.css','v61.css','v62.css','v64.css','v65.css','v700-realtime.css','dashboard-layout-v702.css','dashboard-live-portfolio-v705.css','watch-return-v706.css','decision-cockpit-v710.css','portfolio.json',
  'dashboard-layout-v702.js','dashboard-live-portfolio-v705.js','watch-return-v706.js','decision-cockpit-v710.js','patch-dashboard-layout-v702.js','patch-dashboard-live-v705.js','patch-watch-return-v706.js','patch-decision-cockpit-v710.js',
  'patch-safe-restore-v691.js','patch-saxo-realtime-v700.js','patch-binance-lab-v700.js','patch-golden-report-compat-v701.js',
  'binance-tradfi-lab.html','supabase_migration_v45.sql','supabase_migration_broker_v63.sql','supabase_migration_report_runs_golden_alert_v701.sql','package.json'
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}

const portfolio = JSON.parse(fs.readFileSync('portfolio.json','utf8'));
if (!Array.isArray(portfolio)) throw new Error('portfolio.json must contain an array');

const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
if (pkg.scripts?.start !== 'node startup-v683.js') throw new Error('Production start script must use startup-v683.js');
if (pkg.engines?.node !== '22.x') throw new Error('Node 22.x is required');
if (pkg.version !== '7.1.0') throw new Error('Expected Asiri Capital v7.1.0');

for (const file of ['bootstrap-v65.js','broker-gateway.js','saxo-realtime.js','investment-committee.js','ui-pages-v64.js','ui-page-v65.js','app.js','v59.js','v60.js','v61.js','v62.js','v64.js','v65.js','v65-data.js','v700-realtime.js','dashboard-layout-v702.js','dashboard-live-portfolio-v705.js','watch-return-v706.js','decision-cockpit-v710.js','patch-saxo-realtime-v700.js','patch-binance-lab-v700.js','patch-golden-report-compat-v701.js','patch-dashboard-layout-v702.js','patch-dashboard-live-v705.js','patch-watch-return-v706.js','patch-decision-cockpit-v710.js']) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

const gateway = fs.readFileSync('broker-gateway.js','utf8');
const realtime = fs.readFileSync('saxo-realtime.js','utf8');
const realtimeUi = fs.readFileSync('v700-realtime.js','utf8');
const brokerUi = fs.readFileSync('v62.js','utf8');
const committeeUi = fs.readFileSync('v64.js','utf8');
const commandUi = fs.readFileSync('v65.js','utf8');
const commandData = fs.readFileSync('v65-data.js','utf8');
const commandPage = fs.readFileSync('ui-page-v65.js','utf8');
const bootstrap = fs.readFileSync('bootstrap-v65.js','utf8');
const migration = fs.readFileSync('supabase_migration_broker_v63.sql','utf8');
const goldenMigration = fs.readFileSync('supabase_migration_report_runs_golden_alert_v701.sql','utf8');
const startup = fs.readFileSync('startup-v683.js','utf8');
const goldenPatch = fs.readFileSync('patch-golden-report-compat-v701.js','utf8');
const dashboardLayout = fs.readFileSync('dashboard-layout-v702.js','utf8');
const dashboardCss = fs.readFileSync('dashboard-layout-v702.css','utf8');
const dashboardPatch = fs.readFileSync('patch-dashboard-layout-v702.js','utf8');
const livePortfolio = fs.readFileSync('dashboard-live-portfolio-v705.js','utf8');
const livePortfolioCss = fs.readFileSync('dashboard-live-portfolio-v705.css','utf8');
const livePortfolioPatch = fs.readFileSync('patch-dashboard-live-v705.js','utf8');
const watchReturn = fs.readFileSync('watch-return-v706.js','utf8');
const watchReturnCss = fs.readFileSync('watch-return-v706.css','utf8');
const watchReturnPatch = fs.readFileSync('patch-watch-return-v706.js','utf8');
const decisionCockpit = fs.readFileSync('decision-cockpit-v710.js','utf8');
const decisionCockpitCss = fs.readFileSync('decision-cockpit-v710.css','utf8');
const decisionCockpitPatch = fs.readFileSync('patch-decision-cockpit-v710.js','utf8');

if (!gateway.includes('SAXO_ALLOW_TRADING must remain false')) throw new Error('Read-only broker guard is missing');
if (!gateway.includes("pathname.startsWith('/port/')")) throw new Error('Portfolio GET allow-list is missing');
if (/app\.(post|put|patch|delete)\(['"]\/api\/broker\/saxo\/(order|trade)/i.test(gateway)) throw new Error('Trading route detected in Broker Gateway');
if (!gateway.includes("app.post('/api/broker/saxo/connect-url'")) throw new Error('Authenticated OAuth connect-url route is missing');
if (!gateway.includes("app.post('/api/broker/mock/snapshot'")) throw new Error('Pre-activation mock Shadow Mode is missing');
if (!gateway.includes("app.get('/api/assistant/reconciliation'")) throw new Error('Assistant reconciliation endpoint is missing');
if (!gateway.includes("crypto.createCipheriv('aes-256-gcm'")) throw new Error('Encrypted token storage is missing');
if (!brokerUi.includes('authorization:`Bearer ${sessionB62.access_token}`')) throw new Error('Broker UI must authenticate server requests');
if (!brokerUi.includes('/api/broker/mock/snapshot')) throw new Error('Broker UI mock lab is missing');
if (!migration.includes('broker_connections') || !migration.includes('broker_snapshots')) throw new Error('Broker Supabase schema is incomplete');

if (!realtime.includes('sim-streaming.saxobank.com/sim/oapi/streaming/ws/connect')) throw new Error('Current Saxo SIM streaming endpoint is missing');
if (!realtime.includes('live-streaming.saxobank.com/oapi/streaming/ws/connect')) throw new Error('Current Saxo LIVE streaming endpoint is missing');
if (!realtime.includes("app.post('/api/realtime/start'")) throw new Error('Realtime start endpoint is missing');
if (!realtime.includes("app.get('/api/realtime/events'")) throw new Error('Realtime SSE bridge is missing');
if (!realtime.includes('DelayedByMinutes')) throw new Error('Realtime delay validation is missing');
if (!realtime.includes('readOnly: true')) throw new Error('Realtime engine must remain read-only');
if (/\/api\/(order|trade)|executionAllowed\s*:\s*true/i.test(realtime + realtimeUi)) throw new Error('Realtime engine must not contain execution capability');
if (!realtimeUi.includes('asiri:saxo-live-tick')) throw new Error('Realtime UI event bridge is missing');
if (!realtimeUi.includes('function diagnosticsHost()') || !realtimeUi.includes('تشخيص اتصال Saxo')) throw new Error('Saxo diagnostics relocation is incomplete');
if (realtimeUi.includes('setTimeout(() => start(false)')) throw new Error('Saxo diagnostics must not auto-start on the dashboard');
if (!startup.includes('patch-saxo-realtime-v700.js')) throw new Error('Realtime startup patch is not enabled');
if (!startup.includes('patch-binance-lab-v700.js')) throw new Error('Stock watch lab route patch is not enabled');

if (!startup.includes('patch-golden-report-compat-v701.js')) throw new Error('Golden Alert compatibility patch is not enabled');
if (!goldenPatch.includes('report_runs_report_type_check') || !goldenPatch.includes('claimGoldenAlertKey')) throw new Error('Golden Alert legacy constraint fallback is incomplete');
if (!goldenMigration.includes("'golden-alert'") || !goldenMigration.includes('report_runs_report_type_check')) throw new Error('Golden Alert Supabase migration is incomplete');

if (!startup.includes('patch-dashboard-layout-v702.js')) throw new Error('Dashboard priority layout patch is not enabled');
if (!dashboardLayout.includes('القرار التنفيذي لكل سهم') || !dashboardLayout.includes('سجل تحديثات المحفظة')) throw new Error('Dashboard priority targets are incomplete');
if (!dashboardLayout.includes('ملخص القيادة اليومي') || !dashboardLayout.includes('commandBar.after(panel)')) throw new Error('Executive decision prioritization is incomplete');
if (!dashboardLayout.includes('observer?.disconnect()') || !dashboardLayout.includes("observer.observe(root, { childList: true });")) throw new Error('Dashboard mutation-loop protection is missing');
if (dashboardLayout.includes('subtree: true') || dashboardLayout.includes("window.addEventListener('asiri:saxo-live-tick'")) throw new Error('Dashboard layout must not observe market tick mutations');
if (!dashboardLayout.includes("setAttribute(root, 'data-layout-version', '7.0.4')")) throw new Error('Dashboard v7.0.4 layout marker is missing');
if (!dashboardCss.includes('#dashboard[data-layout-version="7.0.4"]:not(.active){display:none!important}')) throw new Error('Inactive dashboard visibility guard is missing');
if (!dashboardCss.includes('#dashboard[data-layout-version="7.0.4"].active{display:block}')) throw new Error('Active dashboard visibility rule is missing');
if (/#dashboard\[data-layout-version="7\.0\.4"\]\{display:block\}/.test(dashboardCss)) throw new Error('Unconditional dashboard display rule detected');
if (!dashboardPatch.includes("const VERSION = '7.0.1'") || !dashboardPatch.includes("const VERSION = '7.0.4'")) throw new Error('Dashboard release version patch is incomplete');
if (!dashboardPatch.includes('v=7040') || !dashboardPatch.includes('navigationRestored: true')) throw new Error('Dashboard v7.0.4 cache or navigation marker is missing');
if (/executionAllowed\s*:\s*true|\/api\/(order|trade)/i.test(dashboardLayout + dashboardPatch)) throw new Error('Dashboard layout must not contain execution capability');

if (!startup.includes('patch-dashboard-live-v705.js')) throw new Error('Live portfolio replacement patch is not enabled');
if (!livePortfolio.includes('/api/binance-lab/stock-quotes') || !livePortfolio.includes("from('portfolio').select('symbol')") || !livePortfolio.includes("from('watchlist').select('symbol')")) throw new Error('Live portfolio data orchestration is incomplete');
if (!livePortfolio.includes('POLL_MS = 10000') || !livePortfolio.includes('المراقبة الحية للمحفظة')) throw new Error('Live portfolio panel or polling is missing');
if (!livePortfolioCss.includes('.lp705-panel') || !livePortfolioCss.includes('.lp705-grid')) throw new Error('Live portfolio styles are incomplete');
if (!livePortfolioPatch.includes("const VERSION = '7.0.4'") || !livePortfolioPatch.includes("const VERSION = '7.0.5'")) throw new Error('Live portfolio release version patch is incomplete');
if (!livePortfolioPatch.includes('v=7050') || !livePortfolioPatch.includes('saxoDiagnosticsMoved: true')) throw new Error('Live portfolio cache or relocation marker is missing');
if (/executionAllowed\s*:\s*true|\/api\/(order|trade)/i.test(livePortfolio + livePortfolioPatch)) throw new Error('Live portfolio replacement must remain read-only');

if (!startup.includes('patch-watch-return-v706.js')) throw new Error('Watchlist return patch is not enabled');
if (!watchReturn.includes("closest?.('#lp705OpenWatch')") || !watchReturn.includes("WATCH_PATH = '/binance-lab'")) throw new Error('Watchlist manager button interception is incomplete');
if (!watchReturn.includes('history.back()') || !watchReturn.includes('watchReturnV706') || !watchReturn.includes('العودة إلى لوحة القيادة')) throw new Error('Watchlist return controls are incomplete');
if (!watchReturn.includes('sessionStorage.setItem') || !watchReturn.includes('asiri_watch_return_url')) throw new Error('Watchlist return path persistence is missing');
if (!watchReturnCss.includes('.watch-return-v706') || !watchReturnCss.includes('.watch-return-floating')) throw new Error('Watchlist return styles are incomplete');
if (!watchReturnPatch.includes("const VERSION = '7.0.5'") || !watchReturnPatch.includes("const VERSION = '7.0.6'")) throw new Error('Watchlist return release version patch is incomplete');
if (!watchReturnPatch.includes('v=7060') || !watchReturnPatch.includes('watchPageReturnBar: true')) throw new Error('Watchlist return cache or release marker is missing');
if (/executionAllowed\s*:\s*true|\/api\/(order|trade)/i.test(watchReturn + watchReturnPatch)) throw new Error('Watchlist return layer must remain navigation-only');

if (!startup.includes('patch-decision-cockpit-v710.js')) throw new Error('Decision Cockpit patch is not enabled');
for (const marker of ['/api/analyze/','/api/investment-committee/','/api/history/','/api/market-intelligence','قمرة القرار الاستثماري','GOLDEN ALERT GATE','RISK ENGINE','LOCAL DECISION JOURNAL']) {
  if (!decisionCockpit.includes(marker)) throw new Error(`Decision Cockpit marker missing: ${marker}`);
}
if (!decisionCockpit.includes('sessionStorage.setItem') || !decisionCockpit.includes('تم التحقق الشرعي يدويًا')) throw new Error('Manual Sharia gate is incomplete');
if (!decisionCockpit.includes('SAR_RATE = 3.75') || !decisionCockpit.includes('riskBudgetUsd')) throw new Error('SAR position sizing engine is incomplete');
if (!decisionCockpitCss.includes('.dc710-score-ring') || !decisionCockpitCss.includes('.dc710-workspace-grid') || !decisionCockpitCss.includes('@media(max-width:760px)')) throw new Error('Decision Cockpit responsive styles are incomplete');
if (!decisionCockpitPatch.includes("const VERSION = '7.0.6'") || !decisionCockpitPatch.includes("const VERSION = '7.1.0'")) throw new Error('Decision Cockpit release version patch is incomplete');
if (!decisionCockpitPatch.includes('v=7100') || !decisionCockpitPatch.includes('tradingEnabled: false')) throw new Error('Decision Cockpit cache or safety marker is missing');
if (/executionAllowed\s*:\s*true|app\.(?:post|put|patch|delete)\([^\n]*(order|trade)|fetch\([^\n]*(order|trade)/i.test(decisionCockpit + decisionCockpitPatch)) throw new Error('Decision Cockpit must remain analysis-only');

const ref = 'RT_AMPL';
const payload = Buffer.from(JSON.stringify({ Quote: { Bid: 10, Ask: 10.02, DelayedByMinutes: 0 } }), 'utf8');
const frame = Buffer.alloc(8 + 2 + 1 + Buffer.byteLength(ref) + 1 + 4 + payload.length);
let offset = 0;
frame.writeBigUInt64LE(42n, offset); offset += 8;
frame.writeUInt16LE(1, offset); offset += 2;
frame.writeUInt8(Buffer.byteLength(ref), offset); offset += 1;
frame.write(ref, offset, 'ascii'); offset += Buffer.byteLength(ref);
frame.writeUInt8(0, offset); offset += 1;
frame.writeUInt32LE(payload.length, offset); offset += 4;
payload.copy(frame, offset);
const parsed = parseSaxoMessageFrame(frame);
if (parsed.length !== 1 || parsed[0].messageId !== '42' || parsed[0].referenceId !== ref || parsed[0].payload.Quote.Bid !== 10) {
  throw new Error('Saxo binary frame parser fixture failed');
}

if (bootstrap.includes('reconcileCurrentBrokerPortfolio')) throw new Error('Legacy automatic portfolio migration must not run');
if (bootstrap.includes("avg_price: 1.05") || bootstrap.includes("delete().eq('id', row.id)")) throw new Error('Hardcoded portfolio mutation detected');
if (!bootstrap.includes('ASIRI_PRIMARY_USER_ID')) throw new Error('Explicit report user isolation is missing');
if (!bootstrap.includes("app.get('/api/investment-committee/:symbol'")) throw new Error('Investment Committee API route is missing');
if (!bootstrap.includes("app.get('/v65-data.js'")) throw new Error('Intelligence OS data module route is missing');
if (!committeeUi.includes('/api/investment-committee/')) throw new Error('Investment Committee UI is not connected');
if (!commandUi.includes('loadIntelligenceBrief')) throw new Error('Intelligence OS renderer is not connected');
if (!commandData.includes('/api/market-intelligence') || !commandData.includes('/api/portfolio-analysis')) throw new Error('Intelligence OS data orchestration is incomplete');
if (!commandPage.includes('ASIRI INTELLIGENCE OS v6.5')) throw new Error('Intelligence OS page is missing');
if (/fetch\([^\n]*(order|trade)|executionAllowed\s*:\s*true/i.test(commandUi + commandData)) throw new Error('Intelligence OS must not contain execution capability');

const strong = runInvestmentCommittee({
  symbol: 'TEST',
  quote: { symbol: 'TEST', price: 8, changePercent: 2 },
  technicals: { trendScore: 3, momentum20: 8, historicalVolumeRatio: 1.6, rsi14: 59, atrPct: 5 },
  candidate: { confidence: 90, goldenQualified: true, confirmedBreakout: true, volumeRatio: 1.6, liquidityOk: true, entryLow: 7.9, entryHigh: 8.1, stopLoss: 7.4, target1: 9.5, target2: 10.2, riskReward: 2.2 },
  market: { score: 67 }
});
if (strong.tradingEnabled !== false || strong.writeEnabled !== false || strong.consensus.executionAllowed !== false) throw new Error('Committee must remain analysis-only');
if (strong.consensus.decisionCode !== 'CONDITIONAL_ENTRY') throw new Error('Strong committee fixture should produce a conditional entry');

const risky = runInvestmentCommittee({
  symbol: 'RISK',
  quote: { symbol: 'RISK', price: 4, changePercent: -14 },
  technicals: { trendScore: 1, momentum20: -8, historicalVolumeRatio: 0.4, rsi14: 31, atrPct: 18 },
  candidate: { confidence: 52, goldenQualified: false, liquidityOk: false, entryLow: 4, entryHigh: 4.1, stopLoss: null, riskReward: 0.8 },
  market: { score: 28 }
});
const riskOfficer = risky.members.find((member) => member.role === 'RISK_OFFICER');
if (!riskOfficer?.veto || risky.consensus.decisionCode !== 'AVOID') throw new Error('Risk veto fixture must block the setup');

console.log(`Asiri Capital v${pkg.version} checks passed — Decision Cockpit, watchlist return navigation, live portfolio, Saxo read-only, Stock Watch, Golden Alert compatibility and risk controls.`);
