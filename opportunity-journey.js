/* Asiri Opportunity Journey & Card of the Day Logic · Design Environment v3 */
// paperOnly=true · executionAllowed=false · execution disabled · no broker order path
(() => {
    'use strict';

    // The static site has no /api routes; technicals live on the Asiri backend.
    const TECHNICALS_ENDPOINT = 'https://asiri-bot.onrender.com/api/live-terminal/technicals';
    const X_SENTIMENT_ENDPOINT = 'https://asiri-bot.onrender.com/api/x-sentiment';
    const TECHNICAL_CACHE_MS = 5 * 60 * 1000;
    const X_CACHE_MS = 5 * 60 * 1000;
    const REQUEST_TIMEOUT_MS = 12000;
    const MAX_TECHNICAL_LOOKUPS = 6;

    // Short-lived caches (failures are cached too, so a dead source is not hammered on every quote refresh)
    const technicalsCache = new Map();
    const xSentimentCache = new Map();
    let refreshInFlight = false;
    let refreshQueued = false;

    const finiteNumber = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    };

    function readCache(cache, key, ttl) {
        const entry = cache.get(key);
        return entry && Date.now() - entry.storedAt < ttl ? entry : null;
    }

    async function fetchJson(url) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
            if (!response.ok) return null;
            return await response.json();
        } finally {
            window.clearTimeout(timer);
        }
    }

    async function getTechnicals(symbol) {
        const cached = readCache(technicalsCache, symbol, TECHNICAL_CACHE_MS);
        if (cached) return cached.value;

        let value = null;
        try {
            const data = await fetchJson(`${TECHNICALS_ENDPOINT}/${encodeURIComponent(symbol)}`);
            // Same contract as the technical-analysis panel: only trust an explicitly available snapshot
            if (data?.ok && data.availability === 'available' && data.indicators) value = data.indicators;
        } catch (e) {
            console.warn(`Could not fetch technicals for ${symbol}`, e);
        }
        technicalsCache.set(symbol, { storedAt: Date.now(), value });
        return value;
    }

    async function getXSentiment(symbol) {
        const cached = readCache(xSentimentCache, symbol, X_CACHE_MS);
        if (cached) return cached.value;
        const unavailable = { symbol, status: 'unavailable', label: 'غير متاح', posts: 0, score: null, source: 'X public posts' };
        let value = unavailable;
        try {
            value = (await fetchJson(`${X_SENTIMENT_ENDPOINT}/${encodeURIComponent(symbol)}`)) || unavailable;
        } catch { /* keep unavailable */ }
        xSentimentCache.set(symbol, { storedAt: Date.now(), value });
        return value;
    }

    function renderXSentiment(data) {
        const status = document.getElementById('opt-x-status');
        const label = document.getElementById('opt-x-label');
        const score = document.getElementById('opt-x-score');
        const posts = document.getElementById('opt-x-posts');
        const asof = document.getElementById('opt-x-asof');
        if (!data) return;
        if (status) { status.textContent = data.status === 'live' ? 'موثق الآن' : data.status === 'stale' ? 'قديم' : data.status === 'pending' ? 'جارٍ القراءة…' : 'غير متاح'; status.className = `x-status ${data.status || 'unavailable'}`; }
        if (label) label.textContent = data.label || 'غير متاح';
        if (score) score.textContent = Number.isFinite(Number(data.score)) ? `${data.score}/100` : '—';
        if (posts) { const postCount = data.posts ?? data.postCount; posts.textContent = Number.isFinite(Number(postCount)) ? postCount : '—'; }
        if (asof) asof.textContent = data.asOf ? `آخر قراءة: ${new Date(data.asOf).toLocaleString('ar-SA')} · المصدر: X public posts` : 'لم يتم توثيق قراءة من X بعد.';
    }

    // Called after every quote refresh; collapse overlapping calls into one trailing run.
    async function updateOpportunityCard() {
        if (refreshInFlight) { refreshQueued = true; return; }
        refreshInFlight = true;
        try {
            await renderOpportunityCard();
        } catch (e) {
            console.warn('Opportunity card refresh failed', e);
        } finally {
            refreshInFlight = false;
            if (refreshQueued) { refreshQueued = false; window.setTimeout(updateOpportunityCard, 0); }
        }
    }

    async function renderOpportunityCard() {
        if (typeof stockMarketData === 'undefined') return;

        const symbols = Object.keys(stockMarketData);
        if (!symbols.length) return;

        // Logic to pick "Opportunity of the Day"
        // Prioritize symbols that have real technical data and are fresh
        let bestSymbol = null;
        let bestItem = null;
        let bestTechnicals = null;

        // Sort symbols by price or volume to find a candidate
        const candidates = symbols.filter(s => stockMarketData[s]?.isFresh === true).slice(0, MAX_TECHNICAL_LOOKUPS);

        for (const sym of candidates) {
            const tech = await getTechnicals(sym);
            if (tech && finiteNumber(tech.quality) >= 60) {
                bestSymbol = sym;
                bestItem = stockMarketData[sym];
                bestTechnicals = tech;
                break;
            }
        }

        if (!bestSymbol) {
            bestSymbol = symbols[0];
            bestItem = stockMarketData[bestSymbol];
            bestTechnicals = await getTechnicals(bestSymbol);
        }

        // Update UI elements
        const symbolEl = document.getElementById('opt-symbol');
        const priceEl = document.getElementById('opt-price');
        const reasonEl = document.getElementById('opt-reason');
        const badgeEl = document.getElementById('opt-badge');
        const eligibilityEl = document.getElementById('opt-eligibility');
        const momentumEl = document.getElementById('opt-momentum');
        const liquidityEl = document.getElementById('opt-liquidity');
        const tgPreview = document.getElementById('telegram-alert-preview');

        if (symbolEl) symbolEl.textContent = bestSymbol;
        const price = finiteNumber(bestItem?.price);
        if (priceEl) priceEl.textContent = price !== null && price > 0 ? `$${price.toFixed(2)}` : 'غير متاح';
        if (badgeEl) badgeEl.textContent = 'مرشح اليوم — قيد التحقق';
        renderXSentiment(await getXSentiment(bestSymbol));

        // Real technicals only; fall back to the quote's own volume ratio, never to a synthetic value
        const rsiValue = finiteNumber(bestTechnicals?.rsi14);
        const volValue = finiteNumber(bestTechnicals?.historicalVolumeRatio) ?? finiteNumber(bestItem?.volumeRatio);
        const rsi = rsiValue === null ? '—' : Math.round(rsiValue);
        const volRatio = volValue === null ? '—' : volValue.toFixed(2);

        if (momentumEl) momentumEl.textContent = rsi;
        if (liquidityEl) liquidityEl.textContent = volValue === null ? '—' : `x${volRatio}`;

        if (reasonEl) {
            if (bestItem?.isFresh === true && bestTechnicals && price !== null) {
                const momentumText = rsiValue !== null ? (rsiValue > 60 ? 'زخم صاعد قوي' : rsiValue < 40 ? 'منطقة تجميع' : 'زخم مستقر') : 'زخم غير مؤكد';
                const liquidityText = volValue !== null ? (volValue > 1.5 ? 'سيولة مرتفعة' : 'سيولة طبيعية') : 'سيولة غير مؤكدة';
                const trendText = bestTechnicals.trendLabel || 'اتجاه غير محدد';
                
                reasonEl.textContent = `سهم ${bestSymbol} في مسار ${trendText} مع ${momentumText} و ${liquidityText}. البيانات الموثقة تدعم المراجعة البشرية.`;
                if (eligibilityEl) {
                    eligibilityEl.className = 'opportunity-eligibility review';
                    eligibilityEl.textContent = 'بيانات المرشح مكتملة للفحص الفني؛ هذه ليست إشارة شراء ولا أمر تنفيذ. لا يفتح مختبر ASIRI صفقة إلا بعد اكتمال البوابات الموحدة.';
                }
                updateJourneyPath('review');
                showTelegramPreview(bestSymbol, bestItem.price, rsi, volRatio, trendText);
            } else {
                reasonEl.textContent = `سهم ${bestSymbol} قيد الرصد؛ بانتظار اكتمال القراءة الموثقة وتوفر البيانات التاريخية لتفعيل مسار التحليل الفني.`;
                if (eligibilityEl) {
                    eligibilityEl.className = 'opportunity-eligibility blocked';
                    eligibilityEl.textContent = 'الشراء غير مؤهل: بيانات فنية أو تاريخية ناقصة. سيبقى السهم تحت المراقبة فقط.';
                }
                updateJourneyPath('analyze');
                if (tgPreview) tgPreview.hidden = true;
            }
        }
    }

    function updateJourneyPath(activeStep) {
        const nodes = document.querySelectorAll('#opt-journey-path .journey-node');
        const steps = ['observe', 'analyze', 'review', 'ready'];
        const activeIndex = steps.indexOf(activeStep);

        nodes.forEach((node, index) => {
            node.classList.remove('active', 'completed');
            if (index < activeIndex) {
                node.classList.add('completed');
            } else if (index === activeIndex) {
                node.classList.add('active');
            }
        });
    }

    function showTelegramPreview(symbol, price, rsi, volRatio, trend) {
        const tgPreview = document.getElementById('telegram-alert-preview');
        const tgContent = document.getElementById('tg-message-content');
        if (!tgPreview || !tgContent) return;

        const time = new Date().toLocaleTimeString('ar-SA');
        const message = `تنبيه ASIRI: مرشح للمراجعة — ليس أمر شراء\n` +
                        `--------------------------\n` +
                        `الرمز: ${symbol}\n` +
                        `السعر: $${Number(price).toFixed(2)}\n` +
                        `الاتجاه: ${trend || '—'}\n` +
                        `الزخم (RSI): ${rsi}\n` +
                        `السيولة (Vol): ${volRatio === '—' ? '—' : `x${volRatio}`}\n` +
                        `الحالة: مراجعة بشرية، دون تنفيذ\n` +
                        `الوقت: ${time}\n` +
                        `المصدر: محرك Asiri (بيانات حقيقية)\n` +
                        `--------------------------\n` +
                        `رابط المراجعة: https://asiri-bot.onrender.com`;
        
        tgContent.textContent = message;
        tgPreview.hidden = false;
    }

    // Export to window for access from index.html
    window.asiriOpportunity = {
        refresh: updateOpportunityCard
    };

    // Hook into the main refresh cycle if possible, or run independently
    window.addEventListener('load', () => {
        setTimeout(updateOpportunityCard, 1000); // Initial delay to wait for data
    });
})();
