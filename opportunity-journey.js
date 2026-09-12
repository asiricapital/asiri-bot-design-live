/* Asiri Opportunity Journey · verified data + decision room v3 */
(() => {
    'use strict';

    if (window.__asiriOpportunityJourneyV3) return;
    window.__asiriOpportunityJourneyV3 = true;

    const TECHNICALS_ENDPOINT = 'https://asiri-bot.onrender.com/api/live-terminal/technicals';
    const TECHNICAL_CACHE_MS = 60 * 1000;
    const CARD_REFRESH_MS = 15 * 1000;
    const technicalsCache = new Map();
    let refreshInFlight = false;
    let refreshTimer = null;

    const finiteNumber = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    };

    const escapeMarkup = (value) => String(value ?? '').replace(/[<>&"']/g, (character) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    })[character]);

    function quoteHealth(item) {
        try {
            if (window.asiriQuoteDataHealth?.classifyQuote) {
                return window.asiriQuoteDataHealth.classifyQuote(item, Date.now());
            }
        } catch (_) { /* Fall through to the conservative local classifier. */ }

        const price = finiteNumber(item?.price);
        if (price === null) return { state: 'UNAVAILABLE' };
        return { state: item?.isFresh === true ? 'FRESH' : 'DELAYED' };
    }

    const quoteStateView = (state) => ({
        FRESH: { label: 'حديثة الآن', cls: 'fresh' },
        DELAYED: { label: 'إغلاق أو متأخرة', cls: 'delayed' },
        STALE: { label: 'قراءة قديمة', cls: 'stale' },
        UNAVAILABLE: { label: 'غير متاحة', cls: 'unavailable' }
    })[state] || { label: 'قيد التحقق', cls: 'unavailable' };

    function formatObservedAt(item) {
        const raw = item?.observedAt || item?.receivedAt || item?.updatedAt || item?.time;
        const date = new Date(raw || '');
        if (Number.isNaN(date.getTime())) return 'لم يصل وقت موثق';
        return date.toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    }

    function technicalQuality(payload) {
        const indicators = payload?.indicators;
        const available = payload?.availability === 'available' || payload?.ok === true;
        if (!available || !indicators) return null;
        return {
            indicators,
            source: payload.source || 'محرك ASIRI الفني',
            endOfHistory: payload.endOfHistory || null,
            candles: finiteNumber(payload.candles),
            stale: payload?.historyStatus === 'STALE' || payload?.freshness?.isStale === true
        };
    }

    async function getTechnicals(symbol) {
        const cached = technicalsCache.get(symbol);
        if (cached && Date.now() - cached.storedAt < TECHNICAL_CACHE_MS) return cached.value;

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetch(`${TECHNICALS_ENDPOINT}/${encodeURIComponent(symbol)}?_=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal
            });
            if (!response.ok) return null;
            const value = technicalQuality(await response.json());
            technicalsCache.set(symbol, { storedAt: Date.now(), value });
            return value;
        } catch (_) {
            return null;
        } finally {
            window.clearTimeout(timeout);
        }
    }

    function ensureEnhancedMarkup() {
        const card = document.getElementById('opportunity-day-card');
        if (!card) return;

        const badge = card.querySelector('.opportunity-badge');
        if (badge) badge.textContent = 'مرشح اليوم · قيد التحقق';

        const journeyBox = card.querySelector('.opportunity-journey-box');
        if (journeyBox && journeyBox.dataset.version !== '2') {
            journeyBox.dataset.version = '2';
            journeyBox.innerHTML = `
                <div class="journey-title-row">
                    <p class="section-header-meta">مسار رحلة الفرصة · OPPORTUNITY JOURNEY</p>
                    <span id="opt-current-stage" class="journey-stage-pill">جارٍ التحقق</span>
                </div>
                <div class="journey-path" id="opt-journey-path" aria-label="مراحل التحقق من فرصة اليوم">
                    <div class="journey-node" data-step="observe"><div class="node-dot">1</div><span class="node-label">رصد</span><small class="node-state">—</small></div>
                    <div class="journey-node" data-step="quote"><div class="node-dot">2</div><span class="node-label">السعر</span><small class="node-state">—</small></div>
                    <div class="journey-node" data-step="technical"><div class="node-dot">3</div><span class="node-label">البيانات الفنية</span><small class="node-state">—</small></div>
                    <div class="journey-node" data-step="risk"><div class="node-dot">4</div><span class="node-label">المخاطر</span><small class="node-state">—</small></div>
                    <div class="journey-node" data-step="review"><div class="node-dot">5</div><span class="node-label">مراجعة بشرية</span><small class="node-state">—</small></div>
                </div>`;
        }

        if (!document.getElementById('opt-data-truth')) {
            const analysisGrid = card.querySelector('.opportunity-analysis-grid');
            analysisGrid?.insertAdjacentHTML('afterend', `
                <section id="opt-data-truth" class="opportunity-data-truth" aria-live="polite">
                    <div class="data-truth-head">
                        <div><span class="data-truth-kicker">DATA TRUTH</span><b>حالة القراءة المستخدمة</b></div>
                        <span id="opt-quote-state" class="truth-status unavailable">قيد التحقق</span>
                    </div>
                    <div class="data-truth-grid">
                        <div><span>مصدر السعر</span><b id="opt-source">قيد التحقق</b></div>
                        <div><span>وقت الرصد</span><b id="opt-observed-at">قيد التحقق</b></div>
                        <div><span>السجل الفني</span><b id="opt-technical-state">قيد التحقق</b></div>
                    </div>
                    <p id="opt-data-note">لن تُستكمل رحلة الفرصة بقيم ناقصة أو مفترضة.</p>
                </section>`);
        }

        if (!document.getElementById('opt-decision-room')) {
            const truthPanel = document.getElementById('opt-data-truth');
            truthPanel?.insertAdjacentHTML('afterend', `
                <section id="opt-decision-room" class="opportunity-decision-room" aria-live="polite">
                    <div class="decision-room-head">
                        <div><span class="decision-room-kicker">ASIRI DECISION ROOM</span><b>قرار المتابعة الآن</b></div>
                        <span id="opt-decision-status" class="decision-status pending">قيد التحقق</span>
                    </div>
                    <div class="decision-room-summary" aria-label="ملخص قرار المتابعة">
                        <article>
                            <span>الوضع</span>
                            <strong id="opt-decision-mode">قيد التحقق</strong>
                            <small>وصف تشغيلي، لا توصية</small>
                        </article>
                        <article>
                            <span>الأدلة المتاحة</span>
                            <strong id="opt-decision-evidence-count">—</strong>
                            <small>حقائق ظاهرة فقط</small>
                        </article>
                        <article class="next-step">
                            <span>الخطوة الآمنة</span>
                            <strong id="opt-decision-next">انتظار البيانات</strong>
                            <small>قبل المراجعة البشرية</small>
                        </article>
                    </div>
                    <details class="decision-room-details">
                        <summary><span>لماذا؟ وما الذي ينقص؟</span><small>عرض الأدلة والبوابات</small></summary>
                        <div class="decision-evidence-grid">
                            <div>
                                <b>ما يدعم المتابعة</b>
                                <ul id="opt-decision-signals"><li>قيد التحقق من البيانات</li></ul>
                            </div>
                            <div class="decision-blockers">
                                <b>بوابات لم تُستكمل</b>
                                <ul id="opt-decision-blockers"><li>فحص المخاطر والمراجعة البشرية</li></ul>
                            </div>
                        </div>
                    </details>
                    <p class="decision-safety"><b>حد الأمان:</b> لا شراء، لا بيع، ولا تنفيذ آلي من هذه اللوحة.</p>
                </section>`);
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    function setMetric(id, value, available) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = available ? value : 'قيد التحقق';
        element.classList.toggle('is-pending', !available);
    }

    function setList(id, items, fallback) {
        const element = document.getElementById(id);
        if (!element) return;
        const rows = items.length ? items : [fallback];
        element.innerHTML = rows.map((item) => `<li>${escapeMarkup(item)}</li>`).join('');
    }

    function momentumLabel(rsi) {
        if (rsi === null) return null;
        if (rsi >= 70) return `RSI ${Math.round(rsi)} · زخم مرتفع يحتاج حذرًا`;
        if (rsi <= 30) return `RSI ${Math.round(rsi)} · تشبع بيعي محتمل يحتاج تحققًا`;
        return `RSI ${Math.round(rsi)} · زخم ضمن النطاق الوسطي`;
    }

    function buildDecisionBrief({ item, state, technicals, quoteReady, technicalReady, rsi, volumeRatio }) {
        const signals = [];
        const blockers = [];
        const price = finiteNumber(item?.price);

        if (quoteReady && price !== null) signals.push(`سعر موثق ظاهر: $${price.toFixed(2)}`);
        if (technicals?.indicators?.trendLabel) signals.push(`الاتجاه التاريخي: ${technicals.indicators.trendLabel}`);
        const momentum = momentumLabel(rsi);
        if (momentum) signals.push(momentum);
        if (volumeRatio !== null) signals.push(`الحجم: ${volumeRatio.toFixed(2)}× من المتوسط`);

        if (!quoteReady) blockers.push('لا توجد قراءة سعر موثقة صالحة للتحليل.');
        else if (state !== 'FRESH') blockers.push('السعر ليس لحظيًا؛ يبقى المرشح للمراقبة فقط.');
        if (!technicals) blockers.push('السجل الفني غير متاح من المصدر.');
        else if (technicals.stale) blockers.push('السجل الفني متأخر ويحتاج تحديثًا.');
        else if (!technicalReady) blockers.push('المؤشرات الفنية غير مكتملة.');
        blockers.push('ملاءمة المخاطر مع المحفظة لم تُفحص بعد.');
        blockers.push('المراجعة البشرية مطلوبة قبل أي قرار.');

        if (!quoteReady) {
            return { status: 'متوقف', cls: 'unavailable', mode: 'لا قرار', next: 'انتظر سعرًا موثقًا', signals, blockers };
        }
        if (state !== 'FRESH' || technicals?.stale) {
            return { status: 'مراقبة فقط', cls: 'watch', mode: 'انتظار منضبط', next: 'حدّث القراءة أولًا', signals, blockers };
        }
        if (!technicalReady) {
            return { status: 'قيد التحقق', cls: 'pending', mode: 'بيانات غير مكتملة', next: 'أكمل السجل الفني', signals, blockers };
        }
        return { status: 'جاهز لفحص المخاطر', cls: 'ready', mode: 'فحص المخاطر', next: 'تحقق من ملاءمة المحفظة', signals, blockers };
    }

    function renderDecisionRoom(context) {
        const brief = buildDecisionBrief(context);
        const status = document.getElementById('opt-decision-status');
        if (status) {
            status.textContent = brief.status;
            status.className = `decision-status ${brief.cls}`;
        }
        setText('opt-decision-mode', brief.mode);
        setText('opt-decision-evidence-count', `${brief.signals.length} ${brief.signals.length === 1 ? 'إشارة فعلية' : 'إشارات فعلية'}`);
        setText('opt-decision-next', brief.next);
        setList('opt-decision-signals', brief.signals, 'لا توجد إشارة مكتملة بعد.');
        setList('opt-decision-blockers', brief.blockers, 'لا توجد بوابات معلّقة.');
    }

    function updateJourneyPath({ quoteReady, technicalReady, riskReady = false }) {
        const steps = [
            { key: 'observe', completed: true, label: 'تم الرصد' },
            { key: 'quote', completed: quoteReady, label: quoteReady ? 'موثق' : 'بانتظار السعر' },
            { key: 'technical', completed: technicalReady, label: technicalReady ? 'مكتمل' : 'بانتظار السجل' },
            { key: 'risk', completed: riskReady, label: riskReady ? 'مكتمل' : 'غير مكتمل' },
            { key: 'review', completed: false, label: 'مقفلة حتى الاكتمال' }
        ];
        const firstPending = steps.findIndex((step) => !step.completed);

        document.querySelectorAll('#opt-journey-path .journey-node').forEach((node, index) => {
            const step = steps[index];
            if (!step) return;
            node.classList.toggle('completed', step.completed);
            node.classList.toggle('active', index === firstPending);
            node.classList.toggle('blocked', index > firstPending);
            const state = node.querySelector('.node-state');
            if (state) state.textContent = step.label;
            node.setAttribute('aria-current', index === firstPending ? 'step' : 'false');
        });

        const currentStage = document.getElementById('opt-current-stage');
        if (currentStage) {
            currentStage.textContent = !quoteReady ? 'بانتظار سعر موثق'
                : !technicalReady ? 'بانتظار البيانات الفنية'
                    : !riskReady ? 'التالي: فحص المخاطر'
                        : 'جاهزة للمراجعة البشرية';
            currentStage.className = `journey-stage-pill ${riskReady ? 'ready' : 'pending'}`;
        }
    }

    function renderTruthPanel(item, state, technicals) {
        const view = quoteStateView(state);
        const stateElement = document.getElementById('opt-quote-state');
        if (stateElement) {
            stateElement.textContent = view.label;
            stateElement.className = `truth-status ${view.cls}`;
        }
        setText('opt-source', item?.source || item?.provider || 'المصدر لم يُذكر');
        setText('opt-observed-at', formatObservedAt(item));
        setText('opt-technical-state', technicals
            ? `${technicals.stale ? 'متأخر' : 'متاح'}${technicals.candles ? ` · ${technicals.candles} شمعة` : ''}`
            : 'غير متاح من المصدر');
        setText('opt-data-note', technicals?.stale
            ? 'السجل الفني متأخر؛ تبقى الفرصة للمراقبة ولا تنتقل إلى المراجعة.'
            : technicals
                ? 'اكتملت قراءة السعر والسجل الفني؛ يلزم فحص المخاطر قبل المراجعة البشرية.'
                : 'السعر ظاهر، لكن المؤشرات لن تُستبدل بقيم تقديرية أو تجريبية.');
    }

    function chooseCandidate() {
        if (typeof stockMarketData === 'undefined') return null;
        const rows = Object.values(stockMarketData).filter((item) => item?.symbol);
        if (!rows.length) return null;
        const priority = { FRESH: 0, DELAYED: 1, STALE: 2, UNAVAILABLE: 3 };
        return rows.sort((left, right) => {
            const stateDifference = (priority[quoteHealth(left).state] ?? 4) - (priority[quoteHealth(right).state] ?? 4);
            if (stateDifference) return stateDifference;
            return String(left.symbol).localeCompare(String(right.symbol));
        })[0];
    }

    async function updateOpportunityCard() {
        if (refreshInFlight) return;
        refreshInFlight = true;
        try {
            ensureEnhancedMarkup();
            const item = chooseCandidate();
            if (!item) {
                setText('opt-symbol', '—');
                setText('opt-price', 'غير متاح');
                setText('opt-reason', 'أضف رمزًا إلى قائمة المتابعة لبدء رحلة فرصة موثقة.');
                renderDecisionRoom({ item: null, state: 'UNAVAILABLE', technicals: null, quoteReady: false, technicalReady: false, rsi: null, volumeRatio: null });
                updateJourneyPath({ quoteReady: false, technicalReady: false });
                return;
            }

            const symbol = String(item.symbol).toUpperCase();
            const price = finiteNumber(item.price);
            const state = quoteHealth(item).state;
            const quoteReady = price !== null && state !== 'UNAVAILABLE';
            const technicals = quoteReady ? await getTechnicals(symbol) : null;
            const indicators = technicals?.indicators || null;
            const rsi = finiteNumber(indicators?.rsi14);
            const historicalVolumeRatio = finiteNumber(indicators?.historicalVolumeRatio);
            const quoteVolumeRatio = finiteNumber(item?.volumeRatio)
                ?? (finiteNumber(item?.volume) !== null && finiteNumber(item?.averageVolume) > 0
                    ? finiteNumber(item.volume) / finiteNumber(item.averageVolume)
                    : null);
            const volumeRatio = historicalVolumeRatio ?? quoteVolumeRatio;
            const technicalReady = Boolean(technicals && (rsi !== null || volumeRatio !== null));

            setText('opt-symbol', symbol);
            setText('opt-price', quoteReady ? `$${price.toFixed(2)}` : 'غير متاح');
            setMetric('opt-momentum', rsi !== null ? String(Math.round(rsi)) : '', rsi !== null);
            setMetric('opt-liquidity', volumeRatio !== null ? `${volumeRatio.toFixed(2)}×` : '', volumeRatio !== null);
            renderTruthPanel(item, state, technicals);
            renderDecisionRoom({ item, state, technicals, quoteReady, technicalReady, rsi, volumeRatio });

            if (!quoteReady) {
                setText('opt-reason', `تم رصد ${symbol}، لكن لا توجد قراءة سعر موثقة صالحة لبناء التحليل.`);
            } else if (!technicalReady) {
                setText('opt-reason', `سعر ${symbol} موثق، وبانتظار سجل تاريخي كافٍ من المصدر لإظهار الزخم والسيولة دون تخمين.`);
            } else {
                const evidence = [];
                if (indicators?.trendLabel) evidence.push(`الاتجاه: ${indicators.trendLabel}`);
                if (rsi !== null) evidence.push(`RSI ${Math.round(rsi)}`);
                if (volumeRatio !== null) evidence.push(`الحجم ${volumeRatio.toFixed(2)}×`);
                setText('opt-reason', `اكتملت قراءة ${symbol} الفنية (${evidence.join(' · ') || 'بيانات موثقة'}). المرحلة التالية هي فحص المخاطر، ثم المراجعة البشرية؛ لا يوجد أمر تنفيذ.`);
            }

            updateJourneyPath({ quoteReady, technicalReady, riskReady: false });
            const telegramPreview = document.getElementById('telegram-alert-preview');
            if (telegramPreview) telegramPreview.hidden = true;
        } finally {
            refreshInFlight = false;
        }
    }

    function boot() {
        ensureEnhancedMarkup();
        window.setTimeout(updateOpportunityCard, 1200);
        refreshTimer = window.setInterval(updateOpportunityCard, CARD_REFRESH_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) updateOpportunityCard();
        });
    }

    window.asiriOpportunity = {
        refresh: updateOpportunityCard,
        clearCache() {
            technicalsCache.clear();
            return updateOpportunityCard();
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.addEventListener('pagehide', () => {
        if (refreshTimer) window.clearInterval(refreshTimer);
    }, { once: true });
})();
