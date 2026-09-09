/* Asiri Opportunity Journey & Card of the Day Logic · Design Environment */
(() => {
    'use strict';

    function updateOpportunityCard() {
        if (typeof stockMarketData === 'undefined') return;

        const symbols = Object.keys(stockMarketData);
        if (!symbols.length) return;

        // Logic to pick "Opportunity of the Day"
        // In this design phase, we pick the first 'FRESH' stock, or the first one available.
        let bestSymbol = null;
        for (const sym of symbols) {
            const item = stockMarketData[sym];
            if (item.isFresh && item.price) {
                bestSymbol = sym;
                break;
            }
        }

        if (!bestSymbol) bestSymbol = symbols[0];
        const item = stockMarketData[bestSymbol];
        
        // Update UI elements
        const symbolEl = document.getElementById('opt-symbol');
        const priceEl = document.getElementById('opt-price');
        const reasonEl = document.getElementById('opt-reason');
        const tgPreview = document.getElementById('telegram-alert-preview');
        const tgContent = document.getElementById('tg-message-content');

        if (symbolEl) symbolEl.textContent = bestSymbol;
        if (priceEl) priceEl.textContent = item.price ? `$${Number(item.price).toFixed(2)}` : 'غير متاح';
        
        if (reasonEl) {
            if (item.isFresh) {
                reasonEl.textContent = `سهم ${bestSymbol} يظهر جاهزية عالية في البيانات الموثقة مع استقرار في المصدر (${item.source || 'Yahoo'}). السياق الفني يدعم الانتقال لمرحلة المراجعة البشرية.`;
                updateJourneyPath('review');
                showTelegramPreview(bestSymbol, item.price);
            } else {
                reasonEl.textContent = `سهم ${bestSymbol} قيد الرصد؛ بانتظار اكتمال القراءة الموثقة وتحديث وقت حركة السعر لتفعيل مسار التحليل.`;
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

    function showTelegramPreview(symbol, price) {
        const tgPreview = document.getElementById('telegram-alert-preview');
        const tgContent = document.getElementById('tg-message-content');
        if (!tgPreview || !tgContent) return;

        const time = new Date().toLocaleTimeString('ar-SA');
        const message = `🚨 تنبيه ASIRI: فرصة مكتملة البيانات\n` +
                        `--------------------------\n` +
                        `الرمز: ${symbol}\n` +
                        `السعر: $${Number(price).toFixed(2)}\n` +
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
