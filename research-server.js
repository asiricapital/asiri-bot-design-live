import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getQuote, getQuotes, getMarketPulse } from './market.js';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

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
    .filter((s) => !['THE','AND','FOR','WITH','FROM','RISK','NEWS','TODAY','ASIRI'].includes(s));
  return [...new Set([...cashTags, ...standalone])].map(cleanSymbol).filter(Boolean).slice(0, 4);
}

const domains = {
  general: {
    label: 'بحث عام',
    sources: ['الويب', 'المصادر الرسمية', 'المراجع المتخصصة', 'المناقشات'],
    outputs: ['ملخص تنفيذي', 'الادعاءات الرئيسية', 'الأدلة', 'الاختلافات', 'ما الذي لا نعرفه'],
  },
  markets: {
    label: 'الأسواق والاستثمار',
    sources: ['بيانات السوق', 'إفصاحات الشركات', 'الأخبار', 'المحللون', 'المناقشات'],
    outputs: ['Catalyst', 'Risk', 'Market Context', 'Evidence Score', 'What changed', 'Watch levels'],
  },
  government: {
    label: 'الجهات والمنافسات',
    sources: ['المواقع الرسمية', 'منصات المنافسات', 'الوثائق', 'الأخبار الرسمية', 'المراسلات عند الربط'],
    outputs: ['Opportunity Brief', 'Deadline', 'Requirements', 'Stakeholders', 'Risks', 'Next actions'],
  },
  companies: {
    label: 'الشركات والمبيعات',
    sources: ['الموقع الرسمي', 'الأخبار', 'الوظائف', 'التقنيات', 'ملفات الشركة'],
    outputs: ['Account 360', 'Buying signals', 'Decision makers', 'Pain points', 'Opportunities', 'Next move'],
  },
  technology: {
    label: 'التقنية وGitHub',
    sources: ['GitHub', 'Documentation', 'Releases', 'Issues/PRs', 'Security advisories'],
    outputs: ['Architecture', 'Value', 'Maturity', 'Security', 'License', 'Adoption plan'],
  },
  politics: {
    label: 'السياسة والجغرافيا',
    sources: ['وكالات الأنباء', 'المصادر الرسمية', 'مراكز الأبحاث', 'وسائل إعلام متعددة الاتجاهات'],
    outputs: ['What happened', 'Timeline', 'Actors', 'Claims vs evidence', 'Scenarios', 'Uncertainty'],
  },
  science: {
    label: 'العلوم والصحة',
    sources: ['الأبحاث المحكمة', 'الجهات الصحية الرسمية', 'المراجعات المنهجية', 'المراجع العلمية'],
    outputs: ['Evidence summary', 'Study quality', 'Consensus', 'Limitations', 'Safety notes', 'Open questions'],
  },
  cyber: {
    label: 'الأمن السيبراني',
    sources: ['Vendor advisories', 'CVE/NVD', 'CERTs', 'Research blogs', 'GitHub'],
    outputs: ['Exposure', 'Severity', 'Affected versions', 'Mitigation', 'Evidence', 'Priority'],
  },
  media: {
    label: 'الإعلام والمحتوى',
    sources: ['Video', 'Audio', 'Social', 'News', 'Transcripts'],
    outputs: ['Transcript', 'Entities', 'Claims', 'Narrative', 'Risk', 'Key moments'],
  },
  documents: {
    label: 'الملفات والوثائق',
    sources: ['PDF', 'Word', 'Excel', 'Images', 'Attachments'],
    outputs: ['Executive summary', 'Key clauses', 'Deadlines', 'Numbers', 'Risks', 'Action list'],
  },
};

const modeDescriptions = {
  quick: 'إجابة مختصرة تركّز على أهم ما يمكن إثباته بسرعة.',
  deep: 'بحث أعمق متعدد المصادر مع فجوات الأدلة والتعارضات.',
  compare: 'مقارنة منظمة بين بدائل أو جهات أو تقنيات أو روايات.',
  verify: 'التحقق من ادعاء واحد وتحديد ما يؤيده وما يناقضه.',
  timeline: 'بناء تسلسل زمني للأحداث مع فصل المؤكد عن غير المؤكد.',
  decision: 'تحويل البحث إلى مذكرة قرار: خيارات، مخاطر، أدلة، وخطوة تالية.',
};

app.get('/health', (_req, res) => res.json({
  ok: true,
  service: 'asiri-research-intelligence-preview',
  version: '3.0-universal-intelligence',
  engine: 'vane-inspired-ui',
  liveResearch: false,
  liveMarketContext: true,
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
    evidence_policy: [
      'لا يرفع مستوى الثقة أي ادعاء خارجي بلا مصدر قابل للمراجعة.',
      'يجب فصل الحقائق عن الاستنتاجات والسيناريوهات.',
      'التعارض بين المصادر يظهر كفجوة أدلة ولا يتم إخفاؤه.',
      'التاريخ والوقت ونوع المصدر جزء من سجل الدليل عند ربط Vane/SearxNG.',
    ],
    backend_state: 'planning-ready / external-search-disconnected',
  });
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
  console.log(`ASIRI Research Intelligence v3 listening on ${port}`);
});
