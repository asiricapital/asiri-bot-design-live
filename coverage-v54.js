import { runDeepInvestigationWithX } from './deep-intelligence-engine-x.js';
import { understandQuestion } from './deep-intelligence-engine.js';

const MODE_CFG = {
  quick: { passes: 1, maxRead: 6, resultCap: 18 },
  deep: { passes: 2, maxRead: 10, resultCap: 34 },
  max: { passes: 3, maxRead: 14, resultCap: 48 },
  live: { passes: 2, maxRead: 10, resultCap: 34 },
};

function normMode(value) {
  const v = String(value || '').toLowerCase();
  return MODE_CFG[v] ? v : 'max';
}

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFKC')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ').trim();
}

function rootDomain(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const p = host.split('.');
    return p.length <= 2 ? host : p.slice(-2).join('.');
  } catch { return ''; }
}

function dedupeBy(items, keyFn, cap = 100) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= cap) break;
  }
  return out;
}

function bilingualVariant(query, intent) {
  const q = normalizeText(query);
  if (/اليمن|yemen/.test(q)) return 'Yemen latest developments Houthi Red Sea Aden Sanaa Mokha official statement Reuters AP';
  if (/غزه|غزة|gaza|فلسطين|palestin/.test(q)) return 'Gaza Palestine latest developments official statement Reuters AP';
  if (/ايران|iran|هرمز|hormuz/.test(q)) return 'Iran Strait of Hormuz latest developments official statement Reuters AP';
  if (intent.domain === 'technology') return `${query} official documentation release notes security GitHub`; 
  if (intent.domain === 'markets') return `${query} SEC filing investor relations earnings official`; 
  if (intent.domain === 'government') return `${query} site:gov.sa OR site:etimad.sa official`; 
  if (intent.domain === 'science') return `${query} systematic review guideline primary study`; 
  return `${query} official primary source confirmation`; 
}

function variantsFor(query, mode, intent) {
  const out = [query];
  if (mode === 'quick') return out;
  if (mode === 'live') {
    out.push(`${query} آخر 24 ساعة عاجل بيان رسمي latest today breaking official`);
    return [...new Set(out)];
  }
  out.push(bilingualVariant(query, intent));
  if (mode === 'max') {
    const entities = (intent.entities || []).join(' ');
    if (intent.domain === 'politics') out.push(`${query} ${entities} official statement chronology independent sources Reuters AP AFP BBC`);
    else if (intent.domain === 'technology') out.push(`${query} ${entities} GitHub issues releases docs security license activity`);
    else if (intent.domain === 'markets') out.push(`${query} ${entities} SEC 8-K 10-Q investor relations catalyst risk dilution cash`);
    else out.push(`${query} ${entities} primary source independent verification timeline`);
  }
  return [...new Set(out.map((x) => String(x).trim()).filter(Boolean))];
}

function mergeClaims(allClaims) {
  const rows = [];
  for (const claim of allClaims || []) {
    const text = normalizeText(claim.claim);
    if (!text) continue;
    const existing = rows.find((x) => normalizeText(x.claim) === text);
    if (!existing) {
      rows.push({ ...claim, providers: [...(claim.providers || [])], sourceDomains: [...(claim.sourceDomains || [])], items: [...(claim.items || [])] });
      continue;
    }
    existing.supportCount = Math.max(Number(existing.supportCount || 0), Number(claim.supportCount || 0));
    existing.independentSources = Math.max(Number(existing.independentSources || 0), Number(claim.independentSources || 0));
    existing.confidence = Math.max(Number(existing.confidence || 0), Number(claim.confidence || 0));
    existing.possibleConflict = Boolean(existing.possibleConflict || claim.possibleConflict);
    existing.providers = [...new Set([...(existing.providers || []), ...(claim.providers || [])])];
    existing.sourceDomains = [...new Set([...(existing.sourceDomains || []), ...(claim.sourceDomains || [])])];
    existing.items = dedupeBy([...(existing.items || []), ...(claim.items || [])], (x) => x.url || x.text, 8);
  }
  return rows.sort((a,b) => (Number(b.independentSources||0)*20 + Number(b.confidence||0)) - (Number(a.independentSources||0)*20 + Number(a.confidence||0))).slice(0, 28).map((x,i)=>({...x,id:i+1}));
}

function buildAnswer(claims, results, gaps, mode) {
  const strong = claims.filter((c) => Number(c.independentSources || 0) >= 2 && Number(c.confidence || 0) >= 70).slice(0, 7);
  const uncertain = claims.filter((c) => Number(c.independentSources || 0) < 2 || c.possibleConflict).slice(0, 6);
  const numbered = (results || []).slice(0, 40).map((r,i)=>({ ...r, _id:i+1 }));
  const cite = (c) => {
    const hit = numbered.find((r) => (c.items || []).some((x) => x.url === r.url));
    return hit ? `[${hit._id}]` : '';
  };
  const strongText = strong.length ? strong.map((c)=>`- ${c.claim} ${cite(c)}`).join('\n') : '- لم تصل الأدلة بعد إلى عتبة التأكيد المستقل الكافية.';
  const uncertainText = uncertain.length ? uncertain.map((c)=>`- ${c.claim} — ${c.possibleConflict ? 'توجد روايات/أرقام متعارضة' : 'يحتاج مصدرًا مستقلًا إضافيًا'} ${cite(c)}`).join('\n') : '- لا يوجد تعارض بارز في أقوى الأدلة الحالية.';
  const gapText = gaps.length ? gaps.map((x)=>`- ${x}`).join('\n') : '- لا توجد فجوة بارزة اكتشفها المسار الحالي.';
  return `## الخلاصة الآن\n${strongText}\n\n## ما نعرفه بدرجة عالية\n${strongText}\n\n## ما يزال غير مؤكد أو مختلفًا عليه\n${uncertainText}\n\n## تغطية البحث\n- الوضع: ${mode === 'max' ? 'Max Coverage' : mode === 'live' ? 'Live' : mode === 'quick' ? 'Quick' : 'Deep'}\n- تم تشغيل أكثر من مسار بحث عند الحاجة مع إزالة التكرار واحتساب استقلال المصادر.\n\n## ما الذي ما زال يحتاج بحثًا؟\n${gapText}`;
}

function mergeInvestigations(investigations, mode, variants) {
  const cfg = MODE_CFG[mode];
  const primary = investigations[0] || {};
  const results = dedupeBy(investigations.flatMap((x)=>x.results || []).sort((a,b)=>Number(b.evidenceScore||0)-Number(a.evidenceScore||0)), (x)=>x.url || `${x.provider}|${x.title}`, cfg.resultCap);
  const sourcesRead = dedupeBy(investigations.flatMap((x)=>x.sourcesRead || []), (x)=>x.url, mode === 'max' ? 28 : 18);
  const claims = mergeClaims(investigations.flatMap((x)=>x.claims || []));
  const contradictions = dedupeBy(investigations.flatMap((x)=>x.contradictions || []), (x)=>x.claim || x.url, 12);
  const gaps = [...new Set(investigations.flatMap((x)=>x.gaps || []))];
  const gapQueries = [...new Set(investigations.flatMap((x)=>x.gapQueries || []))];
  const independenceMap = new Map();
  for (const item of investigations.flatMap((x)=>x.independence || [])) {
    const key = item.domain || rootDomain(item.url);
    if (!key) continue;
    const old = independenceMap.get(key) || { domain:key, count:0, providers:[] };
    old.count += Number(item.count || 1);
    old.providers = [...new Set([...(old.providers || []), ...(item.providers || [])])];
    independenceMap.set(key, old);
  }
  const independence = [...independenceMap.values()];
  const timeline = dedupeBy(investigations.flatMap((x)=>x.timeline || []).sort((a,b)=>new Date(a.date||0)-new Date(b.date||0)), (x)=>`${x.url}|${x.date}`, 24);
  const stages = investigations.flatMap((x,idx)=>(x.stages || []).map((s)=>({...s, pass:idx+1}))); 
  const strongCount = claims.filter((c)=>Number(c.independentSources||0)>=2 && Number(c.confidence||0)>=70).length;
  const readCount = sourcesRead.filter((x)=>x.readStatus==='read').length;
  const confidence = Math.min(99, Math.round(Math.min(40, independence.length*4) + Math.min(35, strongCount*5) + Math.min(24, readCount*2)));
  return {
    ...primary,
    answer: buildAnswer(claims, results, gaps, mode),
    confidence,
    results,
    sourcesRead,
    claims,
    contradictions,
    gaps,
    gapQueries,
    independence,
    timeline,
    stages,
    coverage: {
      mode,
      passes: investigations.length,
      queryVariants: variants,
      totalEvidence: results.length,
      independentSources: independence.length,
      sourcesRead: readCount,
      strongClaims: strongCount,
    },
  };
}

export async function runCoverageInvestigation(question, options = {}) {
  const mode = normMode(options.mode);
  const cfg = MODE_CFG[mode];
  const intent = understandQuestion(question);
  const variants = variantsFor(question, mode, intent).slice(0, cfg.passes);
  const jobs = variants.map((query, idx) => runDeepInvestigationWithX(query, {
    maxRead: cfg.maxRead,
    xResults: idx === 0 ? (options.xResults || []) : [],
    xConnected: Boolean(options.xConnected),
    xError: options.xError || null,
  }));
  const settled = await Promise.allSettled(jobs);
  const investigations = settled.filter((x)=>x.status==='fulfilled').map((x)=>x.value);
  if (!investigations.length) throw settled[0]?.reason || new Error('فشل البحث متعدد المسارات');
  const merged = mergeInvestigations(investigations, mode, variants);
  merged.intent = { ...(merged.intent || intent), researchMode: mode };
  merged.x = { ...(merged.x || {}), connected: Boolean(options.xConnected), error: options.xError || merged.x?.error || null };
  return merged;
}
