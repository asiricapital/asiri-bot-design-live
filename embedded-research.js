const USER_AGENT = 'ASIRI-Deep-Intelligence/5.2 (+https://asiri-deep-intelligence-os.onrender.com)';
const FETCH_TIMEOUT_MS = 8000;

const providerWeights = {
  'Google News': 82,
  'Bing News': 79,
  'Bing Web': 72,
  Wikipedia: 76,
  DuckDuckGo: 60,
  OpenAlex: 91,
  Crossref: 87,
  arXiv: 89,
  'Hacker News': 50,
  GitHub: 70,
  'SABA RSS': 86,
};

const NEWS_LOCALES = [
  { rx: /(اليمن|yemen)/i, gl: 'YE', ceid: 'YE:ar' },
  { rx: /(السعوديه|السعودية|saudi)/i, gl: 'SA', ceid: 'SA:ar' },
  { rx: /(الامارات|الإمارات|uae|emirates)/i, gl: 'AE', ceid: 'AE:ar' },
  { rx: /(الكويت|kuwait)/i, gl: 'KW', ceid: 'KW:ar' },
  { rx: /(قطر|qatar)/i, gl: 'QA', ceid: 'QA:ar' },
  { rx: /(البحرين|bahrain)/i, gl: 'BH', ceid: 'BH:ar' },
  { rx: /(عمان|عُمان|oman)/i, gl: 'OM', ceid: 'OM:ar' },
  { rx: /(مصر|egypt)/i, gl: 'EG', ceid: 'EG:ar' },
  { rx: /(الاردن|الأردن|jordan)/i, gl: 'JO', ceid: 'JO:ar' },
  { rx: /(لبنان|lebanon)/i, gl: 'LB', ceid: 'LB:ar' },
  { rx: /(العراق|iraq)/i, gl: 'IQ', ceid: 'IQ:ar' },
  { rx: /(سوريا|syria)/i, gl: 'SY', ceid: 'SY:ar' },
  { rx: /(فلسطين|غزه|غزة|palestin|gaza)/i, gl: 'PS', ceid: 'PS:ar' },
];

function newsLocale(query) {
  const hit = NEWS_LOCALES.find((x) => x.rx.test(String(query || '')));
  return hit || { gl: 'SA', ceid: 'SA:ar' };
}

function providerWeight(item, query, domainId) {
  let w = providerWeights[item.provider] || 55;
  const fresh = isFreshQuery(query);
  if (fresh || domainId === 'politics') {
    if (item.type === 'news') w += 12;
    if (['Google News','Bing News','SABA RSS'].includes(item.provider)) w += 8;
    if (item.type === 'paper') w -= 45;
    if (item.provider === 'DuckDuckGo' || item.provider === 'Wikipedia') w -= 18;
  }
  if (domainId === 'science' && item.type === 'paper') w += 8;
  if (domainId === 'technology' && item.type === 'github') w += 6;
  return Math.max(10, Math.min(100, w));
}

const domainSources = {
  general: ['news', 'web', 'papers', 'discussions'],
  markets: ['news', 'web', 'discussions', 'github'],
  government: ['web', 'news'],
  companies: ['web', 'news', 'github', 'discussions'],
  technology: ['github', 'news', 'web', 'papers', 'discussions'],
  politics: ['news', 'web'],
  science: ['papers', 'web', 'news'],
  cyber: ['web', 'news', 'github', 'papers'],
  media: ['news', 'web', 'discussions'],
  documents: ['web', 'papers'],
};

const maxByMode = { quick: 14, deep: 36, compare: 28, verify: 24, timeline: 30, decision: 24 };

const STOPWORDS = new Set([
  'هذا','هذه','ذلك','التي','الذي','على','الى','إلى','عن','من','في','ما','ماذا','هل','ماهي','ماهيه','ماهو','ماهو','اخر','آخر','أخر','الجديد','اليوم','الآن','الان','حاليا','حاليًا','تطورات','التطورات','اخبار','أخبار','خبر','اهم','أهم','حول','بخصوص','اعطني','أعطني','اريد','أريد',
  'سياسي','سياسية','السياسية','سياسه','سياسة','العالميه','العالمية','عالمي','مهم','مهمة','المهمة','why','what','the','and','for','with','from','that','this','today','latest','news','current','now','about','update','updates','politics','political','global','important',
]);

const LOW_QUALITY_RX = /(porn|xxx|sex\s?video|casino|betting|viagra|adult\s?video|anal\s|escort)/i;

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeXml(value) {
  return stripHtml(String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16))));
}

function clip(value, max = 430) {
  const text = stripHtml(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFKC')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه');
}

function rawTokens(value) {
  return normalize(value).match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function topicTokens(value) {
  return [...new Set(rawTokens(value).filter((x) => !STOPWORDS.has(x)).slice(0, 36))];
}

function topicAliases(query) {
  const q = normalize(query);
  const aliases = new Set();
  const add = (...xs) => xs.forEach((x) => aliases.add(normalize(x)));
  if (/اليمن|yemen/.test(q)) add('اليمن','يمن','يمني','الحوثي','حوثي','الحوثيين','صنعاء','عدن','المخا','مأرب','مارب','تعز','الحديدة','yemen','yemeni','houthi','sanaa','aden','mukalla','mokha');
  if (/غزه|gaza|فلسطين|palestin/.test(q)) add('غزة','غزه','فلسطين','حماس','gaza','palestine','hamas');
  if (/ايران|iran/.test(q)) add('ايران','إيران','طهران','الحرس الثوري','iran','tehran','irgc');
  if (/اوكرانيا|ukrain/.test(q)) add('اوكرانيا','أوكرانيا','كييف','روسيا','ukraine','kyiv','russia');
  if (/هرمز|hormuz/.test(q)) add('هرمز','مضيق هرمز','hormuz','strait of hormuz');
  return [...aliases];
}

function relevance(item, query, domainId) {
  const text = normalize(`${item.title || ''} ${item.snippet || ''} ${item.source || ''}`);
  if (!text || LOW_QUALITY_RX.test(text)) return { keep: false, overlap: 0, reason: 'low-quality' };

  const core = topicTokens(query);
  const aliases = topicAliases(query);
  const matchedCore = core.filter((t) => text.includes(t));
  const matchedAliases = aliases.filter((t) => text.includes(t));
  const overlap = new Set([...matchedCore, ...matchedAliases]).size;
  const title = normalize(item.title || '');
  const titleOverlap = new Set([...core, ...aliases].filter((t) => title.includes(t))).size;

  if (!core.length && !aliases.length) {
    return { keep: item.type === 'news' || item.provider === 'Google News' || item.provider === 'Bing News', overlap: 0, reason: 'generic' };
  }

  const threshold = core.length >= 4 ? 2 : 1;
  let keep = overlap >= threshold;
  if (domainId === 'markets' && /\$?[a-z]{1,6}\b/i.test(query)) keep = keep || titleOverlap >= 1;
  if (item.type === 'paper' && overlap < Math.max(1, threshold)) keep = false;
  if (item.provider === 'DuckDuckGo' && overlap < threshold) keep = false;
  return { keep, overlap, titleOverlap, reason: keep ? 'matched' : 'no-topic-overlap' };
}

function xmlTag(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function canonicalKey(item) {
  const raw = String(item.url || '')
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .toLowerCase();
  return raw || normalize(item.title || '').replace(/\s+/g, ' ').trim();
}

function evidenceScore(item, query, rel, domainId) {
  let score = providerWeight(item, query, domainId);
  score += Math.min(20, Number(rel?.overlap || 0) * 5);
  score += Math.min(8, Number(rel?.titleOverlap || 0) * 4);
  if (item.publishedAt) {
    const time = new Date(item.publishedAt).getTime();
    if (Number.isFinite(time)) {
      const ageDays = Math.max(0, (Date.now() - time) / 86400000);
      score += ageDays <= 1 ? 10 : ageDays <= 3 ? 8 : ageDays <= 7 ? 6 : ageDays <= 30 ? 2 : 0;
    }
  }
  if (item.type === 'paper') score += 2;
  if (item.official) score += 6;
  return Math.max(1, Math.min(99, Math.round(score)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers || {}) },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally { clearTimeout(timer); }
}

async function fetchJson(url, options) { return (await fetchWithTimeout(url, options)).json(); }
async function fetchText(url, options) { return (await fetchWithTimeout(url, options)).text(); }

function rssItems(xml, provider, type = 'web', fallbackSource = provider) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 16).map((match) => {
    const block = match[1];
    return {
      type,
      provider,
      source: xmlTag(block, 'source') || fallbackSource,
      title: xmlTag(block, 'title'),
      url: xmlTag(block, 'link'),
      snippet: clip(xmlTag(block, 'description')),
      publishedAt: xmlTag(block, 'pubDate') || null,
    };
  }).filter((item) => item.title && item.url);
}

function isFreshQuery(q) {
  return /(اليوم|الان|الآن|هذه الساعه|هذه الساعة|اخر|آخر|أخر|الجديد|عاجل|latest|today|now|breaking|current)/i.test(q);
}

function expandQueries(query, domainId) {
  const q = String(query || '').trim();
  const list = [q];
  const arabic = /[\u0600-\u06ff]/.test(q);
  if (domainId === 'politics') {
    if (/اليمن/i.test(q)) list.push(arabic ? `${q} اليمن الحوثيين صنعاء عدن البحر الأحمر` : `${q} Yemen Houthi Red Sea`);
    else if (/غزه|غزة/i.test(q)) list.push(`${q} غزة فلسطين إسرائيل`);
    else if (q.length < 70) list.push(arabic ? `${q} الشرق الأوسط بيان رسمي` : `${q} Middle East official statement`);
  } else if (domainId === 'technology' && q.length < 70) {
    list.push(arabic ? `${q} الذكاء الاصطناعي الأمن السيبراني أشباه الموصلات` : `${q} AI cybersecurity semiconductors`);
  } else if (domainId === 'markets' && q.length < 70) {
    list.push(arabic ? `${q} السوق الأمريكي الشركة إفصاح` : `${q} US market company filing`);
  } else if (domainId === 'science' && q.length < 70) {
    list.push(arabic ? `${q} دراسة بحث مراجعة` : `${q} study research review`);
  } else if (domainId === 'cyber' && q.length < 70) {
    list.push(arabic ? `${q} ثغرة تحديث أمني` : `${q} vulnerability security advisory`);
  }
  return [...new Set(list)].slice(0, 2);
}

async function searchGoogleNews(query) {
  const arabic = /[\u0600-\u06ff]/.test(query);
  const q = isFreshQuery(query) ? `${query} when:7d` : query;
  const locale = arabic ? newsLocale(query) : { gl: 'US', ceid: 'US:en' };
  const params = new URLSearchParams({ q, hl: arabic ? 'ar' : 'en', gl: locale.gl, ceid: locale.ceid });
  return rssItems(await fetchText(`https://news.google.com/rss/search?${params}`), 'Google News', 'news', 'Google News');
}

async function searchBingNews(query) {
  const params = new URLSearchParams({ q: query, format: 'RSS' });
  return rssItems(await fetchText(`https://www.bing.com/news/search?${params}`), 'Bing News', 'news', 'Bing News');
}

async function searchSabaRss(query, domainId) {
  const q = String(query || '');
  const arabic = /[\u0600-\u06ff]/.test(q);
  if (!arabic) return [];
  if (domainId !== 'politics' && !/(اليمن|يمن|الحوث|صنعاء|عدن|المخا|البحر الأحمر)/i.test(q)) return [];
  const feeds = [
    ['https://www.saba.ye/ar/rsscatfeed2.htm', 'عربي دولي'],
    ['https://www.saba.ye/ar/rsscatfeed1.htm', 'محلي'],
  ];
  const settled = await Promise.allSettled(feeds.map(async ([url, section]) =>
    rssItems(await fetchText(url), 'SABA RSS', 'news', `سبأ - ${section}`)
  ));
  const rows = settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
  return rows.filter((item) => relevance(item, q, domainId).keep).slice(0, 18);
}

async function searchNews(query, domainId) {
  const settled = await Promise.allSettled([searchGoogleNews(query), searchBingNews(query), searchSabaRss(query, domainId)]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchBingWeb(query) {
  const params = new URLSearchParams({ q: query, format: 'rss' });
  return rssItems(await fetchText(`https://www.bing.com/search?${params}`), 'Bing Web', 'web', 'Bing Web');
}

async function searchWikipedia(query) {
  const lang = /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en';
  const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, utf8: '1', format: 'json', srlimit: '7', origin: '*' });
  const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return (data?.query?.search || []).map((row) => ({
    type: 'web', provider: 'Wikipedia', source: `${lang}.wikipedia.org`, title: row.title,
    url: `https://${lang}.wikipedia.org/?curid=${row.pageid}`, snippet: clip(row.snippet), publishedAt: row.timestamp || null,
  }));
}

function flattenDdgTopics(items, out = []) {
  for (const item of items || []) {
    if (item?.Topics) flattenDdgTopics(item.Topics, out);
    else if (item?.Text && item?.FirstURL) out.push(item);
    if (out.length >= 7) break;
  }
  return out;
}

async function searchDuckDuckGo(query) {
  const params = new URLSearchParams({ q: query, format: 'json', no_html: '1', no_redirect: '1', skip_disambig: '1' });
  const data = await fetchJson(`https://api.duckduckgo.com/?${params}`);
  const results = [];
  if (data.AbstractText && data.AbstractURL) results.push({ type: 'web', provider: 'DuckDuckGo', source: data.AbstractSource || 'DuckDuckGo', title: data.Heading || query, url: data.AbstractURL, snippet: clip(data.AbstractText), publishedAt: null });
  for (const row of flattenDdgTopics(data.RelatedTopics)) results.push({ type: 'web', provider: 'DuckDuckGo', source: 'DuckDuckGo', title: clip(row.Text, 140), url: row.FirstURL, snippet: clip(row.Text), publishedAt: null });
  return results.slice(0, 7);
}

async function searchWeb(query, domainId) {
  const extra = [];
  if (domainId === 'government' && /[\u0600-\u06ff]/.test(query)) extra.push(searchBingWeb(`${query} site:gov.sa OR site:etimad.sa`));
  const settled = await Promise.allSettled([searchBingWeb(query), searchWikipedia(query), searchDuckDuckGo(query), ...extra]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchOpenAlex(query) {
  const data = await fetchJson(`https://api.openalex.org/works?${new URLSearchParams({ search: query, 'per-page': '9' })}`);
  return (data?.results || []).map((work) => ({
    type: 'paper', provider: 'OpenAlex', source: work?.primary_location?.source?.display_name || 'OpenAlex', title: work.display_name,
    url: work?.primary_location?.landing_page_url || work.doi || work.id,
    snippet: clip([work.publication_year ? `سنة النشر ${work.publication_year}` : '', work.cited_by_count != null ? `الاستشهادات ${work.cited_by_count}` : '', (work.authorships || []).slice(0, 3).map((a) => a?.author?.display_name).filter(Boolean).join('، ')].filter(Boolean).join(' · ')),
    publishedAt: work.publication_date || null,
  })).filter((item) => item.title && item.url);
}

async function searchCrossref(query) {
  const params = new URLSearchParams({ query, rows: '8', select: 'DOI,title,published,URL,container-title,author' });
  const data = await fetchJson(`https://api.crossref.org/works?${params}`);
  return (data?.message?.items || []).map((work) => {
    const d = work?.published?.['date-parts']?.[0] || [];
    const publishedAt = d.length ? `${d[0]}-${String(d[1] || 1).padStart(2, '0')}-${String(d[2] || 1).padStart(2, '0')}` : null;
    return { type: 'paper', provider: 'Crossref', source: work?.['container-title']?.[0] || 'Crossref', title: work?.title?.[0] || work.DOI, url: work.URL || (work.DOI ? `https://doi.org/${work.DOI}` : ''), snippet: clip(work.DOI ? `DOI ${work.DOI}` : ''), publishedAt };
  }).filter((item) => item.title && item.url);
}

async function searchArxiv(query) {
  if (!/[a-zA-Z]/.test(query)) return [];
  const params = new URLSearchParams({ search_query: `all:${query}`, start: '0', max_results: '7', sortBy: 'submittedDate', sortOrder: 'descending' });
  const xml = await fetchText(`https://export.arxiv.org/api/query?${params}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const block = match[1];
    return { type: 'paper', provider: 'arXiv', source: 'arXiv', title: xmlTag(block, 'title'), url: xmlTag(block, 'id'), snippet: clip(xmlTag(block, 'summary')), publishedAt: xmlTag(block, 'published') || null };
  }).filter((item) => item.title && item.url);
}

async function searchPapers(query) {
  const settled = await Promise.allSettled([searchOpenAlex(query), searchCrossref(query), searchArxiv(query)]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchDiscussions(query) {
  const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${new URLSearchParams({ query, tags: 'story', hitsPerPage: '9' })}`);
  return (data?.hits || []).map((hit) => ({ type: 'discussion', provider: 'Hacker News', source: 'news.ycombinator.com', title: hit.title || hit.story_title, url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`, snippet: clip(`النقاط ${hit.points ?? 0} · التعليقات ${hit.num_comments ?? 0} · ${hit.author || ''}`), publishedAt: hit.created_at || null })).filter((item) => item.title && item.url);
}

async function searchGitHub(query) {
  const data = await fetchJson(`https://api.github.com/search/repositories?${new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: '9' })}`, { headers: { Accept: 'application/vnd.github+json' } });
  return (data?.items || []).map((repo) => ({ type: 'github', provider: 'GitHub', source: repo.full_name, title: repo.full_name, url: repo.html_url, snippet: clip(`${repo.description || 'بدون وصف'} · ★ ${repo.stargazers_count || 0} · ${repo.language || 'n/a'} · ${repo.license?.spdx_id || 'license n/a'}`), publishedAt: repo.updated_at || null }));
}

const adapters = {
  news: (q, d) => searchNews(q, d), web: (q, d) => searchWeb(q, d), papers: (q) => searchPapers(q), discussions: (q) => searchDiscussions(q), github: (q) => searchGitHub(q),
};

function normalizeSources(domainId, requested, query) {
  const allowed = Object.keys(adapters);
  const fromUser = Array.isArray(requested) ? requested.filter((s) => allowed.includes(s)) : [];
  let selected = [...new Set(fromUser.length ? fromUser : (domainSources[domainId] || domainSources.general))];
  if ((domainId === 'politics' || domainId === 'general') && isFreshQuery(query)) {
    selected = selected.filter((s) => s !== 'papers' && s !== 'discussions');
    selected = ['news', ...selected.filter((s) => s !== 'news')];
  }
  if (domainId === 'politics') selected = selected.filter((s) => s !== 'papers' && s !== 'discussions');
  return [...new Set(selected)];
}

export async function runEmbeddedResearch({ query, domainId = 'general', modeId = 'deep', sources = [] }) {
  const cleanQuery = String(query || '').trim().slice(0, 650);
  const requestedSources = normalizeSources(domainId, sources, cleanQuery);
  const queries = expandQueries(cleanQuery, domainId);
  const started = Date.now();
  const jobs = [];

  for (const source of requestedSources) for (const q of queries) jobs.push((async () => {
    const t0 = Date.now();
    try {
      const items = await adapters[source](q, domainId);
      return { source, query: q, ok: true, ms: Date.now() - t0, count: items.length, items };
    } catch (error) {
      return { source, query: q, ok: false, ms: Date.now() - t0, count: 0, items: [], error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'provider error') };
    }
  })());

  const rows = await Promise.all(jobs);
  const providerSummary = {};
  const seen = new Set();
  let results = [];
  let rejectedByRelevance = 0;

  for (const row of rows) {
    if (!providerSummary[row.source]) providerSummary[row.source] = { source: row.source, ok: false, count: 0, accepted: 0, rejected: 0, ms: 0, attempts: 0, errors: [] };
    const p = providerSummary[row.source];
    p.ok = p.ok || row.ok; p.count += row.count; p.ms = Math.max(p.ms, row.ms); p.attempts += 1;
    if (row.error) p.errors.push(row.error);
    for (const item of row.items) {
      const key = canonicalKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const rel = relevance(item, cleanQuery, domainId);
      if (!rel.keep) { p.rejected += 1; rejectedByRelevance += 1; continue; }
      p.accepted += 1;
      results.push({ ...item, relevanceOverlap: rel.overlap, evidenceScore: evidenceScore(item, cleanQuery, rel, domainId) });
    }
  }

  results.sort((a, b) => b.evidenceScore - a.evidenceScore || b.relevanceOverlap - a.relevanceOverlap || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  results = results.slice(0, maxByMode[modeId] || 28);

  return {
    query: cleanQuery,
    domain: { id: domainId }, mode: { id: modeId }, sources: requestedSources, queryVariants: queries,
    durationMs: Date.now() - started, total: results.length, sourceTypes: [...new Set(results.map((r) => r.type))],
    providers: Object.values(providerSummary), results,
    strongest: results.slice(0, 8).map((r) => ({ title: r.title, source: r.source, provider: r.provider, url: r.url, snippet: r.snippet, evidenceScore: r.evidenceScore, publishedAt: r.publishedAt, type: r.type })),
    timeline: results.filter((r) => r.publishedAt).slice().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 14),
    marketContext: [], researchEngine: 'embedded-strict-relevance-v2', rejectedByRelevance, fetchedAt: new Date().toISOString(),
  };
}
