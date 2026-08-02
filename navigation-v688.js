// Asiri Capital v6.8.8 — standalone navigation runtime
(() => {
  'use strict';
  if (window.__ASIRI_NAVIGATION_V688__) return;
  window.__ASIRI_NAVIGATION_V688__ = true;

  const triggerSelector = '[data-page],[data-mobile-page],[data-target-page],a[href^="#"]';
  let currentPage = null;
  let applying = false;

  function pageFromTrigger(trigger) {
    if (!trigger) return '';
    const direct = trigger.getAttribute('data-page') || trigger.getAttribute('data-mobile-page') || trigger.getAttribute('data-target-page');
    if (direct) return String(direct).replace(/^#/, '').trim();
    const href = trigger.getAttribute('href') || '';
    return href.startsWith('#') ? href.slice(1).trim() : '';
  }

  function validPage(pageId) {
    const page = pageId ? document.getElementById(pageId) : null;
    return page && page.classList.contains('page') ? page : null;
  }

  function applyPage(pageId, updateHistory = true) {
    const target = validPage(pageId);
    if (!target || applying) return false;
    applying = true;
    currentPage = pageId;

    document.querySelectorAll('.page').forEach((page) => {
      const active = page === target;
      page.classList.toggle('active', active);
      page.hidden = !active;
      page.setAttribute('aria-hidden', active ? 'false' : 'true');
      page.style.setProperty('display', active ? 'block' : 'none', 'important');
    });

    document.querySelectorAll(triggerSelector).forEach((trigger) => {
      const active = pageFromTrigger(trigger) === pageId;
      trigger.classList.toggle('active', active);
      if (active) trigger.setAttribute('aria-current', 'page');
      else trigger.removeAttribute('aria-current');
    });

    if (updateHistory) {
      try { history.replaceState({ asiriPage: pageId }, '', `#${pageId}`); } catch {}
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.dataset.asiriPage = pageId;
    window.dispatchEvent(new CustomEvent('asiri:navigation', { detail: { page: pageId } }));
    applying = false;
    return true;
  }

  function enforceCurrent() {
    if (!currentPage || applying) return;
    const target = validPage(currentPage);
    if (!target) return;
    const activePages = [...document.querySelectorAll('.page.active')];
    if (activePages.length !== 1 || activePages[0] !== target || target.hidden || getComputedStyle(target).display === 'none') {
      applyPage(currentPage, false);
    }
  }

  function handleNavigation(event) {
    const trigger = event.target instanceof Element ? event.target.closest(triggerSelector) : null;
    if (!trigger) return;
    const pageId = pageFromTrigger(trigger);
    if (!validPage(pageId)) return;
    event.preventDefault();
    applyPage(pageId, true);
    requestAnimationFrame(enforceCurrent);
    setTimeout(enforceCurrent, 50);
    setTimeout(enforceCurrent, 250);
  }

  function boot() {
    document.addEventListener('click', handleNavigation, true);
    window.addEventListener('hashchange', () => {
      const pageId = location.hash.replace(/^#/, '');
      if (validPage(pageId)) applyPage(pageId, false);
    });

    const initialHash = location.hash.replace(/^#/, '');
    const initialPage = validPage(initialHash)
      ? initialHash
      : (document.querySelector('.page.active')?.id || 'dashboard');
    applyPage(initialPage, false);

    const main = document.querySelector('main') || document.body;
    new MutationObserver(() => requestAnimationFrame(enforceCurrent)).observe(main, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'style']
    });

    window.AsiriNavigate = (pageId) => applyPage(String(pageId || '').replace(/^#/, ''), true);
    console.info('Asiri navigation v6.8.8 ready', { page: currentPage });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
