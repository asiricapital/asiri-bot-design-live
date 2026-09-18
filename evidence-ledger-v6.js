/**
 * evidence-ledger-v6.js — سجل الأدلة
 *
 * المبدأ: الثقة ليست رقمًا يُلصق على النص، بل ناتج حساب قابل للعرض والمراجعة.
 * كل درجة تخرج من هنا مصحوبة بـ ledger يشرح كل معامل دخل فيها.
 *
 * لا يعتمد على أي مكتبة خارجية، ولا يغيّر شكل الكائنات القديمة —
 * يضيف حقولًا جديدة فقط (band, state, ledger, eventDate, stale).
 */

/* ------------------------------------------------------------------ */
/* 1) طبقات المصادر — تُصنَّف بخصائص بنيوية (الملكية/النوع) لا بالرأي   */
/* ------------------------------------------------------------------ */

export const TIERS = {
  primary:   { w: 1.00, label: 'مصدر أولي / جهة رسمية' },
  research:  { w: 0.88, label: 'بحث محكّم' },
  wire:      { w: 0.85, label: 'وكالة أنباء دولية' },
  outlet:    { w: 0.70, label: 'موقع إخباري' },
  stateWire: { w: 0.60, label: 'وكالة مملوكة لجهة حكومية' },
  reference: { w: 0.58, label: 'مصدر مرجعي ثانوي' },
  code:      { w: 0.55, label: 'مستودع شفرة' },
  forum:     { w: 0.35, label: 'نقاش مفتوح' },
  social:    { w: 0.25, label: 'منشور اجتماعي غير موثّق' },
};

/** وكالات دولية مستقلة الملكية عن الحكومات. القائمة قابلة للتعديل. */
const WIRES = ['reuters.com','apnews.com','ap.org','afp.com','bloomberg.com','dpa.com','ansa.it','efe.com','pa.media','kyodonews.net','yna.co.kr'];

/** وكالات تابعة لجهات حكومية — تصنيف ملكية، وليس حكمًا على الدقة. */
const STATE_WIRES = ['spa.gov.sa','wam.ae','kuna.net.kw','petra.gov.jo','mena.org.eg','irna.ir','tass.com','xinhuanet.com','saba.ye','ina.iq','aa.com.tr','presstv.ir','rt.com'];

const REFERENCE = ['wikipedia.org','britannica.com','wikiwand.com'];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, ''); }
  catch { return ''; }
}

function endsWithAny(host, list) {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

/** تحديد طبقة المصدر من خصائصه البنيوية. */
export function tierOf(item = {}) {
  const host = hostOf(item.url) || String(item.rootDomain || '').toLowerCase();
  const provider = String(item.provider || '');

  if (provider === 'X Timeline' || /(^|\.)(x\.com|twitter\.com)$/.test(host)) return { id: 'social', ...TIERS.social };
  if (item.type === 'paper' || provider === 'OpenAlex') return { id: 'research', ...TIERS.research };
  if (item.type === 'discussion' || provider === 'Hacker News') return { id: 'forum', ...TIERS.forum };
  if (item.type === 'github' || provider === 'GitHub') return { id: 'code', ...TIERS.code };

  if (endsWithAny(host, STATE_WIRES)) return { id: 'stateWire', ...TIERS.stateWire };
  if (endsWithAny(host, WIRES)) return { id: 'wire', ...TIERS.wire };
  if (endsWithAny(host, REFERENCE)) return { id: 'reference', ...TIERS.reference };
  if (/\.(gov|mil|int)(\.[a-z]{2})?$/.test(host) || /(^|\.)europa\.eu$/.test(host) || /(^|\.)un\.org$/.test(host)) {
    return { id: 'primary', ...TIERS.primary };
  }
  return { id: 'outlet', ...TIERS.outlet };
}

/* ------------------------------------------------------------------ */
/* 2) الاستقلال — عشرون موقعًا تنقل برقية واحدة = مصدر واحد            */
/* ------------------------------------------------------------------ */

const CREDIT_RX = /\((reuters|associated press|ap|afp|agence france[- ]presse|bloomberg|dpa|رويترز|أسوشيتد برس|اسوشيتد برس|فرانس برس|بلومبرغ|بلومبيرغ)\)|(?:نقلًا عن|نقلا عن|وفق(?:ًا)? ل|بحسب)\s*(?:وكالة\s*)?(رويترز|أسوشيتد برس|فرانس برس|بلومبرغ)/i;

/**
 * مفتاح الاستقلال: إذا كان النص ينسب الخبر إلى وكالة، فالأصل هو الوكالة
 * لا الموقع الذي أعاد النشر.
 */
export function originKey(item = {}) {
  const text = `${item.text || ''} ${item.title || ''} ${item.snippet || ''}`;
  const credit = text.match(CREDIT_RX);
  if (credit) {
    const name = (credit[1] || credit[2] || '').toLowerCase()
      .replace(/رويترز|reuters/, 'reuters')
      .replace(/أسوشيتد برس|اسوشيتد برس|associated press|^ap$/, 'ap')
      .replace(/فرانس برس|agence france[- ]presse|afp/, 'afp')
      .replace(/بلومبرغ|بلومبيرغ|bloomberg/, 'bloomberg');
    return `wire:${name.trim()}`;
  }
  const host = hostOf(item.url) || String(item.rootDomain || '').toLowerCase();
  const wire = WIRE_KEYS.find((w) => host === w.host || host.endsWith(`.${w.host}`));
  if (wire) return `wire:${wire.name}`;
  return item.independenceKey || item.rootDomain || host || item.source || item.provider || '';
}

/** نطاقات الوكالات تُردّ إلى المفتاح نفسه الذي يُنتجه ذكر الوكالة في النص. */
const WIRE_KEYS = [
  { host: 'reuters.com', name: 'reuters' },
  { host: 'apnews.com', name: 'ap' },
  { host: 'ap.org', name: 'ap' },
  { host: 'afp.com', name: 'afp' },
  { host: 'bloomberg.com', name: 'bloomberg' },
];

export function independentCount(items = []) {
  return new Set(items.map(originKey).filter(Boolean)).size;
}

/* ------------------------------------------------------------------ */
/* 3) تنظيف النص قبل أن يصبح «ادّعاءً»                                 */
/* ------------------------------------------------------------------ */

const BOILER_RX = [
  /\blog ?in\b/i, /\bsign ?in\b/i, /\bsign ?up\b/i, /create (a )?free account/i,
  /\bsubscribe\b/i, /subscription/i, /newsletter/i, /\bcookies?\b/i, /accept all/i,
  /privacy policy/i, /terms of (use|service)/i, /all rights reserved/i,
  /advertisement/i, /\bsponsored\b/i, /share this/i, /follow us/i, /click here/i,
  /read more/i, /continue reading/i, /skip to content/i, /enable javascript/i,
  /تسجيل الدخول/, /إنشاء حساب/, /اشترك الآن/, /جميع الحقوق محفوظة/, /سياسة الخصوصية/,
  /ملفات تعريف الارتباط/, /اقرأ أيضًا/, /اقرأ ايضا/, /شارك هذا/, /اضغط هنا/,
];

export function isBoilerplate(text) {
  return BOILER_RX.some((rx) => rx.test(String(text || '')));
}

/**
 * الادّعاء وحدة مفردة قابلة للتكذيب: فيها فعل، وليست قائمة روابط أو عنوان قسم.
 */
export function looksLikeClaim(text) {
  const t = String(text || '').trim();
  if (t.length < 45 || t.length > 420) return false;
  if (isBoilerplate(t)) return false;
  if (/^[^\p{L}]*$/u.test(t)) return false;
  if ((t.match(/\|/g) || []).length >= 2) return false;          // شريط تنقّل
  if ((t.match(/https?:\/\//g) || []).length >= 2) return false;  // قائمة روابط
  const words = t.split(/\s+/);
  if (words.length < 8) return false;
  const capRatio = words.filter((w) => /^[A-Z]/.test(w)).length / words.length;
  if (capRatio > 0.6) return false;                               // عناوين/قوائم
  const hasVerb = /(said|says|reported|announced|confirmed|denied|rose|fell|struck|seized|signed|launched|killed|agreed|warned|will|has|have|was|were|is|are)\b/i.test(t)
    || /(قال|قالت|أعلن|أعلنت|أفاد|أفادت|ذكر|ذكرت|أكد|أكدت|نفى|نفت|ارتفع|انخفض|استولى|سيطر|وقّع|أطلق|حذّر|يبلغ|تبلغ|كان|كانت)/.test(t);
  return hasVerb;
}

/* ------------------------------------------------------------------ */
/* 4) الزمن — تاريخ الحدث ليس تاريخ النشر                              */
/* ------------------------------------------------------------------ */

const AR_MONTHS = {
  'يناير':1,'كانون الثاني':1,'فبراير':2,'شباط':2,'مارس':3,'آذار':3,'اذار':3,'أبريل':4,'ابريل':4,'نيسان':4,
  'مايو':5,'أيار':5,'ايار':5,'يونيو':6,'حزيران':6,'يوليو':7,'تموز':7,'أغسطس':8,'اغسطس':8,'آب':8,
  'سبتمبر':9,'أيلول':9,'ايلول':9,'أكتوبر':10,'اكتوبر':10,'تشرين الأول':10,'نوفمبر':11,'تشرين الثاني':11,
  'ديسمبر':12,'كانون الأول':12,
};
const EN_MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};

function iso(y, m = 1, d = 1) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}

/**
 * يستخرج تاريخ الحدث من متن النص. يعود إلى تاريخ النشر فقط عند عدم وجود
 * أي إشارة زمنية صريحة — وهذا هو الفرق بين «خبر اليوم» و«أرشيف أُعيد نشره».
 */
export function extractEventDate(text, publishedAt = null) {
  const t = String(text || '');
  const pubYear = publishedAt ? new Date(publishedAt).getUTCFullYear() : null;

  const isoHit = t.match(/\b(19|20)\d{2}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/);
  if (isoHit) return { date: isoHit[0], precision: 'day', from: 'text' };

  const enHit = t.match(new RegExp(`\\b(${Object.keys(EN_MONTHS).join('|')})\\.?\\s+(\\d{1,2}),?\\s+((?:19|20)\\d{2})\\b`, 'i'))
    || t.match(new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(EN_MONTHS).join('|')})\\.?\\s+((?:19|20)\\d{2})\\b`, 'i'));
  if (enHit) {
    const monthName = (EN_MONTHS[enHit[1].toLowerCase()] ? enHit[1] : enHit[2]).toLowerCase();
    const day = Number(EN_MONTHS[enHit[1].toLowerCase()] ? enHit[2] : enHit[1]);
    const d = iso(Number(enHit[3]), EN_MONTHS[monthName], day);
    if (d) return { date: d, precision: 'day', from: 'text' };
  }

  for (const [name, num] of Object.entries(AR_MONTHS)) {
    const rx = new RegExp(`(\\d{1,2})\\s*${name}\\s*((?:19|20)\\d{2})`);
    const hit = t.match(rx);
    if (hit) {
      const d = iso(Number(hit[2]), num, Number(hit[1]));
      if (d) return { date: d, precision: 'day', from: 'text' };
    }
  }

  /* سنة صريحة تختلف عن سنة النشر: مؤشّر قوي على محتوى أرشيفي. */
  const years = [...t.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  if (years.length) {
    const earliest = Math.min(...years);
    if (!pubYear || Math.abs(pubYear - earliest) >= 2) {
      return { date: iso(earliest, 6, 30), precision: 'year', from: 'text' };
    }
  }

  if (publishedAt) {
    const d = new Date(publishedAt);
    if (!Number.isNaN(d.getTime())) return { date: d.toISOString().slice(0, 10), precision: 'day', from: 'published' };
  }
  return { date: null, precision: 'none', from: 'none' };
}

/** نافذة السؤال: تُوسَّع تلقائيًا للأسئلة التاريخية حتى لا يُعاقب الأرشيف ظلمًا. */
export function windowForQuestion(intent = {}) {
  const q = String(intent.query || '');
  if (/\b(19|20)\d{2}\b/.test(q) || /(تاريخ|منذ|في عام|خلفية|history|background)/i.test(q)) return 3650;
  if (intent.urgency === 'live' || intent.questionType === 'latest') return 21;
  return 365;
}

function temporal(eventDate, windowDays, today) {
  if (!eventDate) return { factor: 0.8, state: 'unknown', note: 'لا يوجد تاريخ حدث صريح — عومل بحذر' };
  const ageDays = Math.round((new Date(today).getTime() - new Date(eventDate).getTime()) / 86400000);
  if (ageDays < 0) return { factor: 0.9, state: 'future', note: 'تاريخ لاحق لليوم — يحتاج مراجعة' };
  if (ageDays > windowDays * 6) {
    const years = Math.max(1, Math.round(ageDays / 365));
    return { factor: 0, state: 'out', note: `عمر الحدث نحو ${years} سنة — خارج نطاق السؤال، يُعرض كسياق لا كدليل` };
  }
  if (ageDays > windowDays) return { factor: 0.55, state: 'old', note: `أقدم من نافذة السؤال بـ ${ageDays - windowDays} يومًا` };
  return { factor: 1, state: 'fresh', note: `داخل نافذة السؤال (${ageDays} يومًا)` };
}

/* ------------------------------------------------------------------ */
/* 5) التعزيز والحساب                                                  */
/* ------------------------------------------------------------------ */

/** خمسة مصادر أقوى من واحد، لكنها ليست خمسة أضعافه. */
export function corroboration(n) {
  if (n <= 0) return 0;
  return Math.min(1, 0.55 + (0.45 * Math.log2(n + 1)) / 2.5);
}

const REPORTED_RX = /(said|says|according to|reported by|claimed|alleged|قال|قالت|بحسب|وفق|نقلًا عن|نقلا عن|زعم|يُزعم)/i;

/**
 * يحسب درجة الادّعاء ويعيد الحقول الجديدة مع سجل مفصّل.
 * @param {{claim:string, items:Array}} cluster
 * @param {{windowDays?:number, today?:string|Date, opposing?:Array}} options
 */
export function scoreClaim(cluster, options = {}) {
  const items = Array.isArray(cluster.items) && cluster.items.length ? cluster.items : [{ text: cluster.claim }];
  const windowDays = Number(options.windowDays || 365);
  const today = options.today || new Date();
  const ledger = [];

  const tiers = items.map((x) => tierOf(x));
  const bestIdx = tiers.reduce((best, t, i) => (t.w > tiers[best].w ? i : best), 0);
  const best = tiers[bestIdx];
  const independent = independentCount(items);

  const dates = items
    .map((x) => extractEventDate(x.text || cluster.claim, x.publishedAt))
    .filter((d) => d.date);
  const eventDate = dates.length
    ? dates.map((d) => d.date).sort()[Math.floor(dates.length / 2)]
    : null;
  const eventDateFrom = dates.length ? dates[0].from : 'none';
  const time = temporal(eventDate, windowDays, today);

  const reported = REPORTED_RX.test(cluster.claim) && best.id !== 'primary';
  const direct = reported ? 0.85 : 1;

  let value = 100 * best.w * corroboration(independent) * direct * time.factor;

  ledger.push({ sign: 'neutral', delta: `×${best.w.toFixed(2)}`, note: `أقوى مصدر: ${best.label}` });
  ledger.push({
    sign: independent > 1 ? 'up' : 'down',
    delta: `×${corroboration(independent).toFixed(2)}`,
    note: independent > 1
      ? `${independent} مصادر مستقلة بعد دمج إعادة النشر (${items.length} ظهورًا)`
      : `مصدر مستقل واحد فقط من ${items.length} ظهورًا`,
  });
  if (reported) ledger.push({ sign: 'down', delta: '×0.85', note: 'صيغة نقل عن طرف ثالث لا تأكيد مباشر' });
  ledger.push({ sign: time.factor >= 1 ? 'up' : 'down', delta: time.factor ? `×${time.factor}` : '×0', note: time.note });

  let penalty = 0;
  const opposing = Array.isArray(options.opposing) ? options.opposing : [];
  if (opposing.length) {
    const strongest = Math.max(...opposing.map((o) => {
      const oItems = o.items || [];
      const oBest = oItems.length ? Math.max(...oItems.map((x) => tierOf(x).w)) : 0.5;
      return 100 * oBest * corroboration(independentCount(oItems) || 1);
    }));
    penalty = Math.min(35, strongest * 0.4);
    ledger.push({ sign: 'down', delta: `−${Math.round(penalty)}`, note: 'يوجد ادّعاء مضاد بسند مقارب — خُفض الطرفان بدل ترجيح أحدهما' });
  }
  value = Math.max(0, value - penalty);

  /* عدم يقين صادق: نطاق يضيق كلما زاد الاستقلال */
  const spread = independent >= 3 ? 6 : independent === 2 ? 10 : 16;
  const lo = Math.max(0, Math.round(value - spread));
  const hi = Math.min(100, Math.round(value + spread));

  let state = 'likely';
  let stateLabel = 'مرجّح';
  if (time.state === 'out') { state = 'stale'; stateLabel = 'خارج النطاق الزمني'; }
  else if (penalty > 0) { state = 'contested'; stateLabel = 'متعارض'; }
  else if (independent === 1) { state = 'single'; stateLabel = 'مصدر واحد'; }
  else if (value >= 78 && independent >= 3) { state = 'corroborated'; stateLabel = 'مؤكّد'; }
  else if (value < 45) { state = 'weak'; stateLabel = 'ضعيف'; }

  return {
    confidence: Math.round(value),
    band: { low: lo, high: hi },
    state,
    stateLabel,
    ledger,
    independentSources: independent,
    supportCount: items.length,
    eventDate,
    eventDateFrom,
    stale: time.state === 'out',
    topTier: best.id,
    topTierLabel: best.label,
  };
}

/** يعيد حساب ادّعاء موجود بعد إضافة عناصر جديدة (مثل منشورات X). */
export function rescoreClaim(claim, options = {}) {
  return { ...claim, ...scoreClaim(claim, options) };
}

export default {
  TIERS, tierOf, originKey, independentCount, isBoilerplate, looksLikeClaim,
  extractEventDate, windowForQuestion, corroboration, scoreClaim, rescoreClaim,
};