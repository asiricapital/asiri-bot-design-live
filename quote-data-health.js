/* ASIRI Quote Data Health Engine v1 · deterministic, read-only and recommendation-free. */
(() => {
  'use strict';

  const LIMITS = Object.freeze({
    futureToleranceMs: 60 * 1000,
    sourceRecentMs: 2 * 60 * 1000,
    closedQuoteStaleMs: 7 * 24 * 60 * 60 * 1000
  });
  const ANALYSIS_FIELDS = Object.freeze(['priceHistory', 'liquidity', 'technicals', 'news', 'risk']);

  function positiveNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
    if (normalized === '') return null;
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function timestamp(value) {
    const parsed = new Date(value || '').getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  function relativeAge(ageMs) {
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'غير معروف';
    if (ageMs < 15 * 1000) return 'الآن';
    if (ageMs < 60 * 1000) return `منذ ${Math.max(1, Math.floor(ageMs / 1000))} ثانية`;
    if (ageMs < 60 * 60 * 1000) return `منذ ${Math.max(1, Math.floor(ageMs / 60000))} دقيقة`;
    if (ageMs < 24 * 60 * 60 * 1000) return `منذ ${Math.max(1, Math.floor(ageMs / 3600000))} ساعة`;
    return `منذ ${Math.max(1, Math.floor(ageMs / 86400000))} يوم`;
  }

  function quoteTime(item) {
    return timestamp(item?.updatedAt || item?.time);
  }

  function observationTime(item) {
    return timestamp(item?.observedAt || item?.receivedAt || item?.checkedAt);
  }

  function result(base, state, reasonCode) {
    let sourceStatus = 'المصدر غير متاح';
    if (base.checks.source) {
      if (reasonCode === 'UPDATE_FAILED') sourceStatus = 'تعذر آخر تحديث';
      else if (reasonCode === 'LOCAL_SNAPSHOT') sourceStatus = 'لقطة محلية • الاتصال الحالي غير مؤكد';
      else if (reasonCode === 'INVALID_FUTURE_TIME' && base.invalidFields?.includes('observation')) sourceStatus = 'وقت رصد المصدر غير صالح';
      else if (!Number.isFinite(base.sourceAgeMs)) sourceStatus = 'وقت رصد المصدر غير متاح';
      else if (base.sourceAgeMs <= LIMITS.sourceRecentMs) sourceStatus = 'المصدر متصل الآن';
      else sourceStatus = `آخر اتصال ${relativeAge(base.sourceAgeMs)}`;
    }
    return { ...base, state, reasonCode, sourceStatus, recommendationAllowed: false };
  }

  function classifyQuote(item, nowMs = Date.now()) {
    const safeNow = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    const priceAvailable = positiveNumber(item?.price) !== null;
    const sourceKnown = Boolean(String(item?.source || '').trim());
    const quoteAtMs = quoteTime(item);
    const observedAtMs = observationTime(item);
    const quoteTimePresent = quoteAtMs !== null;
    const observationPresent = observedAtMs !== null;
    const quoteTimeValid = quoteTimePresent && quoteAtMs <= safeNow + LIMITS.futureToleranceMs;
    const observationValid = observationPresent && observedAtMs <= safeNow + LIMITS.futureToleranceMs;
    const presentChecks = { price: priceAvailable, source: sourceKnown, time: quoteTimePresent, observation: observationPresent };
    const checks = { price: priceAvailable, source: sourceKnown, time: quoteTimeValid, observation: observationValid };
    const missingFields = Object.entries(presentChecks).filter(([, available]) => !available).map(([name]) => name);
    const invalidFields = [
      quoteTimePresent && !quoteTimeValid ? 'time' : null,
      observationPresent && !observationValid ? 'observation' : null
    ].filter(Boolean);
    const base = {
      checks,
      missingFields,
      invalidFields,
      quoteAtMs,
      observedAtMs,
      quoteAgeMs: quoteAtMs === null ? null : Math.max(0, safeNow - quoteAtMs),
      sourceAgeMs: observedAtMs === null ? null : Math.max(0, safeNow - observedAtMs),
      session: String(item?.session || '').trim().toUpperCase(),
      sessionLabel: String(item?.sessionLabel || '').trim()
    };

    if (missingFields.length) return result(base, 'UNAVAILABLE', 'MISSING_FIELDS');
    if (invalidFields.length) return result(base, 'UNAVAILABLE', 'INVALID_FUTURE_TIME');

    const closedSession = item?.isLiveSession === false || ['CLOSED', 'REGULAR_CLOSE'].includes(base.session);
    const complete = { ...base, closedSession };
    if (item?.error === true) return result(complete, 'STALE', 'UPDATE_FAILED');
    if (item?.fromSnapshot === true) return result(complete, 'STALE', 'LOCAL_SNAPSHOT');
    if (complete.sourceAgeMs > LIMITS.sourceRecentMs) return result(complete, 'STALE', 'SOURCE_NOT_RECENT');

    if (closedSession) {
      if (complete.quoteAgeMs > LIMITS.closedQuoteStaleMs) return result(complete, 'STALE', 'CLOSED_QUOTE_TOO_OLD');
      return result(complete, 'DELAYED', 'MARKET_CLOSED');
    }
    if (item?.isFresh === true) return result(complete, 'FRESH', 'CURRENT');
    return result(complete, 'DELAYED', 'PROVIDER_NOT_FRESH');
  }

  function describeQuote(health) {
    const quoteAge = relativeAge(health?.quoteAgeMs);
    if (health?.state === 'FRESH') return {
      state: 'FRESH', tone: 'fresh', label: 'حديثة الآن', cls: 'badge-fresh',
      detail: `المصدر متصل • آخر حركة ${quoteAge}`,
      reason: 'وصلت قراءة مكتملة، والمصدر متصل ويعلن أن الجلسة والسعر الحاليين حديثان.'
    };
    if (health?.state === 'DELAYED' && health?.reasonCode === 'MARKET_CLOSED') return {
      state: 'DELAYED', tone: 'delayed', label: 'آخر إغلاق', cls: 'badge-delayed',
      detail: `خارج الجلسة • آخر حركة ${quoteAge}`,
      reason: 'المصدر متصل، والسعر الظاهر هو آخر إغلاق موثق لأن الجلسة غير نشطة.'
    };
    if (health?.state === 'DELAYED') return {
      state: 'DELAYED', tone: 'delayed', label: 'متأخرة', cls: 'badge-delayed',
      detail: `المصدر متصل • آخر حركة ${quoteAge}`,
      reason: 'القراءة مكتملة والمصدر متصل، لكنه لا يعلن السعر الحالي كقراءة لحظية حديثة.'
    };
    if (health?.state === 'STALE') {
      const updateFailed = health.reasonCode === 'UPDATE_FAILED';
      const localSnapshot = health.reasonCode === 'LOCAL_SNAPSHOT';
      return {
        state: 'STALE', tone: 'stale',
        label: updateFailed ? 'قديمة — تعذر التحديث' : localSnapshot ? 'قديمة — محفوظة' : 'قديمة',
        cls: 'badge-stale', detail: `للمرجع فقط • آخر حركة ${quoteAge}`,
        reason: updateFailed
          ? 'فشل التحديث الأخير؛ أُبقيت آخر قراءة مع وقتها الأصلي ولم تُعامل كقراءة جديدة.'
          : localSnapshot
            ? 'هذه لقطة محلية سابقة وستبقى قديمة حتى تصل قراءة مباشرة جديدة.'
            : 'عمر القراءة أو آخر اتصال بالمصدر تجاوز الحد الآمن للاستخدام كبيانات حالية.'
      };
    }
    const missing = Array.isArray(health?.missingFields) ? health.missingFields.length : 0;
    return {
      state: 'UNAVAILABLE', tone: 'unavailable', label: 'ناقصة', cls: 'badge-unavailable',
      detail: missing ? `${missing} حقول أساسية غير متاحة` : 'وقت القراءة غير صالح',
      reason: health?.reasonCode === 'INVALID_FUTURE_TIME'
        ? 'وقت القراءة يتجاوز الساعة الحالية؛ أوقفت صلاحية القراءة حتى يتطابق التوقيت.'
        : 'ينقص السعر أو المصدر أو وقت القراءة، لذلك لا توجد قراءة قابلة للتحقق.'
    };
  }

  function analysisGate(item, nowMs = Date.now()) {
    const health = classifyQuote(item, nowMs);
    const evidence = item?.analysisEvidence || {};
    const checks = Object.fromEntries(ANALYSIS_FIELDS.map((field) => [field, evidence[field] === true]));
    const availableCount = Object.values(checks).filter(Boolean).length;
    if (health.state !== 'FRESH') return {
      state: 'BLOCKED', label: 'متوقفة', availableCount, total: ANALYSIS_FIELDS.length,
      checks, recommendation: null,
      reason: 'تحتاج أولاً إلى قراءة سعر حديثة قبل فتح المراجعة التحليلية.'
    };
    if (availableCount !== ANALYSIS_FIELDS.length) return {
      state: 'BLOCKED', label: 'متوقفة', availableCount, total: ANALYSIS_FIELDS.length,
      checks, recommendation: null,
      reason: 'يلزم سجل سعري وسيولة ومؤشرات فنية وأخبار ومخاطر مكتملة قبل المراجعة.'
    };
    return {
      state: 'REVIEW_READY', label: 'جاهزة للمراجعة البشرية', availableCount,
      total: ANALYSIS_FIELDS.length, checks, recommendation: null,
      reason: 'اكتملت الأدلة المطلوبة للمراجعة البشرية؛ لا يصدر المحرك قرار شراء أو بيع تلقائيًا.'
    };
  }

  window.asiriQuoteDataHealth = Object.freeze({ LIMITS, classifyQuote, describeQuote, analysisGate, relativeAge });
})();
