import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const RESEARCH_BASE_URL = String(process.env.RESEARCH_BASE_URL || 'https://asiri-research-intelligence-preview.onrender.com').replace(/\/$/, '');
const SERVER_LLM_BASE_URL = String(process.env.ASIRI_LLM_BASE_URL || '').replace(/\/$/, '');
const SERVER_LLM_API_KEY = String(process.env.ASIRI_LLM_API_KEY || '');
const SERVER_LLM_MODEL = String(process.env.ASIRI_LLM_MODEL || '');
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const CLIENT_MODELS = new Set(['openai-fast','gpt-5.6-sol','claude-fast','gemini-fast','qwen-large']);
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
  if (bucket.count > 20) return res.status(429).json({ error: 'تم تجاوز الحد المؤقت. حاول بعد دقيقة.' });
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

function citationsFromResearch(research) {
  return (research?.results || []).slice(0, 12).map((r, i) => ({
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
    `المقتطف: ${String(c.snippet || '').slice(0, 520)}`,
    `الرابط: ${c.url}`,
  ].join('\n')).join('\n\n');
}

function buildSystemPrompt(agentId, domainId) {
  const agent = agents[agentId] || agents.research;
  return `أنت ASIRI Intelligence Agent. اكتب بالعربية الواضحة والمنظمة.\nالمهمة: ${agent.label}. ${agent.instruction}\nالمجال: ${domains[domainId] || domains.general}.\nقواعد إلزامية:\n1) استخدم فقط الأدلة المرقمة المقدمة لك.\n2) كل ادعاء جوهري يجب أن يحمل مرجعًا بصيغة [1] أو [2].\n3) لا تختلق مصدرًا أو رقمًا أو حدثًا أو اقتباسًا.\n4) افصل الحقائق عن الاستنتاجات والسيناريوهات.\n5) اذكر التعارضات وفجوات الأدلة صراحة.\n6) إذا لم تكف الأدلة فقل ذلك بوضوح.\n7) لا تصدر أمر تداول أو إجراء تنفيذي تلقائي.\n8) اجعل أول فقرة خلاصة عملية، ثم التفاصيل، ثم ما يحتاج تحققًا إضافيًا.`;
}

function fallbackSynthesis(message, research) {
  const refs = citationsFromResearch(research);
  if (!refs.length) {
    return {
      engine: 'evidence-fallback', model: null, confidence: 0,
      answer: 'لم تُرجع المصادر الحالية أدلة كافية لبناء إجابة موثقة. جرّب إعادة صياغة السؤال أو توسيع المصادر.',
      citations: [],
    };
  }
  const top = refs.slice(0, 6);
  const avg = Math.round(top.reduce((sum, x) => sum + Number(x.evidenceScore || 0), 0) / top.length);
  const bullets = top.slice(0, 5).map((x) => `- ${x.snippet || x.title} [${x.id}]`).join('\n');
  return {
    engine: 'evidence-fallback', model: null, confidence: avg,
    answer: `## الخلاصة\nوجد ASIRI ${research.total || refs.length} نتيجة مرتبطة بسؤالك. أعلى الأدلة الحالية متوسطها ${avg}/100.\n\n## أهم ما وجدناه\n${bullets}\n\n## ما يحتاج تحققًا إضافيًا\nهذه خلاصة مستندة إلى مقتطفات المصادر فقط وليست استنتاجًا لغويًا كاملًا. افتح أقوى المراجع أو فعّل نموذج AI من زر «ربط الذكاء الاصطناعي» للحصول على synthesis أعمق.`,
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
    ? conversation.slice(-8).filter((m) => ['user','assistant'].includes(m?.role)).map((m) => ({ role: m.role, content: cleanText(m.content, 2600) }))
    : [];
  const payload = {
    model: provider.model,
    temperature: 0.15,
    messages: [
      { role: 'system', content: buildSystemPrompt(agentId, domainId) },
      ...history,
      { role: 'user', content: `السؤال الحالي:\n${message}\n\nالأدلة المتاحة:\n${evidenceText(citations)}\n\nكوّن إجابة عربية مترابطة وموثقة داخل النص بالمراجع الرقمية.` },
    ],
  };
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const data = await fetchJson(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload) }, 60000);
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('لم يعد النموذج محتوى صالحًا');
  const avg = citations.length ? Math.round(citations.slice(0, 6).reduce((s, x) => s + Number(x.evidenceScore || 0), 0) / Math.min(6, citations.length)) : 0;
  return { engine: provider.type, model: provider.model, confidence: avg, answer, citations };
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-agent-intelligence-live-llm',
  version: '4.1-provider-connected',
  researchBackend: RESEARCH_BASE_URL,
  serverLLMConfigured: Boolean(SERVER_LLM_BASE_URL && SERVER_LLM_MODEL),
  clientBYOPSupported: true,
  supportedClientModels: [...CLIENT_MODELS],
  trading: false,
  time: new Date().toISOString(),
}));

app.get('/api/status', (_req, res) => res.json({
  researchBackend: RESEARCH_BASE_URL,
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
  const params = new URLSearchParams({ q: message, domain: domainId, mode });
  if (sources.length) params.set('sources', sources.join(','));

  const started = Date.now();
  try {
    const research = await fetchJson(`${RESEARCH_BASE_URL}/api/research/search?${params}`, {}, 26000);
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
        total: research.total || 0,
        providers: research.providers || [],
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
        'لخص النتيجة في خمس نقاط',
      ],
    });
  } catch (error) {
    res.status(502).json({ error: 'تعذر تشغيل طبقة البحث.', detail: cleanText(error?.message || 'backend error', 500) });
  }
});

app.get(['/', '/agent', '/agent-live.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'agent-live.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Agent Intelligence v4.1 provider-connected listening on ${port}`);
});
