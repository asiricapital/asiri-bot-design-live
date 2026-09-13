/* Asiri Opportunity Journey · plan simulator + manual portfolio limits v5 */
(() => {
    'use strict';

    if (window.__asiriOpportunityJourneyV5) return;
    window.__asiriOpportunityJourneyV5 = true;

    const TECHNICALS_ENDPOINT = 'https://asiri-bot.onrender.com/api/live-terminal/technicals';
    const TECHNICAL_CACHE_MS = 60 * 1000;
    const CARD_REFRESH_MS = 15 * 1000;
    const technicalsCache = new Map();
    let refreshInFlight = false;
    let refreshTimer = null;
    let latestOpportunityContext = null;
    const PORTFOLIO_REVIEW_MS = 5 * 60 * 1000;
    let portfolioConfirmedAt = null;
    let portfolioSymbol = null;
    const portfolioFields = {
        equity: 'opt-portfolio-equity', cash: 'opt-portfolio-cash', openRisk: 'opt-portfolio-open-risk',
        exposure: 'opt-portfolio-exposure', totalRiskPercent: 'opt-portfolio-total-limit', symbolPercent: 'opt-portfolio-symbol-limit'
    };

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

        if (!document.getElementById('opt-plan-simulator')) {
            const decisionRoom = document.getElementById('opt-decision-room');
            const safetyNote = decisionRoom?.querySelector('.decision-safety');
            safetyNote?.insertAdjacentHTML('beforebegin', `
                <section id="opt-plan-simulator" class="opportunity-plan-lab" aria-live="polite">
                    <div class="plan-lab-head">
                        <div><span class="plan-lab-kicker">ASIRI PLAN LAB</span><b>محاكي خطة الفرصة</b></div>
                        <span id="opt-plan-status" class="plan-status locked">مسودة مقفلة</span>
                    </div>
                    <p class="plan-lab-intro">حوّل القراءة المكتملة إلى سيناريو قياس قبل المراجعة. المستويات حسابية مبنية على ATR وليست توقعًا لحركة السعر.</p>
                    <div class="plan-controls">
                        <label><span>رأس المال المخصص ($)</span><input id="opt-plan-capital" type="number" min="1" step="100" inputmode="decimal" placeholder="أدخل المبلغ" autocomplete="off"></label>
                        <label><span>حد المخاطرة</span><select id="opt-plan-risk" aria-label="نسبة المخاطرة القصوى"><option value="0.5">0.5% · حذر</option><option value="1" selected>1% · منضبط</option><option value="2">2% · مرتفع</option></select></label>
                    </div>
                    <div id="opt-plan-gate" class="plan-gate locked">بانتظار سعر حديث وسجل فني مكتمل.</div>
                    <details class="plan-portfolio-inputs" open>
                        <summary>فحص حدود المحفظة <small>مدخلات يدوية · بالدولار</small></summary>
                        <p id="opt-portfolio-help">قائمة المتابعة لا تمثل كشف حساب. أدخل لقطة حديثة لمحفظة نقدية دون اقتراض أو بيع على المكشوف. اترك القيمة فارغة إذا كانت مجهولة؛ اكتب صفرًا فقط إذا تحققت منه.</p>
                        <div class="plan-controls portfolio-controls">
                            <label><span>قيمة المحفظة الكلية ($)</span><input id="opt-portfolio-equity" type="number" min="0.01" step="0.01" inputmode="decimal" autocomplete="off" placeholder="من كشف الحساب"></label>
                            <label><span>السيولة بعد حجز الأوامر ($)</span><input id="opt-portfolio-cash" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" placeholder="المتاح فقط"></label>
                            <label><span>المخاطرة القائمة والمحجوزة للأوامر ($)</span><input id="opt-portfolio-open-risk" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" placeholder="إجمالي الخسارة المقدرة إلى الوقف"></label>
                            <label><span>حيازة <b id="opt-portfolio-symbol">الرمز</b> مع الأوامر المعلقة ($)</span><input id="opt-portfolio-exposure" type="number" min="0" step="0.01" inputmode="decimal" autocomplete="off" placeholder="القيمة السوقية والمحجوزة"></label>
                            <label><span>حد المخاطرة الإجمالية (%)</span><input id="opt-portfolio-total-limit" type="number" min="0.01" max="100" step="0.01" inputmode="decimal" autocomplete="off" placeholder="حدد سياستك"></label>
                            <label><span>حد تركيز الرمز (%)</span><input id="opt-portfolio-symbol-limit" type="number" min="0.01" max="100" step="0.01" inputmode="decimal" autocomplete="off" placeholder="حدد سياستك"></label>
                        </div>
                        <label class="portfolio-confirm"><input id="opt-portfolio-confirm" type="checkbox" aria-describedby="opt-portfolio-help"><span>راجعت هذه القيم بالدولار لمحفظة نقدية. أي مركز بلا وقف أو مخاطرة معلومة يعني أن الفحص غير مكتمل.</span></label>
                        <p class="portfolio-expiry">التأكيد صالح لخمس دقائق، ويُلغى عند تعديل المدخلات أو تغيّر الرمز. القيم تبقى في هذه الصفحة فقط.</p>
                    </details>
                    <div class="portfolio-result" aria-live="polite" aria-atomic="true">
                        <b id="opt-portfolio-status">الفحص غير مكتمل</b>
                        <ul id="opt-portfolio-issues"><li>أدخل بيانات المحفظة وحدودها لتقدير الملاءمة.</li></ul>
                    </div>
                    <div class="plan-scenarios" aria-label="سيناريوهات محاكاة خطة الفرصة">
                        <article class="plan-scenario conservative" data-plan-scenario="conservative">
                            <div class="plan-scenario-title"><div><span>سيناريو 01</span><b>محافظ · انتظار تراجع</b></div><em>1.5R / 2R</em></div>
                            <div class="plan-levels">
                                <div><span>نطاق الدخول الافتراضي</span><b id="opt-plan-conservative-entry">—</b></div>
                                <div><span>وقف الحماية الحسابي</span><b id="opt-plan-conservative-stop">—</b></div>
                                <div><span>الهدف الأول</span><b id="opt-plan-conservative-target1">—</b></div>
                                <div><span>الهدف الثاني</span><b id="opt-plan-conservative-target2">—</b></div>
                            </div>
                            <div class="plan-position"><span id="opt-plan-conservative-size-label">كمية أولية · قبل فحص المحفظة</span><b id="opt-plan-conservative-quantity">أدخل رأس المال</b><small id="opt-plan-conservative-loss">خسارة مقدرة: —</small></div>
                            <p id="opt-plan-conservative-portfolio" class="scenario-portfolio"></p>
                        </article>
                        <article class="plan-scenario balanced" data-plan-scenario="balanced">
                            <div class="plan-scenario-title"><div><span>سيناريو 02</span><b>متوازن · قرب السعر</b></div><em>1.25R / 1.75R</em></div>
                            <div class="plan-levels">
                                <div><span>نطاق الدخول الافتراضي</span><b id="opt-plan-balanced-entry">—</b></div>
                                <div><span>وقف الحماية الحسابي</span><b id="opt-plan-balanced-stop">—</b></div>
                                <div><span>الهدف الأول</span><b id="opt-plan-balanced-target1">—</b></div>
                                <div><span>الهدف الثاني</span><b id="opt-plan-balanced-target2">—</b></div>
                            </div>
                            <div class="plan-position"><span id="opt-plan-balanced-size-label">كمية أولية · قبل فحص المحفظة</span><b id="opt-plan-balanced-quantity">أدخل رأس المال</b><small id="opt-plan-balanced-loss">خسارة مقدرة: —</small></div>
                            <p id="opt-plan-balanced-portfolio" class="scenario-portfolio"></p>
                        </article>
                    </div>
                    <div class="plan-budget-row"><span>ميزانية المخاطرة القصوى</span><b id="opt-plan-risk-budget">—</b></div>
                    <p class="plan-disclaimer"><b>محاكاة فقط:</b> السيناريوهان بديلان، وليسا عمليتين معًا. تُحسب الكمية والخسارة من أعلى دخول ظاهر إلى الوقف؛ الفجوات والانزلاق والرسوم قد تزيد الخسارة. اجتياز الحدود اليدوية لا يوثق المحفظة ولا يفتح التنفيذ أو يغني عن المراجعة البشرية.</p>
                </section>`);
        }

        bindPlanControls();
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

    function bindPlanControls() {
        const capital = document.getElementById('opt-plan-capital');
        const risk = document.getElementById('opt-plan-risk');
        const confirm = document.getElementById('opt-portfolio-confirm');
        [capital, risk, ...Object.values(portfolioFields).map((id) => document.getElementById(id)), confirm].forEach((control) => {
            if (!control || control.dataset.planBound === 'true') return;
            control.dataset.planBound = 'true';
            const eventName = control === confirm || control.tagName === 'SELECT' ? 'change' : 'input';
            control.addEventListener(eventName, () => {
                if (control === confirm) portfolioConfirmedAt = confirm.checked ? Date.now() : null;
                else {
                    portfolioConfirmedAt = null;
                    if (confirm) confirm.checked = false;
                }
                if (latestOpportunityContext) renderDecisionRoom(latestOpportunityContext);
            });
        });
    }

    function formatPlanPrice(value) {
        return Number.isFinite(value) ? `$${Math.max(0.01, value).toFixed(2)}` : '—';
    }

    function buildPlanScenario(price, atr, kind) {
        return window.asiriPlanRisk?.buildScenario(price, atr, kind) || null;
    }

    function positionForScenario(scenario, capital, riskPercent) {
        return window.asiriPlanRisk?.position(scenario, capital, riskPercent) || null;
    }

    function setPlanScenario(kind, scenario, position, locked) {
        const card = document.querySelector(`[data-plan-scenario="${kind}"]`);
        card?.classList.toggle('locked', locked);
        const prefix = `opt-plan-${kind}`;
        setText(`${prefix}-entry`, locked ? '—' : `${formatPlanPrice(scenario.entryLow)} – ${formatPlanPrice(scenario.entryHigh)}`);
        setText(`${prefix}-stop`, locked ? '—' : formatPlanPrice(scenario.stop));
        setText(`${prefix}-target1`, locked ? '—' : formatPlanPrice(scenario.target1));
        setText(`${prefix}-target2`, locked ? '—' : formatPlanPrice(scenario.target2));
        setText(`${prefix}-quantity`, locked ? 'محجوب حتى اكتمال البيانات' : position ? `${position.quantity.toLocaleString('ar-SA')} سهم` : 'أدخل رأس المال');
        setText(`${prefix}-loss`, locked || !position ? 'خسارة مقدرة: —' : `خسارة مقدرة عند الوقف: $${position.estimatedLoss.toFixed(2)}`);
        const assessed = position?.status === 'passed' || position?.status === 'blocked';
        setText(`${prefix}-size-label`, assessed ? 'الكمية بعد الحدود اليدوية' : 'كمية أولية · قبل فحص المحفظة');
        setText(`${prefix}-portfolio`, locked ? '' : assessed
            ? `${position.status === 'passed' ? 'ضمن الحدود المدخلة' : 'لا تتسع الحدود لسهم واحد'} · القيد: ${position.limitedBy.join('، ')}. السيولة المتبقية: $${position.cashAfter.toFixed(2)} · المخاطرة الإجمالية: ${position.totalRiskPercent.toFixed(2)}% · تركيز الرمز: ${position.symbolPercent.toFixed(2)}%.`
            : 'لم تُفحص هذه الكمية مقابل المحفظة.');
    }

    function reviewPortfolio(context, scenarios, capital, riskPercent, canSimulate) {
        const confirm = document.getElementById('opt-portfolio-confirm');
        const symbol = context?.item?.symbol || null;
        if (portfolioSymbol !== symbol) {
            if (portfolioSymbol !== null) {
                const exposure = document.getElementById(portfolioFields.exposure);
                if (exposure) exposure.value = '';
            }
            portfolioConfirmedAt = null;
            if (confirm) confirm.checked = false;
            portfolioSymbol = symbol;
        }
        setText('opt-portfolio-symbol', symbol || 'الرمز');
        const age = Date.now() - portfolioConfirmedAt;
        if (portfolioConfirmedAt !== null && (age < 0 || age >= PORTFOLIO_REVIEW_MS)) {
            portfolioConfirmedAt = null;
            if (confirm) confirm.checked = false;
        }
        const input = Object.fromEntries(Object.entries(portfolioFields).map(([key, id]) => [key, document.getElementById(id)?.value]));
        const validation = window.asiriPlanRisk?.validatePortfolio(input);
        const errors = validation?.errors || [];
        for (const [key, id] of Object.entries(portfolioFields)) {
            document.getElementById(id)?.setAttribute('aria-invalid', String(errors.some((error) => error.field === key)));
        }
        let result = { status: 'incomplete', positions: [] };
        let messages = errors.map((error) => error.message);
        if (!window.asiriPlanRisk) messages = ['تعذر تحميل حاسبة المخاطر؛ أعد تحميل الصفحة.'];
        else if (!canSimulate) messages = ['أكمل قراءة السعر والسجل الفني قبل فحص أي سيناريو.'];
        else if (!(capital > 0) || ![0.5, 1, 2].includes(riskPercent)) messages = ['أدخل مبلغًا مخصصًا صالحًا ونسبة مخاطرة من الخيارات المتاحة.'];
        else if (validation.ok && (!confirm?.checked || portfolioConfirmedAt === null)) messages = ['راجع القيم وأكّدها لتفعيل الفحص التقديري. يُجدد التأكيد بعد خمس دقائق.'];
        else if (validation.ok) {
            result.positions = scenarios.map((scenario) => window.asiriPlanRisk.assessPortfolio(scenario, capital, riskPercent, input));
            const failed = result.positions.find((p) => p.status === 'incomplete');
            if (failed) messages = failed.errors.map((error) => error.message);
            else {
                result.status = result.positions.every((p) => p.status === 'passed') ? 'passed' : 'blocked';
                messages = [result.status === 'passed' ? 'حُدّدت كمية كل سيناريو وفق السيولة والمخاطرة الإجمالية وتركيز الرمز.' : 'أحد السيناريوهات أو كلاهما لا يتسع لسهم واحد ضمن الحدود؛ راجع القيم والقيود الظاهرة.'];
                messages.push('هذه نتيجة مدخلاتك اليدوية. توثيق كشف المحفظة والمراجعة البشرية ما زالا مطلوبين.');
            }
        }
        setText('opt-portfolio-status', result.status === 'passed' ? 'اجتياز تقديري · بيانات يدوية' : result.status === 'blocked' ? 'الحدود لا تسمح بكمية' : 'الفحص غير مكتمل');
        setList('opt-portfolio-issues', messages, 'راجع مدخلات المحفظة.');
        return result;
    }

    function renderPlanSimulator(context) {
        const price = finiteNumber(context?.item?.price);
        const atr = finiteNumber(context?.technicals?.indicators?.atr14);
        const conservative = buildPlanScenario(price, atr, 'conservative');
        const balanced = buildPlanScenario(price, atr, 'balanced');
        const canSimulate = Boolean(
            context?.quoteReady
            && context?.state === 'FRESH'
            && context?.technicalReady
            && context?.technicals
            && !context.technicals.stale
            && atr > 0
            && price > 0
            && conservative && balanced
        );
        const capital = finiteNumber(document.getElementById('opt-plan-capital')?.value);
        const riskPercent = finiteNumber(document.getElementById('opt-plan-risk')?.value);
        const validBudget = Boolean(positionForScenario(conservative, capital, riskPercent));
        const status = document.getElementById('opt-plan-status');
        const gate = document.getElementById('opt-plan-gate');

        if (status) {
            status.textContent = canSimulate ? (validBudget ? 'محاكاة محسوبة' : 'جاهز للحساب') : 'مسودة مقفلة';
            status.className = `plan-status ${canSimulate ? (validBudget ? 'calculated' : 'ready') : 'locked'}`;
        }
        if (gate) {
            gate.textContent = !context?.quoteReady ? 'مقفل: لا توجد قراءة سعر موثقة.'
                : context.state !== 'FRESH' ? 'مسودة تعليمية: حدّث السعر اللحظي قبل إظهار المستويات.'
                    : !context?.technicals || context.technicals.stale ? 'مقفل: السجل الفني غير متاح أو متأخر.'
                        : !(atr > 0) ? 'مقفل: قيمة ATR غير متاحة لحساب حدود المخاطرة.'
                            : !canSimulate ? 'مقفل: البيانات أو مستويات الدخول والوقف لا تكفي لحساب صالح.'
                                : validBudget ? `الحساب مبني على ATR ${atr.toFixed(2)} ومخاطرة ${riskPercent}% من المبلغ المدخل، عند أعلى سعر دخول ظاهر.`
                                    : `المستويات جاهزة من ATR ${atr.toFixed(2)}؛ أدخل مبلغًا صالحًا ونسبة مخاطرة لحساب الكمية والخسارة المقدرة.`;
            gate.className = `plan-gate ${canSimulate ? 'ready' : 'locked'}`;
        }

        const portfolio = reviewPortfolio(context, [conservative, balanced], capital, riskPercent, canSimulate);
        const checked = ['passed', 'blocked'].includes(portfolio.status);
        const conservativePosition = canSimulate ? (checked ? portfolio.positions[0] : positionForScenario(conservative, capital, riskPercent)) : null;
        const balancedPosition = canSimulate ? (checked ? portfolio.positions[1] : positionForScenario(balanced, capital, riskPercent)) : null;
        setPlanScenario('conservative', conservative, conservativePosition, !canSimulate);
        setPlanScenario('balanced', balanced, balancedPosition, !canSimulate);
        setText('opt-plan-risk-budget', canSimulate && validBudget ? `$${positionForScenario(conservative, capital, riskPercent).riskBudget.toFixed(2)}` : '—');
        return portfolio;
    }

    function buildDecisionBrief({ item, state, technicals, quoteReady, technicalReady, rsi, volumeRatio, portfolio }) {
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
        blockers.push(portfolio?.status === 'passed' ? 'اجتاز الفحص التقديري؛ بيانات المحفظة اليدوية تحتاج توثيقًا بكشف الحساب.'
            : portfolio?.status === 'blocked' ? 'حدود المحفظة المدخلة لا تسمح بكمية؛ راجع القيود.' : 'ملاءمة المخاطر مع المحفظة لم تُفحص بعد.');
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
        return portfolio?.status === 'passed'
            ? { status: 'فحص تقديري مكتمل', cls: 'pending', mode: 'توثيق المحفظة', next: 'طابق القيم بكشف الحساب', signals, blockers }
            : { status: 'جاهز لفحص المخاطر', cls: 'ready', mode: 'فحص المخاطر', next: 'تحقق من ملاءمة المحفظة', signals, blockers };
    }

    function renderDecisionRoom(context) {
        const state = quoteHealth(context?.item).state;
        context = { ...context, state, quoteReady: finiteNumber(context?.item?.price) > 0 && state !== 'UNAVAILABLE' };
        const portfolio = renderPlanSimulator(context);
        context.portfolio = portfolio;
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
        latestOpportunityContext = context;
        updateJourneyPath({ ...context, riskReady: false, manualRiskStatus: portfolio.status });
    }

    function updateJourneyPath({ quoteReady, technicalReady, riskReady = false, manualRiskStatus }) {
        const steps = [
            { key: 'observe', completed: true, label: 'تم الرصد' },
            { key: 'quote', completed: quoteReady, label: quoteReady ? 'موثق' : 'بانتظار السعر' },
            { key: 'technical', completed: technicalReady, label: technicalReady ? 'مكتمل' : 'بانتظار السجل' },
            { key: 'risk', completed: riskReady, label: riskReady ? 'مكتمل' : manualRiskStatus === 'passed' ? 'تقديري · يحتاج توثيقًا' : 'غير مكتمل' },
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
                    : !riskReady ? (manualRiskStatus === 'passed' ? 'التالي: توثيق المحفظة' : 'التالي: فحص المخاطر')
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
            if (latestOpportunityContext) renderDecisionRoom(latestOpportunityContext);
            const telegramPreview = document.getElementById('telegram-alert-preview');
            if (telegramPreview) telegramPreview.hidden = true;
            const item = chooseCandidate();
            if (!item) {
                setText('opt-symbol', '—');
                setText('opt-price', 'غير متاح');
                setText('opt-reason', 'أضف رمزًا إلى قائمة المتابعة لبدء رحلة فرصة موثقة.');
                renderDecisionRoom({ item: null, state: 'UNAVAILABLE', technicals: null, quoteReady: false, technicalReady: false, rsi: null, volumeRatio: null });
                return;
            }

            const symbol = String(item.symbol).toUpperCase();
            const price = finiteNumber(item.price);
            const state = quoteHealth(item).state;
            const quoteReady = price !== null && state !== 'UNAVAILABLE';
            if (portfolioSymbol !== item.symbol) {
                renderDecisionRoom({ item, state, technicals: null, quoteReady, technicalReady: false, rsi: null, volumeRatio: null });
            }
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
        refreshPlan() {
            if (latestOpportunityContext) renderDecisionRoom(latestOpportunityContext);
        },
        clearCache() {
            technicalsCache.clear();
            return updateOpportunityCard();
        }
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();

    window.addEventListener('pagehide', () => {
        if (refreshTimer) window.clearInterval(refreshTimer);
        refreshTimer = null;
        portfolioConfirmedAt = null;
        const confirm = document.getElementById('opt-portfolio-confirm');
        if (confirm) confirm.checked = false;
    });
    window.addEventListener('pageshow', (event) => {
        if (!event.persisted) return;
        if (!refreshTimer) refreshTimer = window.setInterval(updateOpportunityCard, CARD_REFRESH_MS);
        if (latestOpportunityContext) renderDecisionRoom(latestOpportunityContext);
        updateOpportunityCard();
    });
})();
