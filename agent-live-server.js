import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEmbeddedResearch } from './embedded-research.js';
import { getQuotes } from './market.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const SERVER_LLM_BASE_URL = String(process.env.ASIRI_LLM_BASE_URL || '').replace(/\/$/, '');
const SERVER_LLM_API_KEY = String(process.env.ASIRI_LLM_API_KEY || '');
const SERVER_LLM_MODEL = String(process.env.ASIRI_LLM_MODEL || '');
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const CLIENT_MODELS = new Set([
  'openai', 'openai-fast', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'claude-fast', 'claude-sonnet-5', 'gemini-fast', 'gemini-search',
  'deepseek', 'kimi', 'glm', 'qwen-large', 'perplexity-fast',
]);
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '320kb' }));

const agents = {
  research: { label: 'Research Agent', mode: 'deep', instruction: 'كوّن إجابة بحثية متوازنة ومباشرة.' },
  verify: { label: 'Verify Agent', mode: 'verify', instruction: 'تحقق من الادعاء وافصل المؤكد عن غير المؤكد.' },
  compare: { label: 'Compare Agent', mode: 'compare', instruction: 'قارن الخيارات بنفس معايير الأدلة.' },
  timeline: { label: 'Timeline Agent', mode: 'timeline', instruction: 'ابنِ تسلسلًا زمنيًا واضحًا بالأحداث والتواريخ.' },
  decision: { label: 'Decision Agent', mode: 'decision', instruction: 'حوّل الأدلة إلى مذكرة قرار مع مخاطر وخطوة تالية.' },
};

const domains = {
  general: 'بحث عام', markets: 'الأسواق والاستثمار', government: 'الجهات والمنافسات',
  companies: 'الشركات والمبيعات', technology: 'التقنية وGitHub', politics: 'السياسة والجغرافيا',
  science: 'العلوم والصحة', cyber: 'الأمن السيبراني', media: 'الإعلام والمحتوى', documents: 'الملفات والوثائق',
};

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 24) return res.status(429).json({ error: 'تم تجاوز الحد المؤقت. حاول بعد دقيقة.' });
  next();
}

async function fetchJson(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 180)}` : ''}`);
    return text ? JSON.parse(text) : {};
  } finally { clearTimeout(timer); }
}

function cleanText(value, max = 3200) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function symbolsFromQuery(value) {
  const text = String(value || '').toUpperCase();
  const cashTags = [...text.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
  const standalone = [...text.matchAll(/\b([A-Z]{2,5})\b/g)]
    .map((m) => m[1])
    .filter((s) => !['THE','AND','FOR','WITH','FROM','RISK','NEWS','TODAY','ASIRI','DEEP','QUICK'].includes(s));
  return [...new Set([...cashTags, ...standalone])].slice(0, 4);
}

async function enrichMarketContext(research, message, domainId) {
  if (domainId !== 'markets' && !/\$[A-Za-z]{1,6}\b/.test(message)) return research;
  const symbols = symbolsFromQuery(message);
  if (!symbols.length) return research;
  try {
    const quotes = await getQuotes(symbols);
    return { ...research, marketContext: quotes };
  } catch {
    return research;
  }
}

function citationsFromResearch(research) {
  return (research?.results || []).slice(0, 14).map((r, i) => ({
    id: i + 1,
    title: r.title,
    url: r.url,
    source: r.source || r.provider,
    provider: r.provider,
    publishedAt: r.publishedAt,
    evidenceScore: r.evidenceScore,
    snippet: r.snippet,
    type: r.type,
  }));
}

function evidenceText(citations) {
  return citations.map((c) => [
    `[${c.id}] ${c.title}`,
    `المصدر: ${c.source || 'غير محدد'} (${c.provider || 'provider'})`,
    `التاريخ: ${c.publishedAt || 'غير متاح'}`,
    `Evidence Score: ${c.evidenceScore ?? 'n/a'}`,
    `المقتطف: ${String(c.snippet || '').slice(0, 600)}`,
    `الرابط: ${c.url}`,
  ].join('\n')).join('\n\n');
}

function buildSystemPrompt(agentId, domainId) {
  const agent = agents[agentId] || agents.research;
  return `أنت ASIRI Intelligence Agent. اكتب بالعربية الواضحة والمنظمة.\nالمهمة: ${agent.label}. ${agent.instruction}\nالمجال: ${domains[domainId] || domains.general}.\nقواعد إلزامية:\n1) استخدم فقط الأدلة المرقمة المقدمة لك.\n2) كل ادعاء جوهري يجب أن يحمل مرجعًا بصيغة [1] أو [2].\n3) لا تختلق مصدرًا أو رقمًا أو حدثًا أو اقتباسًا.\n4) افصل الحقائق عن الاستنتاجات والسيناريوهات.\n5) اذكر التعارضات وفجوات الأدلة صراحة.\n6) إذا لم تكف الأدلة فقل ذلك بوضوح.\n7) لا تصدر أمر تداول أو إجراء تنفيذي تلقائي.\n8) فضّل المصادر الرسمية والأبحاث والمصادر الحديثة عندما تتعارض النتائج.\n9) اجعل أول فقرة خلاصة عملية، ثم التفاصيل، ثم ما يحتاج تحققًا إضافيًا.`;
}

function fallbackSynthesis(message, research) {
  const refs = citationsFromResearch(research);
  if (!refs.length) {
    const failures = (research.providers || []).filter((p) => !p.ok).map((p) => p.source).filter(Boolean);
    return {
      engine: 'evidence-fallback', model: null, confidence: 0,
      answer: `لم تُرجع المصادر المتاحة أدلة كافية لهذه الصياغة. ${failures.length ? `المصادر التي تعثرت: ${failures.join('، ')}.` : ''} جرّب صياغة أكثر تحديدًا أو غيّر المجال.`,
      citations: [],
    };
  }
  const top = refs.slice(0, 8);
  const avg = Math.round(top.reduce((sum, x) => sum + Number(x.evidenceScore || 0), 0) / top.length);
  const bullets = top.slice(0, 6).map((x) => `- ${x.snippet || x.title} [${x.id}]`).join('\n');
  const providerCount = new Set(top.map((x) => x.provider).filter(Boolean)).size;
  return {
    engine: 'evidence-fallback', model: null, confidence: avg,
    answer: `## الخلاصة\nوجد ASIRI ${research.total || refs.length} نتيجة مرتبطة بسؤالك من عدة قنوات بحثية. أقوى ${top.length} أدلة موزعة على ${providerCount} مزودات، ومتوسط Evidence Score هو ${avg}/100.\n\n## أهم ما وجدناه\n${bullets}\n\n## جودة البحث\nالمحرك الحالي يجمع الويب والأخبار والمراجع العلمية والمناقشات وGitHub حسب المجال، ويستخدم أكثر من محرك لبعض الفئات لتقليل الاعتماد على مصدر واحد.\n\n## ما يحتاج تحققًا إضافيًا\nهذه خلاصة مبنية على مقتطفات ومعلومات المصادر. فعّل نموذج AI للحصول على synthesis لغوي أعمق، أو استخدم Verify إذا كان هناك ادعاء محدد تريد حسمه.`,
    citations: refs,
  };
}

function resolveProvider(body) {
  const clientKey = String(body?.providerKey || '');
  const clientModel = CLIENT_MODELS.has(body?.providerModel) ? body.providerModel : 'openai-fast';
  if (clientKey && /^(sk_|pk_)/.test(clientKey)) {
    return { type: 'pollinations-byop', baseUrl: POLLINATIONS_BASE_URL, apiKey: clientKey, model: clientModel };
  }
  if (SERVER_LLM_BASE_URL && SERVER_LLM_MODEL) {
    return { type: 'server-openai-compatible', baseUrl: SERVER_LLM_BASE_URL, apiKey: SERVER_LLM_API_KEY, model: SERVER_LLM_MODEL };
  }
  return null;
}

async function synthesizeWithModel({ provider, message, agentId, domainId, conversation, citations }) {
  const history = Array.isArray(conversation)
    ? conversation.slice(-8).filter((m) => ['user','assistant'].includes(m?.role)).map((m) => ({ role: m.role, content: cleanText(m.content, 2800) }))
    : [];
  const payload = {
    model: provider.model,
    temperature: 0.12,
    messages: [
      { role: 'system', content: buildSystemPrompt(agentId, domainId) },
      ...history,
      { role: 'user', content: `السؤال الحالي:\n${message}\n\nالأدلة المتاحة:\n${evidenceText(citations)}\n\nكوّن إجابة عربية مترابطة وموثقة داخل النص بالمراجع الرقمية. لا تضف أي حقيقة غير موجودة في الأدلة.` },
    ],
  };
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const data = await fetchJson(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('لم يعد النموذج محتوى صالحًا');
  const avg = citations.length ? Math.round(citations.slice(0, 8).reduce((s, x) => s + Number(x.evidenceScore || 0), 0) / Math.min(8, citations.length)) : 0;
  return { engine: provider.type, model: provider.model, confidence: avg, answer, citations };
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-agent-intelligence-live-llm',
  version: '4.2-self-contained-research',
  embeddedResearch: true,
  externalResearchDependency: false,
  serverLLMConfigured: Boolean(SERVER_LLM_BASE_URL && SERVER_LLM_MODEL),
  clientBYOPSupported: true,
  supportedClientModels: [...CLIENT_MODELS],
  trading: false,
  time: new Date().toISOString(),
}));

app.get('/api/status', (_req, res) => res.json({
  researchEngine: 'embedded-resilient-v1',
  researchProviders: ['Google News','Bing News','Bing Web','Wikipedia','DuckDuckGo','OpenAlex','Crossref','arXiv','Hacker News','GitHub'],
  serverLLMConfigured: Boolean(SERVER_LLM_BASE_URL && SERVER_LLM_MODEL),
  byop: { provider: 'Pollinations', baseUrl: POLLINATIONS_BASE_URL, models: [...CLIENT_MODELS] },
  agents,
  domains,
}));

app.post('/api/chat', rateLimit, async (req, res) => {
  const message = cleanText(req.body?.message);
  if (message.length < 2) return res.status(400).json({ error: 'اكتب سؤالًا أو موضوعًا للبحث.' });
  const agentId = Object.hasOwn(agents, req.body?.agent) ? req.body.agent : 'research';
  const domainId = Object.hasOwn(domains, req.body?.domain) ? req.body.domain : 'general';
  const mode = agents[agentId].mode;
  const sources = Array.isArray(req.body?.sources)
    ? req.body.sources.filter((s) => ['web','news','papers','discussions','github'].includes(s)).slice(0, 5)
    : [];

  const started = Date.now();
  try {
    let research = await runEmbeddedResearch({ query: message, domainId, modeId: mode, sources });
    research = await enrichMarketContext(research, message, domainId);
    const citations = citationsFromResearch(research);
    const provider = resolveProvider(req.body);
    let synthesis = null;
    let providerError = null;

    if (provider && citations.length) {
      try {
        synthesis = await synthesizeWithModel({
          provider, message, agentId, domainId,
          conversation: req.body?.conversation,
          citations,
        });
      } catch (error) {
        providerError = cleanText(error?.message || 'LLM provider error', 500);
      }
    }

    if (!synthesis) synthesis = fallbackSynthesis(message, research);

    res.set('Cache-Control', 'no-store');
    res.json({
      id: `asiri-${Date.now().toString(36)}`,
      message,
      agent: { id: agentId, ...agents[agentId] },
      domain: { id: domainId, label: domains[domainId] },
      durationMs: Date.now() - started,
      research: {
        engine: research.researchEngine,
        total: research.total || 0,
        providers: research.providers || [],
        sourceTypes: research.sourceTypes || [],
        queryVariants: research.queryVariants || [message],
        marketContext: research.marketContext || [],
        fetchedAt: research.fetchedAt,
      },
      ...synthesis,
      providerError,
      providerActive: Boolean(provider && synthesis.engine !== 'evidence-fallback'),
      guardrails: ['research-only','no-broker','no-portfolio-write','citations-required'],
      followUps: [
        'ما أقوى دليل في هذه النتيجة؟',
        'اعرض التعارضات بين المصادر فقط',
        'ما الذي لا نعرفه حتى الآن؟',
        'تحقق من أهم ادعاء من مصدرين مستقلين',
      ],
    });
  } catch (error) {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      id: `asiri-${Date.now().toString(36)}`,
      message,
      agent: { id: agentId, ...agents[agentId] },
      domain: { id: domainId, label: domains[domainId] },
      durationMs: Date.now() - started,
      research: { engine: 'embedded-resilient-v1', total: 0, providers: [], marketContext: [] },
      engine: 'evidence-fallback', model: null, confidence: 0, citations: [], providerActive: false,
      answer: `تعذر الوصول إلى مزودات البحث في هذه المحاولة، لكن خدمة ASIRI نفسها تعمل. الخطأ الفني: ${cleanText(error?.message || 'research provider error', 260)}. أعد الإرسال بعد لحظات أو غيّر المجال/المصادر.`,
      providerError: null,
      guardrails: ['research-only','no-broker','no-portfolio-write','citations-required'],
      followUps: ['أعد البحث الآن', 'استخدم الأخبار والويب فقط', 'حوّل إلى Verify', 'صياغة بحث أدق'],
    });
  }
});

app.get(['/', '/agent', '/agent-live.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'agent-live.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Agent Intelligence v4.2 self-contained research listening on ${port}`);
});
