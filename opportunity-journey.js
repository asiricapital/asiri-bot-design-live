/* Asiri Opportunity Journey & Card of the Day Logic · Design Environment v2 */
(() => {
    'use strict';

    function updateOpportunityCard() {
        if (typeof stockMarketData === 'undefined') return;

        const symbols = Object.keys(stockMarketData);
        if (!symbols.length) return;

        // Logic to pick "Opportunity of the Day"
        // In this design phase, we prioritize FRESH stocks with volume data
        let bestSymbol = null;
        let bestItem = null;

        for (const sym of symbols) {
            const item = stockMarketData[sym];
            if (item.isFresh && item.price && item.volume) {
                bestSymbol = sym;
                bestItem = item;
                break;
            }
        }

        if (!bestSymbol) {
            bestSymbol = symbols[0];
            bestItem = stockMarketData[bestSymbol];
        }

        // Update UI elements
        const symbolEl = document.getElementById('opt-symbol');
        const priceEl = document.getElementById('opt-price');
        const reasonEl = document.getElementById('opt-reason');
        const momentumEl = document.getElementById('opt-momentum');
        const liquidityEl = document.getElementById('opt-liquidity');
        const tgPreview = document.getElementById('telegram-alert-preview');
        const tgContent = document.getElementById('tg-message-content');

        if (symbolEl) symbolEl.textContent = bestSymbol;
        if (priceEl) priceEl.textContent = bestItem.price ? `$${Number(bestItem.price).toFixed(2)}` : 'غير متاح';
        
        // Simulated Analysis for Design Environment
        const rsi = Math.floor(Math.random() * (70 - 40) + 40); // Simulated RSI
        const volRatio = (Math.random() * (2.5 - 0.8) + 0.8).toFixed(2); // Simulated Vol Ratio
        
        if (momentumEl) momentumEl.textContent = rsi;
        if (liquidityEl) liquidityEl.textContent = `x${volRatio}`;

        if (reasonEl) {
            if (bestItem.isFresh) {
                const momentumText = rsi > 60 ? 'زخم صاعد قوي' : rsi < 40 ? 'منطقة تجميع' : 'زخم مستقر';
                const liquidityText = volRatio > 1.5 ? 'سيولة مرتفعة' : 'سيولة طبيعية';
                
                reasonEl.textContent = `سهم ${bestSymbol} يظهر ${momentumText} و ${liquidityText}. البيانات الموثقة من ${bestItem.source || 'Yahoo'} تدعم الانتقال لمرحلة المراجعة البشرية.`;
                updateJourneyPath('review');
                showTelegramPreview(bestSymbol, bestItem.price, rsi, volRatio);
            } else {
                reasonEl.textContent = `سهم ${bestSymbol} قيد الرصد؛ بانتظار اكتمال القراءة الموثقة وتحديث مؤشرات السيولة لتفعيل مسار التحليل.`;
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

    function showTelegramPreview(symbol, price, rsi, volRatio) {
        const tgPreview = document.getElementById('telegram-alert-preview');
        const tgContent = document.getElementById('tg-message-content');
        if (!tgPreview || !tgContent) return;

        const time = new Date().toLocaleTimeString('ar-SA');
        const message = `🚨 تنبيه ASIRI: فرصة مكتملة البيانات\n` +
                        `--------------------------\n` +
                        `الرمز: ${symbol}\n` +
                        `السعر: $${Number(price).toFixed(2)}\n` +
                        `الزخم (RSI): ${rsi}\n` +
                        `السيولة (Vol): x${volRatio}\n` +
                        `الحالة: جاهز للمراجعة البشرية\n` +
                        `الوقت: ${time}\n` +
                        `المصدر: موثق (Snapshot v29)\n` +
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
