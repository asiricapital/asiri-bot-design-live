import crypto from 'node:crypto';

const previews = new Map();
const memoryOrders = new Map();
const inFlightRequests = new Set();

const now = () => Date.now();
const randomId = (prefix = 'id') => `${prefix}_${crypto.randomBytes(18).toString('base64url')}`;
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const canonicalSymbol = (value) => String(value || '').trim().toUpperCase().split(':')[0].replace(/[^A-Z0-9.-]/g, '');

function httpError(message, statusCode = 400, code = null, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (details) error.details = details;
  return error;
}

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function numberEnv(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function executionConfig(baseConfig) {
  const base = baseConfig();
  const mode = String(process.env.SAXO_EXECUTION_MODE || 'read-only').trim().toLowerCase();
  return {
    environment: base.environment,
    apiBase: base.apiBase,
    mode,
    enabled: base.environment === 'sim' && mode === 'confirmed-only',
    liveLocked: base.environment !== 'sim',
    killSwitch: boolEnv('SAXO_EXECUTION_KILL_SWITCH', true),
    requireAudit: boolEnv('SAXO_EXECUTION_REQUIRE_AUDIT', true),
    previewTtlSeconds: numberEnv('SAXO_EXECUTION_PREVIEW_TTL_SECONDS', 180, { min: 60, max: 600 }),
    maxNotionalUsd: numberEnv('SAXO_EXECUTION_MAX_NOTIONAL_USD', 5000, { min: 1, max: 1000000 }),
    maxQuantity: numberEnv('SAXO_EXECUTION_MAX_QUANTITY', 10000, { min: 1, max: 10000000 }),
    maxConcentration: numberEnv('SAXO_EXECUTION_MAX_CONCENTRATION', 0.35, { min: 0.01, max: 1 }),
    maxPriceDeviation: numberEnv('SAXO_EXECUTION_MAX_PRICE_DEVIATION', 0.25, { min: 0.01, max: 1 }),
    allowedAssetTypes: ['Stock'],
    allowedOrderTypes: ['Limit'],
    allowedDurations: ['DayOrder', 'GoodTillCancel']
  };
}

function publicExecutionStatus(deps) {
  const cfg = executionConfig(deps.config);
  const legacyTradingFlag = String(process.env.SAXO_ALLOW_TRADING || 'false').toLowerCase() === 'true';
  const blockers = [];
  if (cfg.environment !== 'sim') blockers.push('LIVE environment is permanently locked.');
  if (cfg.mode !== 'confirmed-only') blockers.push('SAXO_EXECUTION_MODE must be confirmed-only.');
  if (cfg.killSwitch) blockers.push('Execution kill switch is enabled.');
  if (legacyTradingFlag) blockers.push('SAXO_ALLOW_TRADING must remain false.');
  return {
    environment: cfg.environment,
    executionMode: cfg.mode,
    enabled: cfg.enabled && !cfg.killSwitch && !legacyTradingFlag,
    confirmedOnly: true,
    liveLocked: true,
    killSwitch: cfg.killSwitch,
    requireAudit: cfg.requireAudit,
    orderTypes: cfg.allowedOrderTypes,
    assetTypes: cfg.allowedAssetTypes,
    durations: cfg.allowedDurations,
    previewTtlSeconds: cfg.previewTtlSeconds,
    limits: {
      maxNotionalUsd: cfg.maxNotionalUsd,
      maxQuantity: cfg.maxQuantity,
      maxConcentration: cfg.maxConcentration,
      maxPriceDeviation: cfg.maxPriceDeviation
    },
    blockers,
    requiredEnv: ['SAXO_ENV=sim', 'SAXO_EXECUTION_MODE=confirmed-only', 'SAXO_EXECUTION_KILL_SWITCH=false'],
    invariant: 'SAXO_ALLOW_TRADING=false and LIVE execution is never permitted.'
  };
}

function assertExecutionReady(deps) {
  const status = publicExecutionStatus(deps);
  if (!status.enabled) {
    throw httpError(`Saxo SIM execution is locked: ${status.blockers.join(' ') || 'configuration is incomplete.'}`, 423, 'EXECUTION_LOCKED', status);
  }
  return executionConfig(deps.config);
}

async function saxoRequest(userId, deps, pathname, { method = 'GET', body = null, requestId = null } = {}) {
  const base = deps.config();
  if (base.environment !== 'sim') throw httpError('LIVE Saxo endpoints are permanently blocked.', 423, 'LIVE_LOCKED');
  const allowedRead = method === 'GET' && (pathname.startsWith('/port/') || pathname.startsWith('/ref/') || pathname.startsWith('/trade/v1/infoprices'));
  const allowedWrite = method === 'POST' && (pathname === '/trade/v2/orders/precheck' || pathname === '/trade/v2/orders');
  if (!allowedRead && !allowedWrite) throw httpError('Saxo endpoint is outside the SIM execution allowlist.', 403, 'ENDPOINT_BLOCKED');

  const token = await deps.refreshIfPossible(userId);
  if (!token) throw httpError('Saxo access token is unavailable or expired.', 401, 'SAXO_TOKEN_MISSING');
  const headers = { authorization: `Bearer ${token}`, accept: 'application/json' };
  if (body !== null) headers['content-type'] = 'application/json';
  if (requestId) headers['x-request-id'] = requestId;
  const response = await fetch(`${base.apiBase}${pathname}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { Message: text }; }
  if (!response.ok) {
    throw httpError(
      payload.Message || payload.ErrorCode || payload.error_description || `Saxo API request failed (${response.status}).`,
      response.status,
      payload.ErrorCode || 'SAXO_API_ERROR',
      payload
    );
  }
  return payload;
}

function prunePreviews() {
  for (const [id, preview] of previews) {
    if (preview.expiresAt <= now() || preview.consumedAt) previews.delete(id);
  }
}

function accountFromSnapshot(snapshot, requestedAccountKey) {
  const active = (snapshot?.accounts || []).filter((row) => row.active !== false && row.accountKey);
  if (!active.length) throw httpError('No active Saxo SIM account is available.', 409, 'ACCOUNT_MISSING');
  if (requestedAccountKey) {
    const exact = active.find((row) => row.accountKey === requestedAccountKey);
    if (!exact) throw httpError('The selected Saxo account is not available in the latest snapshot.', 409, 'ACCOUNT_NOT_FOUND');
    return exact;
  }
  if (active.length !== 1) throw httpError('Select the Saxo account explicitly before preparing an order.', 409, 'ACCOUNT_SELECTION_REQUIRED');
  return active[0];
}

function uicFromSummary(row) {
  const value = Number(row?.Identifier ?? row?.Uic ?? row?.uic);
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function resolveInstrument(userId, deps, { symbol, accountKey }) {
  const normalized = canonicalSymbol(symbol);
  if (!normalized) throw httpError('A valid U.S. stock symbol is required.', 400, 'INVALID_SYMBOL');
  const query = new URLSearchParams({
    Keywords: normalized,
    AssetTypes: 'Stock',
    IncludeNonTradable: 'false',
    '$top': '20'
  });
  if (accountKey) query.set('AccountKey', accountKey);
  const result = await saxoRequest(userId, deps, `/ref/v1/instruments?${query}`);
  const candidates = (result.Data || []).filter((row) => {
    const candidateSymbol = canonicalSymbol(row.Symbol || row.DisplayAndFormat?.Symbol || row.Description);
    const tradableAs = Array.isArray(row.TradableAs) ? row.TradableAs : [];
    return candidateSymbol === normalized && (row.AssetType === 'Stock' || tradableAs.includes('Stock'));
  });
  const summary = candidates[0];
  const uic = uicFromSummary(summary);
  if (!summary || !uic) throw httpError(`Saxo could not resolve ${normalized} to a tradable Stock UIC.`, 404, 'INSTRUMENT_NOT_FOUND');
  const assetType = summary.AssetType === 'Stock' ? 'Stock' : 'Stock';
  const detailsQuery = new URLSearchParams();
  if (accountKey) detailsQuery.set('AccountKey', accountKey);
  const details = await saxoRequest(userId, deps, `/ref/v1/instruments/details/${uic}/${assetType}${detailsQuery.size ? `?${detailsQuery}` : ''}`);
  if (details.IsTradable === false) throw httpError(`${normalized} is not tradable for the selected Saxo SIM account.`, 409, 'INSTRUMENT_NOT_TRADABLE');
  const resolvedSymbol = canonicalSymbol(details.Symbol || details.DisplayAndFormat?.Symbol || summary.Symbol || normalized);
  if (resolvedSymbol !== normalized) throw httpError('The Saxo instrument result did not match the requested symbol exactly.', 409, 'SYMBOL_MISMATCH');
  return {
    symbol: normalized,
    uic,
    assetType,
    description: details.Description || summary.Description || normalized,
    currency: details.CurrencyCode || details.DisplayAndFormat?.Currency || summary.CurrencyCode || null,
    exchangeId: details.Exchange?.ExchangeId || summary.ExchangeId || null,
    exchangeName: details.Exchange?.Name || null,
    isTradable: details.IsTradable !== false,
    amountDecimals: Number.isInteger(details.AmountDecimals) ? details.AmountDecimals : 0,
    minimumLotSize: Number(details.MinimumLotSize || details.MinimumOrderValue || 0) || null,
    incrementSize: Number(details.IncrementSize || 0) || null,
    format: details.Format || null,
    orderDistances: details.OrderDistances || null,
    orderSetting: details.OrderSetting || null
  };
}

async function infoPrice(userId, deps, { accountKey, instrument, quantity, side }) {
  const query = new URLSearchParams({
    AccountKey: accountKey,
    Amount: String(quantity),
    AmountType: 'Quantity',
    AssetType: instrument.assetType,
    Uic: String(instrument.uic),
    FieldGroups: 'Quote,DisplayAndFormat,PriceInfo,PriceInfoDetails'
  });
  const payload = await saxoRequest(userId, deps, `/trade/v1/infoprices?${query}`);
  const bid = Number(payload.Quote?.Bid || 0);
  const ask = Number(payload.Quote?.Ask || 0);
  const mid = Number(payload.Quote?.Mid || (bid && ask ? (bid + ask) / 2 : bid || ask || 0));
  const referencePrice = side === 'Buy' ? ask || mid : bid || mid;
  return {
    bid: bid || null,
    ask: ask || null,
    mid: mid || null,
    referencePrice: referencePrice || null,
    delayedByMinutes: Number(payload.PriceInfo?.DelayedByMinutes ?? payload.PriceInfoDetails?.DelayedByMinutes ?? 0),
    marketState: payload.MarketState || payload.PriceInfo?.MarketState || null,
    quoteCurrency: payload.DisplayAndFormat?.Currency || instrument.currency || null,
    fetchedAt: new Date().toISOString()
  };
}

function validateOrderInput({ side, quantity, limitPrice, durationType }, instrument, cfg) {
  const normalizedSide = String(side || 'Buy').trim().toLowerCase() === 'sell' ? 'Sell' : 'Buy';
  const amount = Number(quantity);
  const price = Number(limitPrice);
  const duration = String(durationType || 'DayOrder');
  if (!Number.isFinite(amount) || amount <= 0 || amount > cfg.maxQuantity) throw httpError(`Quantity must be between 0 and ${cfg.maxQuantity}.`, 400, 'INVALID_QUANTITY');
  if (!Number.isFinite(price) || price <= 0) throw httpError('A positive limit price is required.', 400, 'INVALID_LIMIT_PRICE');
  if (!cfg.allowedDurations.includes(duration)) throw httpError('Unsupported order duration.', 400, 'INVALID_DURATION');
  const decimals = Math.max(0, Number(instrument.amountDecimals || 0));
  const scaled = amount * (10 ** decimals);
  if (Math.abs(scaled - Math.round(scaled)) > 1e-8) throw httpError(`Quantity supports at most ${decimals} decimal places.`, 400, 'INVALID_QUANTITY_PRECISION');
  return { side: normalizedSide, quantity: amount, limitPrice: price, durationType: duration };
}

function riskChecks({ snapshot, instrument, order, price, cfg }) {
  const checks = [];
  const failures = [];
  const notional = order.quantity * order.limitPrice;
  const balance = snapshot.balance || {};
  const currentPosition = (snapshot.positions || []).find((row) => Number(row.uic) === Number(instrument.uic) || canonicalSymbol(row.symbol) === instrument.symbol);
  const currentMarketValue = Number(currentPosition?.marketValue || 0);
  const totalValue = Number(balance.totalValue || 0);
  const availableCash = Number(balance.cashAvailableForTrading || balance.cashBalance || 0);

  const push = (name, passed, detail) => {
    checks.push({ name, passed, detail });
    if (!passed) failures.push(detail);
  };

  push('sim-environment', snapshot.environment === 'sim', 'The latest account snapshot must come from Saxo SIM.');
  push('stock-only', instrument.assetType === 'Stock', 'Only Stock instruments are allowed.');
  push('limit-only', true, 'Only Limit orders are generated.');
  push('max-notional', notional <= cfg.maxNotionalUsd, `Order notional exceeds the configured ${cfg.maxNotionalUsd} USD limit.`);
  if (order.side === 'Buy') {
    push('available-cash', availableCash >= notional, 'Available SIM cash is lower than the order notional.');
    if (totalValue > 0) {
      const concentration = (currentMarketValue + notional) / totalValue;
      push('concentration', concentration <= cfg.maxConcentration, `Post-trade concentration would exceed ${(cfg.maxConcentration * 100).toFixed(0)}%.`);
    }
  } else {
    push('no-short-selling', Number(currentPosition?.quantity || 0) >= order.quantity, 'Sell quantity exceeds the current Saxo position; short selling is blocked.');
  }
  if (price.referencePrice) {
    const deviation = Math.abs(order.limitPrice - price.referencePrice) / price.referencePrice;
    push('price-deviation', deviation <= cfg.maxPriceDeviation, `Limit price is more than ${(cfg.maxPriceDeviation * 100).toFixed(0)}% away from the current Saxo reference price.`);
  } else {
    push('price-available', false, 'A current Saxo reference price is required before confirmation.');
  }
  push('price-delay', Number(price.delayedByMinutes || 0) <= 15, 'Saxo price delay exceeds 15 minutes.');
  return { passed: failures.length === 0, failures, checks, notional, availableCash, totalValue };
}

function precheckHasDisclaimers(payload) {
  const values = [payload?.PreTradeDisclaimers, payload?.Disclaimers, payload?.Disclaimer];
  return values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value?.Data?.length || value?.length));
}

async function persistPreview(deps, preview) {
  try {
    await deps.adminRest('broker_order_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: preview.userId,
        request_id: null,
        preview_id: preview.id,
        event_type: 'preview-created',
        status: 'prechecked',
        event_payload: {
          symbol: preview.instrument.symbol,
          uic: preview.instrument.uic,
          assetType: preview.instrument.assetType,
          accountKey: preview.accountKey,
          side: preview.order.side,
          quantity: preview.order.quantity,
          limitPrice: preview.order.limitPrice,
          notional: preview.risk.notional,
          expiresAt: new Date(preview.expiresAt).toISOString()
        }
      }
    });
    return { ok: true, mode: 'supabase' };
  } catch (error) {
    deps.markStorageError(error);
    return { ok: false, mode: 'memory', error: error.message };
  }
}

async function reserveOrder(deps, orderRow, requireAudit) {
  const memoryKey = `${orderRow.user_id}:${orderRow.request_id}`;
  if (memoryOrders.has(memoryKey)) return { mode: 'memory', existing: true, row: memoryOrders.get(memoryKey) };
  try {
    const inserted = await deps.adminRest('broker_orders?on_conflict=user_id,request_id', {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: orderRow
    });
    if (inserted?.length) return { mode: 'supabase', existing: false, row: inserted[0] };
    const rows = await deps.adminRest(`broker_orders?select=*&user_id=eq.${encodeURIComponent(orderRow.user_id)}&request_id=eq.${encodeURIComponent(orderRow.request_id)}&limit=1`);
    if (rows?.length) return { mode: 'supabase', existing: true, row: rows[0] };
    throw new Error('Unable to reserve a durable order request.');
  } catch (error) {
    deps.markStorageError(error);
    if (requireAudit) throw httpError(`Durable audit storage is required before execution: ${error.message}`, 503, 'AUDIT_NOT_READY');
    memoryOrders.set(memoryKey, orderRow);
    return { mode: 'memory', existing: false, row: orderRow };
  }
}

async function updateOrder(deps, orderRow, patch, mode) {
  const memoryKey = `${orderRow.user_id}:${orderRow.request_id}`;
  const merged = { ...orderRow, ...patch, updated_at: new Date().toISOString() };
  memoryOrders.set(memoryKey, merged);
  if (mode === 'supabase') {
    try {
      await deps.adminRest(`broker_orders?user_id=eq.${encodeURIComponent(orderRow.user_id)}&request_id=eq.${encodeURIComponent(orderRow.request_id)}`, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { ...patch, updated_at: merged.updated_at }
      });
    } catch (error) {
      deps.markStorageError(error);
    }
  }
  return merged;
}

async function appendEvent(deps, data) {
  try {
    await deps.adminRest('broker_order_events', { method: 'POST', prefer: 'return=minimal', body: data });
  } catch (error) {
    deps.markStorageError(error);
  }
}

function sanitizePreview(preview, token, persistence) {
  return {
    previewId: preview.id,
    confirmationToken: token,
    expiresAt: new Date(preview.expiresAt).toISOString(),
    environment: 'sim',
    executionMode: 'confirmed-only',
    instrument: preview.instrument,
    accountKey: preview.accountKey,
    accountId: preview.accountId,
    order: preview.order,
    market: preview.market,
    risk: preview.risk,
    precheck: preview.precheck,
    externalReference: preview.orderRequest.ExternalReference,
    persistence,
    confirmationRequired: true,
    liveLocked: true
  };
}

function existingOrderResponse(row) {
  const response = row.response_payload || row.response || null;
  return {
    duplicate: true,
    requestId: row.request_id,
    previewId: row.preview_id,
    status: row.status,
    orderId: row.saxo_order_id || response?.OrderId || null,
    response,
    message: row.status === 'submitting' || row.status === 'unknown'
      ? 'This x-request-id is already reserved. The order will not be sent again; reconcile its status first.'
      : 'The original result for this x-request-id was returned without resubmitting.'
  };
}

export function registerSaxoSimExecution(app, deps) {
  app.get('/api/broker/saxo/execution/status', async (req, res) => {
    try {
      await deps.verifyUser(req);
      res.json(publicExecutionStatus(deps));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null });
    }
  });

  app.post('/api/broker/saxo/instruments/resolve', async (req, res) => {
    try {
      const user = await deps.verifyUser(req);
      assertExecutionReady(deps);
      const snapshot = await deps.buildSnapshot(user.id);
      const account = accountFromSnapshot(snapshot, String(req.body?.accountKey || ''));
      const instrument = await resolveInstrument(user.id, deps, { symbol: req.body?.symbol, accountKey: account.accountKey });
      res.json({ environment: 'sim', account, instrument, liveLocked: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null });
    }
  });

  app.post('/api/broker/saxo/orders/preview', async (req, res) => {
    try {
      prunePreviews();
      const user = await deps.verifyUser(req);
      const cfg = assertExecutionReady(deps);
      const snapshot = await deps.buildSnapshot(user.id);
      const account = accountFromSnapshot(snapshot, String(req.body?.accountKey || ''));
      const instrument = req.body?.uic && req.body?.assetType === 'Stock'
        ? await resolveInstrument(user.id, deps, { symbol: req.body?.symbol, accountKey: account.accountKey })
        : await resolveInstrument(user.id, deps, { symbol: req.body?.symbol, accountKey: account.accountKey });
      if (req.body?.uic && Number(req.body.uic) !== instrument.uic) throw httpError('The supplied UIC does not match Saxo instrument resolution.', 409, 'UIC_MISMATCH');
      const order = validateOrderInput(req.body || {}, instrument, cfg);
      const market = await infoPrice(user.id, deps, { accountKey: account.accountKey, instrument, quantity: order.quantity, side: order.side });
      const risk = riskChecks({ snapshot, instrument, order, price: market, cfg });
      if (!risk.passed) throw httpError('The order failed Asiri pre-trade risk controls.', 409, 'RISK_VETO', risk);

      const previewId = randomId('preview');
      const confirmationToken = randomId('confirm');
      const externalReference = `ASI-${sha256(`${user.id}:${previewId}`).slice(0, 24)}`;
      const orderRequest = {
        AccountKey: account.accountKey,
        Amount: order.quantity,
        AssetType: instrument.assetType,
        BuySell: order.side,
        Uic: instrument.uic,
        OrderType: 'Limit',
        OrderPrice: order.limitPrice,
        OrderDuration: { DurationType: order.durationType },
        ManualOrder: true,
        ExternalReference: externalReference
      };
      const precheck = await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', { method: 'POST', body: orderRequest });
      if (precheckHasDisclaimers(precheck)) throw httpError('Saxo requires a pre-trade disclaimer that must be completed in an approved Saxo flow.', 409, 'PRETRADE_DISCLAIMER_REQUIRED', precheck);
      const preview = {
        id: previewId,
        userId: user.id,
        tokenHash: sha256(confirmationToken),
        createdAt: now(),
        expiresAt: now() + cfg.previewTtlSeconds * 1000,
        consumedAt: null,
        accountKey: account.accountKey,
        accountId: account.accountId,
        instrument,
        order,
        market,
        risk,
        precheck,
        orderRequest
      };
      previews.set(previewId, preview);
      const persistence = await persistPreview(deps, preview);
      if (cfg.requireAudit && !persistence.ok) {
        previews.delete(previewId);
        throw httpError(`Durable audit storage is required before confirmation: ${persistence.error}`, 503, 'AUDIT_NOT_READY');
      }
      res.json(sanitizePreview(preview, confirmationToken, persistence));
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null });
    }
  });

  app.post('/api/broker/saxo/orders/confirm', async (req, res) => {
    const requestId = String(req.headers['x-request-id'] || req.body?.requestId || '').trim();
    let lockKey = null;
    let reservationContext = null;
    let failurePersisted = false;
    try {
      prunePreviews();
      const user = await deps.verifyUser(req);
      const cfg = assertExecutionReady(deps);
      if (!/^[A-Za-z0-9._:-]{8,64}$/.test(requestId)) throw httpError('A stable x-request-id of 8 to 64 safe characters is required.', 400, 'INVALID_REQUEST_ID');
      lockKey = `${user.id}:${requestId}`;
      if (inFlightRequests.has(lockKey)) throw httpError('This x-request-id is already being processed.', 409, 'REQUEST_IN_FLIGHT');
      const memoryExisting = memoryOrders.get(lockKey);
      if (memoryExisting) return res.json(existingOrderResponse(memoryExisting));

      const previewId = String(req.body?.previewId || '');
      const confirmationToken = String(req.body?.confirmationToken || '');
      const preview = previews.get(previewId);
      if (!preview || preview.userId !== user.id) throw httpError('Order preview was not found or has expired.', 404, 'PREVIEW_NOT_FOUND');
      if (preview.expiresAt <= now()) throw httpError('Order preview expired. Run a fresh pre-check.', 410, 'PREVIEW_EXPIRED');
      if (preview.consumedAt) throw httpError('Order preview was already consumed.', 409, 'PREVIEW_CONSUMED');
      const actualHash = Buffer.from(sha256(confirmationToken));
      const expectedHash = Buffer.from(preview.tokenHash);
      if (actualHash.length !== expectedHash.length || !crypto.timingSafeEqual(actualHash, expectedHash)) throw httpError('Manual confirmation token is invalid.', 403, 'CONFIRMATION_INVALID');

      inFlightRequests.add(lockKey);
      const createdAt = new Date().toISOString();
      const orderRow = {
        user_id: user.id,
        request_id: requestId,
        preview_id: preview.id,
        provider: 'saxo',
        environment: 'sim',
        execution_mode: 'confirmed-only',
        account_key: preview.accountKey,
        account_id: preview.accountId,
        symbol: preview.instrument.symbol,
        uic: preview.instrument.uic,
        asset_type: preview.instrument.assetType,
        side: preview.order.side,
        quantity: preview.order.quantity,
        order_type: 'Limit',
        limit_price: preview.order.limitPrice,
        duration_type: preview.order.durationType,
        notional: preview.risk.notional,
        external_reference: preview.orderRequest.ExternalReference,
        manual_order: true,
        status: 'submitting',
        request_payload: preview.orderRequest,
        response_payload: null,
        error_code: null,
        error_message: null,
        created_at: createdAt,
        confirmed_at: createdAt,
        updated_at: createdAt
      };
      const reservation = await reserveOrder(deps, orderRow, cfg.requireAudit);
      if (reservation.existing) return res.json(existingOrderResponse(reservation.row));
      reservationContext = { reservation, orderRow, preview, userId: user.id };

      preview.consumedAt = now();
      await appendEvent(deps, {
        user_id: user.id,
        request_id: requestId,
        preview_id: preview.id,
        event_type: 'manual-confirmation',
        status: 'submitting',
        event_payload: { confirmedAt: createdAt, externalReference: preview.orderRequest.ExternalReference }
      });

      const freshSnapshot = await deps.buildSnapshot(user.id);
      const freshAccount = accountFromSnapshot(freshSnapshot, preview.accountKey);
      if (freshAccount.accountKey !== preview.accountKey) throw httpError('Saxo account changed after preview.', 409, 'ACCOUNT_CHANGED');
      const freshMarket = await infoPrice(user.id, deps, {
        accountKey: preview.accountKey,
        instrument: preview.instrument,
        quantity: preview.order.quantity,
        side: preview.order.side
      });
      const freshRisk = riskChecks({ snapshot: freshSnapshot, instrument: preview.instrument, order: preview.order, price: freshMarket, cfg });
      if (!freshRisk.passed) throw httpError('The order failed the final risk re-check.', 409, 'FINAL_RISK_VETO', freshRisk);
      const secondPrecheck = await saxoRequest(user.id, deps, '/trade/v2/orders/precheck', {
        method: 'POST',
        body: preview.orderRequest,
        requestId
      });
      if (precheckHasDisclaimers(secondPrecheck)) throw httpError('Saxo returned a pre-trade disclaimer during final confirmation.', 409, 'PRETRADE_DISCLAIMER_REQUIRED', secondPrecheck);

      let responsePayload;
      try {
        responsePayload = await saxoRequest(user.id, deps, '/trade/v2/orders', {
          method: 'POST',
          body: preview.orderRequest,
          requestId
        });
      } catch (error) {
        const ambiguous = error.statusCode >= 500 || error.code === 'SAXO_API_ERROR';
        const status = ambiguous ? 'unknown' : 'rejected';
        const updated = await updateOrder(deps, reservation.row, {
          status,
          error_code: error.code || null,
          error_message: error.message,
          response_payload: error.details || null,
          submitted_at: new Date().toISOString()
        }, reservation.mode);
        await appendEvent(deps, {
          user_id: user.id,
          request_id: requestId,
          preview_id: preview.id,
          event_type: ambiguous ? 'submission-unknown' : 'submission-rejected',
          status,
          event_payload: { error: error.message, code: error.code || null }
        });
        failurePersisted = true;
        if (ambiguous) throw httpError('Saxo submission outcome is uncertain. The x-request-id is locked and the order will not be retried automatically.', 502, 'SUBMISSION_UNKNOWN', updated);
        throw error;
      }

      const orderId = String(responsePayload.OrderId || responsePayload.Orders?.[0]?.OrderId || '');
      const submittedAt = new Date().toISOString();
      const updated = await updateOrder(deps, reservation.row, {
        status: 'submitted',
        saxo_order_id: orderId || null,
        response_payload: responsePayload,
        submitted_at: submittedAt,
        error_code: null,
        error_message: null
      }, reservation.mode);
      await appendEvent(deps, {
        user_id: user.id,
        request_id: requestId,
        preview_id: preview.id,
        event_type: 'submitted-to-saxo-sim',
        status: 'submitted',
        event_payload: { orderId: orderId || null, response: responsePayload }
      });
      res.status(201).json({
        duplicate: false,
        requestId,
        previewId: preview.id,
        status: 'submitted',
        orderId: orderId || null,
        response: responsePayload,
        auditMode: reservation.mode,
        submittedAt,
        liveLocked: true,
        order: updated
      });
    } catch (error) {
      if (reservationContext && !failurePersisted) {
        const { reservation, orderRow, preview, userId } = reservationContext;
        await updateOrder(deps, reservation.row || orderRow, {
          status: 'rejected',
          error_code: error.code || null,
          error_message: error.message,
          response_payload: error.details || null
        }, reservation.mode);
        await appendEvent(deps, {
          user_id: userId,
          request_id: requestId,
          preview_id: preview.id,
          event_type: 'final-check-rejected',
          status: 'rejected',
          event_payload: { error: error.message, code: error.code || null }
        });
      }
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null, requestId: requestId || null });
    } finally {
      if (lockKey) inFlightRequests.delete(lockKey);
    }
  });

  app.get('/api/broker/saxo/orders', async (req, res) => {
    try {
      const user = await deps.verifyUser(req);
      const cfg = executionConfig(deps.config);
      if (cfg.environment !== 'sim') throw httpError('LIVE order reads are blocked by this execution module.', 423, 'LIVE_LOCKED');
      const payload = await saxoRequest(user.id, deps, '/port/v1/orders/me?$top=100&FieldGroups=DisplayAndFormat');
      const requested = String(req.query.orderId || '').trim();
      const orders = (payload.Data || []).filter((row) => !requested || String(row.OrderId) === requested).map((row) => ({
        orderId: row.OrderId || null,
        accountId: row.AccountId || null,
        accountKey: row.AccountKey || null,
        symbol: canonicalSymbol(row.DisplayAndFormat?.Symbol || row.Description || ''),
        description: row.DisplayAndFormat?.Description || row.Description || null,
        uic: row.Uic ?? null,
        assetType: row.AssetType || null,
        side: row.BuySell || null,
        amount: Number(row.Amount || 0),
        filledAmount: Number(row.FilledAmount || 0),
        price: Number(row.Price || row.OrderPrice || 0),
        status: row.Status || row.OrderStatus || null,
        duration: row.Duration || row.OrderDuration || null,
        externalReference: row.ExternalReference || null,
        raw: row
      }));
      res.json({ environment: 'sim', count: orders.length, orders, liveLocked: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null, details: error.details || null });
    }
  });

  app.get('/api/broker/saxo/orders/audit', async (req, res) => {
    try {
      const user = await deps.verifyUser(req);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
      let rows = [];
      let mode = 'supabase';
      try {
        rows = await deps.adminRest(`broker_orders?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=${limit}`) || [];
      } catch (error) {
        deps.markStorageError(error);
        mode = 'memory';
        rows = [...memoryOrders.values()].filter((row) => row.user_id === user.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit);
      }
      res.json({ mode, count: rows.length, orders: rows, liveLocked: true });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, code: error.code || null });
    }
  });
}
