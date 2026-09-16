import { runDeepInvestigation } from './deep-intelligence-engine.js';

function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || [])
    .filter((x) => !['هذا','هذه','ذلك','التي','الذي','على','الى','إلى','عن','من','في','ما','ماذا','هل','why','what','the','and','for','with','from','that','this','today'].includes(x))
    .slice(0, 80))];
}

function jaccard(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const x of A) if (B.has(x)) intersection += 1;
  return intersection / (A.size + B.size - intersection);
}

function hasNegation(value) {
  return /(ليس|لم |لن |لا |غير |نفى|نفت|not\b|no\b|denied|false)/i.test(String(value || ''));
}

function numbers(value) {
  return new Set(String(value || '').match(/\b\d+(?:[.,]\d+)?%?\b/g) || []);
}

function possibleConflict(a, b) {
  if (jaccard(a, b) < 0.28) return false;
  if (hasNegation(a) !== hasNegation(b)) return true;
  const A = numbers(a);
  const B = numbers(b);
  if (A.size && B.size) {
    const common = [...A].some((x) => B.has(x));
    if (!common) return true;
  }
  return false;
}

function canonicalResultKey(item) {
  try {
    const u = new URL(item.url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return `${item.provider || ''}|${String(item.title || '').toLowerCase().slice(0, 180)}`;
  }
}

function mergeResults(base, extras) {
  const out = [...(base || [])];
  const seen = new Set(out.map(canonicalResultKey));
  for (const item of extras || []) {
    const key = canonicalResultKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 52);
}

function xPostsOnly(results) {
  return (results || []).filter((x) => x?.provider === 'X Timeline' && x?.snippet);
}

function mergeClaims(baseClaims, xResults, baseResultCount) {
  const claims = (baseClaims || []).map((c) => ({
    ...c,
    providers: [...(c.providers || [])],
    sourceDomains: [...(c.sourceDomains || [])],
    items: [...(c.items || [])],
  }));
  const conflicts = [];
  const posts = xPostsOnly(xResults);

  for (let idx = 0; idx < posts.length; idx += 1) {
    const post = posts[idx];
    const text = String(post.snippet || '').replace(/\s+/g, ' ').trim();
    if (text.length < 25) continue;
    let best = null;
    let similarity = 0;
    for (const claim of claims) {
      const sim = jaccard(text, claim.claim);
      if (sim > similarity) { best = claim; similarity = sim; }
    }
    const sourceKey = post.independenceKey || post.source || 'x';
    const item = {
      text,
      score: post.evidenceScore || 55,
      url: post.url,
      source: post.source,
      provider: post.provider,
      rootDomain: sourceKey,
      publishedAt: post.publishedAt,
      evidenceScore: post.evidenceScore,
    };

    if (best && similarity >= 0.30) {
      const alreadyIndependent = best.sourceDomains.includes(sourceKey);
      best.items.push(item);
      best.supportCount = Number(best.supportCount || 0) + 1;
      if (!alreadyIndependent) {
        best.sourceDomains.push(sourceKey);
        best.independentSources = Number(best.independentSources || 0) + 1;
      }
      if (!best.providers.includes('X Timeline')) best.providers.push('X Timeline');
      best.confidence = Math.min(99, Math.round(Number(best.confidence || 0) + (alreadyIndependent ? 1 : 5)));
      if (possibleConflict(text, best.claim)) {
        best.possibleConflict = true;
        conflicts.push({ claim: best.claim, xClaim: text, source: post.source, url: post.url });
      }
    } else {
      claims.push({
        id: claims.length + 1,
        claim: text,
        supportCount: 1,
        independentSources: 1,
        providers: ['X Timeline'],
        sourceDomains: [sourceKey],
        confidence: Math.min(90, Math.max(35, Number(post.evidenceScore || 55))),
        possibleConflict: false,
        items: [item],
        xOnly: true,
        citationId: baseResultCount + idx + 1,
      });
    }
  }

  return { claims: claims.slice(0, 24).map((c, i) => ({ ...c, id: i + 1 })), conflicts };
}

function mergeIndependence(base, extras) {
  const map = new Map((base || []).map((x) => [x.domain, { ...x, providers: [...(x.providers || [])] }]));
  for (const item of extras || []) {
    let key = item.independenceKey;
    if (!key) {
      try { key = new URL(item.url).hostname.replace(/^www\./, ''); } catch { key = item.source || item.provider; }
    }
    if (!key) continue;
    if (!map.has(key)) map.set(key, { domain: key, count: 0, providers: [] });
    const row = map.get(key);
    row.count += 1;
    if (item.provider && !row.providers.includes(item.provider)) row.providers.push(item.provider);
  }
  return [...map.values()];
}

function mergeTimeline(base, extras) {
  const rows = [...(base || [])];
  for (const item of extras || []) {
    if (!item.publishedAt) continue;
    rows.push({ date: item.publishedAt, title: item.title, source: item.source || item.provider, url: item.url, viaX: Boolean(item.fromX) });
  }
  return rows
    .filter((x) => x.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-18);
}

function xSection(xResults, baseResultCount) {
  const posts = xPostsOnly(xResults).slice(0, 6);
  if (!posts.length) return '';
  const accounts = new Set(posts.map((x) => x.source).filter(Boolean));
  const lines = posts.slice(0, 4).map((x) => `- ${String(x.snippet || x.title).replace(/\s+/g, ' ').slice(0, 260)} [${baseResultCount + xResults.indexOf(x) + 1}]`).join('\n');
  return `\n\n## X Intelligence\nتمت مطابقة ${posts.length} منشورات ذات صلة من ${accounts.size} حسابات في الـHome Timeline المتصل. تُعامل X كطبقة اكتشاف وإشارة، وليس كمصدر وحيد للحقيقة.\n${lines}`;
}

export async function runDeepInvestigationWithX(query, options = {}) {
  const base = await runDeepInvestigation(query, options);
  const xResults = Array.isArray(options.xResults) ? options.xResults : [];
  if (!xResults.length) {
    return {
      ...base,
      x: { connected: Boolean(options.xConnected), used: 0, accounts: 0, error: options.xError || null },
    };
  }

  const baseResultCount = base.results?.length || 0;
  const results = mergeResults(base.results, xResults);
  const mergedClaims = mergeClaims(base.claims, xResults, baseResultCount);
  const contradictions = [
    ...(base.contradictions || []),
    ...mergedClaims.conflicts.map((x) => ({ claim: x.claim, xClaim: x.xClaim, source: x.source, url: x.url, possibleConflict: true })),
  ].slice(0, 10);
  const independence = mergeIndependence(base.independence, xResults);
  const timeline = mergeTimeline(base.timeline, xResults);
  const xPosts = xPostsOnly(xResults);
  const accounts = new Set(xPosts.map((x) => x.independenceKey || x.source).filter(Boolean));
  const strongX = xPosts.filter((x) => Number(x.evidenceScore || 0) >= 68).length;
  const confidence = Math.min(99, Math.round(Number(base.confidence || 0) + Math.min(8, accounts.size * 1.5) + Math.min(5, strongX)));
  const sourcesRead = [
    ...(base.sourcesRead || []),
    ...xPosts.slice(0, 12).map((x) => ({
      title: x.title,
      url: x.url,
      source: x.source,
      provider: x.provider,
      publishedAt: x.publishedAt,
      evidenceScore: x.evidenceScore,
      readStatus: 'x-api',
      chars: String(x.snippet || '').length,
      excerpt: String(x.snippet || '').slice(0, 900),
    })),
  ];

  const stages = [
    ...(base.stages || []),
    { id: 'x-intelligence', label: 'مطابقة Home Timeline من X مع السؤال', ms: 0, posts: xPosts.length, accounts: accounts.size },
  ];

  const gaps = [...(base.gaps || [])];
  if (xPosts.length && accounts.size < 2) gaps.push('إشارات X ذات الصلة جاءت من عدد محدود من الحسابات، لذلك لم تُعامل كتأكيد مستقل كافٍ.');

  return {
    ...base,
    answer: `${base.answer}${xSection(xResults, baseResultCount)}`,
    confidence,
    results,
    sourcesRead,
    claims: mergedClaims.claims,
    contradictions,
    gaps: [...new Set(gaps)],
    independence,
    timeline,
    x: { connected: true, used: xPosts.length, accounts: accounts.size, error: options.xError || null },
    stages,
  };
}
