import crypto from 'node:crypto';

const oauthStates = new Map();
const memoryTokens = new Map();
const lastSnapshots = new Map();
const storageHealth = { available: null, lastError: null };

const now = () => Date.now();
const b64url = (buffer) => Buffer.from(buffer).toString('base64url');
const randomUrlSafe = (bytes = 32) => b64url(crypto.randomBytes(bytes));
const canonicalSymbol = (value) => String(value || '').trim().toUpperCase().split(':')[0].replace(/[^A-Z0-9.-]/g, '');

function readOnlyGuard() {
  if (String(process.env.SAXO_ALLOW_TRADING || 'false').toLowerCase() === 'true') {
    throw new Error('SAXO_ALLOW_TRADING must remain false. Broker Gateway is read-only.');
  }
}

function config() {
  const environment = String(process.env.SAXO_ENV || 'sim').toLowerCase() === 'live' ? 'live' : 'sim';
  const isSim = environment === 'sim';
  return {
    environment,
    appKey: String(process.env.SAXO_APP_KEY || ''),
    appSecret: String(process.env.SAXO_APP_SECRET || ''),
    redirectUri: String(process.env.SAXO_REDIRECT_URI || ''),
    staticToken: String(process.env.SAXO_SIM_ACCESS_TOKEN || ''),
    authBase: isSim ? 'https://sim.logonvalidation.net' : 'https://live.logonvalidation.net',
    apiBase: isSim ? 'https://gateway.saxobank.com/sim/openapi' : 'https://gateway.saxobank.com/openapi',
    supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabasePublishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || ''),
    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
    encryptionKey: String(process.env.BROKER_TOKEN_ENCRYPTION_KEY || '')
  };
}

function encryptionKeyBytes() {
  const secret = config().encryptionKey;
  return secret ? crypto.createHash('sha256').update(secret).digest() : null;
}

function encryptJson(value) {
  const key = encryptionKeyBytes();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: b64url(iv), tag: b64url(tag), data: b64url(encrypted) });
}

function decryptJson(ciphertext) {
  const key = encryptionKeyBytes();
  if (!key || !ciphertext) return null;
  const payload = typeof ciphertext === 'string' ? JSON.parse(ciphertext) : ciphertext;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  const clear = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64url')), decipher.final()]);
  return JSON.parse(clear.toString('utf8'));
}

async function verifyUser(req) {
  const cfg = config();
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('جلسة المستخدم مطلوبة.'), { statusCode: 401 });
  if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) throw Object.assign(new Error('Supabase authentication is not configured.'), { statusCode: 503 });
  const response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { authorization, apikey: cfg.supabasePublishableKey, accept: 'application/json' },
    cache: 'no-store'
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id) throw Object.assign(new Error('جلسة المستخدم غير صالحة أو منتهية.'), { statusCode: 401 });
  return user;
}

async function adminRest(pathname, { method = 'GET', body = null, prefer = null } = {}) {
  const cfg = config();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceRoleKey) throw new Error('Supabase service role is not configured.');
  const headers = {
    apikey: cfg.supabaseServiceRoleKey,
    authorization: `Bearer ${cfg.supabaseServiceRoleKey}`,
    accept: 'application/json'
  };
  if (body !== null) headers['content-type'] = 'application/json';
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/${pathname}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || payload?.hint || payload?.details || `Supabase REST failed (${response.status})`);
  storageHealth.available = true;
  storageHealth.lastError = null;
  return payload;
}

function markStorageError(error) {
  storageHealth.available = false;
  storageHealth.lastError = error.message;
}

async function loadStoredToken(userId) {
  if (memoryTokens.has(userId)) return memoryTokens.get(userId);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey || !cfg.encryptionKey) return null;
  try {
    const rows = await adminRest(`broker_connections?select=token_ciphertext,access_expires_at,refresh_expires_at,status&user_id=eq.${encodeURIComponent(userId)}&provider=eq.saxo&limit=1`);
    const row = rows?.[0];
    if (!row?.token_ciphertext || row.status === 'disconnected') return null;
    const token = decryptJson(row.token_ciphertext);
    if (!token?.accessToken) return null;
    token.expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() : token.expiresAt;
    token.refreshExpiresAt = row.refresh_expires_at ? new Date(row.refresh_expires_at).getTime() : token.refreshExpiresAt;
    memoryTokens.set(userId, token);
    return token;
  } catch (error) {
    markStorageError(error);
    return null;
  }
}

async function persistToken(userId, token) {
  memoryTokens.set(userId, token);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey || !cfg.encryptionKey) return 'memory';
  try {
    const ciphertext = encryptJson(token);
    await adminRest('broker_connections?on_conflict=user_id,provider', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: cfg.environment,
        mode: 'read-only',
        token_ciphertext: ciphertext,
        access_expires_at: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
        refresh_expires_at: token.refreshExpiresAt ? new Date(token.refreshExpiresAt).toISOString() : null,
        status: 'connected',
        last_error: null,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    return 'supabase-encrypted';
  } catch (error) {
    markStorageError(error);
    return 'memory';
  }
}

async function deleteStoredToken(userId) {
  memoryTokens.delete(userId);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return;
  try {
    await adminRest(`broker_connections?user_id=eq.${encodeURIComponent(userId)}&provider=eq.saxo`, { method: 'DELETE' });
  } catch (error) {
    markStorageError(error);
  }
}

async function usableToken(userId) {
  const cfg = config();
  if (cfg.staticToken) return { accessToken: cfg.staticToken, source: 'render-env', expiresAt: null };
  const token = await loadStoredToken(userId);
  if (!token?.accessToken) return null;
  if (!token.expiresAt || token.expiresAt > now() + 30_000) return { ...token, source: storageHealth.available ? 'supabase-encrypted' : 'oauth-memory' };
  return null;
}

async function exchangeToken(body, cfg, userId) {
  body.set('client_id', cfg.appKey);
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cfg.appSecret) headers.authorization = `Basic ${Buffer.from(`${cfg.appKey}:${cfg.appSecret}`).toString('base64')}`;
  const response = await fetch(`${cfg.authBase}/token`, { method: 'POST', headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || `Saxo token exchange failed (${response.status})`);
  const previous = memoryTokens.get(userId) || {};
  const token = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || previous.refreshToken || null,
    expiresAt: now() + Math.max(60, Number(payload.expires_in || 1200)) * 1000,
    refreshExpiresAt: payload.refresh_token_expires_in ? now() + Number(payload.refresh_token_expires_in) * 1000 : previous.refreshExpiresAt || null
  };
  await persistToken(userId, token);
  return token;
}

async function refreshIfPossible(userId) {
  const current = await usableToken(userId);
  if (current) return current.accessToken;
  const cfg = config();
  const token = await loadStoredToken(userId);
  if (!token?.refreshToken) return null;
  if (token.refreshExpiresAt && token.refreshExpiresAt <= now()) return null;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refreshToken });
  await exchangeToken(body, cfg, userId);
  return memoryTokens.get(userId)?.accessToken || null;
}

async function saxoGet(userId, pathname) {
  readOnlyGuard();
  if (!pathname.startsWith('/port/')) throw new Error('Broker Gateway only permits Saxo Portfolio read endpoints.');
  const cfg = config();
  const token = await refreshIfPossible(userId);
  if (!token) throw new Error('Saxo access token is not configured or has expired.');
  const response = await fetch(`${cfg.apiBase}${pathname}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.Message || payload.ErrorCode || `Saxo API request failed (${response.status})`);
  return payload;
}

function normalizeNetPosition(row = {}) {
  const base = row.NetPositionBase || {};
  const view = row.NetPositionView || {};
  const display = row.DisplayAndFormat || {};
  return {
    symbol: canonicalSymbol(display.Symbol || display.Description || String(base.Uic || 'UNKNOWN')),
    description: display.Description || null,
    assetType: base.AssetType || null,
    uic: base.Uic ?? null,
    quantity: Number(base.Amount || 0),
    averagePrice: Number(view.AverageOpenPrice || view.AverageOpenPriceIncludingCosts || 0),
    currentPrice: Number(view.CurrentPrice || 0),
    marketValue: Number(view.MarketValue || 0),
    unrealizedPnl: Number(view.ProfitLossOnTrade || view.ProfitLossOnTradeInBaseCurrency || 0),
    currency: view.ExposureCurrency || display.Currency || null
  };
}

function validateSnapshot(snapshot) {
  const warnings = [];
  const positions = Array.isArray(snapshot.positions) ? snapshot.positions : [];
  const seen = new Set();
  for (const position of positions) {
    if (!position.symbol) throw new Error('Saxo snapshot contains a position without a symbol.');
    if (!Number.isFinite(position.quantity) || position.quantity < 0) throw new Error(`Invalid quantity for ${position.symbol}.`);
    if (seen.has(position.symbol)) warnings.push(`Duplicate symbol detected: ${position.symbol}`);
    seen.add(position.symbol);
  }
  if (!positions.length) warnings.push('The snapshot contains zero positions. Shadow Mode will never delete local holdings.');
  if (!snapshot.balance || !Number.isFinite(Number(snapshot.balance.totalValue))) warnings.push('Total account value is unavailable.');
  return { isValid: true, warnings };
}

async function recordSnapshot(userId, snapshot, source) {
  lastSnapshots.set(userId, snapshot);
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey) return;
  try {
    await adminRest('broker_snapshots', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        snapshot,
        positions_count: snapshot.positions.length,
        is_valid: snapshot.validation.isValid,
        warnings: snapshot.validation.warnings,
        captured_at: snapshot.updatedAt
      }
    });
    await adminRest('broker_sync_runs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        user_id: userId,
        provider: 'saxo',
        environment: snapshot.environment,
        source,
        status: 'success',
        positions_count: snapshot.positions.length,
        warnings: snapshot.validation.warnings,
        started_at: snapshot.updatedAt,
        completed_at: new Date().toISOString()
      }
    });
  } catch (error) {
    markStorageError(error);
  }
}

async function buildSnapshot(userId) {
  const [accounts, balances, netPositions] = await Promise.all([
    saxoGet(userId, '/port/v1/accounts/me?$top=100'),
    saxoGet(userId, '/port/v1/balances/me'),
    saxoGet(userId, '/port/v1/netpositions/me?$top=250&FieldGroups=NetPositionBase,NetPositionView,DisplayAndFormat')
  ]);
  const positions = (netPositions.Data || []).map(normalizeNetPosition).filter((row) => row.quantity !== 0 && row.symbol);
  const snapshot = {
    provider: 'Saxo',
    environment: config().environment,
    source: 'saxo-api',
    mode: 'read-only',
    shadowMode: true,
    updatedAt: new Date().toISOString(),
    accounts: (accounts.Data || []).map((row) => ({
      accountId: row.AccountId || null,
      accountKey: row.AccountKey || null,
      currency: row.Currency || null,
      accountType: row.AccountType || null,
      active: row.Active !== false
    })),
    balance: {
      currency: balances.Currency || null,
      cashBalance: Number(balances.CashBalance || 0),
      cashAvailableForTrading: Number(balances.CashAvailableForTrading || 0),
      totalValue: Number(balances.TotalValue || 0),
      nonMarginPositionsValue: Number(balances.NonMarginPositionsValue || 0),
      unrealizedPnl: Number(balances.UnrealizedMarginProfitLoss || balances.UnrealizedMarginOpenProfitLoss || 0),
      reliability: balances.CalculationReliability || null
    },
    positions
  };
  snapshot.validation = validateSnapshot(snapshot);
  await recordSnapshot(userId, snapshot, 'oauth');
  return snapshot;
}

function mockSnapshot(scenario = 'matched') {
  const scenarios = {
    matched: [
      { symbol: 'AMPL', description: 'Amplitude, Inc', assetType: 'Stock', quantity: 68.59, averagePrice: 8.96, currentPrice: 9.69, marketValue: 664.64, unrealizedPnl: 50.08, currency: 'USD' },
      { symbol: 'CRDL', description: 'Cardiol Therapeutics Inc', assetType: 'Stock', quantity: 30, averagePrice: 1.05, currentPrice: 1.22, marketValue: 36.60, unrealizedPnl: 5.10, currency: 'USD' }
    ],
    variance: [
      { symbol: 'AMPL', description: 'Amplitude, Inc', assetType: 'Stock', quantity: 68.59, averagePrice: 8.96, currentPrice: 9.69, marketValue: 664.64, unrealizedPnl: 50.08, currency: 'USD' },
      { symbol: 'CRDL', description: 'Cardiol Therapeutics Inc', assetType: 'Stock', quantity: 24, averagePrice: 1.08, currentPrice: 1.22, marketValue: 29.28, unrealizedPnl: 3.36, currency: 'USD' },
      { symbol: 'RKLB', description: 'Rocket Lab USA, Inc', assetType: 'Stock', quantity: 5, averagePrice: 62, currentPrice: 68.4, marketValue: 342, unrealizedPnl: 32, currency: 'USD' }
    ],
    empty: []
  };
  const positions = scenarios[scenario] || scenarios.matched;
  const positionsValue = positions.reduce((sum, row) => sum + Number(row.marketValue || 0), 0);
  const snapshot = {
    provider: 'Saxo',
    environment: 'sim',
    source: `mock-${scenario}`,
    mode: 'read-only',
    shadowMode: true,
    updatedAt: new Date().toISOString(),
    accounts: [{ accountId: 'SIM-MOCK', accountKey: null, currency: 'USD', accountType: 'Simulation', active: true }],
    balance: {
      currency: 'USD',
      cashBalance: 100000 - positionsValue,
      cashAvailableForTrading: 100000 - positionsValue,
      totalValue: 100000,
      nonMarginPositionsValue: positionsValue,
      unrealizedPnl: positions.reduce((sum, row) => sum + Number(row.unrealizedPnl || 0), 0),
      reliability: 'Mock'
    },
    positions
  };
  snapshot.validation = validateSnapshot(snapshot);
  return snapshot;
}

async function loadPortfolioRows(userId) {
  try {
    const rows = await adminRest(`portfolio?select=symbol,quantity,avg_price&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`);
    return rows || [];
  } catch (error) {
    markStorageError(error);
    return [];
  }
}

function reconcile(localRows, snapshot) {
  const local = new Map((localRows || []).map((row) => [canonicalSymbol(row.symbol), { quantity: Number(row.quantity || 0), averagePrice: Number(row.avg_price || 0) }]));
  const remote = new Map((snapshot?.positions || []).map((row) => [canonicalSymbol(row.symbol), { quantity: Number(row.quantity || 0), averagePrice: Number(row.averagePrice || 0) }]));
  const symbols = [...new Set([...local.keys(), ...remote.keys()])].filter(Boolean).sort();
  return symbols.map((symbol) => {
    const asiri = local.get(symbol) || null;
    const saxo = remote.get(symbol) || null;
    let status = 'MATCH';
    if (!asiri) status = 'NEW';
    else if (!saxo) status = 'MISSING';
    else if (Math.abs(asiri.quantity - saxo.quantity) > 1e-6 || Math.abs(asiri.averagePrice - saxo.averagePrice) > 0.01) status = 'CHANGE';
    return { symbol, asiri, saxo, status };
  });
}

async function publicStatus(userId) {
  const cfg = config();
  const token = await usableToken(userId);
  const snapshot = lastSnapshots.get(userId) || null;
  return {
    provider: 'Saxo',
    environment: cfg.environment,
    mode: 'read-only',
    tradingEnabled: false,
    appConfigured: Boolean(cfg.appKey && cfg.redirectUri),
    tokenAvailable: Boolean(token),
    tokenSource: token?.source || null,
    tokenExpiresAt: token?.expiresAt ? new Date(token.expiresAt).toISOString() : null,
    connected: Boolean(token),
    shadowMode: true,
    mockModeAvailable: true,
    lastSnapshotAt: snapshot?.updatedAt || null,
    lastSnapshotSource: snapshot?.source || null,
    storageMode: cfg.supabaseServiceRoleKey && cfg.encryptionKey ? (storageHealth.available === false ? 'memory-fallback' : 'supabase-encrypted') : 'memory-only',
    storageReady: storageHealth.available !== false,
    storageError: storageHealth.lastError,
    requiredEnv: ['SAXO_ENV', 'SAXO_APP_KEY', 'SAXO_REDIRECT_URI', 'BROKER_TOKEN_ENCRYPTION_KEY'],
    optionalEnv: ['SAXO_APP_SECRET', 'SAXO_SIM_ACCESS_TOKEN']
  };
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message });
}

export function registerBrokerGateway(app) {
  readOnlyGuard();

  app.get('/api/broker/status', async (req, res) => {
    try {
      const user = await verifyUser(req);
      res.json(await publicStatus(user.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/broker/saxo/connect-url', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const cfg = config();
      if (!cfg.appKey || !cfg.redirectUri) return res.status(503).json({ error: 'Saxo SIM app credentials are not configured yet.' });
      const state = randomUrlSafe(24);
      const verifier = randomUrlSafe(48);
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      oauthStates.set(state, { verifier, userId: user.id, createdAt: now() });
      for (const [key, value] of oauthStates) if (now() - value.createdAt > 10 * 60_000) oauthStates.delete(key);
      const url = new URL(`${cfg.authBase}/authorize`);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', cfg.appKey);
      url.searchParams.set('state', state);
      url.searchParams.set('redirect_uri', cfg.redirectUri);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      res.json({ url: url.toString(), expiresInSeconds: 600 });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/broker/saxo/connect', (_req, res) => {
    res.status(410).json({ error: 'Use authenticated POST /api/broker/saxo/connect-url.' });
  });

  app.get('/api/broker/saxo/callback', async (req, res) => {
    try {
      const cfg = config();
      const state = String(req.query.state || '');
      const code = String(req.query.code || '');
      const pending = oauthStates.get(state);
      oauthStates.delete(state);
      if (!pending || !code || now() - pending.createdAt > 10 * 60_000) throw new Error('Invalid or expired Saxo OAuth callback state.');
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: pending.verifier
      });
      await exchangeToken(body, cfg, pending.userId);
      res.redirect('/?broker=saxo-connected#brokergateway');
    } catch (error) {
      res.redirect(`/?brokerError=${encodeURIComponent(error.message)}#brokergateway`);
    }
  });

  app.get('/api/broker/saxo/snapshot', async (req, res) => {
    try {
      const user = await verifyUser(req);
      res.json(await buildSnapshot(user.id));
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.message });
    }
  });

  app.post('/api/broker/mock/snapshot', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const scenario = String(req.body?.scenario || 'matched').toLowerCase();
      if (!['matched', 'variance', 'empty'].includes(scenario)) return res.status(400).json({ error: 'Unknown mock scenario.' });
      const snapshot = mockSnapshot(scenario);
      await recordSnapshot(user.id, snapshot, snapshot.source);
      res.json(snapshot);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/broker/saxo/disconnect', async (req, res) => {
    try {
      const user = await verifyUser(req);
      await deleteStoredToken(user.id);
      lastSnapshots.delete(user.id);
      res.json({ ok: true, status: await publicStatus(user.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/broker/shadow/latest', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const snapshot = lastSnapshots.get(user.id);
      if (!snapshot) return res.status(404).json({ error: 'No Saxo snapshot has been loaded yet.' });
      res.json(snapshot);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/assistant/broker-status', async (req, res) => {
    try {
      const user = await verifyUser(req);
      res.json(await publicStatus(user.id));
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/assistant/reconciliation', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const snapshot = lastSnapshots.get(user.id);
      if (!snapshot) return res.status(404).json({ error: 'No broker snapshot is available.' });
      const localRows = await loadPortfolioRows(user.id);
      const rows = reconcile(localRows, snapshot);
      const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
      res.json({ updatedAt: snapshot.updatedAt, source: snapshot.source, counts, rows, writeEnabled: false });
    } catch (error) {
      sendError(res, error);
    }
  });
}
