(() => {
  'use strict';
  if (window.__asiriWatchReturnV706) return;
  window.__asiriWatchReturnV706 = true;

  const DEFAULT_RETURN = '/?v=7060';
  const RETURN_KEY = 'asiri_watch_return_url';
  const WATCH_PATH = '/binance-lab';

  function safePath(value) {
    const text = String(value || '').trim();
    if (!text.startsWith('/') || text.startsWith('//')) return null;
    try {
      const url = new URL(text, window.location.origin);
      return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
    } catch {
      return null;
    }
  }

  function currentDashboardReturn() {
    return DEFAULT_RETURN;
  }

  function storedReturn() {
    try { return safePath(sessionStorage.getItem(RETURN_KEY)); } catch { return null; }
  }

  function requestedReturn() {
    const params = new URLSearchParams(window.location.search);
    return safePath(params.get('return'));
  }

  function rememberReturn(value) {
    const target = safePath(value) || DEFAULT_RETURN;
    try { sessionStorage.setItem(RETURN_KEY, target); } catch {}
    return target;
  }

  function navigate(url) {
    window.__asiriWatchNavigationTarget = url;
    window.location.assign(url);
  }

  function openWatchManager(event) {
    const button = event.target?.closest?.('#lp705OpenWatch');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const returnUrl = rememberReturn(currentDashboardReturn());
    navigate(`${WATCH_PATH}?return=${encodeURIComponent(returnUrl)}&v=2060`);
  }

  function returnToDashboard(event) {
    event?.preventDefault?.();
    const target = rememberReturn(requestedReturn() || storedReturn() || DEFAULT_RETURN);
    let canUseHistory = false;
    try {
      canUseHistory = window.history.length > 1
        && Boolean(document.referrer)
        && new URL(document.referrer).origin === window.location.origin;
    } catch {}

    if (canUseHistory) {
      window.__asiriWatchNavigationTarget = 'history.back';
      window.history.back();
      window.setTimeout(() => {
        if (window.location.pathname === WATCH_PATH) navigate(target);
      }, 650);
      return;
    }
    navigate(target);
  }

  function buildReturnBar() {
    if (window.location.pathname !== WATCH_PATH || document.getElementById('watchReturnV706')) return;
    const target = rememberReturn(requestedReturn() || storedReturn() || DEFAULT_RETURN);
    const bar = document.createElement('nav');
    bar.id = 'watchReturnV706';
    bar.className = 'watch-return-v706';
    bar.setAttribute('aria-label', 'العودة إلى Asiri Capital');
    bar.innerHTML = `
      <div class="watch-return-brand">
        <span class="watch-return-mark">AC</span>
        <div><strong>Asiri Capital</strong><small>إدارة قائمة المتابعة</small></div>
      </div>
      <a id="watchReturnTop" href="${target}" class="watch-return-button">العودة إلى لوحة القيادة <span aria-hidden="true">←</span></a>`;
    document.body.prepend(bar);

    const floating = document.createElement('a');
    floating.id = 'watchReturnFloating';
    floating.className = 'watch-return-floating';
    floating.href = target;
    floating.innerHTML = '<span aria-hidden="true">⌂</span> لوحة القيادة';
    document.body.appendChild(floating);

    bar.querySelector('#watchReturnTop')?.addEventListener('click', returnToDashboard);
    floating.addEventListener('click', returnToDashboard);
  }

  document.addEventListener('click', openWatchManager, true);
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', buildReturnBar, { once: true })
    : buildReturnBar();
})();
