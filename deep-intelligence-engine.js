import net from 'node:net';
import { runEmbeddedResearch } from './embedded-research.js';
import ledger from './evidence-ledger-v6.js';

const READ_TIMEOUT_MS = 8500;
const MAX_READ_BYTES = 700_000;

const DOMAIN_LABELS = {
  general: 'بحث عام',
  markets: 'الأسواق والاستثمار',
  government: 'الجهات والمنافسات',
  companies: 'الشركات والأعمال',
  technology: 'التقنية وGitHub',
  politics: 'السياسة والجغرافيا',
  science: 'العلوم والصحة',
  cyber: 'الأمن السيبراني',
  media: 'الإعلام والمحتوى',
  documents: 'الملفات والوثائق',
};

const DOMAIN_HINTS = {
  markets: /\b(stock|stocks|share|shares|nasdaq|nyse|earnings|revenue|guidance|short interest|sec|10-k|10-q|8-k|market cap|السهم|سهم|الاسهم|الأسهم|البورصة|ناسداك|السوق|إيرادات|ايرادات|أرباح|ارباح|تداول)\b/i,
  government: /(منافسة|منافسات|كراسة|RFP|RFQ|EOI|tender|procurement|اعتماد|Etimad|وزارة|هيئة|مركز حكومي|عقد حكومي|ترسية)/i,
  technology: /(github|repository|repo|مستودع|تقنية|التقنية|ذكاء اصطناعي|الذكاء الاصطناعي|AI\b|LLM|open source|برمج|software|framework|API|agent|MCP)/i,
  politics: /(سياس|حرب|عسكري|اليمن|غزة|إيران|اسرائيل|إسرائيل|روسيا|اوكرانيا|أوكرانيا|هرمز|مضيق|انتخابات|رئيس|حكومة|جيوسياسي|geopolit|war\b|military)/i,
  science: /(دراسة|بحث علمي|صحة|طبي|مرض|دواء|clinical|study|science|health|medicine|trial|meta-analysis)/i,
  cyber: /(ثغرة|أمن سيبراني|امن سيبراني|CVE|ransomware|malware|zero-day|cyber|vulnerability|security advisory)/i,
  companies: /(شركة|شركات|مبيعات|عميل|عملاء|account|sales|company|vendor|pipeline|CRM)/i,
  media: /(فيديو|صوت|مقطع|تغريدة|منشور|youtube|tiktok|instagram|twitter|x\.com|media|podcast)/i,
  documents: /(PDF|Word|Excel|ملف|وثيقة|مرفق|document|spreadsheet|attachment)/i,
};

const QUESTION_HINTS = {
  verify: /(تحقق|هل صحيح|صحيح أم|ما صحة|verify|fact check|true or false)/i,
  compare: /(قارن|مقارنة|مقابل|أفضل من|الفرق بين|compare|versus|\bvs\b)/i,
  timeline: /(تسلسل|متى بدأ|Timeline|تاريخ الأحداث|ما الذي حدث منذ)/i,
  decision: /(تنصح|قرار|أختار|اختر|ماذا أفعل|ما الأفضل|decision|recommend)/i,
  latest: /(اليوم|الآن|الان|هذه الساعة|آخر|اخر|الجديد|latest|today|now|breaking|current)/i,
};

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return normalizeSpace(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>'));
}

function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || [])
    .filter((x) => !['هذا','هذه','ذلك','التي','الذي','على','الى','إلى','عن','من','في','ما','ماذا','هل','why','what','the','and','for','with','from','that','this','today'].includes(x))
    .slice(0, 60))];
}

function detectDomain(query) {
  let best = 'general';
  let bestScore = 0;
  for (const [domain, rx] of Object.entries(DOMAIN_HINTS)) {
    const matches = String(query).match(new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : `${rx.flags}g`)) || [];
    if (matches.length > bestScore) {
      best = domain;
      bestScore = matches.length;
    }
  }
  if (/\$[A-Z]{1,6}\b/.test(String(query).toUpperCase())) return 'markets';
  if (/github\.com\/[\w.-]+\/[\w.-]+/i.test(query)) return 'technology';
  return best;
}

function detectQuestionType(query) {
  for (const [type, rx] of Object.entries(QUESTION_HINTS)) if (rx.test(query)) return type;
  return 'deep';
}

function detectUrgency(query) {
  return QUESTION_HINTS.latest.test(query) ? 'live' : 'background';
}

function extractEntities(query) {
  const found = new Set();
  for (const m of String(query).matchAll(/\$([A-Z]{1,6})\b/g)) found.add(m[1]);
  for (const m of String(query).matchAll(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:\/[^\s]*)?/ig)) found.add(m[1].toLowerCase());
  for (const m of String(query).matchAll(/\b([A-Z][A-Za-z0-9.-]{2,})\b/g)) found.add(m[1]);
  return [...found].slice(0, 10);
}

export function understandQuestion(query) {
  const text = normalizeSpace(query).slice(0, 3000);
  const domain = detectDomain(text);
  const questionType = detectQuestionType(text);
  const urgency = detectUrgency(text);
  const isUrl = /^https?:\/\/\S+$/i.test(text);
  return {
    query: text,
    domain,
    domainLabel: DOMAIN_LABELS[domain],
    questionType,
    urgency,
    isUrl,
    entities: extractEntities(text),
    language: /[\u0600-\u06ff]/.test(text) ? 'ar' : 'en',
  };
}

function planFor(intent) {
  const depth = intent.questionType === 'latest' || intent.urgency === 'live' ? 'fresh-first' : 'deep';
  const sourcePolicy = {
    markets: ['news','web','discussions','github'],
    government: ['web','news','papers'],
    companies: ['web','news','github','discussions'],
    technology: ['github','news','web','papers','discussions'],
    politics: ['news','web','papers'],
    science: ['papers','web','news'],
    cyber: ['web','news','github','papers'],
    media: ['news','web','discussions'],
    documents: ['web','papers'],
    general: ['web','news','papers','discussions'],
  }[intent.domain] || ['web','news'];
  const goals = {
    markets: ['المحفزات','المخاطر','ما تغير','المصدر الأولي','سياق السوق'],
    government: ['المتطلبات','المواعيد','الجهة الرسمية','المخاطر','الخطوة التالية'],
    technology: ['القيمة','النضج','الهندسة','الأمان','الترخيص','النشاط'],
    politics: ['ما حدث','الأطراف','التسلسل الزمني','الروايات المتعارضة','ما هو غير مؤكد'],
    science: ['جودة الدليل','الاتفاق العلمي','القيود','السلامة','الأسئلة المفتوحة'],
    cyber: ['التأثر','الشدة','الإصدارات','المعالجة','الدليل الأولي'],
  }[intent.domain] || ['الخلاصة','أقوى الأدلة','التعارضات','فجوات المعرفة','ما الذي تغير'];
  return { depth, sources: sourcePolicy, goals };
}

function rootDomain(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const bits = host.split('.');
    return bits.length <= 2 ? host : bits.slice(-2).join('.');
  } catch { return ''; }
}

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

function safeHttpUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:','https:'].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || isPrivateIp(host)) return null;
    return u;
  } catch { return null; }
}

async function fetchReadableSource(item) {
  const u = safeHttpUrl(item.url);
  if (!u) return { ...item, readStatus: 'blocked', fullText: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(u, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'ASIRI-Deep-Intelligence/5.0',
        'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.3',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(type)) return { ...item, readStatus: 'unsupported', fullText: '' };
    const buf = await response.arrayBuffer();
    const limited = Buffer.from(buf).subarray(0, MAX_READ_BYTES).toString('utf8');
    const main = limited.match(/<article\b[\s\S]*?<\/article>/i)?.[0]
      || limited.match(/<main\b[\s\S]*?<\/main>/i)?.[0]
      || limited;
    const text = stripTags(main).slice(0, 22_000);
    return { ...item, readStatus: text.length > 300 ? 'read' : 'thin', fullText: text, resolvedUrl: response.url || item.url };
  } catch (error) {
    return { ...item, readStatus: error?.name === 'AbortError' ? 'timeout' : 'failed', fullText: '', readError: String(error?.message || error).slice(0, 120) };
  } finally { clearTimeout(timer); }
}

function sentenceSplit(text) {
  return normalizeSpace(text)
    .split(/(?<=[.!?؟。])\s+|\n+/u)
    .map((x) => normalizeSpace(x))
    .filter((x) => x.length >= 45 && x.length <= 650);
}

function sentenceScore(sentence, queryTokens, source) {
  const low = sentence.toLowerCase();
  const overlap = queryTokens.filter((t) => low.includes(t)).length;
  let score = overlap * 8;
  if (/\d/.test(sentence)) score += 2;
  if (/(said|announced|reported|according|أعلن|قال|ذكر|أفاد|بحسب|وفق)/i.test(sentence)) score += 2;
  if (source.official) score += 5;
  score += Math.min(10, Number(source.evidenceScore || 0) / 10);
  return score;
}

function claimsFromSource(source, query) {
  const base = source.fullText || source.snippet || source.title || '';
  const q = tokens(query);
  /* نسبة الخبر إلى وكالة تظهر عادة في الترويسة لا داخل الجملة، فتُحسب مرة على مستوى المصدر. */
  const independenceKey = ledger.originKey({
    url: source.resolvedUrl || source.url,
    rootDomain: rootDomain(source.resolvedUrl || source.url),
    text: base.slice(0, 600),
    title: source.title,
    snippet: source.snippet,
  });
  return sentenceSplit(base)
    .filter((text) => ledger.looksLikeClaim(text))
    .map((text) => ({ text, score: sentenceScore(text, q, source) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => ({
      ...row,
      url: source.url,
      source: source.source,
      provider: source.provider,
      rootDomain: rootDomain(source.resolvedUrl || source.url),
      independenceKey,
      publishedAt: source.publishedAt,
      evidenceScore: source.evidenceScore,
    }));
}

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let i = 0;
  for (const x of A) if (B.has(x)) i += 1;
  return i / (A.size + B.size - i);
}

function numberSet(text) {
  return new Set(String(text).match(/\b\d+(?:[.,]\d+)?%?\b/g) || []);
}

function hasNegation(text) {
  return /(ليس|لم |لن |لا |غير |not\b|no\b|denied|false|غير صحيح|نفى|نفت)/i.test(text);
}

function clusterClaims(claims, intent = {}) {
  const clusters = [];
  for (const claim of claims.sort((a, b) => b.score - a.score)) {
    let best = null;
    let bestSim = 0;
    for (const cluster of clusters) {
      const sim = jaccard(claim.text, cluster.canonical);
      if (sim > bestSim) { best = cluster; bestSim = sim; }
    }
    if (best && bestSim >= 0.36) best.items.push(claim);
    else clusters.push({ canonical: claim.text, items: [claim] });
  }
  const base = clusters.slice(0, 18).map((cluster, idx) => ({
    id: idx + 1,
    claim: cluster.canonical,
    providers: [...new Set(cluster.items.map((x) => x.provider).filter(Boolean))],
    sourceDomains: [...new Set(cluster.items.map((x) => x.rootDomain).filter(Boolean))],
    items: cluster.items.slice(0, 6),
  }));

  const windowDays = ledger.windowForQuestion(intent);
  const today = new Date();

  return base.map((cluster) => {
    const opposing = base.filter((other) => other.id !== cluster.id
      && jaccard(other.claim, cluster.claim) >= 0.30
      && (hasNegation(other.claim) !== hasNegation(cluster.claim) || numbersDiverge(other.claim, cluster.claim)));
    const scored = ledger.scoreClaim(cluster, { windowDays, today, opposing });
    return {
      ...cluster,
      ...scored,
      possibleConflict: opposing.length > 0,
      opposingClaims: opposing.slice(0, 2).map((x) => x.claim),
      windowDays,
    };
  });
}

function numbersDiverge(a, b) {
  const A = numberSet(a);
  const B = numberSet(b);
  if (!A.size || !B.size) return false;
  return ![...A].some((x) => B.has(x));
}

function sourceIndependence(results) {
  const map = new Map();
  for (const item of results) {
    const rd = rootDomain(item.url) || item.source || item.provider;
    if (!rd) continue;
    if (!map.has(rd)) map.set(rd, []);
    map.get(rd).push(item);
  }
  return [...map.entries()].map(([domain, items]) => ({ domain, count: items.length, providers: [...new Set(items.map((x) => x.provider))] }));
}

function buildGapQueries(intent, clusters, independence) {
  const qs = [];
  const strong = clusters.filter((x) => x.independentSources >= 2 && x.confidence >= 70);
  const arabic = intent.language === 'ar';
  const meaningful = tokens(intent.query).length;
  /* الأسئلة القصيرة/العامة لا نوسّعها بعبارات هجينة حتى لا تنحرف دلاليًا. */
  if (meaningful < 3) return qs;
  if (intent.domain === 'politics' && intent.urgency === 'live') qs.push(arabic
    ? `${intent.query} بيان رسمي وكالة أنباء تأكيد مستقل`
    : `${intent.query} Reuters AP official statement`);
  if (intent.domain === 'government') qs.push(arabic
    ? `${intent.query} الموقع الرسمي الجهة الحكومية اعتماد`
    : `${intent.query} site:gov.sa OR site:etimad.sa`);
  if (intent.domain === 'markets') qs.push(arabic
    ? `${intent.query} إفصاح الشركة ملف رسمي نتائج مالية`
    : `${intent.query} SEC filing company investor relations`);
  if (intent.domain === 'technology') qs.push(arabic
    ? `${intent.query} التوثيق الرسمي إصدار ثغرة أمنية مستودع`
    : `${intent.query} documentation release security issue`);
  if (intent.domain === 'science') qs.push(arabic
    ? `${intent.query} مراجعة منهجية دراسة أصلية إرشادات`
    : `${intent.query} systematic review guideline`);
  if (independence.length < 3) qs.push(arabic
    ? `${intent.query} مصدر أولي رسمي مستقل`
    : `${intent.query} official primary source`);
  if (!strong.length) qs.push(arabic
    ? `${intent.query} دليل مستقل تأكيد المصدر`
    : `${intent.query} evidence source confirmation`);
  return [...new Set(qs)].slice(0, 2);
}

function mergeResearch(a, b, query) {
  const all = [...(a?.results || []), ...(b?.results || [])];
  const seen = new Set();
  const results = [];
  for (const item of all) {
    const key = `${rootDomain(item.url)}|${normalizeSpace(item.title).toLowerCase().slice(0, 120)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }
  results.sort((x, y) => Number(y.evidenceScore || 0) - Number(x.evidenceScore || 0));
  return {
    query,
    results,
    total: results.length,
    providers: [...(a?.providers || []), ...(b?.providers || [])],
    marketContext: [...(a?.marketContext || []), ...(b?.marketContext || [])],
    fetchedAt: new Date().toISOString(),
  };
}

function timelineFrom(results) {
  return results.filter((x) => x.publishedAt)
    .map((x) => ({ date: x.publishedAt, title: x.title, source: x.source || x.provider, url: x.url }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-14);
}

function deterministicAnswer(intent, clusters, results, gaps) {
  const live = clusters.filter((c) => !c.stale);
  const archived = clusters.filter((c) => c.stale).slice(0, 3);
  const strong = live.filter((c) => c.independentSources >= 2 && c.confidence >= 60).slice(0, 6);
  const uncertain = live.filter((c) => c.independentSources < 2 || c.possibleConflict).slice(0, 5);
  const citations = results.slice(0, 14).map((r, i) => ({ id: i + 1, ...r }));
  const citeFor = (claim) => {
    const hit = citations.find((c) => claim.items?.some((x) => x.url === c.url));
    return hit ? `[${hit.id}]` : '';
  };
  const nowLines = strong.length
    ? strong.slice(0, 3).map((c) => `- ${c.claim} (${c.stateLabel} · ${c.band?.low ?? 0}–${c.band?.high ?? 0}) ${citeFor(c)}`).join('\n')
    : '- لم تتجمع أدلة مستقلة كافية لبناء خلاصة عالية الثقة بعد.';
  const band = (c) => `${c.band?.low ?? 0}–${c.band?.high ?? 0}`;
  const known = strong.length
    ? strong.map((c) => `- ${c.claim} — ${c.stateLabel} · نطاق الثقة ${band(c)} · مصادر مستقلة ${c.independentSources} ${citeFor(c)}`).join('\n')
    : '- لا توجد ادعاءات وصلت بعد إلى عتبة الدعم المستقل المطلوبة.';
  const archivedText = archived.length
    ? `\n\n## محتوى أقدم من نطاق السؤال\n${archived.map((c) => `- ${c.claim} — ${c.ledger?.find((l) => l.delta === '×0')?.note || 'خارج النافذة الزمنية'} ${citeFor(c)}`).join('\n')}`
    : '';
  const unknown = uncertain.length
    ? uncertain.map((c) => `- ${c.claim} — ${c.possibleConflict ? 'يوجد تعارض محتمل بين الأدلة' : 'يحتاج مصدرًا مستقلًا إضافيًا'} ${citeFor(c)}`).join('\n')
    : '- لم يكتشف المحرك تعارضًا واضحًا في أقوى الأدلة، مع بقاء احتمال وجود معلومات غير مفهرسة.';
  const why = intent.domain === 'politics'
    ? 'الأهمية تُقاس هنا بتأثير التطور على الأطراف، الممرات/المناطق الحساسة، واحتمال التصعيد أو التهدئة.'
    : intent.domain === 'markets'
      ? 'الأهمية تُقاس بتأثير المعلومات على المحفزات والمخاطر والتوقعات وسياق السوق، مع فصل الخبر عن الرأي.'
      : intent.domain === 'technology'
        ? 'الأهمية تُقاس بالنضج، الاستخدام العملي، النشاط، الأمان، الترخيص، وإمكانية الاعتماد.'
        : 'الأهمية تُقاس بمدى ثبات الأدلة، حداثتها، واستقلال مصادرها عن بعضها.';
  const gapText = gaps.length ? gaps.map((x) => `- ${x}`).join('\n') : '- لا توجد فجوة بحثية بارزة اكتشفها المسار الآلي.';
  return `## الخلاصة الآن\n${nowLines}${archivedText}\n\n## ما نعرفه بدرجة أعلى\n${known}\n\n## ما يزال غير مؤكد أو مختلفًا عليه\n${unknown}\n\n## لماذا هذا مهم؟\n${why}\n\n## ما الذي ما زال يحتاج بحثًا؟\n${gapText}`;
}

export async function runDeepInvestigation(query, options = {}) {
  const intent = understandQuestion(query);
  const plan = planFor(intent);
  const stages = [];
  const mark = (id, label, started, meta = {}) => stages.push({ id, label, ms: Date.now() - started, ...meta });

  let t = Date.now();
  mark('understand', 'فهم السؤال وتحديد المجال', t, { domain: intent.domain, questionType: intent.questionType, urgency: intent.urgency });

  t = Date.now();
  const first = await runEmbeddedResearch({ query: intent.query, domainId: intent.domain, modeId: 'deep', sources: plan.sources });
  mark('search-1', 'البحث الأول متعدد المصادر', t, { results: first.results?.length || 0, providers: first.providers?.length || 0 });

  t = Date.now();
  const topToRead = (first.results || []).filter((x) => ['news','web','github'].includes(x.type)).slice(0, options.maxRead || 8);
  const readRows = await Promise.all(topToRead.map(fetchReadableSource));
  mark('read', 'فتح وقراءة أقوى المصادر', t, { requested: topToRead.length, read: readRows.filter((x) => x.readStatus === 'read').length });

  t = Date.now();
  const qClaims = readRows.flatMap((x) => claimsFromSource(x, intent.query));
  const initialClusters = clusterClaims(qClaims, intent);
  const initialIndependence = sourceIndependence(first.results || []);
  mark('claims', 'استخراج الادعاءات وتجميعها', t, { claims: qClaims.length, clusters: initialClusters.length, independentDomains: initialIndependence.length });

  t = Date.now();
  const gapQueries = buildGapQueries(intent, initialClusters, initialIndependence);
  let second = { results: [], providers: [] };
  if (gapQueries.length) {
    const passes = await Promise.allSettled(gapQueries.map((q) => runEmbeddedResearch({ query: q, domainId: intent.domain, modeId: 'verify', sources: plan.sources })));
    for (const p of passes) if (p.status === 'fulfilled') second = mergeResearch(second, p.value, intent.query);
  }
  mark('gap-search', 'بحث ثانٍ لسد فجوات الدليل', t, { queries: gapQueries, results: second.results?.length || 0 });

  t = Date.now();
  const merged = mergeResearch(first, second, intent.query);
  const readKnown = new Map(readRows.map((x) => [x.url, x]));
  const extraToRead = (merged.results || []).filter((x) => !readKnown.has(x.url) && ['news','web','github'].includes(x.type)).slice(0, 4);
  const extraRead = await Promise.all(extraToRead.map(fetchReadableSource));
  const allRead = [...readRows, ...extraRead];
  const allClaims = allRead.flatMap((x) => claimsFromSource(x, intent.query));
  const clusters = clusterClaims(allClaims, intent);
  const contradictions = clusters.filter((x) => x.possibleConflict).slice(0, 8);
  const independence = sourceIndependence(merged.results || []);
  const weakClusters = clusters.filter((x) => x.independentSources < 2).slice(0, 6);
  const gaps = [];
  if (independence.length < 3) gaps.push('عدد المصادر المستقلة ما زال محدودًا.');
  if (contradictions.length) gaps.push(`هناك ${contradictions.length} مجموعات ادعاءات تحمل تعارضًا محتملًا وتحتاج مراجعة المصدر الأولي.`);
  if (weakClusters.length) gaps.push(`${weakClusters.length} ادعاءات مهمة ما زالت مدعومة بمصدر مستقل واحد فقط.`);
  const staleCount = clusters.filter((x) => x.stale).length;
  if (staleCount) gaps.push(`${staleCount} ادعاءات مستخرجة من محتوى أقدم من نطاق السؤال، وعُرضت كسياق لا كدليل على الوضع الحالي.`);
  if (intent.urgency === 'live' && !(merged.results || []).some((x) => x.publishedAt && Date.now() - new Date(x.publishedAt).getTime() < 48 * 3600_000)) gaps.push('لم يظهر عدد كافٍ من المصادر الحديثة جدًا خلال آخر 48 ساعة.');
  mark('cross-check', 'التحقق المتقاطع وكشف التعارضات', t, { clusters: clusters.length, contradictions: contradictions.length, independentDomains: independence.length });

  const results = (merged.results || []).slice(0, 36);
  const answer = deterministicAnswer(intent, clusters, results, gaps);
  const coverage = Math.min(100, Math.round((Math.min(8, clusters.filter((x) => x.independentSources >= 2 && !x.stale).length) / 8) * 55 + Math.min(6, independence.length) / 6 * 30 + Math.min(10, allRead.filter((x) => x.readStatus === 'read').length) / 10 * 15));

  return {
    intent,
    plan,
    stages,
    answer,
    confidence: coverage,
    results,
    sourcesRead: allRead.map((x) => ({ title: x.title, url: x.url, source: x.source, provider: x.provider, publishedAt: x.publishedAt, evidenceScore: x.evidenceScore, readStatus: x.readStatus, chars: x.fullText?.length || 0, excerpt: (x.fullText || x.snippet || '').slice(0, 900) })),
    claims: clusters,
    contradictions,
    gaps,
    gapQueries,
    independence,
    timeline: timelineFrom(results),
    providers: merged.providers || [],
    marketContext: merged.marketContext || [],
    fetchedAt: new Date().toISOString(),
  };
}