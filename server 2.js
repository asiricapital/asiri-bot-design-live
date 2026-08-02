import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getQuote, getHistory, getMarketPulse, searchUsEquities } from './market.js';
import { calculateTechnicals } from './indicators.js';
import { analyzePosition } from './decision.js';
import { analyzeCandidate } from './candidate.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const pollMs = Math.max(5000, Number(process.env.POLL_INTERVAL_MS || 10000));
const technicalRefreshMs = Math.max(300000, Number(process.env.TECHNICAL_REFRESH_MS || 1800000));
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabasePublishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const telegramBotToken = String(process.env.TELEGRAM_BOT_TOKEN || '');
const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '');
const alertScanMs = Math.max(60000, Number(process.env.ALERT_SCAN_MS || 120000));
const goldenScanMs = Math.max(300000, Number(process.env.GOLDEN_SCAN_MS || 600000));
const goldenThreshold = Math.max(75, Math.min(99, Number(process.env.GOLDEN_THRESHOLD || 88)));
const goldenMaxAlerts = Math.max(1, Math.min(5, Number(process.env.GOLDEN_MAX_ALERTS || 3)));
const supabaseEnabled = Boolean(supabaseUrl && supabasePublishableKey);
const backgroundAlertsEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const telegramEnabled = Boolean(telegramBotToken && telegramChatId);
const defaultUniverse = 'KULR,HUMA,PLUG,OCGN,INO,CURI,LASE,SES,BLNK,OPTT,MVIS,CHPT,CRDL,POET,EOSE,AMPL,ADMA,SG,TMCI,RDW,AEHR,OUST,JOBY,ACHR,EVGO,SLDP,ENVX,QS,IONQ,RGTI,QBTS,BBAI,SOUN,GRAB,SOFI,OPEN,LCID,LAES,ONDS,REKR,AVXL,ABCL,CRSP,NTLA,EDIT,ARQQ,ASTS,SPIR,IRDM,CLSK,CIFR,HIVE,IREN';
const opportunityUniverse = String(process.env.OPPORTUNITY_SYMBOLS || defaultUniverse)
  .split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean).slice(0, 120);

const technicalCache = new Map();
const technicalCacheAt = new Map();
let marketPulse = { rows: [], score: null, regime: 'جارٍ التحديث', updatedAt: null };
let goldenScannerState = { running: false, lastStartedAt: null, lastCompletedAt: null, scanned: 0, qualified: 0, top: [], error: null };
const clients = new Set();

app.use(express.json({ limit: '1mb' }));
for (const file of ['index.html', 'style.css', 'app.js']) {
  app.get(file === 'index.html' ? '/' : `/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
}

function sanitizeSymbol(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
}

async function getTechnicals(symbol, force = false) {
  const age = Date.now() - (technicalCacheAt.get(symbol) || 0);
  if (!force && technicalCache.has(symbol) && age < technicalRefreshMs) return technicalCache.get(symbol);
  const history = await getHistory(symbol, new Date(Date.now() - 370 * 86400000));
  const technicals = calculateTechnicals(history);
  technicalCache.set(symbol, technicals);
  technicalCacheAt.set(symbol, Date.now());
  return technicals;
}

async function enrichPosition(position) {
  const symbol = sanitizeSymbol(position.symbol);
  if (!symbol) throw new Error('رمز سهم غير صالح');
  const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol)]);
  const normalized = {
    id: position.id,
    symbol,
    quantity: Number(position.quantity || 0),
    avgPrice: Number(position.avg_price ?? position.avgPrice ?? 0),
    stopLoss: position.stop_loss == null ? null : Number(position.stop_loss),
    target1: position.target1 == null ? null : Number(position.target1),
    target2: position.target2 == null ? null : Number(position.target2),
    notes: position.notes || ''
  };
  return { ...quote, position: normalized, technicals, analysis: analyzePosition(quote, normalized, technicals) };
}

function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const response of clients) response.write(payload);
}

async function refreshMarket() {
  try {
    marketPulse = await getMarketPulse();
    broadcast('market', marketPulse);
  } catch (error) {
    console.error('market', error.message);
  }
}

app.get('/api/config', (_req, res) => res.json({
  version: '5.1.2',
  mode: 'supabase-portfolio+alert-center+yahoo-polling',
  pollMs,
  technicalRefreshMs,
  supabase: {
    enabled: supabaseEnabled,
    url: supabaseEnabled ? supabaseUrl : null,
    publishableKey: supabaseEnabled ? supabasePublishableKey : null
  },
  notifications: { telegramEnabled, backgroundAlertsEnabled, alertScanMs, goldenScanMs, goldenThreshold, goldenMaxAlerts }
  ,goldenScanner: goldenScannerState
}));

app.post('/api/portfolio-analysis', async (req, res) => {
  const positions = Array.isArray(req.body?.positions) ? req.body.positions.slice(0, 30) : [];
  if (!positions.length) return res.json([]);
  const settled = await Promise.allSettled(positions.map(enrichPosition));
  const rows = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    return { symbol: sanitizeSymbol(positions[index]?.symbol), position: positions[index], error: result.reason?.message || 'تعذر جلب البيانات' };
  });
  res.json(rows);
});

app.get('/api/market', (_req, res) => res.json(marketPulse));
app.get('/api/search', async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (!term) return res.json([]);
  try { res.json(await searchUsEquities(term, 15)); }
  catch (error) { res.status(502).json({ error: error.message }); }
});
app.get('/api/analyze/:symbol', async (req, res) => {
  const symbol = sanitizeSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  try {
    const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol, true)]);
    res.json({ ...quote, technicals, candidateAnalysis: analyzeCandidate(quote, technicals, marketPulse) });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
app.get('/api/history/:symbol', async (req, res) => {
  const symbol = sanitizeSymbol(req.params.symbol);
  const days = Math.min(730, Math.max(10, Number(req.query.days || 180)));
  try { res.json(await getHistory(symbol, new Date(Date.now() - days * 86400000))); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.get('/api/opportunities', async (req, res) => {
  const requested = String(req.query.symbols || '').split(',').map(sanitizeSymbol).filter(Boolean);
  const symbols = [...new Set([...requested, ...opportunityUniverse])].slice(0, 30);
  try {
    const settled = await Promise.allSettled(symbols.map(async (symbol) => {
      const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol)]);
      const candidateAnalysis = analyzeCandidate(quote, technicals, marketPulse);
      return { ...quote, technicals, candidateAnalysis };
    }));
    const rows = settled
      .filter((x) => x.status === 'fulfilled')
      .map((x) => x.value)
      .filter((x) => Number(x.price) >= 1 && Number(x.price) <= 10)
      .filter((x) => Number(x.candidateAnalysis?.confidence || 0) >= 60)
      .sort((a, b) => Number(b.candidateAnalysis?.confidence || 0) - Number(a.candidateAnalysis?.confidence || 0))
      .slice(0, 3);
    res.json({ updatedAt: new Date().toISOString(), rows, scanned: symbols.length, note: 'تحقق من التوافق الشرعي في عوائد قبل أي تنفيذ.' });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});


app.get('/api/replacements', async (req, res) => {
  const exclude = new Set(String(req.query.exclude || '').split(',').map(sanitizeSymbol).filter(Boolean));
  const requested = String(req.query.symbols || '').split(',').map(sanitizeSymbol).filter(Boolean);
  const symbols = [...new Set([...requested, ...opportunityUniverse])].filter((s) => !exclude.has(s)).slice(0, 30);
  try {
    const settled = await Promise.allSettled(symbols.map(async (symbol) => {
      const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol, true)]);
      return { ...quote, technicals, candidateAnalysis: analyzeCandidate(quote, technicals, marketPulse) };
    }));
    const rows = settled.filter((x) => x.status === 'fulfilled').map((x) => x.value)
      .filter((x) => Number(x.price) >= 1 && Number(x.price) <= 10)
      .sort((a, b) => Number(b.candidateAnalysis?.confidence || 0) - Number(a.candidateAnalysis?.confidence || 0))
      .slice(0, 3);
    res.json({ updatedAt: new Date().toISOString(), rows, scanned: symbols.length, note: 'مرشحات بديلة تحتاج تحققًا شرعيًا وتأكيدًا فنيًا قبل التنفيذ.' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});


function alertFromPosition(q) {
  const p = q.position || {};
  const price = Number(q.price || 0);
  const volRatio = Number(q.technicals?.volumeRatio || 0);
  const out = [];
  const day = new Date().toISOString().slice(0, 10);
  const add = (type, severity, message, triggerPrice = null, payload = {}) => out.push({ symbol: q.symbol, alert_type: type, severity, message, trigger_price: triggerPrice, rule_key: `${q.symbol}:${type}:${day}`, payload });
  if (p.stopLoss && price <= Number(p.stopLoss)) add('STOP_HIT', 'critical', `كسر ${q.symbol} وقف الخسارة عند $${Number(p.stopLoss).toFixed(2)}. راجع التنفيذ فورًا.`, p.stopLoss, { price });
  else if (p.stopLoss && ((price / Number(p.stopLoss)) - 1) * 100 <= 3) add('STOP_NEAR', 'high', `${q.symbol} يبعد أقل من 3% عن وقف الخسارة.`, p.stopLoss, { price });
  if (p.target2 && price >= Number(p.target2)) add('TARGET2_HIT', 'golden', `${q.symbol} بلغ الهدف الثاني $${Number(p.target2).toFixed(2)}.`, p.target2, { price });
  else if (p.target1 && price >= Number(p.target1)) add('TARGET1_HIT', 'golden', `${q.symbol} بلغ الهدف الأول $${Number(p.target1).toFixed(2)}.`, p.target1, { price });
  if (volRatio >= 1.8) add('VOLUME_SPIKE', 'high', `حجم تداول ${q.symbol} بلغ ${volRatio.toFixed(1)}× من المتوسط.`, null, { price, volRatio });
  return out;
}

function telegramNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function telegramReasons(reasons) {
  const list = Array.isArray(reasons) ? reasons.filter(Boolean) : [];
  return list.length ? list.slice(0, 6).map((reason) => `• ${reason}`).join('\n') : '• اجتاز السهم شروط محرك Golden Alert';
}

function telegramAlertText(alert) {
  const payload = alert.payload || {};
  const symbol = alert.symbol || 'السوق';
  const time = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });

  if (alert.alert_type === 'GOLDEN_ALERT') {
    const currentPrice = payload.currentPrice ?? payload.price ?? alert.trigger_price;
    const action = payload.action || payload.decision || 'مراقبة الدخول وعدم مطاردة السعر';
    return [
      '🚨 Golden Alert — أسيري كابيتال',
      '',
      `السهم: ${symbol}`,
      `الثقة: ${telegramNumber(payload.confidence, 0)}/100`,
      `السعر الحالي: $${telegramNumber(currentPrice)}`,
      '',
      `الدخول المقترح: $${telegramNumber(payload.entryLow)} – $${telegramNumber(payload.entryHigh)}`,
      `وقف الخسارة: $${telegramNumber(payload.stopLoss)}`,
      `الهدف الأول: $${telegramNumber(payload.target1)}`,
      `الهدف الثاني: $${telegramNumber(payload.target2)}`,
      `العائد إلى المخاطرة: ${telegramNumber(payload.riskReward, 1)}`,
      '',
      'أسباب الترشيح:',
      telegramReasons(payload.reasons),
      '',
      `الإجراء: ${action}`,
      '⚠️ تحقق من التوافق الشرعي في عوائد قبل التنفيذ.',
      `الوقت: ${time}`
    ].join('\n');
  }

  if (alert.alert_type === 'STOP_HIT') {
    return [
      '🛑 تنبيه عاجل — أسيري كابيتال',
      '',
      `السهم: ${symbol}`,
      `السعر الحالي: $${telegramNumber(payload.price)}`,
      `وقف الخسارة: $${telegramNumber(alert.trigger_price)}`,
      '',
      'الإجراء: راجع تنفيذ وقف الخسارة فورًا.',
      `الوقت: ${time}`
    ].join('\n');
  }

  if (alert.alert_type === 'STOP_NEAR') {
    return [
      '⚠️ اقتراب من وقف الخسارة — أسيري كابيتال',
      '',
      `السهم: ${symbol}`,
      `السعر الحالي: $${telegramNumber(payload.price)}`,
      `وقف الخسارة: $${telegramNumber(alert.trigger_price)}`,
      '',
      'الإجراء: مراقبة لصيقة وعدم توسيع المركز.',
      `الوقت: ${time}`
    ].join('\n');
  }

  if (alert.alert_type === 'TARGET1_HIT' || alert.alert_type === 'TARGET2_HIT') {
    const label = alert.alert_type === 'TARGET2_HIT' ? 'الهدف الثاني' : 'الهدف الأول';
    return [
      '🎯 تنبيه هدف — أسيري كابيتال',
      '',
      `السهم: ${symbol}`,
      `السعر الحالي: $${telegramNumber(payload.price)}`,
      `${label}: $${telegramNumber(alert.trigger_price)}`,
      '',
      'الإجراء: راجع جني الأرباح أو رفع وقف الخسارة.',
      `الوقت: ${time}`
    ].join('\n');
  }

  if (alert.alert_type === 'VOLUME_SPIKE') {
    return [
      '📊 نشاط غير اعتيادي — أسيري كابيتال',
      '',
      `السهم: ${symbol}`,
      `السعر الحالي: $${telegramNumber(payload.price)}`,
      `الحجم مقابل المتوسط: ${telegramNumber(payload.volRatio, 1)}×`,
      '',
      'الإجراء: راقب استمرار الزخم وتأكيد الاختراق.',
      `الوقت: ${time}`
    ].join('\n');
  }

  return [
    '🔔 أسيري كابيتال',
    '',
    `${symbol} — ${alert.message || 'تنبيه جديد'}`,
    '',
    `الدرجة: ${payload.confidence ?? '—'}`,
    `الوقت: ${time}`
  ].join('\n');
}

async function sendTelegramAlert(alert) {
  if (!telegramEnabled) return { ok: false, reason: 'telegram-disabled' };
  const text = telegramAlertText(alert);
  const r = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramChatId,
      text,
      disable_web_page_preview: true
    })
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.description || 'تعذر إرسال تيليجرام');
  return data;
}

app.get('/api/notifications/status', (_req, res) => res.json({ telegramEnabled, backgroundAlertsEnabled, alertScanMs }));
app.post('/api/notifications/telegram-test', async (req, res) => {
  if (!telegramEnabled) return res.status(409).json({ error: 'أضف TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID في Render.' });
  try { await sendTelegramAlert({ symbol: 'TEST', message: 'نجح اختبار تنبيهات أسيري كابيتال.', payload: {} }); res.json({ ok: true }); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/api/notifications/telegram-golden-test', async (_req, res) => {
  if (!telegramEnabled) return res.status(409).json({ error: 'أضف TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID في Render.' });
  try {
    await sendTelegramAlert({
      symbol: 'TEST',
      alert_type: 'GOLDEN_ALERT',
      trigger_price: 3.93,
      message: 'اختبار قالب Golden Alert التفصيلي.',
      payload: {
        confidence: 92,
        currentPrice: 3.93,
        entryLow: 3.88,
        entryHigh: 3.96,
        stopLoss: 3.62,
        target1: 4.35,
        target2: 4.72,
        riskReward: 2.1,
        reasons: ['اتجاه صاعد', 'حجم تداول مرتفع', 'اختراق مقاومة', 'زخم إيجابي'],
        action: 'اختبار القالب فقط — لا تنفذ شراء.'
      }
    });
    res.json({ ok: true, template: 'golden-alert-detailed' });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

async function adminFetch(table, query = '') {
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, { headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}` } });
  if (!r.ok) throw new Error(`Supabase ${table}: ${await r.text()}`);
  return r.json();
}
async function adminInsert(table, rows) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=user_id,rule_key`, { method: 'POST', headers: { apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`Supabase insert ${table}: ${await r.text()}`);
  return r.json();
}

async function scanGoldenUniverse({ force = false } = {}) {
  if (goldenScannerState.running && !force) return goldenScannerState;
  goldenScannerState = { ...goldenScannerState, running: true, lastStartedAt: new Date().toISOString(), error: null };
  try {
    const results = [];
    const symbols = [...new Set(opportunityUniverse)].slice(0, 120);
    const batchSize = 8;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const settled = await Promise.allSettled(batch.map(async (symbol) => {
        const [quote, technicals] = await Promise.all([getQuote(symbol), getTechnicals(symbol)]);
        const candidateAnalysis = analyzeCandidate(quote, technicals, marketPulse);
        return { ...quote, technicals, candidateAnalysis };
      }));
      for (const item of settled) if (item.status === 'fulfilled') results.push(item.value);
    }
    const tradable = results
      .filter((row) => Number(row.price) >= 1 && Number(row.price) <= 10)
      .filter((row) => row.candidateAnalysis?.liquidityOk)
      .sort((a, b) => Number(b.candidateAnalysis?.confidence || 0) - Number(a.candidateAnalysis?.confidence || 0));
    const qualified = tradable.filter((row) => row.candidateAnalysis?.goldenQualified && Number(row.candidateAnalysis?.confidence || 0) >= goldenThreshold);
    goldenScannerState = {
      running: false,
      lastStartedAt: goldenScannerState.lastStartedAt,
      lastCompletedAt: new Date().toISOString(),
      scanned: results.length,
      qualified: qualified.length,
      top: tradable.slice(0, 10).map((row) => ({ symbol: row.symbol, price: row.price, confidence: row.candidateAnalysis?.confidence, decision: row.candidateAnalysis?.decision })),
      error: null
    };
    return { all: tradable, qualified, state: goldenScannerState };
  } catch (error) {
    goldenScannerState = { ...goldenScannerState, running: false, lastCompletedAt: new Date().toISOString(), error: error.message };
    throw error;
  }
}

async function knownUserIds() {
  if (!backgroundAlertsEnabled) return [];
  const [portfolio, watchlist] = await Promise.all([
    adminFetch('portfolio', '?select=user_id'),
    adminFetch('watchlist', '?select=user_id')
  ]);
  return [...new Set([...portfolio, ...watchlist].map((row) => row.user_id).filter(Boolean))];
}

async function runGoldenAlertScan() {
  if (!backgroundAlertsEnabled) return;
  try {
    // Always run the market scan so status metrics update even when no user rows exist yet.
    const { qualified } = await scanGoldenUniverse();
    if (!qualified.length) return;
    const userIds = await knownUserIds();
    if (!userIds.length) {
      console.log('golden-alert-scan: completed, but no Supabase user IDs were found for alert delivery');
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const selected = qualified.slice(0, goldenMaxAlerts);
    const alerts = [];
    for (const userId of userIds) {
      for (const row of selected) {
        const analysis = row.candidateAnalysis || {};
        alerts.push({
          user_id: userId,
          symbol: row.symbol,
          alert_type: 'GOLDEN_ALERT',
          severity: 'golden',
          status: 'unread',
          is_active: true,
          trigger_price: analysis.entryLow || row.price,
          rule_key: `${row.symbol}:GOLDEN_ALERT:${day}`,
          message: `${row.symbol}: ${analysis.decision} بثقة ${analysis.confidence}/100. الدخول $${analysis.entryLow}–$${analysis.entryHigh}، الوقف $${analysis.stopLoss}، الهدف الأول $${analysis.target1}.`,
          payload: {
            confidence: analysis.confidence,
            currentPrice: row.price,
            entryLow: analysis.entryLow,
            entryHigh: analysis.entryHigh,
            stopLoss: analysis.stopLoss,
            target1: analysis.target1,
            target2: analysis.target2,
            riskReward: analysis.riskReward,
            reasons: analysis.reasons,
            action: analysis.decision || 'مراقبة الدخول وعدم مطاردة السعر',
            scannerVersion: '5.1.2'
          }
        });
      }
    }
    const inserted = await adminInsert('alerts', alerts);
    for (const alert of inserted) {
      try { await sendTelegramAlert(alert); }
      catch (error) { console.error('telegram-golden', error.message); }
    }
  } catch (error) {
    console.error('golden-alert-scan', error.message);
  }
}

app.get('/api/golden-scanner/status', (_req, res) => res.json({
  ...goldenScannerState,
  enabled: backgroundAlertsEnabled,
  intervalMs: goldenScanMs,
  threshold: goldenThreshold,
  universeSize: opportunityUniverse.length
}));

app.post('/api/golden-scanner/run', async (_req, res) => {
  try {
    const result = await scanGoldenUniverse({ force: true });
    res.json({ ...result.state, rows: result.all.slice(0, 10) });
  } catch (error) {
    res.status(502).json({ error: error.message, ...goldenScannerState });
  }
});

async function runBackgroundAlertScan() {
  if (!backgroundAlertsEnabled) return;
  try {
    const positions = await adminFetch('portfolio', '?select=*');
    if (!positions.length) return;
    const settled = await Promise.allSettled(positions.slice(0, 50).map(enrichPosition));
    const alerts = [];
    settled.forEach((result, i) => { if (result.status === 'fulfilled') for (const a of alertFromPosition(result.value)) alerts.push({ ...a, user_id: positions[i].user_id, status: 'unread', is_active: true }); });
    if (!alerts.length) return;
    const inserted = await adminInsert('alerts', alerts);
    for (const alert of inserted) { try { await sendTelegramAlert(alert); } catch (e) { console.error('telegram', e.message); } }
  } catch (error) { console.error('background-alert-scan', error.message); }
}

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.add(res);
  res.write(`event: market\ndata: ${JSON.stringify(marketPulse)}\n\n`);
  req.on('close', () => clients.delete(res));
});
app.get('/api/system/readiness', (_req, res) => res.json({
  ok: true,
  version: '5.1.2',
  checks: {
    supabaseConfigured: supabaseEnabled,
    yahooPolling: true,
    marketPulseReady: Boolean(marketPulse?.updatedAt || marketPulse?.rows?.length),
    authMode: 'supabase-anonymous-session',
    backgroundAlerts: backgroundAlertsEnabled,
    telegram: telegramEnabled,
    goldenScanner: backgroundAlertsEnabled
  },
  nextAction: supabaseEnabled ? 'ready' : 'configure-supabase-environment'
}));

app.get('/health', (_req, res) => res.json({
  ok: true,
  version: '5.1.2',
  database: supabaseEnabled ? 'supabase-configured' : 'supabase-missing',
  marketPulse: marketPulse.regime,
  technicalCache: technicalCache.size
}));

app.listen(port, () => console.log(`Asiri Capital v5.1.2: http://localhost:${port}`));
refreshMarket();
setInterval(refreshMarket, Math.max(60000, pollMs * 2)).unref();

runBackgroundAlertScan();
setInterval(runBackgroundAlertScan, alertScanMs).unref();

// Start the first Golden scan shortly after boot, then continue on schedule.
// A short delay lets the HTTP server and market pulse initialize first.
setTimeout(() => runGoldenAlertScan().catch((error) => console.error('golden-initial-scan', error.message)), 5000).unref();
setInterval(() => runGoldenAlertScan().catch((error) => console.error('golden-scheduled-scan', error.message)), goldenScanMs).unref();
