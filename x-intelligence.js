import crypto from 'node:crypto';

const X_API = 'https://api.x.com';
const X_AUTHORIZE = 'https://x.com/i/oauth2/authorize';
const X_CLIENT_ID = String(process.env.X_CLIENT_ID || '').trim();
const X_CLIENT_SECRET = String(process.env.X_CLIENT_SECRET || '').trim();
const X_SESSION_SECRET = String(process.env.X_SESSION_SECRET || '').trim();
const X_CALLBACK_URL = String(process.env.X_CALLBACK_URL || '').trim();
const SESSION_COOKIE = 'asiri_x_session';
const OAUTH_COOKIE = 'asiri_x_oauth';
const OAUTH_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 3600_000;
const SCOPES = ['tweet.read','users.read','follows.read','list.read','offline.access'];

function keyBytes() {
  if (!X_SESSION_SECRET) return null;
  return crypto.createHash('sha256').update(X_SESSION_SECRET).digest();
}

function seal(payload, ttlMs) {
  const key = keyBytes();
  if (!key) throw new Error('X_SESSION_SECRET is not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.from(JSON.stringify({ ...payload, _exp: Date.now() + ttlMs }));
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function unseal(value) {
  try {
    const key = keyBytes();
    if (!key || !value) return null;
    const [ivPart, tagPart, bodyPart] = String(value).split('.');
    if (!ivPart || !tagPart || !bodyPart) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const clear = Buffer.concat([decipher.update(Buffer.from(bodyPart, 'base64url')), decipher.final()]);
    const payload = JSON.parse(clear.toString('utf8'));
    if (!payload?._exp || Date.now() > payload._exp) return null;
    delete payload._exp;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function setCookie(res, name, value, maxAgeSec, httpOnly = true) {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    'Secure',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSec))}`,
  ];
  if (httpOnly) bits.push('HttpOnly');
  res.append('Set-Cookie', bits.join('; '));
}

function clearCookie(res, name) {
  setCookie(res, name, '', 0, true);
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

export function xCallbackUrl(req) {
  return X_CALLBACK_URL || `${requestOrigin(req)}/auth/x/callback`;
}

function validClientId(value) {
  const id = String(value || '').trim();
  return id.length >= 5 && id.length <= 240 && /^[A-Za-z0-9._:\-]+$/.test(id) ? id : '';
}

function clientIdFromRequest(req) {
  return X_CLIENT_ID || validClientId(req.query?.client_id || req.body?.clientId);
}

function pkcePair() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function xFetchJson(url, options = {}, timeoutMs = 16_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 800) }; }
    if (!response.ok) {
      const message = data?.detail || data?.title || data?.error_description || data?.error || `HTTP ${response.status}`;
      const error = new Error(String(message));
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function tokenHeaders(clientId) {
  if (X_CLIENT_SECRET && X_CLIENT_ID && clientId === X_CLIENT_ID) {
    return { Authorization: `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')}` };
  }
  return {};
}

async function exchangeCode({ code, verifier, redirectUri, clientId }) {
  const form = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: clientId,
  });
  return xFetchJson(`${X_API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...tokenHeaders(clientId) },
    body: form.toString(),
  });
}

async function refreshToken(session) {
  if (!session?.refreshToken || !session?.clientId) return session;
  const form = new URLSearchParams({
    refresh_token: session.refreshToken,
    grant_type: 'refresh_token',
    client_id: session.clientId,
  });
  const token = await xFetchJson(`${X_API}/2/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...tokenHeaders(session.clientId) },
    body: form.toString(),
  });
  return {
    ...session,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || session.refreshToken,
    expiresAt: Date.now() + Number(token.expires_in || 7200) * 1000,
    scope: token.scope || session.scope,
  };
}

async function getUser(accessToken) {
  const data = await xFetchJson(`${X_API}/2/users/me?user.fields=id,name,username,profile_image_url,verified`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data?.data || null;
}

function readSession(req) {
  return unseal(parseCookies(req)[SESSION_COOKIE]);
}

async function ensureSession(req, res) {
  let session = readSession(req);
  if (!session?.accessToken || !session?.user?.id) return null;
  if (session.expiresAt && session.expiresAt < Date.now() + 90_000 && session.refreshToken) {
    try {
      session = await refreshToken(session);
      setCookie(res, SESSION_COOKIE, seal(session, SESSION_TTL_MS), SESSION_TTL_MS / 1000, true);
    } catch {
      clearCookie(res, SESSION_COOKIE);
      return null;
    }
  }
  return session;
}

export function isXBackendReady() {
  return Boolean(X_SESSION_SECRET);
}

export async function startXOAuth(req, res) {
  if (!X_SESSION_SECRET) {
    return res.status(503).json({ error: 'X session encryption is not configured on the server.' });
  }
  const clientId = clientIdFromRequest(req);
  if (!clientId) {
    return res.status(400).json({ error: 'أدخل X Client ID من Developer Console أولًا.' });
  }
  const state = crypto.randomBytes(24).toString('base64url');
  const { verifier, challenge } = pkcePair();
  const redirectUri = xCallbackUrl(req);
  const oauthState = seal({ state, verifier, redirectUri, clientId }, OAUTH_TTL_MS);
  setCookie(res, OAUTH_COOKIE, oauthState, OAUTH_TTL_MS / 1000, true);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  res.redirect(`${X_AUTHORIZE}?${params.toString()}`);
}

export async function finishXOAuth(req, res) {
  const failure = String(req.query?.error || '');
  if (failure) return res.redirect(`/?x_error=${encodeURIComponent(failure)}`);
  const code = String(req.query?.code || '');
  const state = String(req.query?.state || '');
  const oauth = unseal(parseCookies(req)[OAUTH_COOKIE]);
  clearCookie(res, OAUTH_COOKIE);
  if (!code || !state || !oauth || oauth.state !== state) {
    return res.redirect('/?x_error=oauth_state_invalid');
  }
  try {
    const token = await exchangeCode({
      code,
      verifier: oauth.verifier,
      redirectUri: oauth.redirectUri,
      clientId: oauth.clientId,
    });
    const user = await getUser(token.access_token);
    if (!user?.id) throw new Error('تعذر قراءة حساب X بعد التفويض.');
    const session = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: Date.now() + Number(token.expires_in || 7200) * 1000,
      scope: token.scope || SCOPES.join(' '),
      tokenType: token.token_type || 'bearer',
      clientId: oauth.clientId,
      user,
      connectedAt: new Date().toISOString(),
    };
    setCookie(res, SESSION_COOKIE, seal(session, SESSION_TTL_MS), SESSION_TTL_MS / 1000, true);
    res.redirect('/?x_connected=1');
  } catch (error) {
    res.redirect(`/?x_error=${encodeURIComponent(String(error?.message || error).slice(0, 220))}`);
  }
}

export async function xStatus(req, res) {
  const session = await ensureSession(req, res);
  res.set('Cache-Control', 'no-store');
  res.json({
    backendReady: Boolean(X_SESSION_SECRET),
    serverClientIdConfigured: Boolean(X_CLIENT_ID),
    callbackUrl: xCallbackUrl(req),
    scopes: SCOPES,
    connected: Boolean(session?.user?.id),
    user: session?.user || null,
    connectedAt: session?.connectedAt || null,
  });
}

export async function disconnectX(_req, res) {
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, OAUTH_COOKIE);
  res.json({ ok: true, connected: false });
}

function queryTokens(value) {
  const stop = new Set(['هذا','هذه','ذلك','ما','ماذا','هل','عن','من','في','على','إلى','الى','اليوم','الآن','الان','the','and','for','with','from','today','now','news']);
  return [...new Set((String(value || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || []).filter((x) => !stop.has(x)).slice(0, 40))];
}

function freshnessScore(date) {
  const ageHours = Math.max(0, (Date.now() - new Date(date || 0).getTime()) / 3600_000);
  if (!Number.isFinite(ageHours)) return 0;
  if (ageHours <= 1) return 15;
  if (ageHours <= 6) return 12;
  if (ageHours <= 24) return 9;
  if (ageHours <= 72) return 6;
  if (ageHours <= 168) return 3;
  return 0;
}

function mapTimeline(data) {
  const users = new Map((data?.includes?.users || []).map((u) => [u.id, u]));
  return (data?.data || []).map((tweet) => {
    const author = users.get(tweet.author_id) || {};
    const username = author.username || tweet.author_id || 'x';
    const metrics = tweet.public_metrics || {};
    const links = (tweet.entities?.urls || [])
      .map((u) => u.expanded_url || u.unwound_url || u.url)
      .filter((u) => /^https?:\/\//i.test(String(u || '')) && !/^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)\//i.test(u));
    return {
      id: tweet.id,
      text: tweet.text || '',
      createdAt: tweet.created_at || null,
      lang: tweet.lang || null,
      author: {
        id: author.id || tweet.author_id,
        name: author.name || username,
        username,
        verified: Boolean(author.verified),
        profileImageUrl: author.profile_image_url || null,
      },
      metrics,
      url: `https://x.com/${encodeURIComponent(username)}/status/${tweet.id}`,
      links: [...new Set(links)].slice(0, 3),
      referencedTweets: tweet.referenced_tweets || [],
    };
  });
}

async function fetchTimelinePage(session, paginationToken) {
  const params = new URLSearchParams({
    max_results: '100',
    'tweet.fields': 'id,text,author_id,created_at,lang,public_metrics,entities,attachments,referenced_tweets,conversation_id',
    expansions: 'author_id,attachments.media_keys',
    'user.fields': 'id,name,username,profile_image_url,verified',
    'media.fields': 'media_key,type,url,preview_image_url,width,height',
    exclude: 'replies',
  });
  if (paginationToken) params.set('pagination_token', paginationToken);
  return xFetchJson(`${X_API}/2/users/${encodeURIComponent(session.user.id)}/timelines/reverse_chronological?${params}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  }, 20_000);
}

async function fetchTimeline(session, limit = 100) {
  const cap = Math.max(5, Math.min(300, Number(limit) || 100));
  const posts = [];
  let token = null;
  let pages = 0;
  do {
    const data = await fetchTimelinePage(session, token);
    posts.push(...mapTimeline(data));
    token = data?.meta?.next_token || null;
    pages += 1;
  } while (posts.length < cap && token && pages < 3);
  return posts.slice(0, cap);
}

function xEvidenceScore(post, query) {
  const q = queryTokens(query);
  const hay = `${post.text} ${post.author?.name || ''} ${post.author?.username || ''}`.toLowerCase();
  const overlap = q.filter((t) => hay.includes(t)).length;
  const engagement = Number(post.metrics?.like_count || 0) + Number(post.metrics?.retweet_count || 0) * 2 + Number(post.metrics?.reply_count || 0) + Number(post.metrics?.quote_count || 0) * 2;
  let score = 52 + Math.min(20, overlap * 6) + freshnessScore(post.createdAt) + Math.min(7, Math.log10(engagement + 1) * 2);
  if (post.author?.verified) score += 4;
  if (post.referencedTweets?.some((x) => x.type === 'retweeted')) score -= 5;
  return Math.max(25, Math.min(92, Math.round(score)));
}

function relevantPosts(posts, query, limit = 20) {
  const q = queryTokens(query);
  const generic = q.length === 0 || /(اليوم|الآن|الان|آخر|اخر|أخبار|اخبار|latest|today|now|news)/i.test(query);
  return posts
    .map((post) => ({ post, score: xEvidenceScore(post, query), overlap: q.filter((t) => `${post.text} ${post.author?.username || ''}`.toLowerCase().includes(t)).length }))
    .filter((row) => generic || row.overlap > 0)
    .sort((a, b) => b.score - a.score || new Date(b.post.createdAt || 0) - new Date(a.post.createdAt || 0))
    .slice(0, limit)
    .map((row) => ({ ...row.post, evidenceScore: row.score }));
}

function toResearchResults(posts) {
  const results = [];
  for (const post of posts) {
    const label = `@${post.author?.username || 'x'}`;
    results.push({
      type: 'x',
      provider: 'X Timeline',
      source: label,
      title: String(post.text || '').replace(/\s+/g, ' ').trim().slice(0, 180) || `منشور من ${label}`,
      url: post.url,
      snippet: post.text,
      publishedAt: post.createdAt,
      evidenceScore: post.evidenceScore,
      official: Boolean(post.author?.verified),
      independenceKey: `x:${post.author?.username || post.author?.id || 'unknown'}`,
      fromX: true,
      xMeta: { author: post.author, metrics: post.metrics },
    });
    for (const link of post.links.slice(0, 1)) {
      try {
        const host = new URL(link).hostname.replace(/^www\./, '');
        results.push({
          type: 'web',
          provider: 'X Link',
          source: host,
          title: `رابط شاركه ${label}: ${String(post.text || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`,
          url: link,
          snippet: post.text,
          publishedAt: post.createdAt,
          evidenceScore: Math.min(95, post.evidenceScore + 3),
          independenceKey: host,
          fromX: true,
          discoveredVia: label,
        });
      } catch {}
    }
  }
  return results;
}

export async function getXFeed(req, res, { query = '', limit = 100 } = {}) {
  const session = await ensureSession(req, res);
  if (!session) return { connected: false, user: null, posts: [], results: [], error: null };
  try {
    const posts = await fetchTimeline(session, limit);
    const selected = query ? relevantPosts(posts, query, 24) : posts;
    return {
      connected: true,
      user: session.user,
      posts: selected,
      results: query ? toResearchResults(selected) : [],
      totalFetched: posts.length,
      error: null,
    };
  } catch (error) {
    if (error?.status === 401) clearCookie(res, SESSION_COOKIE);
    return { connected: true, user: session.user, posts: [], results: [], totalFetched: 0, error: String(error?.message || error).slice(0, 240) };
  }
}

export async function xFeedEndpoint(req, res) {
  const limit = Math.max(5, Math.min(300, Number(req.query?.limit) || 60));
  const data = await getXFeed(req, res, { limit });
  res.set('Cache-Control', 'no-store');
  if (!data.connected) return res.status(401).json({ connected: false, error: 'حساب X غير متصل.' });
  res.json({ connected: true, user: data.user, posts: data.posts, totalFetched: data.totalFetched, error: data.error });
}
