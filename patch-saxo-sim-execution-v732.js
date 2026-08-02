import fs from 'node:fs/promises';

const corePath = new URL('./saxo-sim-execution-core-v730.js', import.meta.url);
const marker = 'ASIRI_SAXO_SIM_EXECUTION_STATUS_SAFETY_V732';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.3.2 Saxo status safety failed: ${label} anchor not found`);
  return text.replace(before, after);
}

let core = await fs.readFile(corePath, 'utf8');
if (!core.includes(marker)) {
  core = replaceRequired(
    core,
    `function normalizeActivityStatus(activity) {
  const status = String(activity?.Status || '');
  const subStatus = String(activity?.SubStatus || '');
  if (subStatus === 'Rejected') return 'rejected';
  if (status === 'FinalFill') return 'filled';
  if (status === 'Fill') return 'partially-filled';
  if (status === 'Cancelled' || status === 'Expired' || status === 'DoneForDay') return 'cancelled';
  if (status === 'Placed' && subStatus === 'Confirmed') return 'accepted';
  if (status === 'Placed') return 'submitted';
  return 'unknown';
}

// ASIRI_SAXO_SIM_EXECUTION_HARDENING_V731`,
    `function normalizeActivityStatus(activity) {
  const status = String(activity?.Status || '');
  const subStatus = String(activity?.SubStatus || '');
  if (subStatus === 'Rejected') return 'rejected';
  if (status === 'FinalFill') return 'filled';
  if (status === 'Fill') return 'partially-filled';
  if (status === 'Cancelled' || status === 'Expired' || status === 'DoneForDay') return 'cancelled';
  if (status === 'Placed' && subStatus === 'Confirmed') return 'accepted';
  if (status === 'Placed') return 'submitted';
  return 'unknown';
}

function normalizeOpenOrderStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'filled') return 'filled';
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('placementpending')) return 'submitted';
  if (status.includes('working') || status === 'parked' || status === 'notworking') return 'working';
  if (status === 'unknown') return 'unknown';
  return 'accepted';
}

// ASIRI_SAXO_SIM_EXECUTION_HARDENING_V731
// ASIRI_SAXO_SIM_EXECUTION_STATUS_SAFETY_V732`,
    'open order status normalizer'
  );

  core = replaceRequired(
    core,
    `      const [openPayload, activitiesPayload] = await Promise.all([
        saxoRequest(user.id, deps, '/port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat'),
        saxoRequest(user.id, deps, '/cs/v1/audit/orderactivities?$top=100&EntryType=Last')
      ]);`,
    `      const openPayload = await saxoRequest(user.id, deps, '/port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat');
      const activityFrom = encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      let activitiesPayload = { Data: [], __nextPoll: null };
      let activityHistoryAvailable = true;
      try {
        activitiesPayload = await saxoRequest(user.id, deps, \`/cs/v1/audit/orderactivities?$top=100&EntryType=Last&FromDateTime=\${activityFrom}\`);
      } catch (activityError) {
        activityHistoryAvailable = false;
        activitiesPayload = { Data: [], __nextPoll: null, Error: activityError.message };
      }`,
    'activity history fallback'
  );

  core = replaceRequired(
    core,
    `        status: String(row.Status || row.OrderStatus || 'Working').toLowerCase(),`,
    `        status: normalizeOpenOrderStatus(row.Status || row.OrderStatus || 'Working'),`,
    'open order normalized status'
  );

  core = replaceRequired(
    core,
    `        const activity = merged.get(row.orderId);
        merged.set(row.orderId, activity ? { ...row, ...activity, raw: { openOrder: row.raw, activity: activity.raw } } : row);`,
    `        const activity = merged.get(row.orderId);
        merged.set(row.orderId, activity ? {
          ...row,
          ...activity,
          accountId: activity.accountId || row.accountId,
          accountKey: activity.accountKey || row.accountKey,
          symbol: activity.symbol || row.symbol,
          description: activity.description || row.description,
          uic: activity.uic ?? row.uic,
          assetType: activity.assetType || row.assetType,
          side: activity.side || row.side,
          amount: activity.amount || row.amount,
          price: activity.price || row.price,
          externalReference: activity.externalReference || row.externalReference,
          raw: { openOrder: row.raw, activity: activity.raw }
        } : row);`,
    'order lifecycle merge'
  );

  core = replaceRequired(
    core,
    `        statusSource: 'Saxo open orders + audit order activities',
        liveLocked: true`,
    `        statusSource: activityHistoryAvailable ? 'Saxo open orders + audit order activities' : 'Saxo open orders; audit history unavailable for current OAuth permission',
        activityHistoryAvailable,
        liveLocked: true`,
    'order lifecycle source status'
  );

  await fs.writeFile(corePath, core, 'utf8');
}

console.log('saxo-sim-execution-v7.3.2-status-safety', {
  applied: true,
  normalizedDatabaseStatuses: true,
  auditPermissionFallback: true,
  orderDetailsPreserved: true,
  liveLocked: true
});
