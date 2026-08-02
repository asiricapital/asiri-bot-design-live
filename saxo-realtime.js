import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();
const streamTickets = new Map();
const TICKET_TTL_MS = 15 * 60_000;
const STALE_AFTER_MS = 15_000;
const MAX_SYMBOLS = 8;

const now = () => Date.now();
const canonicalSymbol = (value) => String(value || '').trim().toUpperCase().split(':')[0].replace(/[^A-Z0-9.-]/g, '');
const randomId = (prefix = '') => `${prefix}${crypto.randomBytes(12).toString('hex')}`.slice(0, 48);

function config() {
  const environment = String(process.env.SAXO_ENV || 'sim').toLowerCase() === 'live' ? 'live' : 'sim';
  const isSim = environment === 'sim';
  return {
    environment,
    apiBase: isSim ? 'https://gateway.saxobank.com/sim/openapi' : 'https://gateway.saxobank.com/openapi',
    streamConnectUrl: isSim
      ? 'wss://sim-streaming.saxobank.com/sim/oapi/streaming/ws/connect'
      : 'wss://live-streaming.saxobank.com/oapi/streaming/ws/connect',
    streamAuthorizeUrl: isSim
      ? 'https://sim-streaming.saxobank.com/sim/oapi/streaming/ws/authorize'
      : 'https://live-streaming.saxobank.com/oapi/streaming/ws/authorize',
    authBase: isSim ? 'https://sim.logonvalidation.net' : 'https://live.logonvalidation.net',
    appKey: String(process.env.SAXO_APP_KEY || ''),
    appSecret: String(process.env.SAXO_APP_SECRET || ''),
    staticToken: String(process.env.SAXO_SIM_ACCESS_TOKEN || ''),
    supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    supabasePublishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || ''),
    supabaseServiceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
    encryptionKey: String(process.env.BROKER_TOKEN_ENCRYPTION_KEY || ''),
    enabled: String(process.env.ASIRI_REALTIME_ENABLED || 'true').toLowerCase() !== 'false'
  };
}

function readOnlyGuard() {
  if (String(process.env.SAXO_ALLOW_TRADING || 'false').toLowerCase() === 'true') {
    throw new Error('SAXO_ALLOW_TRADING must remain false. Real-time engine is read-only.');
  }
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

function encryptionKeyBytes() {
  const secret = config().encryptionKey;
  return secret ? crypto.createHash('sha256').update(secret).digest() : null;
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

function encryptJson(value) {
  const key = encryptionKeyBytes();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url')
  });
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
  return payload;
}

async function persistToken(userId, token) {
  const cfg = config();
  if (!cfg.supabaseServiceRoleKey || !cfg.encryptionKey) return;
  await adminRest('broker_connections?on_conflict=user_id,provider', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      user_id: userId,
      provider: 'saxo',
      environment: cfg.environment,
      mode: 'read-only',
      token_ciphertext: encryptJson(token),
      access_expires_at: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
      refresh_expires_at: token.refreshExpiresAt ? new Date(token.refreshExpiresAt).toISOString() : null,
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString()
    }
  });
}

async function refreshToken(userId, stored) {
  const cfg = config();
  if (!stored?.refreshToken) return null;
  if (stored.refreshExpiresAt && Number(stored.refreshExpiresAt) <= now()) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: stored.refreshToken,
    client_id: cfg.appKey
  });
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cfg.appSecret) headers.authorization = `Basic ${Buffer.from(`${cfg.appKey}:${cfg.appSecret}`).toString('base64')}`;
  const response = await fetch(`${cfg.authBase}/token`, { method: 'POST', headers, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error_description || payload.error || `Saxo token refresh failed (${response.status})`);
  const token = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || stored.refreshToken,
    expiresAt: now() + Math.max(60, Number(payload.expires_in || 1200)) * 1000,
    refreshExpiresAt: payload.refresh_token_expires_in
      ? now() + Number(payload.refresh_token_expires_in) * 1000
      : stored.refreshExpiresAt || null
  };
  await persistToken(userId, token);
  return token;
}

async function loadAccessToken(userId, forceRefresh = false) {
  const cfg = config();
  if (cfg.staticToken) return { accessToken: cfg.staticToken, expiresAt: null, source: 'render-env' };
  const rows = await adminRest(`broker_connections?select=token_ciphertext,access_expires_at,refresh_expires_at,status&user_id=eq.${encodeURIComponent(userId)}&provider=eq.saxo&limit=1`);
  const row = rows?.[0];
  if (!row?.token_ciphertext || row.status === 'disconnected') throw new Error('Saxo غير مفوض. أعد تفويض Saxo SIM أولًا.');
  const stored = decryptJson(row.token_ciphertext);
  if (!stored?.accessToken) throw new Error('رمز وصول Saxo غير متاح.');
  stored.expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() : stored.expiresAt;
  stored.refreshExpiresAt = row.refresh_expires_at ? new Date(row.refresh_expires_at).getTime() : stored.refreshExpiresAt;
  if (!forceRefresh && (!stored.expiresAt || stored.expiresAt > now() + 90_000)) return { ...stored, source: 'supabase-encrypted' };
  const refreshed = await refreshToken(userId, stored);
  if (!refreshed) throw new Error('انتهت صلاحية Saxo. أعد التفويض من صفحة ربط الوسطاء.');
  return { ...refreshed, source: 'oauth-refresh' };
}

async function saxoFetch(token, pathname, options = {}) {
  const cfg = config();
  const response = await fetch(`${cfg.apiBase}${pathname}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...(options.headers || {})
    },
    cache: 'no-store'
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.Message || payload.ErrorCode || payload?.ModelState && JSON.stringify(payload.ModelState) || `Saxo API failed (${response.status})`;
    throw Object.assign(new Error(detail), { statusCode: response.status, payload });
  }
  return { payload, response };
}

async function getAccountKey(token) {
  const { payload } = await saxoFetch(token, '/port/v1/accounts/me?$top=100');
  const account = (payload.Data || []).find((row) => row.Active !== false) || (payload.Data || [])[0];
  if (!account?.AccountKey) throw new Error('لم يتم العثور على AccountKey في Saxo.');
  return account.AccountKey;
}

function instrumentOverrides() {
  try {
    const raw = JSON.parse(String(process.env.SAXO_REALTIME_INSTRUMENTS_JSON || '{}'));
    return Object.fromEntries(Object.entries(raw).map(([symbol, value]) => [canonicalSymbol(symbol), value]));
  } catch {
    return {};
  }
}

function instrumentScore(row, symbol) {
  const exact = canonicalSymbol(row.Symbol) === symbol ? 100 : 0;
  const exchange = String(row.ExchangeId || '').toUpperCase();
  const usPrimary = /NASDAQ|XNAS|NYSE|XNYS|ARCX|BATS/.test(exchange) ? 30 : 0;
  const primary = Number(row.PrimaryListing) === Number(row.Identifier) ? 10 : 0;
  const tradable = Array.isArray(row.TradableAs) && row.TradableAs.includes('Stock') ? 5 : 0;
  return exact + usPrimary + primary + tradable;
}

async function resolveInstrument(token, symbol) {
  const override = instrumentOverrides()[symbol];
  if (override?.uic && override?.assetType) {
    return { symbol, uic: Number(override.uic), assetType: String(override.assetType), exchangeId: override.exchangeId || null, source: 'env-override' };
  }
  const params = new URLSearchParams({
    '$top': '20',
    AssetTypes: 'Stock',
    IncludeNonTradable: 'true',
    Keywords: symbol
  });
  const { payload } = await saxoFetch(token, `/ref/v1/instruments?${params.toString()}`);
  const candidates = (payload.Data || [])
    .filter((row) => row.AssetType === 'Stock' && canonicalSymbol(row.Symbol) === symbol)
    .sort((a, b) => instrumentScore(b, symbol) - instrumentScore(a, symbol));
  const best = candidates[0];
  if (!best?.Identifier) {
    const found = (payload.Data || []).slice(0, 5).map((row) => row.Symbol).filter(Boolean).join(', ');
    throw new Error(`تعذر تحديد UIC للسهم ${symbol}${found ? `؛ النتائج: ${found}` : ''}`);
  }
  return {
    symbol,
    uic: Number(best.Identifier),
    assetType: best.AssetType || 'Stock',
    exchangeId: best.ExchangeId || null,
    description: best.Description || null,
    currency: best.CurrencyCode || null,
    source: 'saxo-reference-search'
  };
}

function deepMerge(base, delta) {
  if (Array.isArray(delta)) return delta.map((item) => item && typeof item === 'object' ? deepMerge({}, item) : item);
  if (!delta || typeof delta !== 'object') return delta;
  const out = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(delta)) {
    out[key] = value && typeof value === 'object' && !Array.isArray(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}

export function parseSaxoMessageFrame(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const messages = [];
  let index = 0;
  while (index < buffer.length) {
    if (buffer.length - index < 16) throw new Error(`Saxo frame header is incomplete at byte ${index}.`);
    const messageId = buffer.readBigUInt64LE(index).toString();
    index += 8;
    const version = buffer.readUInt16LE(index);
    index += 2;
    const referenceIdSize = buffer.readUInt8(index);
    index += 1;
    if (buffer.length - index < referenceIdSize + 5) throw new Error('Saxo frame reference id is incomplete.');
    const referenceId = buffer.subarray(index, index + referenceIdSize).toString('ascii');
    index += referenceIdSize;
    const payloadFormat = buffer.readUInt8(index);
    index += 1;
    const payloadSize = buffer.readUInt32LE(index);
    index += 4;
    if (buffer.length - index < payloadSize) throw new Error(`Saxo payload is incomplete for ${referenceId}.`);
    const payloadBuffer = buffer.subarray(index, index + payloadSize);
    index += payloadSize;
    if (payloadFormat !== 0) continue;
    let payload = null;
    try { payload = JSON.parse(payloadBuffer.toString('utf8')); }
    catch (error) { throw new Error(`تعذر قراءة رسالة Saxo (${referenceId}): ${error.message}`); }
    messages.push({ messageId, version, referenceId, payload });
  }
  return messages;
}

function unwrapSnapshot(value) {
  if (!value || typeof value !== 'object') return {};
  if (value.Snapshot && typeof value.Snapshot === 'object') return value.Snapshot;
  if (value.Data && !Array.isArray(value.Data) && typeof value.Data === 'object') return value.Data;
  return value;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeQuote(session, instrument, raw, source) {
  const data = unwrapSnapshot(raw);
  const quote = data.Quote || {};
  const priceInfo = data.PriceInfo || {};
  const details = data.PriceInfoDetails || {};
  const bid = firstFinite(quote.Bid);
  const ask = firstFinite(quote.Ask);
  const mid = firstFinite(quote.Mid, bid !== null && ask !== null ? (bid + ask) / 2 : null);
  const last = firstFinite(priceInfo.LastTraded, details.LastTraded, mid, ask, bid);
  const delayed = firstFinite(quote.DelayedByMinutes);
  const priceTypeBid = quote.PriceTypeBid || null;
  const priceTypeAsk = quote.PriceTypeAsk || null;
  const noAccess = [priceTypeBid, priceTypeAsk].includes('NoAccess');
  const noMarket = [priceTypeBid, priceTypeAsk].includes('NoMarket');
  let status = 'UNKNOWN';
  if (noAccess) status = 'NO_ACCESS';
  else if (last === null) status = noMarket ? 'NO_MARKET' : 'NO_PRICE';
  else if (delayed === 0) status = 'LIVE';
  else if (delayed !== null && delayed > 0) status = 'DELAYED';
  const updatedAt = new Date().toISOString();
  return {
    symbol: instrument.symbol,
    uic: instrument.uic,
    assetType: instrument.assetType,
    exchangeId: instrument.exchangeId,
    description: instrument.description || data.DisplayAndFormat?.Description || null,
    currency: data.DisplayAndFormat?.Currency || instrument.currency || null,
    bid,
    ask,
    mid,
    price: last,
    change: firstFinite(priceInfo.NetChange, details.NetChange),
    changePercent: firstFinite(priceInfo.PercentChange, details.PercentChange),
    high: firstFinite(priceInfo.High, details.High),
    low: firstFinite(priceInfo.Low, details.Low),
    open: firstFinite(priceInfo.Open, details.Open),
    delayedByMinutes: delayed,
    priceTypeBid,
    priceTypeAsk,
    marketState: data.MarketState || details.TradingStatus || null,
    source,
    status,
    isRealtime: status === 'LIVE',
    updatedAt,
    receivedAtMs: now(),
    contextId: session.contextId,
    readOnly: true
  };
}

function publicSession(session) {
  if (!session) return { state: 'STOPPED', readOnly: true, quotes: [] };
  return {
    state: session.state,
    readOnly: true,
    environment: session.environment,
    contextId: session.contextId,
    startedAt: session.startedAt,
    connectedAt: session.connectedAt,
    lastHeartbeatAt: session.lastHeartbeatAt,
    lastMessageAt: session.lastMessageAt,
    lastMessageId: session.lastMessageId,
    reconnectAttempts: session.reconnectAttempts,
    error: session.error,
    symbols: session.instruments.map((item) => item.symbol),
    quotes: [...session.quotes.values()].map((quote) => ({
      ...quote,
      ageMs: Math.max(0, now() - Number(quote.receivedAtMs || now())),
      stale: now() - Number(quote.receivedAtMs || 0) > STALE_AFTER_MS
    }))
  };
}

function sendSse(response, event, data) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(session, event, data) {
  for (const response of [...session.clients]) {
    try { sendSse(response, event, data); }
    catch { session.clients.delete(response); }
  }
}

function setState(session, state, error = null) {
  session.state = state;
  session.error = error ? String(error.message || error) : null;
  broadcast(session, 'status', publicSession(session));
}

async function subscribeInstrument(session, instrument, replaceReferenceId = null) {
  const referenceId = `RT_${instrument.symbol}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50);
  const body = {
    ContextId: session.contextId,
    ReferenceId: referenceId,
    Format: 'application/json',
    RefreshRate: 1000,
    Arguments: {
      AccountKey: session.accountKey,
      Uic: instrument.uic,
      AssetType: instrument.assetType,
      Amount: 1,
      FieldGroups: ['DisplayAndFormat', 'PriceInfo', 'PriceInfoDetails', 'Quote', 'Timestamps']
    }
  };
  if (replaceReferenceId) body.ReplaceReferenceId = replaceReferenceId;
  const { payload, response } = await saxoFetch(session.token.accessToken, '/trade/v1/prices/subscriptions', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  session.references.set(referenceId, instrument);
  const location = response.headers.get('location');
  if (location) session.subscriptionLocations.set(referenceId, location);
  const snapshot = unwrapSnapshot(payload);
  session.snapshots.set(referenceId, snapshot);
  const normalized = normalizeQuote(session, instrument, snapshot, 'saxo-subscription-snapshot');
  session.quotes.set(instrument.symbol, normalized);
  broadcast(session, 'quote', normalized);
  return normalized;
}

async function createSubscriptions(session) {
  const settled = await Promise.allSettled(session.instruments.map((instrument) => subscribeInstrument(session, instrument)));
  const failures = settled.filter((item) => item.status === 'rejected');
  if (failures.length === settled.length) throw failures[0].reason;
  if (failures.length) {
    session.error = failures.map((item) => item.reason?.message || String(item.reason)).join(' | ');
    broadcast(session, 'warning', { message: session.error });
  }
  setState(session, 'STREAMING');
}

function handleControlMessage(session, message) {
  if (message.referenceId === '_heartbeat') {
    session.lastHeartbeatAt = new Date().toISOString();
    broadcast(session, 'heartbeat', { at: session.lastHeartbeatAt, payload: message.payload });
    return true;
  }
  if (message.referenceId === '_resetsubscriptions') {
    broadcast(session, 'warning', { message: 'Saxo طلب إعادة الاشتراكات؛ جارٍ إعادة الاتصال.', payload: message.payload });
    scheduleReconnect(session, 'reset-subscriptions', 250);
    return true;
  }
  if (message.referenceId === '_disconnect') {
    session.autoReconnect = false;
    setState(session, 'REAUTH_REQUIRED', message.payload?.Reason || 'Saxo disconnected the stream.');
    try { session.ws?.close(1000, 'Saxo disconnect control message'); } catch {}
    return true;
  }
  return false;
}

function handlePriceMessage(session, message) {
  const instrument = session.references.get(message.referenceId);
  if (!instrument) return;
  const previous = session.snapshots.get(message.referenceId) || {};
  const merged = deepMerge(previous, message.payload || {});
  session.snapshots.set(message.referenceId, merged);
  const quote = normalizeQuote(session, instrument, merged, 'saxo-websocket');
  quote.messageId = message.messageId;
  session.quotes.set(instrument.symbol, quote);
  broadcast(session, 'quote', quote);
}

function scheduleReconnect(session, reason, overrideDelay = null) {
  if (!session.autoReconnect || session.stopping || session.reconnectTimer) return;
  const delay = overrideDelay ?? Math.min(30_000, 1000 * (2 ** Math.min(session.reconnectAttempts, 5)));
  session.reconnectAttempts += 1;
  session.reconnectTimer = setTimeout(async () => {
    session.reconnectTimer = null;
    try {
      session.token = await loadAccessToken(session.userId);
      await connectSocket(session, reason);
    } catch (error) {
      setState(session, 'RECONNECTING', error);
      scheduleReconnect(session, 'retry');
    }
  }, delay);
  setState(session, 'RECONNECTING', `إعادة الاتصال خلال ${Math.ceil(delay / 1000)} ثوانٍ (${reason}).`);
}

async function connectSocket(session, reason = 'initial') {
  if (session.stopping) return;
  if (session.ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(session.ws.readyState)) {
    try { session.ws.close(1000, 'replace connection'); } catch {}
  }
  const cfg = config();
  const url = new URL(cfg.streamConnectUrl);
  url.searchParams.set('contextId', session.contextId);
  if (reason !== 'initial' && session.lastMessageId) url.searchParams.set('messageid', session.lastMessageId);
  setState(session, reason === 'initial' ? 'CONNECTING' : 'RECONNECTING');
  const ws = new WebSocket(url, {
    headers: { Authorization: `BEARER ${session.token.accessToken}` },
    perMessageDeflate: false,
    handshakeTimeout: 15_000
  });
  session.ws = ws;
  ws.on('open', async () => {
    session.connectedAt = new Date().toISOString();
    session.reconnectAttempts = 0;
    setState(session, 'SUBSCRIBING');
    try { await createSubscriptions(session); }
    catch (error) {
      setState(session, 'SUBSCRIPTION_ERROR', error);
      try { ws.close(1011, 'subscription failed'); } catch {}
    }
  });
  ws.on('message', (data) => {
    try {
      const messages = parseSaxoMessageFrame(data);
      for (const message of messages) {
        session.lastMessageId = message.messageId;
        session.lastMessageAt = new Date().toISOString();
        if (!handleControlMessage(session, message)) handlePriceMessage(session, message);
      }
    } catch (error) {
      session.error = error.message;
      broadcast(session, 'warning', { message: error.message });
    }
  });
  ws.on('unexpected-response', (_request, response) => {
    setState(session, 'CONNECTION_ERROR', `Saxo WebSocket HTTP ${response.statusCode}`);
  });
  ws.on('error', (error) => {
    session.error = error.message;
    broadcast(session, 'warning', { message: error.message });
  });
  ws.on('close', (code, reasonBuffer) => {
    const reasonText = Buffer.from(reasonBuffer || '').toString('utf8');
    if (session.stopping) return setState(session, 'STOPPED');
    if (session.state === 'REAUTH_REQUIRED') return;
    session.references.clear();
    session.subscriptionLocations.clear();
    scheduleReconnect(session, `socket-close-${code}${reasonText ? `:${reasonText}` : ''}`);
  });
}

async function reauthorizeIfNeeded(session) {
  if (session.stopping || !session.token?.expiresAt) return;
  if (session.token.expiresAt > now() + 120_000) return;
  const token = await loadAccessToken(session.userId, true);
  const cfg = config();
  const url = new URL(cfg.streamAuthorizeUrl);
  url.searchParams.set('contextid', session.contextId);
  const response = await fetch(url, { method: 'PUT', headers: { authorization: `BEARER ${token.accessToken}` } });
  if (!response.ok) throw new Error(`Saxo stream reauthorization failed (${response.status})`);
  session.token = token;
  broadcast(session, 'status', publicSession(session));
}

async function stopSession(userId, reason = 'manual') {
  const session = sessions.get(userId);
  if (!session) return;
  session.stopping = true;
  session.autoReconnect = false;
  if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session.reauthTimer) clearInterval(session.reauthTimer);
  try {
    if (session.token?.accessToken && session.contextId) {
      await saxoFetch(session.token.accessToken, `/root/v1/subscriptions/${encodeURIComponent(session.contextId)}`, { method: 'DELETE' }).catch(() => null);
    }
  } finally {
    try { session.ws?.close(1000, reason); } catch {}
    for (const response of session.clients) {
      try { sendSse(response, 'status', { state: 'STOPPED', reason, readOnly: true }); response.end(); } catch {}
    }
    sessions.delete(userId);
  }
}

async function startSession(userId, requestedSymbols) {
  readOnlyGuard();
  const cfg = config();
  if (!cfg.enabled) throw new Error('محرك الأسعار المباشرة غير مفعّل في Render.');
  await stopSession(userId, 'restart');
  const symbols = [...new Set((requestedSymbols || ['AMPL', 'CRDL']).map(canonicalSymbol).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if (!symbols.length) throw new Error('لا توجد رموز صالحة للاشتراك.');
  const token = await loadAccessToken(userId);
  const accountKey = await getAccountKey(token.accessToken);
  const settled = await Promise.allSettled(symbols.map((symbol) => resolveInstrument(token.accessToken, symbol)));
  const instruments = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
  const errors = settled.filter((item) => item.status === 'rejected').map((item) => item.reason?.message || String(item.reason));
  if (!instruments.length) throw new Error(errors.join(' | ') || 'تعذر تحديد أدوات Saxo.');
  const session = {
    userId,
    environment: cfg.environment,
    contextId: randomId('asiri_rt_'),
    accountKey,
    token,
    instruments,
    state: 'STARTING',
    startedAt: new Date().toISOString(),
    connectedAt: null,
    lastHeartbeatAt: null,
    lastMessageAt: null,
    lastMessageId: null,
    error: errors.length ? errors.join(' | ') : null,
    ws: null,
    clients: new Set(),
    references: new Map(),
    subscriptionLocations: new Map(),
    snapshots: new Map(),
    quotes: new Map(),
    autoReconnect: true,
    stopping: false,
    reconnectAttempts: 0,
    reconnectTimer: null,
    reauthTimer: null,
    lastClientAt: now()
  };
  sessions.set(userId, session);
  session.reauthTimer = setInterval(() => reauthorizeIfNeeded(session).catch((error) => {
    broadcast(session, 'warning', { message: error.message });
    scheduleReconnect(session, 'reauthorize-failed');
  }), 30_000);
  await connectSocket(session);
  return session;
}

function createTicket(userId) {
  const ticket = crypto.randomBytes(32).toString('base64url');
  streamTickets.set(ticket, { userId, expiresAt: now() + TICKET_TTL_MS });
  return ticket;
}

function cleanTickets() {
  for (const [ticket, value] of streamTickets) if (value.expiresAt <= now()) streamTickets.delete(ticket);
}
setInterval(cleanTickets, 60_000).unref?.();
setInterval(() => {
  for (const session of sessions.values()) {
    if (!session.clients.size && now() - session.lastClientAt > 5 * 60_000) stopSession(session.userId, 'idle-timeout').catch(() => {});
  }
}, 60_000).unref?.();

function sendError(res, error) {
  res.status(error.statusCode || 500).json({ error: error.message });
}

export function registerSaxoRealtime(app) {
  readOnlyGuard();

  app.get('/v700-realtime.js', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.sendFile(path.join(root, 'v700-realtime.js'));
  });
  app.get('/v700-realtime.css', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.sendFile(path.join(root, 'v700-realtime.css'));
  });

  app.get('/api/realtime/status', async (req, res) => {
    try {
      const user = await verifyUser(req);
      res.json({ enabled: config().enabled, ...publicSession(sessions.get(user.id)) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/realtime/start', async (req, res) => {
    try {
      const user = await verifyUser(req);
      const session = await startSession(user.id, Array.isArray(req.body?.symbols) ? req.body.symbols : ['AMPL', 'CRDL']);
      const ticket = createTicket(user.id);
      res.json({ ticket, ticketExpiresAt: new Date(now() + TICKET_TTL_MS).toISOString(), ...publicSession(session) });
    } catch (error) { sendError(res, error); }
  });

  app.post('/api/realtime/stop', async (req, res) => {
    try {
      const user = await verifyUser(req);
      await stopSession(user.id, 'manual');
      res.json({ ok: true, state: 'STOPPED', readOnly: true });
    } catch (error) { sendError(res, error); }
  });

  app.get('/api/realtime/events', (req, res) => {
    const ticket = String(req.query.ticket || '');
    const grant = streamTickets.get(ticket);
    if (!grant || grant.expiresAt <= now()) return res.status(401).json({ error: 'تذكرة البث غير صالحة أو منتهية.' });
    const session = sessions.get(grant.userId);
    if (!session) return res.status(404).json({ error: 'جلسة البث غير موجودة.' });
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    session.clients.add(res);
    session.lastClientAt = now();
    sendSse(res, 'snapshot', publicSession(session));
    const keepAlive = setInterval(() => {
      try { res.write(`: keepalive ${Date.now()}\n\n`); } catch { clearInterval(keepAlive); }
    }, 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      session.clients.delete(res);
      session.lastClientAt = now();
    });
  });
}
