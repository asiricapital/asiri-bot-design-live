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
const goldenMaxAlerts = Math.max(1, Math.min(5, Number(process.env.GOLDEN_MAX_ALERTS || 5)));
const reportCheckMs = Math.max(60000, Number(process.env.REPORT_CHECK_MS || 60000));
const closeReportHour = Math.max(16, Math.min(20, Number(process.env.CLOSE_REPORT_HOUR_NY || 16)));
const closeReportMinute = Math.max(0, Math.min(59, Number(process.env.CLOSE_REPORT_MINUTE_NY || 20)));
const preMarketReportHour = Math.max(5, Math.min(9, Number(process.env.PREMARKET_REPORT_HOUR_NY || 8)));
const preMarketReportMinute = Math.max(0, Math.min(59, Number(process.env.PREMARKET_REPORT_MINUTE_NY || 45)));
const sundayBriefHour = Math.max(17, Math.min(21, Number(process.env.SUNDAY_BRIEF_HOUR_NY || 18)));
const sundayBriefMinute = Math.max(0, Math.min(59, Number(process.env.SUNDAY_BRIEF_MINUTE_NY || 15)));
const sundayBriefEnabled = String(process.env.SUNDAY_BRIEF_ENABLED || 'true').toLowerCase() !== 'false';
const supabaseEnabled = Boolean(supabaseUrl && supabasePublishableKey);
const backgroundAlertsEnabled = Boolean(supabaseUrl && supabaseServiceRoleKey);
const telegramEnabled = Boolean(telegramBotToken && telegramChatId);
const defaultUniverse = 'KULR,HUMA,PLUG,OCGN,INO,CURI,LASE,SES,BLNK,OPTT,MVIS,CHPT,CRDL,POET,EOSE,AMPL,ADMA,SG,TMCI,RDW,AEHR,OUST,JOBY,ACHR,EVGO,SLDP,ENVX,QS,IONQ,RGTI,QBTS,BBAI,SOUN,GRAB,SOFI,OPEN,LCID,LAES,ONDS,REKR,AVXL,ABCL,CRSP,NTLA,EDIT,ARQQ,ASTS,SPIR,IRDM,CLSK,CIFR,HIVE,IREN';
const opportunityUniverse = String(process.env.OPPORTUNITY_SYMBOLS || defaultUniverse)
  .split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean).slice(0, 120);

const technicalCache = new Map();
const technicalCacheAt = new Map();
let marketPulse = { rows: [], score: null, regime: 'جارٍ التحديث', updatedAt: null };
let goldenScannerState = { running: false, lastStartedAt: null, lastCompletedAt: null, scanned: 0, qualified: 0, qualifiedSymbols: [], top: [], error: null };
let reportState = { running: false, lastCloseReportAt: null, lastPreMarketReportAt: null, lastSundayBriefAt: null, lastError: null };
const memoryReportKeys = new Set();
const marketCalendar = {
  '2026-01-01': { status: 'closed', reason: 'New Year’s Day' },
  '2026-01-19': { status: 'closed', reason: 'Martin Luther King, Jr. Day' },
  '2026-02-16': { status: 'closed', reason: "Washington's Birthday" },
  '2026-04-03': { status: 'closed', reason: 'Good Friday' },
  '2026-05-25': { status: 'closed', reason: 'Memorial Day' },
  '2026-06-19': { status: 'closed', reason: 'Juneteenth National Independence Day' },
  '2026-07-03': { status: 'closed', reason: 'Independence Day observed' },
  '2026-09-07': { status: 'closed', reason: 'Labor Day' },
  '2026-11-26': { status: 'closed', reason: 'Thanksgiving Day' },
  '2026-11-27': { status: 'early-close', closeHour: 13, closeMinute: 0, reason: 'Day after Thanksgiving' },
  '2026-12-24': { status: 'early-close', closeHour: 13, closeMinute: 0, reason: 'Christmas Eve' },
  '2026-12-25': { status: 'closed', reason: 'Christmas Day' },
  '2027-01-01': { status: 'closed', reason: 'New Year’s Day' },
  '2027-01-18': { status: 'closed', reason: 'Martin Luther King, Jr. Day' },
  '2027-02-15': { status: 'closed', reason: "Washington's Birthday" },
  '2027-03-26': { status: 'closed', reason: 'Good Friday' },
  '2027-05-31': { status: 'closed', reason: 'Memorial Day' },
  '2027-06-18': { status: 'closed', reason: 'Juneteenth observed' },
  '2027-07-05': { status: 'closed', reason: 'Independence Day observed' },
  '2027-09-06': { status: 'closed', reason: 'Labor Day' },
  '2027-11-25': { status: 'closed', reason: 'Thanksgiving Day' },
  '2027-11-26': { status: 'early-close', closeHour: 13, closeMinute: 0, reason: 'Day after Thanksgiving' },
  '2027-12-24': { status: 'closed', reason: 'Christmas Day observed' },
  '2028-01-17': { status: 'closed', reason: 'Martin Luther King, Jr. Day' },
  '2028-02-21': { status: 'closed', reason: "Washington's Birthday" },
  '2028-04-14': { status: 'closed', reason: 'Good Friday' },
  '2028-05-29': { status: 'closed', reason: 'Memorial Day' },
  '2028-06-19': { status: 'closed', reason: 'Juneteenth National Independence Day' },
  '2028-07-03': { status: 'early-close', closeHour: 13, closeMinute: 0, reason: 'Day before Independence Day' },
  '2028-07-04': { status: 'closed', reason: 'Independence Day' },
  '2028-09-04': { status: 'closed', reason: 'Labor Day' },
  '2028-11-23': { status: 'closed', reason: 'Thanksgiving Day' },
  '2028-11-24': { status: 'early-close', closeHour: 13, closeMinute: 0, reason: 'Day after Thanksgiving' },
  '2028-12-25': { status: 'closed', reason: 'Christmas Day' }
};

function marketDayInfo(parts = newYorkParts()) {
  if (!isUsWeekday(parts)) return { status: 'closed', reason: 'عطلة نهاية الأسبوع', date: parts.date };
  const special = marketCalendar[parts.date];
  if (special) return { ...special, date: parts.date };
  return { status: 'open', closeHour: 16, closeMinute: 0, reason: null, date: parts.date };
}
function nextCalendarEvent(fromDate = newYorkParts().date) {
  return Object.entries(marketCalendar)
    .filter(([date]) => date >= fromDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, info]) => ({ date, ...info }))[0] || null;
}
const clients = new Set();

app.use(express.json({ limit: '1mb' }));
for (const file of ['index.html', 'style.css', 'app.js']) {
  app.get(file === 'index.html' ? '/' : `/${file}`, (_req, res) => res.sendFile(path.join(root, file)));
}


function reportNumber(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}
function reportPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}%` : '—';
}
function newYorkParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
  }).formatToParts(date).reduce((obj, part) => ({ ...obj, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), weekday: parts.weekday };
}
function isUsWeekday(parts) { return !['Sat', 'Sun'].includes(parts.weekday); }
function reportWindowReached(parts, hour, minute, graceMinutes = 90) {
  const current = parts.hour * 60 + parts.minute;
  const target = hour * 60 + minute;
  return current >= target && current <= target + graceMinutes;
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
  version: '5.8.0',
  mode: 'supabase-portfolio+alert-center+yahoo-polling+market-calendar+report-history+sunday-futures-brief+market-intelligence+decision-journal+risk-control',
  pollMs,
  technicalRefreshMs,
  supabase: {
    enabled: supabaseEnabled,
    url: supabaseEnabled ? supabaseUrl : null,
    publishableKey: supabaseEnabled ? supabasePublishableKey : null
  },
  notifications: { telegramEnabled, backgroundAlertsEnabled, alertScanMs, goldenScanMs, goldenThreshold, goldenMaxAlerts },
  reports: {
    enabled: telegramEnabled,
    timezone: 'America/New_York',
    close: `${String(closeReportHour).padStart(2,'0')}:${String(closeReportMinute).padStart(2,'0')}`,
    preMarket: `${String(preMarketReportHour).padStart(2,'0')}:${String(preMarketReportMinute).padStart(2,'0')}`,
    sundayBrief: {
      enabled: sundayBriefEnabled,
      weekday: 'Sun',
      schedule: `${String(sundayBriefHour).padStart(2,'0')}:${String(sundayBriefMinute).padStart(2,'0')}`
    }
  },
  goldenScanner: goldenScannerState
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
      .slice(0, 5);
    res.json({ updatedAt: new Date().toISOString(), rows, scanned: symbols.length, note: 'تحقق من التوافق الشرعي في عوائد قبل أي تنفيذ.' });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});


function miBucket(a={}){const s=Number(a.confidence??a.asiriScore??0);const d=String(a.decision||'').toUpperCase();if(a.goldenQualified&&s>=goldenThreshold)return'BUY';if(d.includes('AVOID')||d.includes('تجنب')||s<70)return'AVOID';return'WAIT'}
function miMomentum(t={}){const m=Number(t.momentum20||0);return m>=15?'قوي جدًا':m>=7?'قوي':m>=0?'متوسط-قوي':m>=-7?'متوسط':'ضعيف'}
function miLiquidity(a={},t={}){const r=Number(a.volumeRatio??t.volumeRatio??0);return r>=1.8?'مرتفعة جدًا':r>=1.2?'مرتفعة':r>=.8?'جيدة':'متوسطة'}
app.get('/api/market-intelligence+decision-journal+risk-control',async(req,res)=>{const requested=String(req.query.symbols||'').split(',').map(sanitizeSymbol).filter(Boolean);const symbols=[...new Set([...requested,...opportunityUniverse])].slice(0,40);try{const settled=await Promise.allSettled(symbols.map(async symbol=>{const[quote,technicals]=await Promise.all([getQuote(symbol),getTechnicals(symbol)]);return{...quote,technicals,candidateAnalysis:analyzeCandidate(quote,technicals,marketPulse)}}));const rows=settled.filter(x=>x.status==='fulfilled').map(x=>x.value).filter(x=>Number.isFinite(Number(x.price))).sort((a,b)=>Number(b.candidateAnalysis?.confidence??b.candidateAnalysis?.asiriScore??0)-Number(a.candidateAnalysis?.confidence??a.candidateAnalysis?.asiriScore??0));const ranked=rows.filter(x=>Number(x.price)>=1&&Number(x.price)<=10).map(x=>{const a=x.candidateAnalysis||{},t=x.technicals||{},score=Number(a.confidence??a.asiriScore??0),bucket=miBucket(a);return{symbol:x.symbol,name:x.name,price:x.price,changePercent:x.changePercent,score,bucket,decision:a.decision||(bucket==='BUY'?'شراء بعد التأكيد':bucket==='AVOID'?'تجنب':'انتظار'),momentum:miMomentum(t),liquidity:miLiquidity(a,t),volumeRatio:a.volumeRatio??t.volumeRatio??null,support:a.support??t.low20??null,resistance:a.resistance??t.high20??null,entryLow:a.entryLow??null,entryHigh:a.entryHigh??null,stopLoss:a.stopLoss??null,target1:a.target1??null,target2:a.target2??null,riskReward:a.riskReward??null,goldenQualified:Boolean(a.goldenQualified),shariaStatus:a.shariaStatus||'يجب التحقق في عوائد قبل التنفيذ.'}});const buy=ranked.filter(x=>x.bucket==='BUY'),wait=ranked.filter(x=>x.bucket==='WAIT'),avoid=ranked.filter(x=>x.bucket==='AVOID');const clamp=n=>Math.max(0,Math.min(100,Math.round(Number.isFinite(Number(n))?Number(n):50)));const marketScore=clamp(marketPulse.score);const vix=Number((marketPulse.rows||[]).find(x=>x.symbol==='^VIX')?.price||20);const rut=Number((marketPulse.rows||[]).find(x=>['^RUT','IWM'].includes(x.symbol))?.changePercent||0);const avg=(marketPulse.rows||[]).reduce((s,x)=>s+Number(x.changePercent||0),0);const liquid=ranked.filter(x=>Number(x.volumeRatio)>=.8).length;const closest=ranked[0]||null;const status=buy.length?'BUY':marketScore<45?'AVOID':'WAIT';res.json({updatedAt:new Date().toISOString(),market:{regime:marketPulse.regime,score:marketScore,trend:clamp(50+avg*8),riskAppetite:clamp(100-vix*2),smallCap:clamp(50+rut*15),liquidity:clamp(ranked.length?liquid/ranked.length*100:marketScore)},golden:{status,closest,qualified:buy.length,requirement:closest?.goldenQualified?'التحقق الشرعي والتنفيذ داخل منطقة الدخول فقط.':'اختراق مؤكد + Volume قوي + ثبات فوق المقاومة.'},top3:ranked.slice(0,3),rows:ranked.slice(0,20),counts:{buy:buy.length,wait:wait.length,avoid:avoid.length,highQuality:ranked.filter(x=>x.score>=85).length},shariaWatch:ranked.slice(0,5).map((x,i)=>({symbol:x.symbol,priority:i<2?'أولوية فحص':'مرشح'})),note:'التحليل فني آلي. تحقق من التوافق الشرعي في عوائد قبل التنفيذ.'})}catch(error){res.status(502).json({error:error.message})}});


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
      '🚨 Golden Alert — Asiri Capital',
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
      '🛑 تنبيه عاجل — Asiri Capital',
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
      '⚠️ اقتراب من وقف الخسارة — Asiri Capital',
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
      '🎯 تنبيه هدف — Asiri Capital',
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
      '📊 نشاط غير اعتيادي — Asiri Capital',
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
    '🔔 Asiri Capital',
    '',
    `${symbol} — ${alert.message || 'تنبيه جديد'}`,
    '',
    `الدرجة: ${payload.confidence ?? '—'}`,
    `الوقت: ${time}`
  ].join('\n');
}

async function sendTelegramText(text) {
  if (!telegramEnabled) return { ok: false, reason: 'telegram-disabled' };
  const r = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramChatId, text, disable_web_page_preview: true })
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(data.description || 'تعذر إرسال تيليجرام');
  return data;
}

async function sendTelegramAlert(alert) {
  return sendTelegramText(telegramAlertText(alert));
}

app.get('/api/notifications/status', (_req, res) => res.json({ telegramEnabled, backgroundAlertsEnabled, alertScanMs }));
app.post('/api/notifications/telegram-test', async (req, res) => {
  if (!telegramEnabled) return res.status(409).json({ error: 'أضف TELEGRAM_BOT_TOKEN وTELEGRAM_CHAT_ID في Render.' });
  try { await sendTelegramAlert({ symbol: 'TEST', message: 'نجح اختبار تنبيهات Asiri Capital.', payload: {} }); res.json({ ok: true }); }
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
async function adminPatch(table, query, values) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(values)
  });
  if (!r.ok) throw new Error(`Supabase update ${table}: ${await r.text()}`);
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
      qualifiedSymbols: qualified.map((row) => row.symbol),
      top: tradable.slice(0, 10).map((row) => ({ symbol: row.symbol, price: row.price, confidence: row.candidateAnalysis?.confidence, decision: row.candidateAnalysis?.decision, qualificationStatus: row.candidateAnalysis?.goldenQualified ? 'QUALIFIED' : 'REJECTED' })),
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
  if (!backgroundAlertsEnabled && !telegramEnabled) return;

  try {
    const { qualified } = await scanGoldenUniverse();
    if (!qualified.length) {
      console.log('golden-alert-scan: no qualified opportunities');
      return;
    }

    const day = newYorkParts().date;
    const selected = qualified.slice(0, goldenMaxAlerts);

    // Telegram delivery is independent from Supabase user IDs.
    for (const row of selected) {
      const analysis = row.candidateAnalysis || {};
      const reportKey = `golden-telegram:${row.symbol}:${day}`;
      const alert = {
        symbol: row.symbol,
        alert_type: 'GOLDEN_ALERT',
        severity: 'golden',
        trigger_price: analysis.entryLow || row.price,
        message: `${row.symbol}: ${analysis.decision || 'Golden Alert'}`,
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
          scannerVersion: '5.7.0'
        }
      };

      const telegramReport = {
        text: telegramAlertText(alert),
        payload: {
          ...alert.payload,
          symbol: row.symbol,
          generatedAt: new Date().toISOString()
        }
      };

      try {
        let runId = true;

        if (backgroundAlertsEnabled) {
          runId = await claimReportKey(
            reportKey,
            'golden-alert',
            day,
            telegramReport
          );
        } else if (memoryReportKeys.has(reportKey)) {
          runId = false;
        }

        if (!runId) {
          console.log(`golden-alert-telegram: duplicate skipped ${row.symbol}`);
          continue;
        }

        await sendTelegramAlert(alert);

        if (backgroundAlertsEnabled && runId !== true) {
          await adminPatch('report_runs', `?id=eq.${runId}`, {
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            error_message: null
          });
        }

        memoryReportKeys.add(reportKey);
        console.log(`golden-alert-telegram: sent ${row.symbol}`);
      } catch (error) {
        console.error(`golden-alert-telegram ${row.symbol}`, error.message);
      }
    }

    // Supabase in-app alerts remain optional and no longer block Telegram.
    if (!backgroundAlertsEnabled) return;

    const userIds = await knownUserIds();
    if (!userIds.length) {
      console.log('golden-alert-scan: Telegram sent, but no user IDs found for Supabase alerts');
      return;
    }

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
            scannerVersion: '5.7.0'
          }
        });
      }
    }

    if (alerts.length) await adminInsert('alerts', alerts);
  } catch (error) {
    console.error('golden-alert-scan', error.message);
  }
}

app.get('/api/golden-scanner/status' , (_req, res) => res.json({
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


async function loadPortfolioForReport() {
  if (!backgroundAlertsEnabled) return [];
  const positions = await adminFetch('portfolio', '?select=*');
  if (!positions.length) return [];
  const settled = await Promise.allSettled(positions.slice(0, 50).map(enrichPosition));
  return settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
}
function reportMarketLines(pulse) {
  return (pulse.rows || []).map((row) => row.error
    ? `${row.label}: تعذر التحديث`
    : `${row.label}: ${row.symbol === '^VIX' ? reportNumber(row.price, 1) : reportPercent(row.changePercent)}`
  ).join('\n');
}
function reportPortfolioLines(rows) {
  if (!rows.length) return 'لا توجد مراكز مسجلة.';
  return rows.slice(0, 10).map((row) => `• ${row.symbol}: $${reportNumber(row.price)} | ${reportPercent(row.changePercent)} | ${row.analysis?.decision || '—'}`).join('\n');
}
function nearestStopLine(rows) {
  const list = rows.map((row) => ({ symbol: row.symbol, distance: Number(row.analysis?.stopDistancePct), stop: row.position?.stopLoss }))
    .filter((row) => Number.isFinite(row.distance)).sort((a, b) => a.distance - b.distance);
  if (!list.length) return 'لا يوجد وقف مسجل';
  const row = list[0];
  return `${row.symbol} — يبعد ${reportNumber(row.distance, 1)}% عن الوقف $${reportNumber(row.stop)}`;
}
function nextSessionDecision(pulse, portfolio) {
  if (portfolio.some((row) => row.analysis?.action === 'EXIT')) return 'أولوية حماية رأس المال وتنفيذ الوقف للمراكز المكسورة.';
  if (Number(pulse.score) >= 70 && Number(goldenScannerState.qualified) > 0) return 'شراء انتقائي فقط داخل مناطق الدخول المحددة، دون مطاردة السعر.';
  if (Number(pulse.score) >= 45) return 'مراقبة وانتقاء محدود؛ تجنب التوسع قبل تأكيد الزخم.';
  return 'وضع دفاعي: تجنب إضافة مراكز جديدة وراقب المخاطر.';
}

const futuresBriefSymbols = [
  { symbol: 'ES=F', label: 'S&P 500 Futures' },
  { symbol: 'NQ=F', label: 'Nasdaq 100 Futures' },
  { symbol: 'YM=F', label: 'Dow Futures' },
  { symbol: 'RTY=F', label: 'Russell 2000 Futures' },
  { symbol: 'CL=F', label: 'النفط WTI' },
  { symbol: 'GC=F', label: 'الذهب' },
  { symbol: 'DX-Y.NYB', label: 'مؤشر الدولار' },
  { symbol: '^TNX', label: 'عائد سندات 10 سنوات' },
  { symbol: '^VIX', label: 'VIX' }
];

async function loadSundayFuturesSnapshot() {
  const settled = await Promise.allSettled(
    futuresBriefSymbols.map(async ({ symbol, label }) => {
      const quote = await getQuote(symbol);
      return { symbol, label, price: Number(quote.price), change: Number(quote.change), changePercent: Number(quote.changePercent), marketState: quote.marketState || null };
    })
  );
  return settled.map((result, index) => result.status === 'fulfilled' ? result.value : {
    symbol: futuresBriefSymbols[index].symbol,
    label: futuresBriefSymbols[index].label,
    error: result.reason?.message || 'تعذر التحديث'
  });
}

function futuresBriefLines(rows) {
  return rows.map((row) => row.error
    ? `• ${row.label}: تعذر التحديث`
    : `• ${row.label}: ${Number.isFinite(row.price) ? reportNumber(row.price, 2) : '—'} ${reportPercent(row.changePercent)}`
  ).join('\n');
}

function findFuturesRow(rows, symbol) {
  return rows.find((row) => row.symbol === symbol && !row.error);
}

function calculateSundayRisk(rows) {
  const equityRows = ['ES=F', 'NQ=F', 'YM=F', 'RTY=F'].map((symbol) => findFuturesRow(rows, symbol)).filter(Boolean);
  const positive = equityRows.filter((row) => Number(row.changePercent) > 0).length;
  const negative = equityRows.filter((row) => Number(row.changePercent) < 0).length;
  const nasdaq = findFuturesRow(rows, 'NQ=F');
  const vix = findFuturesRow(rows, '^VIX');
  const treasury = findFuturesRow(rows, '^TNX');
  const oil = findFuturesRow(rows, 'CL=F');
  let riskScore = 35;
  const reasons = [];
  if (negative >= 3) { riskScore += 25; reasons.push('غالبية العقود الآجلة للأسهم سلبية'); }
  if (positive >= 3) { riskScore -= 15; reasons.push('اتساع إيجابي في العقود الآجلة'); }
  if (Number(nasdaq?.changePercent) <= -0.7) { riskScore += 15; reasons.push('ضغط واضح على عقود Nasdaq'); }
  if (Number(nasdaq?.changePercent) >= 0.7) { riskScore -= 10; reasons.push('زخم إيجابي في عقود Nasdaq'); }
  if (Number(vix?.price) >= 25) { riskScore += 20; reasons.push('مؤشر الخوف VIX مرتفع'); }
  else if (Number(vix?.price) >= 20) { riskScore += 10; reasons.push('VIX أعلى من المستوى المريح'); }
  if (Number(treasury?.changePercent) >= 2) { riskScore += 10; reasons.push('ارتفاع قوي في عوائد السندات'); }
  if (Math.abs(Number(oil?.changePercent)) >= 3) { riskScore += 10; reasons.push('حركة حادة في أسعار النفط'); }
  riskScore = Math.max(0, Math.min(100, riskScore));
  let level = 'منخفض';
  let action = 'الاستعداد لشراء انتقائي بعد تأكيد الافتتاح';
  if (riskScore >= 70) { level = 'مرتفع'; action = 'انتظار وتجنب الدخول المبكر حتى استقرار السوق'; }
  else if (riskScore >= 45) { level = 'متوسط'; action = 'مراقبة حذرة وعدم مطاردة الأسهم عند الافتتاح'; }
  return { score: riskScore, level, action, reasons: reasons.length ? reasons : ['لا توجد إشارات خطر استثنائية حتى الآن'] };
}

async function buildSundayFuturesBrief(test = false) {
  const ny = newYorkParts();
  await refreshMarket();
  const [futures, portfolio] = await Promise.all([loadSundayFuturesSnapshot(), loadPortfolioForReport()]);
  if (!goldenScannerState.lastCompletedAt || test) {
    try { await scanGoldenUniverse({ force: true }); } catch (error) { console.error('sunday-golden-scan', error.message); }
  }
  const risk = calculateSundayRisk(futures);
  const bestOpportunity = goldenScannerState.qualifiedSymbols?.[0] || goldenScannerState.top?.[0]?.symbol || 'لا توجد فرصة مكتملة';
  const text = [
    `🌙 Sunday Night Futures Brief — Asiri Capital${test ? ' (TEST)' : ''}`, '',
    `استعداد مبكر لجلسة الاثنين — ${ny.date}`, '',
    'العقود والأسواق:', futuresBriefLines(futures), '',
    `مستوى مخاطر الجلسة: ${risk.level} (${risk.score}/100)`, '',
    'أسباب التقييم:', ...risk.reasons.map((reason) => `• ${reason}`), '',
    'المحفظة الحالية:', reportPortfolioLines(portfolio), '',
    `أقرب وقف خسارة: ${nearestStopLine(portfolio)}`,
    `أفضل فرصة مرشحة: ${bestOpportunity}`,
    `Golden Alerts المؤهلة: ${goldenScannerState.qualified || 0}`, '',
    `القرار الأولي: ${risk.action}`, '',
    'الخطة:',
    '• لا شراء اعتمادًا على العقود الآجلة وحدها.',
    '• انتظار تقرير ما قبل الافتتاح.',
    '• تأكيد الاتجاه بعد أول 15–30 دقيقة من الجلسة.',
    '• عدم مطاردة فجوة سعرية مرتفعة.', '',
    '⚠️ تحقق من التوافق الشرعي في تطبيق عوائد قبل تنفيذ أي صفقة.',
    `وقت الإرسال: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`
  ].join('\n');
  return {
    text,
    payload: {
      type: 'sunday-futures', test, marketDate: ny.date, futures, risk,
      portfolio: portfolio.map((row) => ({ symbol: row.symbol, price: row.price, changePercent: row.changePercent, decision: row.analysis?.decision, score: row.analysis?.asiriScore, stopDistancePct: row.analysis?.stopDistancePct })),
      golden: { qualified: goldenScannerState.qualified, qualifiedSymbols: goldenScannerState.qualifiedSymbols, top: goldenScannerState.top?.slice(0, 5) },
      generatedAt: new Date().toISOString()
    }
  };
}

async function buildAutomatedReport(type, test = false) {
  if (type === 'sunday-futures') return buildSundayFuturesBrief(test);
  await refreshMarket();
  if (!goldenScannerState.lastCompletedAt || test) {
    try { await scanGoldenUniverse({ force: true }); } catch {}
  }
  const portfolio = await loadPortfolioForReport();
  const ny = newYorkParts();
  const dayInfo = marketDayInfo(ny);
  const title = type === 'close' ? '📊 Market Close Report — Asiri Capital' : '🌅 Pre-Market Report — Asiri Capital';
  const best = goldenScannerState.qualifiedSymbols?.[0] || goldenScannerState.top?.[0]?.symbol || 'لا توجد فرصة مكتملة';
  const text = [
    `${title}${test ? ' (TEST)' : ''}`, '',
    `${type === 'close' ? 'ملخص ما بعد الإغلاق' : 'استعداد ما قبل الافتتاح'} — ${ny.date}`,
    `حالة جلسة اليوم: ${dayInfo.status === 'closed' ? `مغلقة — ${dayInfo.reason}` : dayInfo.status === 'early-close' ? `إغلاق مبكر 1:00 م — ${dayInfo.reason}` : 'جلسة كاملة'}`, '',
    'حالة السوق:', reportMarketLines(marketPulse), '',
    `نبض السوق: ${marketPulse.regime} (${marketPulse.score ?? '—'}/100)`, '',
    'المحفظة:', reportPortfolioLines(portfolio), '',
    `أقرب وقف خسارة: ${nearestStopLine(portfolio)}`,
    `أفضل فرصة: ${best}`,
    `Golden Alerts: ${goldenScannerState.qualified || 0}`, '',
    `قرار الجلسة: ${nextSessionDecision(marketPulse, portfolio)}`, '',
    '⚠️ تحقق من التوافق الشرعي في عوائد قبل تنفيذ أي صفقة.',
    `وقت الإرسال: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`
  ].join('\n');
  return {
    text,
    payload: {
      type, test, marketDate: ny.date, dayInfo,
      market: { score: marketPulse.score, regime: marketPulse.regime, rows: marketPulse.rows },
      portfolio: portfolio.map((row) => ({
        symbol: row.symbol, price: row.price, changePercent: row.changePercent,
        decision: row.analysis?.decision, score: row.analysis?.asiriScore,
        stopDistancePct: row.analysis?.stopDistancePct
      })),
      golden: { qualified: goldenScannerState.qualified, qualifiedSymbols: goldenScannerState.qualifiedSymbols, top: goldenScannerState.top?.slice(0, 5) },
      generatedAt: new Date().toISOString()
    }
  };
}
async function claimReportKey(reportKey, reportType, marketDate, report) {
  if (memoryReportKeys.has(reportKey)) return false;
  if (!backgroundAlertsEnabled) { memoryReportKeys.add(reportKey); return true; }
  const existing = await adminFetch('report_runs', `?select=id,delivery_status,created_at&report_key=eq.${encodeURIComponent(reportKey)}&limit=1`);
  if (existing.length && existing[0].delivery_status === 'sent') return false;
  if (existing.length) {
    await adminPatch('report_runs', `?id=eq.${existing[0].id}`, {
      report_text: report.text,
      payload: report.payload,
      delivery_status: 'pending',
      error_message: null
    });
    return existing[0].id;
  }
  const r = await fetch(`${supabaseUrl}/rest/v1/report_runs`, {
    method: 'POST', headers: {
      apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json', Prefer: 'return=representation'
    }, body: JSON.stringify([{
      report_key: reportKey, report_type: reportType, market_date: marketDate,
      report_text: report.text, payload: report.payload, delivery_status: 'pending'
    }])
  });
  if (!r.ok) throw new Error(await r.text());
  const inserted = await r.json();
  return inserted[0]?.id || true;
}
async function sendAutomatedReport(type, { force = false, test = false } = {}) {
  if (!telegramEnabled) throw new Error('Telegram غير مفعّل');
  const ny = newYorkParts();
  const key = `${type}:${ny.date}`;
  const report = await buildAutomatedReport(type, test);
  let runId = null;
  if (!force) {
    runId = await claimReportKey(key, type, ny.date, report);
    if (!runId) return { sent: false, reason: 'duplicate', key };
  }
  try {
    await sendTelegramText(report.text);
    if (runId && backgroundAlertsEnabled) {
      await adminPatch('report_runs', `?id=eq.${runId}`, {
        delivery_status: 'sent', sent_at: new Date().toISOString(), error_message: null
      });
      memoryReportKeys.add(key);
    }
    if (type === 'close') reportState.lastCloseReportAt = new Date().toISOString();
    else if (type === 'premarket') reportState.lastPreMarketReportAt = new Date().toISOString();
    else if (type === 'sunday-futures') reportState.lastSundayBriefAt = new Date().toISOString();
    reportState.lastError = null;
    return { sent: true, key, preview: report.text };
  } catch (error) {
    if (runId && backgroundAlertsEnabled) {
      try { await adminPatch('report_runs', `?id=eq.${runId}`, { delivery_status: 'failed', error_message: error.message }); } catch {}
    }
    throw error;
  }
}
async function runReportScheduler() {
  if (!telegramEnabled || reportState.running) return;
  const ny = newYorkParts();
  const dayInfo = marketDayInfo(ny);
  reportState.running = true;
  try {
    if (sundayBriefEnabled && ny.weekday === 'Sun' && reportWindowReached(ny, sundayBriefHour, sundayBriefMinute, 150)) {
      await sendAutomatedReport('sunday-futures');
    }
    if (dayInfo.status === 'closed') return;
    const effectiveCloseHour = dayInfo.status === 'early-close' ? dayInfo.closeHour : closeReportHour;
    const effectiveCloseMinute = dayInfo.status === 'early-close' ? 20 : closeReportMinute;
    if (reportWindowReached(ny, effectiveCloseHour, effectiveCloseMinute)) await sendAutomatedReport('close');
    if (reportWindowReached(ny, preMarketReportHour, preMarketReportMinute)) await sendAutomatedReport('premarket');
  } catch (error) {
    reportState.lastError = error.message;
    console.error('report-scheduler', error.message);
  } finally { reportState.running = false; }
}
app.get('/api/market-calendar/status', (_req, res) => {
  const ny = newYorkParts();
  const today = marketDayInfo(ny);
  res.json({ timezone: 'America/New_York', today, nextEvent: nextCalendarEvent(ny.date), source: 'NYSE 2026–2028 published calendar' });
});
app.get('/api/reports/status', (_req, res) => {
  const ny = newYorkParts();
  const today = marketDayInfo(ny);
  res.json({
    ...reportState, enabled: telegramEnabled, timezone: 'America/New_York', today,
    closeSchedule: today.status === 'early-close' ? '13:20' : `${String(closeReportHour).padStart(2,'0')}:${String(closeReportMinute).padStart(2,'0')}`,
    preMarketSchedule: `${String(preMarketReportHour).padStart(2,'0')}:${String(preMarketReportMinute).padStart(2,'0')}`,
    sundayBrief: { enabled: sundayBriefEnabled, weekday: 'Sunday', schedule: `${String(sundayBriefHour).padStart(2,'0')}:${String(sundayBriefMinute).padStart(2,'0')}` },
    checkEveryMs: reportCheckMs,
    nextCalendarEvent: nextCalendarEvent(ny.date)
  });
});
app.get('/api/reports/history', async (req, res) => {
  if (!backgroundAlertsEnabled) return res.json({ rows: [], enabled: false });
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
  const type = ['close', 'premarket', 'sunday-futures'].includes(String(req.query.type)) ? String(req.query.type) : null;
  const typeFilter = type ? `&report_type=eq.${type}` : '';
  try {
    const rows = await adminFetch('report_runs', `?select=id,report_key,report_type,market_date,report_text,payload,delivery_status,sent_at,created_at,error_message&delivery_status=eq.sent${typeFilter}&order=sent_at.desc&limit=${limit}`);
    res.json({ rows, enabled: true });
  } catch (error) { res.status(502).json({ error: error.message }); }
});
app.post('/api/reports/market-close-test', async (_req, res) => {
  try { res.json(await sendAutomatedReport('close', { force: true, test: true })); }
  catch (error) { res.status(502).json({ error: error.message }); }
});
app.post('/api/reports/pre-market-test', async (_req, res) => {
  try { res.json(await sendAutomatedReport('premarket', { force: true, test: true })); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

app.post('/api/reports/sunday-futures-test', async (_req, res) => {
  try { res.json(await sendAutomatedReport('sunday-futures', { force: true, test: true })); }
  catch (error) { res.status(502).json({ error: error.message }); }
});

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
  version: '5.8.0',
  checks: {
    supabaseConfigured: supabaseEnabled,
    yahooPolling: true,
    marketPulseReady: Boolean(marketPulse?.updatedAt || marketPulse?.rows?.length),
    authMode: 'supabase-anonymous-session',
    backgroundAlerts: backgroundAlertsEnabled,
    telegram: telegramEnabled,
    goldenScanner: backgroundAlertsEnabled,
    automatedReports: telegramEnabled,
    marketCalendar: true,
    reportHistory: backgroundAlertsEnabled,
    investmentLedger: supabaseEnabled,
    sundayFuturesBrief: sundayBriefEnabled,
    marketIntelligence: true
  },
  nextAction: supabaseEnabled ? 'ready' : 'configure-supabase-environment'
}));

app.get('/health', (_req, res) => res.json({
  ok: true,
  version: '5.8.0',
  database: supabaseEnabled ? 'supabase-configured' : 'supabase-missing',
  marketPulse: marketPulse.regime,
  technicalCache: technicalCache.size,
  reports: telegramEnabled ? 'enabled' : 'disabled',
  marketCalendar: marketDayInfo(newYorkParts()).status,
  reportHistory: backgroundAlertsEnabled ? 'enabled' : 'disabled',
  investmentLedger: supabaseEnabled ? 'enabled' : 'disabled',
  sundayFuturesBrief: sundayBriefEnabled ? 'enabled' : 'disabled',
  marketIntelligence: 'enabled'
}));

app.listen(port, () => console.log(`Asiri Capital v5.7.0: http://localhost:${port}`));
refreshMarket();
setInterval(refreshMarket, Math.max(60000, pollMs * 2)).unref();

runBackgroundAlertScan();
setInterval(runBackgroundAlertScan, alertScanMs).unref();

// Start the first Golden scan shortly after boot, then continue on schedule.
// A short delay lets the HTTP server and market pulse initialize first.
setTimeout(() => runGoldenAlertScan().catch((error) => console.error('golden-initial-scan', error.message)), 5000).unref();
setInterval(() => runGoldenAlertScan().catch((error) => console.error('golden-scheduled-scan', error.message)), goldenScanMs).unref();

setTimeout(() => runReportScheduler().catch((error) => console.error('report-initial-check', error.message)), 10000).unref();
setInterval(() => runReportScheduler().catch((error) => console.error('report-scheduled-check', error.message)), reportCheckMs).unref();
