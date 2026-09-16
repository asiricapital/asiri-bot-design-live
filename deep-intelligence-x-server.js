import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDeepInvestigationWithX } from './deep-intelligence-engine-x.js';
import { getQuotes } from './market.js';
import {
  startXOAuth,
  finishXOAuth,
  xStatus,
  disconnectX,
  xFeedEndpoint,
  getXFeed,
  isXBackendReady,
} from './x-intelligence.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

const SERVER_LLM_BASE_URL = String(process.env.ASIRI_LLM_BASE_URL || '').replace(/\/$/, '');
const SERVER_LLM_API_KEY = String(process.env.ASIRI_LLM_API_KEY || '');
const SERVER_LLM_MODEL = String(process.env.ASIRI_LLM_MODEL || '');
const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai/v1';
const CLIENT_MODELS = new Set([
  'openai', 'openai-fast', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
  'claude-fast', 'claude-sonnet-5', 'gemini-fast', 'gemini-search', 'deepseek',
  'kimi', 'glm', 'qwen-large', 'perplexity-fast',
]);
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '512kb' }));

function clean(value, max = 5000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 14) return res.status(429).json({ error: 'تم تجاوز حد البحث العميق مؤقتًا. حاول بعد دقيقة.' });
  next();
}

async function fetchJson(url, options = {}, timeoutMs = 70_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 220)}` : ''}`);
    return text ? JSON.parse(text) : {};
  } finally { clearTimeout(timer); }
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

function numberedEvidence(investigation) {
  const readByUrl = new Map((investigation.sourcesRead || []).map((x) => [x.url, x]));
  return (investigation.results || []).slice(0, 24).map((r, i) => {
    const read = readByUrl.get(r.url);
    return {
      id: i + 1,
      title: r.title,
      url: r.url,
      source: r.source || r.provider,
      provider: r.provider,
      publishedAt: r.publishedAt,
      evidenceScore: r.evidenceScore,
      excerpt: clean(read?.excerpt || r.snippet || '', 1200),
      readStatus: read?.readStatus || (r.provider === 'X Timeline' ? 'x-api' : 'search-snippet'),
      fromX: Boolean(r.fromX),
    };
  });
}

function evidencePack(investigation, refs) {
  const sources = refs.map((r) => [
    `[${r.id}] ${r.title}`,
    `المصدر: ${r.source} / ${r.provider}`,
    `التاريخ: ${r.publishedAt || 'غير متاح'}`,
    `Evidence Score: ${r.evidenceScore ?? 'n/a'}`,
    `حالة القراءة: ${r.readStatus}`,
    `المحتوى/المقتطف: ${r.excerpt}`,
    `الرابط: ${r.url}`,
  ].join('\n')).join('\n\n');

  const claims = (investigation.claims || []).slice(0, 14).map((c) =>
    `C${c.id}: ${c.claim}\nالدعم المستقل=${c.independentSources}; الثقة=${c.confidence}/100; تعارض محتمل=${c.possibleConflict ? 'نعم' : 'لا'}`
  ).join('\n\n');

  const gaps = (investigation.gaps || []).map((x) => `- ${x}`).join('\n') || '- لا توجد فجوة مسجلة.';
  const contradictions = (investigation.contradictions || []).slice(0, 10).map((c) => `- ${c.claim}${c.xClaim ? ` | X: ${c.xClaim}` : ''}`).join('\n') || '- لا يوجد تعارض واضح مكتشف آليًا.';
  const xNote = investigation.x?.connected
    ? `X Home Timeline متصل: استخدم ${investigation.x.used || 0} منشورات ذات صلة من ${investigation.x.accounts || 0} حسابات. تعامل مع X كطبقة اكتشاف ولا تعتبره مصدرًا وحيدًا للحقيقة.`
    : 'X Home Timeline غير متصل.';

  return `المصادر المرقمة:\n${sources}\n\nمجموعات الادعاءات المستخرجة:\n${claims}\n\nفجوات الدليل:\n${gaps}\n\nالتعارضات المحتملة:\n${contradictions}\n\n${xNote}`;
}

function authorSystem(investigation) {
  const d = investigation.intent?.domainLabel || 'بحث عام';
  return `أنت ASIRI Deep Intelligence Analyst. تكتب بالعربية الدقيقة والمنظمة. المجال: ${d}.\n
مهمتك بناء صورة استخباراتية موثقة من الأدلة التي تم جمعها وقراءتها، بما فيها إشارات X عند اتصال الحساب.\n
قواعد إلزامية:\n1) لا تستخدم أي حقيقة خارج الأدلة المقدمة.\n2) ضع مرجعًا رقميًا [n] بجوار كل ادعاء جوهري.\n3) لا تعتبر كثرة المواقع أو المنشورات دليلاً على الاستقلال؛ ميّز بين النقل المتكرر والمصادر المستقلة.\n4) منشورات X إشارات اكتشاف أولية ما لم تدعمها مصادر مستقلة أو أصلية.\n5) افصل: المؤكد / المرجح / غير المؤكد / السيناريو.\n6) اذكر التناقضات صراحة ولا تخفها.\n7) لا تملأ الفراغ بالتخمين. إذا لم تكف الأدلة قل ذلك.\n8) إذا كان السؤال حديثًا، أعط أولوية للتوقيت وحداثة المصدر.\n9) لا تصدر أوامر تداول أو تنفيذ تلقائي.\n
اكتب بالترتيب التالي:\n## الخلاصة الآن\n## ما نعرفه بدرجة عالية\n## إشارات X المهمة\n## ما يزال غير مؤكد أو مختلفًا عليه\n## لماذا هذا مهم؟\n## السيناريوهات أو ما يجب مراقبته\n## ما الذي قد يغير النتيجة الحالية؟`;
}

async function callModel(provider, messages, temperature = 0.12) {
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const data = await fetchJson(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: provider.model, temperature, messages }),
  });
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('لم يُعد النموذج محتوى صالحًا');
  return answer;
}

async function authorAnswer(provider, question, investigation, refs, conversation) {
  const history = Array.isArray(conversation)
    ? conversation.slice(-6).filter((m) => ['user','assistant'].includes(m?.role)).map((m) => ({ role: m.role, content: clean(m.content, 2600) }))
    : [];
  return callModel(provider, [
    { role: 'system', content: authorSystem(investigation) },
    ...history,
    { role: 'user', content: `السؤال:\n${question}\n\n${evidencePack(investigation, refs)}\n\nابنِ الإجابة النهائية الآن.` },
  ]);
}

async function challengeAnswer(provider, question, draft, investigation, refs) {
  const prompt = `أنت ASIRI Challenge Agent، مراجع مستقل ومتشدد.\nالسؤال: ${question}\n\nالمسودة:\n${draft}\n\n${evidencePack(investigation, refs)}\n\nراجع المسودة سطرًا بسطر. احذف أي ادعاء لا يسنده دليل مرقم، وخفّض درجة اليقين عند التعارض. إذا كان الادعاء مبنيًا فقط على X فاذكر أنه إشارة غير مستقلة ما لم يوجد دعم آخر. لا تضف حقائق جديدة. أعد فقط النسخة المصححة النهائية بنفس عناوين الأقسام وبالمراجع [n].`;
  return callModel(provider, [
    { role: 'system', content: 'أنت مراجع أدلة مستقل. هدفك تقليل الادعاءات غير المدعومة، وليس جعل النص أكثر إثارة.' },
    { role: 'user', content: prompt },
  ], 0.05);
}

function symbolsFromQuery(value) {
  const upper = String(value || '').toUpperCase();
  const tagged = [...upper.matchAll(/\$([A-Z]{1,6})\b/g)].map((m) => m[1]);
  return [...new Set(tagged)].slice(0, 4);
}

async function addMarketContext(investigation, question) {
  if (investigation.intent?.domain !== 'markets') return investigation;
  const symbols = symbolsFromQuery(question);
  if (!symbols.length) return investigation;
  try { return { ...investigation, marketContext: await getQuotes(symbols) }; }
  catch { return investigation; }
}

app.get('/auth/x/start', startXOAuth);
app.get('/auth/x/callback', finishXOAuth);
app.get('/api/x/status', xStatus);
app.get('/api/x/feed', rateLimit, xFeedEndpoint);
app.post('/api/x/disconnect', disconnectX);

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-deep-intelligence-os',
  version: '5.1-x-intelligence',
  pipeline: ['understand','search','read','claims','x-intelligence','gap-search','cross-check','synthesize','challenge'],
  xIntegration: true,
  xBackendReady: isXBackendReady(),
  serverLLMConfigured: Boolean(SERVER_LLM_BASE_URL && SERVER_LLM_MODEL),
  clientBYOPSupported: true,
  trading: false,
  time: new Date().toISOString(),
}));

app.post('/api/deep-research', rateLimit, async (req, res) => {
  const question = clean(req.body?.question || req.body?.message, 3000);
  if (question.length < 2) return res.status(400).json({ error: 'اكتب ما تريد معرفته.' });
  const provider = resolveProvider(req.body);
  const started = Date.now();
  try {
    const xFeed = await getXFeed(req, res, { query: question, limit: 180 });
    let investigation = await runDeepInvestigationWithX(question, {
      maxRead: 8,
      xResults: xFeed.results,
      xConnected: xFeed.connected,
      xError: xFeed.error,
    });
    investigation = await addMarketContext(investigation, question);
    const refs = numberedEvidence(investigation);
    let answer = investigation.answer;
    let engine = 'deterministic-deep-evidence';
    let model = null;
    let challenge = { used: false, passed: null, error: null };
    let modelError = null;

    if (provider && refs.length) {
      const t1 = Date.now();
      try {
        const draft = await authorAnswer(provider, question, investigation, refs, req.body?.conversation);
        investigation.stages.push({ id: 'synthesize', label: 'تركيب الإجابة بواسطة النموذج', ms: Date.now() - t1, model: provider.model });
        const t2 = Date.now();
        try {
          answer = await challengeAnswer(provider, question, draft, investigation, refs);
          challenge = { used: true, passed: true, error: null };
          investigation.stages.push({ id: 'challenge', label: 'مراجعة Challenge Agent', ms: Date.now() - t2, passed: true });
        } catch (error) {
          answer = draft;
          challenge = { used: true, passed: false, error: clean(error?.message || error, 320) };
          investigation.stages.push({ id: 'challenge', label: 'مراجعة Challenge Agent', ms: Date.now() - t2, passed: false });
        }
        engine = provider.type;
        model = provider.model;
      } catch (error) {
        modelError = clean(error?.message || error, 420);
      }
    }

    const independentStrong = (investigation.claims || []).filter((c) => c.independentSources >= 2 && c.confidence >= 70).length;
    const finalConfidence = Math.min(99, Math.round((investigation.confidence || 0) * 0.62 + Math.min(10, independentStrong) * 3.1 + (challenge.passed ? 7 : 0)));

    res.set('Cache-Control', 'no-store');
    res.json({
      id: `asiri-deep-${Date.now().toString(36)}`,
      question,
      durationMs: Date.now() - started,
      engine,
      model,
      answer,
      confidence: finalConfidence,
      challenge,
      modelError,
      intent: investigation.intent,
      plan: investigation.plan,
      stages: investigation.stages,
      results: refs,
      sourcesRead: investigation.sourcesRead,
      claims: investigation.claims,
      contradictions: investigation.contradictions,
      gaps: investigation.gaps,
      gapQueries: investigation.gapQueries,
      timeline: investigation.timeline,
      independence: investigation.independence,
      marketContext: investigation.marketContext || [],
      x: {
        ...investigation.x,
        connected: xFeed.connected,
        user: xFeed.user,
        totalFetched: xFeed.totalFetched,
        error: xFeed.error,
      },
      followUps: [
        'ما أقوى دليل مستقل يدعم الخلاصة؟',
        'اعرض لي فقط إشارات X المهمة وما الذي تم تأكيده خارج X.',
        'اعرض لي فقط ما هو غير مؤكد أو المتعارض.',
        'ما الذي قد يغير هذه النتيجة خلال الساعات أو الأيام القادمة؟',
      ],
      guardrails: ['research-only','full-source-reading','x-discovery-not-single-truth','independence-aware','citations-required','no-broker','no-portfolio-write'],
    });
  } catch (error) {
    res.status(500).json({ error: 'تعذر إكمال البحث العميق.', detail: clean(error?.message || error, 500) });
  }
});

app.get(['/', '/deep', '/deep-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'deep-intelligence-x.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Deep Intelligence OS v5.1 + X Intelligence listening on ${port}`);
});
