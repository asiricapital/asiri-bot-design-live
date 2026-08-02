import fs from 'node:fs';

const requiredFiles = [
  'startup-v683.js',
  'patch-saxo-sim-execution-v731.js',
  'patch-saxo-sim-execution-v732.js',
  'patch-saxo-sim-execution-v730.js',
  'saxo-sim-execution-core-v730.js',
  'saxo-sim-execution-v730.css',
  'supabase_migration_saxo_sim_execution_v730.sql'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing Saxo execution file: ${file}`);
}

const startup = fs.readFileSync('startup-v683.js', 'utf8');
const hardening = fs.readFileSync('patch-saxo-sim-execution-v731.js', 'utf8');
const statusSafety = fs.readFileSync('patch-saxo-sim-execution-v732.js', 'utf8');
const patch = fs.readFileSync('patch-saxo-sim-execution-v730.js', 'utf8');
const core = fs.readFileSync('saxo-sim-execution-core-v730.js', 'utf8');
const css = fs.readFileSync('saxo-sim-execution-v730.css', 'utf8');
const sql = fs.readFileSync('supabase_migration_saxo_sim_execution_v730.sql', 'utf8');

const featureFlag = 'SAXO_EXECUTION_FEATURE_ENABLED';
const featureGate = "String(process.env.SAXO_EXECUTION_FEATURE_ENABLED || 'false').toLowerCase() === 'true'";
const hardeningMarker = "await import('./patch-saxo-sim-execution-v731.js');";
const statusSafetyMarker = "await import('./patch-saxo-sim-execution-v732.js');";
const integrationMarker = "await import('./patch-saxo-sim-execution-v730.js');";
const bootstrapMarker = "await import('./bootstrap-v65.js');";
if (!startup.includes(featureFlag) || !startup.includes(featureGate)) throw new Error('Saxo execution must remain behind an explicit disabled-by-default feature gate.');
if (![hardeningMarker, statusSafetyMarker, integrationMarker].every((marker) => startup.includes(marker))) throw new Error('Saxo execution startup imports are missing.');
if (startup.indexOf(hardeningMarker) > startup.indexOf(statusSafetyMarker)) throw new Error('v7.3.1 hardening must run before v7.3.2 status safety.');
if (startup.indexOf(statusSafetyMarker) > startup.indexOf(integrationMarker)) throw new Error('v7.3.2 status safety must run before v7.3.0 integration.');
if (startup.indexOf(integrationMarker) > startup.indexOf(bootstrapMarker)) throw new Error('Saxo execution patches must run before bootstrap.');

const coreMarkers = [
  "base.environment !== 'sim'",
  "mode === 'confirmed-only'",
  "SAXO_EXECUTION_KILL_SWITCH",
  "SAXO_ALLOW_TRADING",
  "allowedAssetTypes: ['Stock']",
  "allowedOrderTypes: ['Limit']",
  "OrderType: 'Limit'",
  'ManualOrder: true',
  "'/trade/v2/orders/precheck'",
  "'/trade/v2/orders'",
  "req.headers['x-request-id']",
  'inFlightRequests',
  'reserveOrder',
  'precheckHasDisclaimers',
  'no-short-selling',
  'max-notional',
  'concentration',
  'SUBMISSION_UNKNOWN'
];
for (const marker of coreMarkers) {
  if (!core.includes(marker)) throw new Error(`Core safety marker missing: ${marker}`);
}
if (core.indexOf("'/trade/v2/orders/precheck'") > core.indexOf("responsePayload = await saxoRequest(user.id, deps, '/trade/v2/orders'")) {
  throw new Error('Saxo pre-check must appear before final order submission.');
}
if (/gateway\.saxobank\.com\/openapi/.test(core)) throw new Error('A LIVE Saxo base URL must not be hard-coded in the execution module.');
if (/OrderType:\s*['"]Market['"]/.test(core)) throw new Error('Market orders are forbidden.');
if (/ManualOrder:\s*false/.test(core)) throw new Error('Automatic orders are forbidden.');

const hardeningMarkers = [
  'ASIRI_SAXO_SIM_EXECUTION_HARDENING_V731',
  "FieldGroups', 'OrderSetting,SupportedOrderTypeSettings'",
  'supportedOrderTypes',
  'SupportedOrderTypeSettings',
  'INVALID_PRICE_INCREMENT',
  'quote-error',
  'price-type',
  'assertSaxoBusinessResponse',
  'ErrorInfo',
  'returned no OrderId',
  '/cs/v1/audit/orderactivities',
  'EntryType=Last',
  'normalizeActivityStatus',
  'partially-filled',
  'broker-status-updated'
];
for (const marker of hardeningMarkers) {
  if (!hardening.includes(marker)) throw new Error(`v7.3.1 hardening marker missing: ${marker}`);
}
if (/gateway\.saxobank\.com\/openapi/.test(hardening)) throw new Error('Hardening must not hard-code a LIVE Saxo endpoint.');
if (/OrderType:\s*['"]Market['"]/.test(hardening)) throw new Error('Hardening must not introduce Market orders.');

const statusSafetyMarkers = [
  'ASIRI_SAXO_SIM_EXECUTION_STATUS_SAFETY_V732',
  'normalizeOpenOrderStatus',
  'activityHistoryAvailable',
  'FromDateTime',
  'auditPermissionFallback',
  'orderDetailsPreserved'
];
for (const marker of statusSafetyMarkers) {
  if (!statusSafety.includes(marker)) throw new Error(`v7.3.2 status safety marker missing: ${marker}`);
}
if (/gateway\.saxobank\.com\/openapi/.test(statusSafety)) throw new Error('Status safety must not hard-code a LIVE Saxo endpoint.');

const patchMarkers = [
  'ASIRI_SAXO_SIM_EXECUTION_V730',
  'registerSaxoSimExecution',
  'sx730ConfirmCheck',
  'sx730Confirm',
  'LIVE LOCKED',
  '/saxo-sim-execution-v730.css'
];
for (const marker of patchMarkers) {
  if (!patch.includes(marker)) throw new Error(`Patch/UI marker missing: ${marker}`);
}

const sqlMarkers = [
  "environment = 'sim'",
  "execution_mode = 'confirmed-only'",
  "asset_type = 'Stock'",
  "order_type = 'Limit'",
  'manual_order = true',
  'unique (user_id, request_id)',
  'enable row level security',
  'revoke all on table public.broker_orders from anon, authenticated',
  'broker_order_events'
];
for (const marker of sqlMarkers) {
  if (!sql.toLowerCase().includes(marker.toLowerCase())) throw new Error(`Migration safety marker missing: ${marker}`);
}
const forbiddenSql = [/grant\s+insert/i, /grant\s+update/i, /grant\s+delete/i, /environment\s*=\s*'live'/i, /order_type\s*=\s*'market'/i];
for (const pattern of forbiddenSql) {
  if (pattern.test(sql)) throw new Error(`Forbidden migration pattern: ${pattern}`);
}

if (!css.includes('#saxoExecutionV730') || !css.includes('.sx730-confirm-row') || !css.includes('@media (max-width: 620px)')) {
  throw new Error('Execution Desk styling or mobile rules are incomplete.');
}

console.log('Saxo SIM confirmed execution v7.3.2 safety contract verified');
