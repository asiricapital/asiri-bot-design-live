const USER_AGENT = 'ASIRI-Agent-Intelligence/4.2 (+https://asiri-agent-intelligence-live.onrender.com)';
const FETCH_TIMEOUT_MS = 7500;

const providerWeights = {
  'Google News': 78,
  'Bing News': 76,
  'Bing Web': 72,
  Wikipedia: 78,
  DuckDuckGo: 62,
  OpenAlex: 92,
  Crossref: 88,
  arXiv: 90,
  'Hacker News': 52,
  GitHub: 70,
};

const domainSources = {
  general: ['web', 'news', 'papers', 'discussions'],
  markets: ['news', 'web', 'discussions', 'github'],
  government: ['web', 'news'],
  companies: ['web', 'news', 'github', 'discussions'],
  technology: ['github', 'news', 'web', 'papers', 'discussions'],
  politics: ['news', 'web', 'papers'],
  science: ['papers', 'web', 'news'],
  cyber: ['web', 'news', 'github', 'papers'],
  media: ['news', 'web', 'discussions'],
  documents: ['web', 'papers'],
};

const maxByMode = {
  quick: 14,
  deep: 36,
  compare: 28,
  verify: 24,
  timeline: 30,
  decision: 24,
};

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

function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 36))];
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
  return raw || String(item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function evidenceScore(item, query) {
  let score = providerWeights[item.provider] || 55;
  const q = tokens(query);
  const hay = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  const overlap = q.filter((t) => hay.includes(t)).length;
  score += Math.min(15, overlap * 3);
  if (item.publishedAt) {
    const time = new Date(item.publishedAt).getTime();
    if (Number.isFinite(time)) {
      const ageDays = Math.max(0, (Date.now() - time) / 86400000);
      score += ageDays <= 1 ? 9 : ageDays <= 3 ? 7 : ageDays <= 7 ? 5 : ageDays <= 30 ? 2 : 0;
    }
  }
  if (item.type === 'paper') score += 3;
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
      headers: {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, options) {
  const response = await fetchWithTimeout(url, options);
  return response.json();
}

async function fetchText(url, options) {
  const response = await fetchWithTimeout(url, options);
  return response.text();
}

function rssItems(xml, provider, type = 'web', fallbackSource = provider) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 14).map((match) => {
    const block = match[1];
    const source = xmlTag(block, 'source') || fallbackSource;
    return {
      type,
      provider,
      source,
      title: xmlTag(block, 'title'),
      url: xmlTag(block, 'link'),
      snippet: clip(xmlTag(block, 'description')),
      publishedAt: xmlTag(block, 'pubDate') || null,
    };
  }).filter((item) => item.title && item.url);
}

function expandQueries(query, domainId) {
  const q = String(query || '').trim();
  const list = [q];
  const arabic = /[\u0600-\u06ff]/.test(q);
  const vague = q.length < 55 || /(اليوم|آخر|اخر|الجديد|أخبار|اخبار|latest|today|news)/i.test(q);
  if (!vague) return list;

  if (domainId === 'technology') {
    list.push(arabic ? `${q} الذكاء الاصطناعي الأمن السيبراني أشباه الموصلات` : `${q} AI cybersecurity semiconductors`);
  } else if (domainId === 'politics') {
    list.push(arabic ? `${q} العالم الشرق الأوسط` : `${q} world Middle East`);
  } else if (domainId === 'markets') {
    list.push(arabic ? `${q} السوق الأمريكي الشركات` : `${q} US market companies`);
  } else if (domainId === 'science') {
    list.push(arabic ? `${q} دراسة بحث مراجعة` : `${q} study research review`);
  } else if (domainId === 'cyber') {
    list.push(arabic ? `${q} ثغرة تحديث أمني` : `${q} vulnerability security advisory`);
  }
  return [...new Set(list)].slice(0, 2);
}

async function searchGoogleNews(query) {
  const arabic = /[\u0600-\u06ff]/.test(query);
  const params = new URLSearchParams({ q: query, hl: arabic ? 'ar' : 'en', gl: arabic ? 'SA' : 'US', ceid: arabic ? 'SA:ar' : 'US:en' });
  const xml = await fetchText(`https://news.google.com/rss/search?${params}`);
  return rssItems(xml, 'Google News', 'news', 'Google News');
}

async function searchBingNews(query) {
  const params = new URLSearchParams({ q: query, format: 'RSS' });
  const xml = await fetchText(`https://www.bing.com/news/search?${params}`);
  return rssItems(xml, 'Bing News', 'news', 'Bing News');
}

async function searchNews(query) {
  const settled = await Promise.allSettled([searchGoogleNews(query), searchBingNews(query)]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchBingWeb(query) {
  const params = new URLSearchParams({ q: query, format: 'rss' });
  const xml = await fetchText(`https://www.bing.com/search?${params}`);
  return rssItems(xml, 'Bing Web', 'web', 'Bing Web');
}

async function searchWikipedia(query) {
  const lang = /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en';
  const params = new URLSearchParams({ action: 'query', list: 'search', srsearch: query, utf8: '1', format: 'json', srlimit: '7', origin: '*' });
  const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return (data?.query?.search || []).map((row) => ({
    type: 'web',
    provider: 'Wikipedia',
    source: `${lang}.wikipedia.org`,
    title: row.title,
    url: `https://${lang}.wikipedia.org/?curid=${row.pageid}`,
    snippet: clip(row.snippet),
    publishedAt: row.timestamp || null,
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
  if (data.AbstractText && data.AbstractURL) {
    results.push({
      type: 'web', provider: 'DuckDuckGo', source: data.AbstractSource || 'DuckDuckGo',
      title: data.Heading || query, url: data.AbstractURL, snippet: clip(data.AbstractText), publishedAt: null,
    });
  }
  for (const row of flattenDdgTopics(data.RelatedTopics)) {
    results.push({ type: 'web', provider: 'DuckDuckGo', source: 'DuckDuckGo', title: clip(row.Text, 140), url: row.FirstURL, snippet: clip(row.Text), publishedAt: null });
  }
  return results.slice(0, 7);
}

async function searchWeb(query, domainId) {
  const extra = [];
  if (domainId === 'government' && /[\u0600-\u06ff]/.test(query)) {
    extra.push(searchBingWeb(`${query} site:gov.sa OR site:etimad.sa`));
  }
  const settled = await Promise.allSettled([searchBingWeb(query), searchWikipedia(query), searchDuckDuckGo(query), ...extra]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchOpenAlex(query) {
  const params = new URLSearchParams({ search: query, 'per-page': '9' });
  const data = await fetchJson(`https://api.openalex.org/works?${params}`);
  return (data?.results || []).map((work) => ({
    type: 'paper', provider: 'OpenAlex', source: work?.primary_location?.source?.display_name || 'OpenAlex',
    title: work.display_name,
    url: work?.primary_location?.landing_page_url || work.doi || work.id,
    snippet: clip([
      work.publication_year ? `سنة النشر ${work.publication_year}` : '',
      work.cited_by_count != null ? `الاستشهادات ${work.cited_by_count}` : '',
      (work.authorships || []).slice(0, 3).map((a) => a?.author?.display_name).filter(Boolean).join('، '),
    ].filter(Boolean).join(' · ')),
    publishedAt: work.publication_date || null,
  })).filter((item) => item.title && item.url);
}

async function searchCrossref(query) {
  const params = new URLSearchParams({ query, rows: '8', select: 'DOI,title,published,URL,container-title,author' });
  const data = await fetchJson(`https://api.crossref.org/works?${params}`);
  return (data?.message?.items || []).map((work) => {
    const dateParts = work?.published?.['date-parts']?.[0] || [];
    const publishedAt = dateParts.length ? `${dateParts[0]}-${String(dateParts[1] || 1).padStart(2, '0')}-${String(dateParts[2] || 1).padStart(2, '0')}` : null;
    const authors = (work.author || []).slice(0, 3).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean).join('، ');
    return {
      type: 'paper', provider: 'Crossref', source: work?.['container-title']?.[0] || 'Crossref',
      title: work?.title?.[0] || work.DOI,
      url: work.URL || (work.DOI ? `https://doi.org/${work.DOI}` : ''),
      snippet: clip([authors, work.DOI ? `DOI ${work.DOI}` : ''].filter(Boolean).join(' · ')),
      publishedAt,
    };
  }).filter((item) => item.title && item.url);
}

async function searchArxiv(query) {
  if (!/[a-zA-Z]/.test(query)) return [];
  const params = new URLSearchParams({ search_query: `all:${query}`, start: '0', max_results: '7', sortBy: 'submittedDate', sortOrder: 'descending' });
  const xml = await fetchText(`https://export.arxiv.org/api/query?${params}`);
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => {
    const block = match[1];
    const id = xmlTag(block, 'id');
    return {
      type: 'paper', provider: 'arXiv', source: 'arXiv', title: xmlTag(block, 'title'), url: id,
      snippet: clip(xmlTag(block, 'summary')), publishedAt: xmlTag(block, 'published') || null,
    };
  }).filter((item) => item.title && item.url);
}

async function searchPapers(query) {
  const settled = await Promise.allSettled([searchOpenAlex(query), searchCrossref(query), searchArxiv(query)]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchDiscussions(query) {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: '9' });
  const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`);
  return (data?.hits || []).map((hit) => ({
    type: 'discussion', provider: 'Hacker News', source: 'news.ycombinator.com',
    title: hit.title || hit.story_title,
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    snippet: clip(`النقاط ${hit.points ?? 0} · التعليقات ${hit.num_comments ?? 0} · ${hit.author || ''}`),
    publishedAt: hit.created_at || null,
  })).filter((item) => item.title && item.url);
}

async function searchGitHub(query) {
  const params = new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: '9' });
  const data = await fetchJson(`https://api.github.com/search/repositories?${params}`, { headers: { Accept: 'application/vnd.github+json' } });
  return (data?.items || []).map((repo) => ({
    type: 'github', provider: 'GitHub', source: repo.full_name, title: repo.full_name, url: repo.html_url,
    snippet: clip(`${repo.description || 'بدون وصف'} · ★ ${repo.stargazers_count || 0} · ${repo.language || 'n/a'} · ${repo.license?.spdx_id || 'license n/a'}`),
    publishedAt: repo.updated_at || null,
  }));
}

const adapters = {
  news: (q, domain) => searchNews(q, domain),
  web: (q, domain) => searchWeb(q, domain),
  papers: (q, domain) => searchPapers(q, domain),
  discussions: (q, domain) => searchDiscussions(q, domain),
  github: (q, domain) => searchGitHub(q, domain),
};

function normalizeSources(domainId, requested) {
  const allowed = Object.keys(adapters);
  const fromUser = Array.isArray(requested) ? requested.filter((s) => allowed.includes(s)) : [];
  return [...new Set(fromUser.length ? fromUser : (domainSources[domainId] || domainSources.general))];
}

export async function runEmbeddedResearch({ query, domainId = 'general', modeId = 'deep', sources = [] }) {
  const cleanQuery = String(query || '').trim().slice(0, 650);
  const requestedSources = normalizeSources(domainId, sources);
  const queries = expandQueries(cleanQuery, domainId);
  const started = Date.now();

  const jobs = [];
  for (const source of requestedSources) {
    for (const q of queries) {
      jobs.push((async () => {
        const t0 = Date.now();
        try {
          const items = await adapters[source](q, domainId);
          return { source, query: q, ok: true, ms: Date.now() - t0, count: items.length, items };
        } catch (error) {
          return { source, query: q, ok: false, ms: Date.now() - t0, count: 0, items: [], error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'provider error') };
        }
      })());
    }
  }

  const rows = await Promise.all(jobs);
  const providerSummary = {};
  const seen = new Set();
  let results = [];

  for (const row of rows) {
    if (!providerSummary[row.source]) providerSummary[row.source] = { source: row.source, ok: false, count: 0, ms: 0, attempts: 0, errors: [] };
    const p = providerSummary[row.source];
    p.ok = p.ok || row.ok;
    p.count += row.count;
    p.ms = Math.max(p.ms, row.ms);
    p.attempts += 1;
    if (row.error) p.errors.push(row.error);
    for (const item of row.items) {
      const key = canonicalKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push({ ...item, evidenceScore: evidenceScore(item, cleanQuery) });
    }
  }

  results.sort((a, b) => b.evidenceScore - a.evidenceScore || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  results = results.slice(0, maxByMode[modeId] || 28);

  const strongest = results.slice(0, 8).map((r) => ({
    title: r.title, source: r.source, provider: r.provider, url: r.url, snippet: r.snippet,
    evidenceScore: r.evidenceScore, publishedAt: r.publishedAt, type: r.type,
  }));
  const timeline = results.filter((r) => r.publishedAt).slice().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 14);

  return {
    query: cleanQuery,
    domain: { id: domainId },
    mode: { id: modeId },
    sources: requestedSources,
    queryVariants: queries,
    durationMs: Date.now() - started,
    total: results.length,
    sourceTypes: [...new Set(results.map((r) => r.type))],
    providers: Object.values(providerSummary),
    results,
    strongest,
    timeline,
    marketContext: [],
    researchEngine: 'embedded-resilient-v1',
    fetchedAt: new Date().toISOString(),
  };
}
