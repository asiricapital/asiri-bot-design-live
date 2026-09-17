/* Asiri Opportunity Journey & Card of the Day Logic · Design Environment v3 */
(() => {
    'use strict';

    // Internal cache for technical snapshots to avoid redundant calculations
    const technicalsCache = new Map();
    const xSentimentCache = new Map();

    async function getTechnicals(symbol) {
        if (technicalsCache.has(symbol)) return technicalsCache.get(symbol);
        
        try {
            // Attempt to fetch real technicals from the design environment's service
            // This usually fetches history and calculates RSI/VolumeRatio
            const response = await fetch(`/api/technicals/${symbol}`);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.ok && data.indicators) {
                technicalsCache.set(symbol, data.indicators);
                return data.indicators;
            }
        } catch (e) {
            console.warn(`Could not fetch real technicals for ${symbol}`, e);
        }
        return null;
    }

    async function getXSentiment(symbol) {
        if (xSentimentCache.has(symbol)) return xSentimentCache.get(symbol);
        try {
            const response = await fetch(`https://asiri-bot.onrender.com/api/x-sentiment/${encodeURIComponent(symbol)}`, { cache: 'no-store' });
            const data = await response.json();
            xSentimentCache.set(symbol, data);
            return data;
        } catch {
            return { symbol, status: 'unavailable', label: 'غير متاح', posts: 0, score: null, source: 'X public posts' };
        }
    }

    function renderXSentiment(data) {
        const status = document.getElementById('opt-x-status');
        const label = document.getElementById('opt-x-label');
        const score = document.getElementById('opt-x-score');
        const posts = document.getElementById('opt-x-posts');
        const asof = document.getElementById('opt-x-asof');
        if (!data) return;
        if (status) { status.textContent = data.status === 'live' ? 'موثق الآن' : data.status === 'stale' ? 'قديم' : 'غير متاح'; status.className = `x-status ${data.status || 'unavailable'}`; }
        if (label) label.textContent = data.label || 'غير متاح';
        if (score) score.textContent = Number.isFinite(Number(data.score)) ? `${data.score}/100` : '—';
        if (posts) posts.textContent = Number.isFinite(Number(data.posts)) ? data.posts : '—';
        if (asof) asof.textContent = data.asOf ? `آخر قراءة: ${new Date(data.asOf).toLocaleString('ar-SA')} · المصدر: X public posts` : 'لم يتم توثيق قراءة من X بعد.';
    }

    async function updateOpportunityCard() {
        if (typeof stockMarketData === 'undefined') return;

        const symbols = Object.keys(stockMarketData);
        if (!symbols.length) return;

        // Logic to pick "Opportunity of the Day"
        // Prioritize symbols that have real technical data and are fresh
        let bestSymbol = null;
        let bestItem = null;
        let bestTechnicals = null;

        // Sort symbols by price or volume to find a candidate
        const candidates = symbols.filter(s => stockMarketData[s].isFresh);
        
        for (const sym of candidates) {
            const tech = await getTechnicals(sym);
            if (tech && tech.quality >= 60) {
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
        const momentumEl = document.getElementById('opt-momentum');
        const liquidityEl = document.getElementById('opt-liquidity');
        const tgPreview = document.getElementById('telegram-alert-preview');

        if (symbolEl) symbolEl.textContent = bestSymbol;
        if (priceEl) priceEl.textContent = bestItem.price ? `$${Number(bestItem.price).toFixed(2)}` : 'غير متاح';
        renderXSentiment(await getXSentiment(bestSymbol));
        
        // Use real technicals if available, fallback to quote volumeRatio or simulation
        const rsi = bestTechnicals?.rsi14 ? Math.round(bestTechnicals.rsi14) : '—';
        const volRatio = bestTechnicals?.historicalVolumeRatio ? bestTechnicals.historicalVolumeRatio.toFixed(2) : 
                         (bestItem.volumeRatio ? bestItem.volumeRatio.toFixed(2) : '—');
        
        if (momentumEl) momentumEl.textContent = rsi;
        if (liquidityEl) liquidityEl.textContent = volRatio !== '—' ? `x${volRatio}` : '—';

        if (reasonEl) {
            if (bestItem.isFresh && bestTechnicals) {
                const momentumText = rsi !== '—' ? (rsi > 60 ? 'زخم صاعد قوي' : rsi < 40 ? 'منطقة تجميع' : 'زخم مستقر') : 'زخم غير مؤكد';
                const liquidityText = volRatio !== '—' ? (volRatio > 1.5 ? 'سيولة مرتفعة' : 'سيولة طبيعية') : 'سيولة عادية';
                const trendText = bestTechnicals.trendLabel || 'اتجاه غير محدد';
                
                reasonEl.textContent = `سهم ${bestSymbol} في مسار ${trendText} مع ${momentumText} و ${liquidityText}. البيانات الموثقة تدعم المراجعة البشرية.`;
                updateJourneyPath('review');
                showTelegramPreview(bestSymbol, bestItem.price, rsi, volRatio, trendText);
            } else {
                reasonEl.textContent = `سهم ${bestSymbol} قيد الرصد؛ بانتظار اكتمال القراءة الموثقة وتوفر البيانات التاريخية لتفعيل مسار التحليل الفني.`;
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
        const message = `🚨 تنبيه ASIRI: فرصة حقيقية مكتملة\n` +
                        `--------------------------\n` +
                        `الرمز: ${symbol}\n` +
                        `السعر: $${Number(price).toFixed(2)}\n` +
                        `الاتجاه: ${trend || '—'}\n` +
                        `الزخم (RSI): ${rsi}\n` +
                        `السيولة (Vol): x${volRatio}\n` +
                        `الحالة: جاهز للمراجعة البشرية\n` +
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
