import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getQuote, getQuotes, getMarketPulse } from './market.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const USER_AGENT = 'ASIRI-Research-Intelligence/3.2 (+https://asiri-research-intelligence-preview.onrender.com)';
const SEARCH_TIMEOUT_MS = 9000;
const searchCache = new Map();
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 16);
}

function symbolsFromQuery(value) {
  const text = String(value || '').toUpperCase();
  const cashTags = [...text.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
  const standalone = [...text.matchAll(/\b([A-Z]{2,5})\b/g)]
    .map((m) => m[1])
    .filter((s) => !['THE','AND','FOR','WITH','FROM','RISK','NEWS','TODAY','ASIRI','DEEP','QUICK'].includes(s));
  return [...new Set([...cashTags, ...standalone])].map(cleanSymbol).filter(Boolean).slice(0, 4);
}

const domains = {
  general: { label: 'بحث عام', sources: ['web','news','papers','discussions'], outputs: ['ملخص تنفيذي','أهم النتائج','الأدلة','التعارضات','ما الذي لا نعرفه'] },
  markets: { label: 'الأسواق والاستثمار', sources: ['news','web','discussions','github'], outputs: ['Catalyst','Risk','Market Context','Evidence Score','What changed','Watch levels'] },
  government: { label: 'الجهات والمنافسات', sources: ['web','news','papers'], outputs: ['Opportunity Brief','Deadline','Requirements','Stakeholders','Risks','Next actions'] },
  companies: { label: 'الشركات والمبيعات', sources: ['web','news','github','discussions'], outputs: ['Account 360','Buying signals','Decision makers','Pain points','Opportunities','Next move'] },
  technology: { label: 'التقنية وGitHub', sources: ['github','web','discussions','papers'], outputs: ['Architecture','Value','Maturity','Security','License','Adoption plan'] },
  politics: { label: 'السياسة والجغرافيا', sources: ['news','web','papers','discussions'], outputs: ['What happened','Timeline','Actors','Claims vs evidence','Scenarios','Uncertainty'] },
  science: { label: 'العلوم والصحة', sources: ['papers','web','news'], outputs: ['Evidence summary','Study quality','Consensus','Limitations','Safety notes','Open questions'] },
  cyber: { label: 'الأمن السيبراني', sources: ['web','news','github','papers'], outputs: ['Exposure','Severity','Affected versions','Mitigation','Evidence','Priority'] },
  media: { label: 'الإعلام والمحتوى', sources: ['news','web','discussions'], outputs: ['Claims','Entities','Narrative','Risk','Key moments','Sources'] },
  documents: { label: 'الملفات والوثائق', sources: ['web','papers'], outputs: ['Executive summary','Key clauses','Deadlines','Numbers','Risks','Action list'] },
};

const modeDescriptions = {
  quick: 'إجابة مختصرة تركّز على أهم ما يمكن إثباته بسرعة.',
  deep: 'بحث أعمق متعدد المصادر مع فجوات الأدلة والتعارضات.',
  compare: 'مقارنة منظمة بين بدائل أو جهات أو تقنيات أو روايات.',
  verify: 'التحقق من ادعاء واحد وتحديد ما يؤيده وما يناقضه.',
  timeline: 'بناء تسلسل زمني للأحداث مع فصل المؤكد عن غير المؤكد.',
  decision: 'تحويل البحث إلى مذكرة قرار: خيارات، مخاطر، أدلة، وخطوة تالية.',
};

const providerWeights = {
  'Google News': 74,
  Wikipedia: 76,
  DuckDuckGo: 60,
  OpenAlex: 91,
  'Hacker News': 50,
  GitHub: 68,
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

function clip(value, max = 360) {
  const text = stripHtml(value);
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function tokens(value) {
  return [...new Set((String(value || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 30))];
}

function canonicalKey(item) {
  const raw = String(item.url || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
  return raw || String(item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function evidenceScore(item, query) {
  let score = providerWeights[item.provider] || 55;
  const q = tokens(query);
  const hay = `${item.title || ''} ${item.snippet || ''}`.toLowerCase();
  const overlap = q.filter((t) => hay.includes(t)).length;
  score += Math.min(12, overlap * 3);
  if (item.publishedAt) {
    const ageDays = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 86400000);
    if (Number.isFinite(ageDays)) score += ageDays <= 1 ? 8 : ageDays <= 7 ? 5 : ageDays <= 30 ? 2 : 0;
  }
  if (item.type === 'paper') score += 3;
  return Math.max(1, Math.min(99, Math.round(score)));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(options.headers || {}) },
      signal: controller.signal,
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

function xmlTag(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

async function searchNews(query) {
  const params = new URLSearchParams({ q: query, hl: /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en', gl: 'SA', ceid: /[\u0600-\u06ff]/.test(query) ? 'SA:ar' : 'US:en' });
  const xml = await fetchText(`https://news.google.com/rss/search?${params}`);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 12);
  return items.map((match) => {
    const block = match[1];
    return {
      type: 'news',
      provider: 'Google News',
      source: xmlTag(block, 'source') || 'News',
      title: xmlTag(block, 'title'),
      url: xmlTag(block, 'link'),
      snippet: clip(xmlTag(block, 'description')),
      publishedAt: xmlTag(block, 'pubDate') || null,
    };
  }).filter((item) => item.title && item.url);
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
    if (out.length >= 6) break;
  }
  return out;
}

async function searchDuckDuckGo(query) {
  const params = new URLSearchParams({ q: query, format: 'json', no_html: '1', no_redirect: '1', skip_disambig: '1' });
  const data = await fetchJson(`https://api.duckduckgo.com/?${params}`);
  const results = [];
  if (data.AbstractText && data.AbstractURL) {
    results.push({ type: 'web', provider: 'DuckDuckGo', source: data.AbstractSource || 'DuckDuckGo', title: data.Heading || query, url: data.AbstractURL, snippet: clip(data.AbstractText), publishedAt: null });
  }
  for (const row of flattenDdgTopics(data.RelatedTopics)) {
    results.push({ type: 'web', provider: 'DuckDuckGo', source: 'DuckDuckGo', title: clip(row.Text, 120), url: row.FirstURL, snippet: clip(row.Text), publishedAt: null });
  }
  return results.slice(0, 6);
}

async function searchWeb(query) {
  const settled = await Promise.allSettled([searchWikipedia(query), searchDuckDuckGo(query)]);
  return settled.flatMap((row) => row.status === 'fulfilled' ? row.value : []);
}

async function searchPapers(query) {
  const params = new URLSearchParams({ search: query, 'per-page': '8' });
  const data = await fetchJson(`https://api.openalex.org/works?${params}`);
  return (data?.results || []).map((work) => ({
    type: 'paper',
    provider: 'OpenAlex',
    source: work?.primary_location?.source?.display_name || 'OpenAlex',
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

async function searchDiscussions(query) {
  const params = new URLSearchParams({ query, tags: 'story', hitsPerPage: '8' });
  const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`);
  return (data?.hits || []).map((hit) => ({
    type: 'discussion',
    provider: 'Hacker News',
    source: 'news.ycombinator.com',
    title: hit.title || hit.story_title,
    url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
    snippet: clip(`النقاط ${hit.points ?? 0} · التعليقات ${hit.num_comments ?? 0} · ${hit.author || ''}`),
    publishedAt: hit.created_at || null,
  })).filter((item) => item.title && item.url);
}

async function searchGitHub(query) {
  const params = new URLSearchParams({ q: query, sort: 'stars', order: 'desc', per_page: '8' });
  const data = await fetchJson(`https://api.github.com/search/repositories?${params}`, { headers: { Accept: 'application/vnd.github+json' } });
  return (data?.items || []).map((repo) => ({
    type: 'github',
    provider: 'GitHub',
    source: repo.full_name,
    title: repo.full_name,
    url: repo.html_url,
    snippet: clip(`${repo.description || 'بدون وصف'} · ★ ${repo.stargazers_count || 0} · ${repo.language || 'n/a'} · ${repo.license?.spdx_id || 'license n/a'}`),
    publishedAt: repo.updated_at || null,
  }));
}

const adapters = {
  news: searchNews,
  web: searchWeb,
  papers: searchPapers,
  discussions: searchDiscussions,
  github: searchGitHub,
};

function normalizeRequestedSources(domainId, raw) {
  const allowed = Object.keys(adapters);
  const requested = String(raw || '').split(',').map((s) => s.trim()).filter((s) => allowed.includes(s));
  return requested.length ? [...new Set(requested)] : domains[domainId].sources.filter((s) => allowed.includes(s));
}

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 30) return res.status(429).json({ error: 'تم تجاوز الحد المؤقت للبحث. حاول بعد دقيقة.' });
  next();
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-research-intelligence-preview',
  version: '3.2-live-multisource',
  engine: 'universal-evidence-router',
  liveResearch: true,
  liveMarketContext: true,
  searchProviders: ['Google News','Wikipedia','DuckDuckGo','OpenAlex','Hacker News','GitHub'],
  universalDomains: Object.keys(domains).length,
  trading: false,
  time: new Date().toISOString(),
}));

app.get('/api/research/domains', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(Object.entries(domains).map(([id, value]) => ({ id, ...value })));
});

app.get('/api/research/plan', (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 2000);
  const domainId = Object.prototype.hasOwnProperty.call(domains, req.query.domain) ? req.query.domain : 'general';
  const modeId = Object.prototype.hasOwnProperty.call(modeDescriptions, req.query.mode) ? req.query.mode : 'deep';
  const domain = domains[domainId];
  const symbols = domainId === 'markets' ? symbolsFromQuery(query) : [];
  res.set('Cache-Control', 'no-store');
  res.json({
    query,
    domain: { id: domainId, label: domain.label },
    mode: { id: modeId, description: modeDescriptions[modeId] },
    source_strategy: domain.sources,
    expected_outputs: domain.outputs,
    detected_symbols: symbols,
    backend_state: 'live-multisource-search',
  });
});

app.get('/api/research/search', rateLimit, async (req, res) => {
  const query = String(req.query.q || '').trim().slice(0, 600);
  if (query.length < 2) return res.status(400).json({ error: 'اكتب سؤالًا أو موضوعًا للبحث.' });

  const domainId = Object.prototype.hasOwnProperty.call(domains, req.query.domain) ? req.query.domain : 'general';
  const modeId = Object.prototype.hasOwnProperty.call(modeDescriptions, req.query.mode) ? req.query.mode : 'deep';
  const sources = normalizeRequestedSources(domainId, req.query.sources);
  const cacheKey = JSON.stringify([query.toLowerCase(), domainId, modeId, [...sources].sort()]);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.time < 120000) {
    res.set('Cache-Control', 'no-store');
    return res.json({ ...cached.value, cached: true });
  }

  const started = Date.now();
  const jobs = sources.map(async (source) => {
    const t0 = Date.now();
    try {
      const items = await adapters[source](query);
      return { source, ok: true, ms: Date.now() - t0, count: items.length, items };
    } catch (error) {
      return { source, ok: false, ms: Date.now() - t0, count: 0, items: [], error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'provider error') };
    }
  });

  const providerRows = await Promise.all(jobs);
  const seen = new Set();
  let results = [];
  for (const provider of providerRows) {
    for (const item of provider.items) {
      const key = canonicalKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      results.push({ ...item, evidenceScore: evidenceScore(item, query) });
    }
  }

  results.sort((a, b) => b.evidenceScore - a.evidenceScore || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  const maxByMode = { quick: 12, deep: 30, compare: 24, verify: 20, timeline: 24, decision: 20 }[modeId] || 24;
  results = results.slice(0, maxByMode);

  const symbols = symbolsFromQuery(query);
  let marketContext = [];
  if (symbols.length && (domainId === 'markets' || symbols.some((s) => query.includes(`$${s}`)))) {
    try { marketContext = await getQuotes(symbols); } catch { marketContext = []; }
  }

  const sourceTypes = [...new Set(results.map((r) => r.type))];
  const providersOk = providerRows.filter((p) => p.ok && p.count > 0).length;
  const strongest = results.slice(0, 5).map((r) => ({ title: r.title, source: r.source, provider: r.provider, url: r.url, snippet: r.snippet, evidenceScore: r.evidenceScore, publishedAt: r.publishedAt }));
  const timeline = results.filter((r) => r.publishedAt).slice().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 12);

  const payload = {
    query,
    domain: { id: domainId, label: domains[domainId].label },
    mode: { id: modeId, description: modeDescriptions[modeId] },
    sources,
    durationMs: Date.now() - started,
    total: results.length,
    sourceTypes,
    providers: providerRows.map(({ items, ...meta }) => meta),
    results,
    strongest,
    timeline,
    marketContext,
    synthesis: {
      title: `تم العثور على ${results.length} نتيجة مباشرة من ${providersOk} مزودات`,
      note: 'هذه نتائج فعلية وملخصات مصدرية. لم يتم توليد ادعاءات جديدة بواسطة نموذج لغوي في هذه المرحلة.',
    },
    fetchedAt: new Date().toISOString(),
  };

  searchCache.set(cacheKey, { time: Date.now(), value: payload });
  if (searchCache.size > 80) searchCache.delete(searchCache.keys().next().value);
  res.set('Cache-Control', 'no-store');
  res.json(payload);
});

app.get('/api/quote/:symbol', async (req, res) => {
  const symbol = cleanSymbol(req.params.symbol);
  if (!symbol) return res.status(400).json({ error: 'رمز غير صالح' });
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getQuote(symbol));
  } catch (error) {
    res.status(502).json({ symbol, error: error?.message || 'تعذر جلب السعر' });
  }
});

app.get('/api/market', async (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getMarketPulse());
  } catch (error) {
    res.status(502).json({ error: error?.message || 'تعذر جلب حالة السوق' });
  }
});

app.get('/api/research/context', async (req, res) => {
  const symbols = symbolsFromQuery(req.query.q);
  if (!symbols.length) return res.json({ symbols: [], quotes: [], note: 'لم يتم اكتشاف رمز سهم واضح في السؤال.' });
  try {
    const rows = await getQuotes(symbols);
    res.set('Cache-Control', 'no-store');
    res.json({ symbols, quotes: rows, note: 'سياق سوق حي للاستخدام كمرجع فقط؛ ليس توصية تداول.' });
  } catch (error) {
    res.status(502).json({ symbols, quotes: [], error: error?.message || 'تعذر جلب سياق السوق' });
  }
});

app.get(['/', '/research', '/research-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'research-intelligence.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Research Intelligence v3.2 live multi-source listening on ${port}`);
});
