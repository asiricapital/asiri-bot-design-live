import fs from 'node:fs/promises';

const corePath = new URL('./saxo-sim-execution-core-v730.js', import.meta.url);
const marker = 'ASIRI_SAXO_SIM_EXECUTION_HARDENING_V731';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.3.1 Saxo execution hardening failed: ${label} anchor not found`);
  return text.replace(before, after);
}

function replaceRange(text, startMarker, endMarker, replacement, label) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`v7.3.1 Saxo execution hardening failed: ${label} range not found`);
  return text.slice(0, start) + replacement + text.slice(end);
}

let core = await fs.readFile(corePath, 'utf8');
if (!core.includes(marker)) {
  core = replaceRequired(
    core,
    "const allowedRead = method === 'GET' && (pathname.startsWith('/port/') || pathname.startsWith('/ref/') || pathname.startsWith('/trade/v1/infoprices'));",
    "const allowedRead = method === 'GET' && (pathname.startsWith('/port/') || pathname.startsWith('/ref/') || pathname.startsWith('/trade/v1/infoprices') || pathname.startsWith('/cs/v1/audit/orderactivities'));",
    'Saxo read allowlist'
  );

  core = replaceRequired(
    core,
    `  const detailsQuery = new URLSearchParams();
  if (accountKey) detailsQuery.set('AccountKey', accountKey);`,
    `  const detailsQuery = new URLSearchParams();
  if (accountKey) detailsQuery.set('AccountKey', accountKey);
  detailsQuery.set('FieldGroups', 'OrderSetting,SupportedOrderTypeSettings');`,
    'instrument field groups'
  );

  core = replaceRequired(
    core,
    `    amountDecimals: Number.isInteger(details.AmountDecimals) ? details.AmountDecimals : 0,
    minimumLotSize: Number(details.MinimumLotSize || details.MinimumOrderValue || 0) || null,
    incrementSize: Number(details.IncrementSize || 0) || null,
    format: details.Format || null,
    orderDistances: details.OrderDistances || null,
    orderSetting: details.OrderSetting || null`,
    `    amountDecimals: Number.isInteger(details.AmountDecimals) ? details.AmountDecimals : 0,
    minimumLotSize: Number(details.MinimumLotSize || 0) || null,
    minimumTradeSize: Number(details.MinimumTradeSize || 0) || null,
    minimumOrderValue: Number(details.MinimumOrderValue || 0) || null,
    incrementSize: Number(details.IncrementSize || 0) || null,
    tickSizeLimitOrder: Number(details.TickSizeLimitOrder || details.TickSize || 0) || null,
    format: details.Format || null,
    orderDistances: details.OrderDistances || null,
    orderSetting: details.OrderSetting || null,
    supportedOrderTypes: Array.isArray(details.SupportedOrderTypes) ? details.SupportedOrderTypes : [],
    supportedOrderTypeSettings: Array.isArray(details.SupportedOrderTypeSettings) ? details.SupportedOrderTypeSettings : [],
    shortTradeDisabled: details.ShortTradeDisabled === true,
    tradingStatus: details.TradingStatus || null`,
    'instrument execution constraints'
  );

  core = replaceRequired(
    core,
    `  if (!cfg.allowedDurations.includes(duration)) throw httpError('Unsupported order duration.', 400, 'INVALID_DURATION');
  const decimals = Math.max(0, Number(instrument.amountDecimals || 0));`,
    `  if (!cfg.allowedDurations.includes(duration)) throw httpError('Unsupported order duration.', 400, 'INVALID_DURATION');
  if (instrument.supportedOrderTypes?.length && !instrument.supportedOrderTypes.includes('Limit')) {
    throw httpError('Saxo does not support Limit orders for this instrument.', 409, 'LIMIT_NOT_SUPPORTED');
  }
  const limitSetting = instrument.supportedOrderTypeSettings?.find((row) => row?.OrderType === 'Limit');
  if (Array.isArray(limitSetting?.DurationTypes) && limitSetting.DurationTypes.length && !limitSetting.DurationTypes.includes(duration)) {
    throw httpError('The selected duration is not supported for Limit orders on this instrument.', 409, 'DURATION_NOT_SUPPORTED');
  }
  const minimumQuantity = Math.max(Number(instrument.minimumLotSize || 0), Number(instrument.minimumTradeSize || 0));
  if (minimumQuantity > 0 && amount < minimumQuantity) {
    throw httpError(\`Quantity is below Saxo's minimum trade size of \${minimumQuantity}.\`, 409, 'AMOUNT_BELOW_MINIMUM');
  }
  const maxOrderSize = Number(instrument.orderSetting?.MaxOrderSize || 0);
  if (maxOrderSize > 0 && amount > maxOrderSize) {
    throw httpError(\`Quantity exceeds Saxo's maximum order size of \${maxOrderSize}.\`, 409, 'AMOUNT_ABOVE_MAXIMUM');
  }
  const notional = amount * price;
  const minOrderValue = Math.max(Number(instrument.minimumOrderValue || 0), Number(instrument.orderSetting?.MinOrderValue || 0));
  const maxOrderValue = Number(instrument.orderSetting?.MaxOrderValue || 0);
  if (minOrderValue > 0 && notional < minOrderValue) throw httpError('Order value is below the instrument minimum.', 409, 'ORDER_VALUE_BELOW_MINIMUM');
  if (maxOrderValue > 0 && notional > maxOrderValue) throw httpError('Order value exceeds the instrument maximum.', 409, 'ORDER_VALUE_ABOVE_MAXIMUM');
  const tick = Number(instrument.tickSizeLimitOrder || 0);
  if (tick > 0) {
    const ticks = price / tick;
    if (Math.abs(ticks - Math.round(ticks)) > 1e-7) throw httpError(\`Limit price must follow Saxo's tick size of \${tick}.\`, 409, 'INVALID_PRICE_INCREMENT');
  }
  const decimals = Math.max(0, Number(instrument.amountDecimals || 0));`,
    'instrument-aware order validation'
  );

  core = replaceRequired(
    core,
    `    delayedByMinutes: Number(payload.PriceInfo?.DelayedByMinutes ?? payload.PriceInfoDetails?.DelayedByMinutes ?? 0),
    marketState: payload.MarketState || payload.PriceInfo?.MarketState || null,
    quoteCurrency: payload.DisplayAndFormat?.Currency || instrument.currency || null,`,
    `    delayedByMinutes: Number(payload.Quote?.DelayedByMinutes ?? payload.PriceInfo?.DelayedByMinutes ?? payload.PriceInfoDetails?.DelayedByMinutes ?? 0),
    marketState: payload.MarketState || payload.PriceInfo?.MarketState || null,
    quoteError: payload.Quote?.ErrorCode || null,
    priceTypeBid: payload.Quote?.PriceTypeBid || null,
    priceTypeAsk: payload.Quote?.PriceTypeAsk || null,
    quoteCurrency: payload.DisplayAndFormat?.Currency || instrument.currency || null,`,
    'price quality fields'
  );

  core = replaceRequired(
    core,
    `  push('price-delay', Number(price.delayedByMinutes || 0) <= 15, 'Saxo price delay exceeds 15 minutes.');
  return { passed: failures.length === 0, failures, checks, notional, availableCash, totalValue };`,
    `  push('price-delay', Number(price.delayedByMinutes || 0) <= 15, 'Saxo price delay exceeds 15 minutes.');
  push('quote-error', !price.quoteError || price.quoteError === 'None', \`Saxo price returned error: \${price.quoteError || 'unknown'}.\`);
  const disallowedPriceTypes = new Set(['NoAccess', 'NoMarket', 'Pending', 'OldIndicative']);
  push('price-type', !disallowedPriceTypes.has(price.priceTypeBid) && !disallowedPriceTypes.has(price.priceTypeAsk), 'Saxo price is not current or accessible enough for confirmation.');
  return { passed: failures.length === 0, failures, checks, notional, availableCash, totalValue };`,
    'price quality risk controls'
  );

  core = replaceRequired(
    core,
    `function precheckHasDisclaimers(payload) {
  const values = [payload?.PreTradeDisclaimers, payload?.Disclaimers, payload?.Disclaimer];
  return values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value?.Data?.length || value?.length));
}
`,
    `function precheckHasDisclaimers(payload) {
  const values = [payload?.PreTradeDisclaimers, payload?.Disclaimers, payload?.Disclaimer];
  return values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value?.Data?.length || value?.length));
}

function saxoResponseError(payload) {
  const info = payload?.ErrorInfo || payload?.errorInfo || null;
  if (!info) return null;
  if (typeof info === 'string') return { code: 'SAXO_ORDER_REJECTED', message: info };
  const code = info.ErrorCode || info.Code || 'SAXO_ORDER_REJECTED';
  const message = info.Message || info.ErrorMessage || code;
  return { code, message, details: info };
}

function assertSaxoBusinessResponse(payload, stage) {
  const failure = saxoResponseError(payload);
  if (failure) throw httpError(\`Saxo \${stage} rejected the order: \${failure.message}\`, 409, failure.code, payload);
  return payload;
}

function normalizeActivityStatus(activity) {
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

// ASIRI_SAXO_SIM_EXECUTION_HARDENING_V731
`,
    'Saxo business response validation'
  );

  core = replaceRequired(
    core,
    `      const precheck = await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', { method: 'POST', body: orderRequest });
      if (precheckHasDisclaimers(precheck))`,
    `      const precheck = assertSaxoBusinessResponse(await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', { method: 'POST', body: orderRequest }), 'pre-check');
      if (precheckHasDisclaimers(precheck))`,
    'initial pre-check business result'
  );

  core = replaceRequired(
    core,
    `      const secondPrecheck = await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', {
        method: 'POST',
        body: preview.orderRequest,
        requestId
      });`,
    `      const secondPrecheck = assertSaxoBusinessResponse(await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', {
        method: 'POST',
        body: preview.orderRequest,
        requestId
      }), 'final pre-check');`,
    'final pre-check business result'
  );

  core = replaceRequired(
    core,
    `        responsePayload = await saxoRequest(user.id, deps, '/trade/v2/orders', {
          method: 'POST',
          body: preview.orderRequest,
          requestId
        });`,
    `        responsePayload = assertSaxoBusinessResponse(await saxoRequest(user.id, deps, '/trade/v2/orders', {
          method: 'POST',
          body: preview.orderRequest,
          requestId
        }), 'order placement');
        const returnedOrderId = responsePayload.OrderId || responsePayload.Orders?.[0]?.OrderId;
        if (!returnedOrderId) throw httpError('Saxo returned no OrderId. Submission outcome is uncertain and must not be retried.', 502, 'SUBMISSION_UNKNOWN', responsePayload);`,
    'order placement business result'
  );

  const ordersEndpoint = `  app.get('/api/broker/saxo/orders', async (req, res) => {
    try {
      const user = await deps.verifyUser(req);
      const cfg = executionConfig(deps.config);
      if (cfg.environment !== 'sim') throw httpError('LIVE order reads are blocked by this execution module.', 423, 'LIVE_LOCKED');

      const [openPayload, activitiesPayload] = await Promise.all([
        saxoRequest(user.id, deps, '/port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat'),
        saxoRequest(user.id, deps, '/cs/v1/audit/orderactivities?$top=100&EntryType=Last')
      ]);

      const requested = String(req.query.orderId || '').trim();
      const openOrders = (openPayload.Data || []).map((row) => ({
        orderId: String(row.OrderId || ''),
        accountId: row.AccountId || null,
        accountKey: row.AccountKey || null,
        symbol: canonicalSymbol(row.DisplayAndFormat?.Symbol || row.Description || ''),
        description: row.DisplayAndFormat?.Description || row.Description || null,
        uic: row.Uic ?? null,
        assetType: row.AssetType || null,
        side: row.BuySell || null,
        amount: Number(row.Amount || 0),
        filledAmount: Number(row.FilledAmount || 0),
        averagePrice: Number(row.AveragePrice || 0) || null,
        price: Number(row.Price || row.OrderPrice || 0),
        status: String(row.Status || row.OrderStatus || 'Working').toLowerCase(),
        brokerStatus: row.Status || row.OrderStatus || null,
        brokerSubStatus: null,
        duration: row.Duration || row.OrderDuration || null,
        externalReference: row.ExternalReference || null,
        activityTime: null,
        source: 'open-orders',
        raw: row
      }));

      const activityOrders = (activitiesPayload.Data || []).map((row) => ({
        orderId: String(row.OrderId || ''),
        accountId: row.AccountId || null,
        accountKey: row.AccountKey || null,
        symbol: canonicalSymbol(row.Symbol || ''),
        description: row.Description || null,
        uic: row.Uic ?? null,
        assetType: row.AssetType || null,
        side: row.BuySell || null,
        amount: Number(row.Amount || 0),
        filledAmount: Number(row.FilledAmount || row.FillAmount || 0),
        averagePrice: Number(row.AveragePrice || 0) || null,
        price: Number(row.Price || row.OrderPrice || 0),
        status: normalizeActivityStatus(row),
        brokerStatus: row.Status || null,
        brokerSubStatus: row.SubStatus || null,
        duration: row.Duration || row.OrderDuration || null,
        externalReference: row.ExternalReference || null,
        activityTime: row.ActivityTime || row.ActivityDateTime || null,
        source: 'order-activities',
        raw: row
      }));

      const merged = new Map();
      for (const row of activityOrders) if (row.orderId) merged.set(row.orderId, row);
      for (const row of openOrders) {
        if (!row.orderId) continue;
        const activity = merged.get(row.orderId);
        merged.set(row.orderId, activity ? { ...row, ...activity, raw: { openOrder: row.raw, activity: activity.raw } } : row);
      }
      let orders = [...merged.values()].filter((row) => row.orderId);
      if (requested) orders = orders.filter((row) => row.orderId === requested);
      orders.sort((a, b) => String(b.activityTime || '').localeCompare(String(a.activityTime || '')));

      let auditRows = [];
      try {
        auditRows = await deps.adminRest(\`broker_orders?select=*&user_id=eq.\${encodeURIComponent(user.id)}&order=created_at.desc&limit=100\`) || [];
      } catch (error) {
        deps.markStorageError(error);
      }
      const byOrderId = new Map(orders.map((row) => [String(row.orderId), row]));
      for (const audit of auditRows) {
        const live = audit.saxo_order_id ? byOrderId.get(String(audit.saxo_order_id)) : null;
        if (!live || !audit.saxo_order_id) continue;
        if (live.status && live.status !== audit.status) {
          await updateOrder(deps, audit, {
            status: live.status,
            response_payload: { ...(audit.response_payload || {}), latestActivity: live.raw },
            error_code: live.status === 'rejected' ? (live.raw?.activity?.ErrorCode || null) : null,
            error_message: live.status === 'rejected' ? (live.raw?.activity?.Reason || live.raw?.activity?.Message || 'Rejected by Saxo') : null
          }, 'supabase');
          await appendEvent(deps, {
            user_id: user.id,
            request_id: audit.request_id,
            preview_id: audit.preview_id,
            event_type: 'broker-status-updated',
            status: live.status,
            event_payload: { orderId: live.orderId, brokerStatus: live.brokerStatus, brokerSubStatus: live.brokerSubStatus, activityTime: live.activityTime }
          });
        }
      }

      res.json({
        environment: 'sim',
        count: orders.length,
        orders,
        nextPoll: activitiesPayload.__nextPoll || null,
        statusSource: 'Saxo open orders + audit order activities',
        liveLocked: true
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null });
    }
  });

`;

  core = replaceRange(
    core,
    "  app.get('/api/broker/saxo/orders', async (req, res) => {",
    "  app.get('/api/broker/saxo/orders/audit', async (req, res) => {",
    ordersEndpoint,
    'order lifecycle endpoint'
  );

  await fs.writeFile(corePath, core, 'utf8');
}

console.log('saxo-sim-execution-v7.3.1-hardening', {
  applied: true,
  officialInstrumentConstraints: true,
  businessErrorInspection: true,
  orderActivityLifecycle: true,
  ambiguousSubmissionLocked: true,
  liveLocked: true
});
