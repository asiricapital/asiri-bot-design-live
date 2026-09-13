/* Pure arithmetic for the USD, cash-only opportunity simulator. No account access. */
(() => {
    'use strict';
    const number = (value) => {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        const text = String(value).trim();
        if (!text) return null;
        const parsed = Number(text);
        return Number.isFinite(parsed) ? parsed : null;
    };
    const money = (value) => Number.isFinite(value) && value >= 0 && value <= 1e10;
    const down = (value) => Math.floor(value * 100 + 1e-7);
    const up = (value) => Math.ceil(value * 100 - 1e-7);

    function buildScenario(price, atr, kind) {
        if (!money(price) || !money(atr) || price <= 0 || atr <= 0) return null;
        const conservative = kind === 'conservative';
        const low = down(price - atr * (conservative ? 0.35 : 0.15));
        const high = up(price + atr * (conservative ? -0.05 : 0.10));
        const stop = down(low / 100 - atr * (conservative ? 1.25 : 0.95));
        if (!(stop > 0 && stop < low && low <= high)) return null;
        const loss = high - stop;
        return {
            entryLow: low / 100, entryHigh: high / 100, stop: stop / 100,
            perShareRisk: loss / 100,
            target1: Math.ceil(high + loss * (conservative ? 1.5 : 1.25)) / 100,
            target2: Math.ceil(high + loss * (conservative ? 2 : 1.75)) / 100
        };
    }

    function position(scenario, capital, riskPercent) {
        if (!scenario || !money(capital) || capital <= 0 || ![0.5, 1, 2].includes(riskPercent)) return null;
        if (![scenario.entryLow, scenario.entryHigh, scenario.stop, scenario.perShareRisk].every(money)
            || !(scenario.stop > 0 && scenario.stop < scenario.entryLow && scenario.entryLow <= scenario.entryHigh)
            || Math.abs(scenario.perShareRisk - (scenario.entryHigh - scenario.stop)) > 1e-7) return null;
        const cost = up(scenario.entryHigh);
        const loss = up(scenario.perShareRisk);
        if (!(loss > 0 && cost > loss)) return null;
        const riskBudget = down(capital * riskPercent / 100);
        const quantity = Math.min(Math.floor(riskBudget / loss), Math.floor(down(capital) / cost));
        return { quantity, estimatedLoss: quantity * loss / 100, cost: quantity * cost / 100, riskBudget: riskBudget / 100 };
    }

    function validatePortfolio(input) {
        const labels = {
            equity: 'قيمة المحفظة', cash: 'السيولة المتاحة', openRisk: 'المخاطرة الحالية',
            exposure: 'قيمة حيازة الرمز', totalRiskPercent: 'حد المخاطرة الإجمالية', symbolPercent: 'حد تركيز الرمز'
        };
        const values = {};
        const errors = [];
        for (const [key, label] of Object.entries(labels)) {
            values[key] = number(input?.[key]);
            const isPercent = key.endsWith('Percent');
            if (values[key] === null || (isPercent ? !(values[key] > 0 && values[key] <= 100) : !money(values[key]))) {
                errors.push({ field: key, message: `أدخل ${label} ${isPercent ? 'بنسبة أكبر من صفر وحتى 100%.' : 'بالدولار (صفر قيمة صريحة، والفراغ غير معروف).'}` });
            }
        }
        if (errors.length) return { ok: false, errors, values };
        if (values.equity <= 0) errors.push({ field: 'equity', message: 'قيمة المحفظة يجب أن تكون أكبر من صفر.' });
        if (values.cash > values.equity) errors.push({ field: 'cash', message: 'السيولة المتاحة تتجاوز قيمة المحفظة.' });
        if (values.exposure + values.cash > values.equity + 1e-7) errors.push({ field: 'exposure', message: 'الحيازة مع السيولة تتجاوز قيمة المحفظة؛ راجع القيم.' });
        if (values.openRisk > values.equity - values.cash + 1e-7) errors.push({ field: 'openRisk', message: 'المخاطرة الحالية تتجاوز قيمة المراكز المحتملة في محفظة نقدية.' });
        return { ok: errors.length === 0, errors, values };
    }

    function assessPortfolio(scenario, capital, riskPercent, input) {
        const validation = validatePortfolio(input);
        const base = position(scenario, capital, riskPercent);
        if (!validation.ok || !base) return { status: 'incomplete', errors: validation.errors };
        const p = validation.values;
        if (capital > p.equity) return { status: 'incomplete', errors: [{ field: 'equity', message: 'المبلغ المخصص يتجاوز قيمة المحفظة.' }] };
        const equity = down(p.equity);
        if (equity <= 0) return { status: 'incomplete', errors: [{ field: 'equity', message: 'قيمة المحفظة أقل من سنت واحد.' }] };
        const cost = up(scenario.entryHigh);
        const loss = up(scenario.perShareRisk);
        const existingRisk = up(p.openRisk);
        const exposure = up(p.exposure);
        const cash = down(p.cash);
        const limits = [
            { label: 'ميزانية الفرصة', quantity: base.quantity },
            { label: 'السيولة المتاحة', quantity: Math.floor(cash / cost) },
            { label: 'المخاطرة الإجمالية', quantity: Math.floor(Math.max(0, down(p.equity * p.totalRiskPercent / 100) - existingRisk) / loss) },
            { label: 'تركيز الرمز', quantity: Math.floor(Math.max(0, down(p.equity * p.symbolPercent / 100) - exposure) / cost) }
        ];
        const quantity = Math.min(...limits.map((limit) => limit.quantity));
        return {
            status: quantity > 0 ? 'passed' : 'blocked', quantity,
            estimatedLoss: quantity * loss / 100, cost: quantity * cost / 100, riskBudget: base.riskBudget,
            cashAfter: (cash - quantity * cost) / 100,
            totalRiskPercent: (existingRisk + quantity * loss) / equity * 100,
            symbolPercent: (exposure + quantity * cost) / equity * 100,
            limitedBy: limits.filter((limit) => limit.quantity === quantity).map((limit) => limit.label),
            errors: []
        };
    }

    globalThis.asiriPlanRisk = Object.freeze({ number, buildScenario, position, validatePortfolio, assessPortfolio });
})();
