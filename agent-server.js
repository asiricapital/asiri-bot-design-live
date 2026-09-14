import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const RESEARCH_BASE_URL = String(process.env.RESEARCH_BASE_URL || 'https://asiri-research-intelligence-preview.onrender.com').replace(/\/$/, '');
const LLM_BASE_URL = String(process.env.ASIRI_LLM_BASE_URL || '').replace(/\/$/, '');
const LLM_API_KEY = String(process.env.ASIRI_LLM_API_KEY || '');
const LLM_MODEL = String(process.env.ASIRI_LLM_MODEL || '');
const rateBuckets = new Map();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

const agentProfiles = {
  research: { label: 'Research Agent', mode: 'deep', icon: 'R', brief: 'يجمع الأدلة ويعطي جوابًا موثقًا.' },
  verify: { label: 'Verify Agent', mode: 'verify', icon: 'V', brief: 'يفصل المؤكد عن غير المؤكد.' },
  compare: { label: 'Compare Agent', mode: 'compare', icon: 'C', brief: 'يقارن البدائل بنفس معيار الأدلة.' },
  timeline: { label: 'Timeline Agent', mode: 'timeline', icon: 'T', brief: 'يبني تسلسلًا زمنيًا للأحداث.' },
  decision: { label: 'Decision Agent', mode: 'decision', icon: 'D', brief: 'يحوّل الأدلة إلى مذكرة قرار.' },
};

const domainLabels = {
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
  if (bucket.count > 18) return res.status(429).json({ error: 'تم تجاوز الحد المؤقت. حاول بعد دقيقة.' });
  next();
}

async function fetchJson(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function esc(value) { return String(value || '').replace(/[<>]/g, ''); }
function clip(value, max = 360) { const text = String(value || '').replace(/\s+/g, ' ').trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text; }

function citationIndex(results) {
  return (results || []).slice(0, 10).map((r, index) => ({
    id: index + 1,
    title: r.title,
    url: r.url,
    source: r.source,
    provider: r.provider,
    publishedAt: r.publishedAt,
    evidenceScore: r.evidenceScore,
    snippet: r.snippet,
    type: r.type,
  }));
}

function fallbackSynthesis({ message, agent, domain, research }) {
  const refs = citationIndex(research.results);
  const top = refs.slice(0, agent === 'quick' ? 3 : 6);
  const dated = [...refs].filter((r) => r.publishedAt).sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const avg = top.length ? Math.round(top.reduce((a, r) => a + (r.evidenceScore || 0), 0) / top.length) : 0;
  const providers = [...new Set(top.map((r) => r.provider))];
  let sections = [];

  if (!top.length) {
    sections = [{ title: 'النتيجة', text: 'لم تُرجع المصادر الحالية نتائج كافية لبناء جواب موثق. جرّب توسيع صياغة السؤال أو اختيار مجال/مصادر مختلفة.' }];
  } else if (agent === 'timeline') {
    sections = [{
      title: 'التسلسل الزمني',
      text: dated.slice(-8).map((r) => `${r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('ar-SA') : 'بدون تاريخ'} — ${clip(r.title, 140)} [${r.id}]`).join('\n'),
    }];
  } else if (agent === 'verify') {
    sections = [
      { title: 'حكم أولي', text: `توجد ${top.length} أدلة مباشرة من ${providers.length} مزودات. درجة الأدلة المتوسطة ${avg}/100. هذا يكفي لتكوين صورة أولية لكنه لا يساوي تحققًا نهائيًا من الادعاء.` },
      { title: 'أقوى ما يؤيد', text: top.slice(0, 3).map((r) => `${clip(r.title, 150)} — ${clip(r.snippet, 210)} [${r.id}]`).join('\n') },
      { title: 'ما يزال غير محسوم', text: 'وجود نتائج متشابهة لا يضمن الاستقلال بين المصادر. راجع المصدر الأصلي، التاريخ، والسياق قبل اعتبار الادعاء مؤكدًا.' },
    ];
  } else if (agent === 'compare') {
    sections = [
      { title: 'مقارنة الأدلة', text: top.map((r) => `${r.source || r.provider}: ${clip(r.title, 140)} — درجة ${r.evidenceScore}/100 [${r.id}]`).join('\n') },
      { title: 'الخلاصة', text: `الأدلة الأعلى جودة حاليًا تأتي من ${top.slice(0, 3).map((r) => r.provider).join('، ')}. استخدم الروابط الأصلية لحسم الفروق الدقيقة.` },
    ];
  } else if (agent === 'decision') {
    sections = [
      { title: 'ملخص القرار', text: `السؤال: ${message}\nتوفر ${top.length} مصادر قوية نسبيًا بمتوسط أدلة ${avg}/100. القرار النهائي يجب أن يراعي ما لا تغطيه هذه النتائج.` },
      { title: 'ما يدعم القرار', text: top.slice(0, 4).map((r) => `${clip(r.title, 160)} [${r.id}]`).join('\n') },
      { title: 'المخاطر / فجوات الدليل', text: 'قد تكون بعض النتائج إعادة نشر أو مختصرات. يجب مراجعة المصدر الأولي، التوقيت، والتعارضات قبل أي إجراء مهم.' },
      { title: 'الخطوة التالية', text: 'افتح أقوى مصدرين، ثم شغّل Verify على الادعاء الحاسم أو Compare إذا كانت هناك بدائل.' },
    ];
  } else {
    sections = [
      { title: 'الخلاصة التنفيذية', text: `وجد ASIRI ${research.total || top.length} نتيجة من ${research.providers?.filter((p) => p.ok && p.count > 0).length || providers.length} مزودات. أقوى الأدلة الحالية تميل إلى: ${top.slice(0, 3).map((r) => clip(r.title, 120)).join('؛ ')}.` },
      { title: 'أهم ما وجدناه', text: top.slice(0, 5).map((r) => `${clip(r.snippet || r.title, 250)} [${r.id}]`).join('\n') },
      { title: 'درجة الثقة', text: `ثقة بحثية أولية: ${avg >= 82 ? 'مرتفعة نسبيًا' : avg >= 68 ? 'متوسطة' : 'محدودة'} (${avg}/100 متوسط Evidence Score). هذه الدرجة لترتيب الأدلة وليست ضمانًا لصحة الادعاء.` },
      { title: 'ما يحتاج تحققًا إضافيًا', text: 'الأدلة الحالية لا تثبت تلقائيًا السببية أو النية أو التوقعات المستقبلية. شغّل Verify على النقطة الأهم إذا كانت ستؤثر في قرار.' },
    ];
  }

  return {
    engine: 'evidence-synthesis',
    model: null,
    answer: sections.map((s) => `## ${s.title}\n${s.text}`).join('\n\n'),
    sections,
    confidence: avg,
    citations: refs,
    followUps: [
      `تحقق من أقوى ادعاء في: ${clip(message, 70)}`,
      'اعرض التعارضات بين المصادر فقط',
      'ابنِ Timeline مختصرًا مع التواريخ',
      'ما الذي قد يغير النتيجة الحالية؟',
    ],
  };
}

function buildSystemPrompt(agent, domain) {
  return `أنت ASIRI Intelligence Agent. اكتب بالعربية الواضحة. المهمة الحالية: ${agentProfiles[agent]?.label || 'Research Agent'}. المجال: ${domainLabels[domain] || 'بحث عام'}.\nقواعد إلزامية:\n1) استخدم فقط الأدلة المرقمة المقدمة.\n2) كل ادعاء جوهري يجب أن يحمل citation بصيغة [1] أو [2].\n3) لا تختلق مصدرًا أو رقمًا أو حدثًا.\n4) افصل الحقيقة عن الاستنتاج والسيناريو.\n5) اذكر التعارضات وفجوات الأدلة.\n6) لا تصدر توصية تداول أو إجراء تنفيذي تلقائي.\n7) اختم بأربع أسئلة متابعة قصيرة.`;
}

async function llmSynthesis({ message, agent, domain, conversation, research }) {
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  const citations = citationIndex(research.results);
  const evidence = citations.map((r) => `[${r.id}] ${r.title}\nالمصدر: ${r.source || r.provider}\nالتاريخ: ${r.publishedAt || 'غير متاح'}\nEvidence Score: ${r.evidenceScore}\nالمقتطف: ${r.snippet}\nالرابط: ${r.url}`).join('\n\n');
  const history = Array.isArray(conversation) ? conversation.slice(-8).filter((m) => ['user','assistant'].includes(m?.role)).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 3000) })) : [];
  const payload = {
    model: LLM_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildSystemPrompt(agent, domain) },
      ...history,
      { role: 'user', content: `السؤال الحالي:\n${message}\n\nالأدلة المتاحة:\n${evidence}\n\nاكتب جوابًا تركيبيًا موثقًا بالمراجع داخل النص.` },
    ],
  };
  const headers = { 'Content-Type': 'application/json' };
  if (LLM_API_KEY) headers.Authorization = `Bearer ${LLM_API_KEY}`;
  const data = await fetchJson(`${LLM_BASE_URL}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(payload) }, 45000);
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) throw new Error('LLM returned no content');
  return {
    engine: 'openai-compatible-agent',
    model: LLM_MODEL,
    answer,
    sections: [],
    confidence: citations.length ? Math.round(citations.slice(0, 6).reduce((a, r) => a + (r.evidenceScore || 0), 0) / Math.min(6, citations.length)) : 0,
    citations,
    followUps: ['ما أقوى دليل؟', 'ما أبرز التعارضات؟', 'لخصها في 5 نقاط', 'ما الذي يجب التحقق منه بعد ذلك؟'],
  };
}

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-agent-intelligence-preview',
  version: '4.0-librechat-inspired-agent-layer',
  researchBackend: RESEARCH_BASE_URL,
  llmConfigured: Boolean(LLM_BASE_URL && LLM_MODEL),
  agents: Object.keys(agentProfiles),
  trading: false,
  time: new Date().toISOString(),
}));

app.get('/api/agents', (_req, res) => res.json({ agents: Object.entries(agentProfiles).map(([id, a]) => ({ id, ...a })), domains: domainLabels }));

app.post('/api/agent/chat', rateLimit, async (req, res) => {
  const message = esc(req.body?.message).trim().slice(0, 3000);
  if (message.length < 2) return res.status(400).json({ error: 'اكتب سؤالًا أو موضوعًا للبحث.' });
  const agent = Object.hasOwn(agentProfiles, req.body?.agent) ? req.body.agent : 'research';
  const domain = Object.hasOwn(domainLabels, req.body?.domain) ? req.body.domain : 'general';
  const mode = agentProfiles[agent].mode;
  const sources = Array.isArray(req.body?.sources) ? req.body.sources.filter((s) => ['web','news','papers','discussions','github'].includes(s)).slice(0, 5) : [];
  const params = new URLSearchParams({ q: message, domain, mode });
  if (sources.length) params.set('sources', sources.join(','));

  const started = Date.now();
  try {
    const research = await fetchJson(`${RESEARCH_BASE_URL}/api/research/search?${params}`, {}, 22000);
    let synthesis = null;
    let llmError = null;
    try { synthesis = await llmSynthesis({ message, agent, domain, conversation: req.body?.conversation, research }); }
    catch (error) { llmError = error?.message || 'LLM synthesis failed'; }
    if (!synthesis) synthesis = fallbackSynthesis({ message, agent, domain, research });

    res.set('Cache-Control', 'no-store');
    res.json({
      id: `asiri-${Date.now().toString(36)}`,
      message,
      agent: { id: agent, ...agentProfiles[agent] },
      domain: { id: domain, label: domainLabels[domain] },
      durationMs: Date.now() - started,
      research: {
        total: research.total || 0,
        providers: research.providers || [],
        marketContext: research.marketContext || [],
        fetchedAt: research.fetchedAt,
      },
      ...synthesis,
      llmError,
      guardrails: ['research-only','no-broker','no-portfolio-write','source-citations-required'],
    });
  } catch (error) {
    res.status(502).json({ error: 'تعذر تشغيل طبقة البحث الحالية.', detail: error?.message || 'backend error' });
  }
});

app.get(['/', '/agent', '/agent-intelligence.html'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(root, 'agent-intelligence.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`ASIRI Agent Intelligence v4 listening on ${port}`);
});
