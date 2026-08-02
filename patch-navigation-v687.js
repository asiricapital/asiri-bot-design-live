import fs from 'node:fs/promises';

const appPath = new URL('./app.js', import.meta.url);
let app = await fs.readFile(appPath, 'utf8');

const marker = 'ASIRI_ROBUST_NAVIGATION_V687';
if (!app.includes(marker)) {
  app += `

// ${marker}
(() => {
  if (window.__asiriNavigationV687) return;
  window.__asiriNavigationV687 = true;

  const getTarget = (trigger) => {
    if (!trigger) return '';
    const direct = trigger.dataset?.page || trigger.dataset?.mobilePage || trigger.dataset?.targetPage;
    if (direct) return String(direct).replace(/^#/, '');
    const href = trigger.getAttribute?.('href') || '';
    return href.startsWith('#') ? href.slice(1) : '';
  };

  const activatePage = (pageId) => {
    const target = document.getElementById(pageId);
    if (!target || !target.classList.contains('page')) return false;

    try {
      const runtimeShowPage = window.AsiriRuntimeV683?.showPage;
      if (typeof runtimeShowPage === 'function') runtimeShowPage(pageId);
    } catch (error) {
      console.warn('navigation-runtime-fallback', error);
    }

    document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
    target.classList.add('active');

    document.querySelectorAll('[data-page],[data-mobile-page],[data-target-page]').forEach((item) => {
      const active = getTarget(item) === pageId;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });

    window.scrollTo({ top: 0, behavior: 'auto' });
    window.dispatchEvent(new CustomEvent('asiri:page-changed', { detail: { page: pageId } }));
    return true;
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-page],[data-mobile-page],[data-target-page],a[href^="#"]');
    if (!trigger) return;
    const pageId = getTarget(trigger);
    if (!pageId || !document.getElementById(pageId)?.classList.contains('page')) return;
    event.preventDefault();
    activatePage(pageId);
  }, true);

  window.AsiriNavigate = activatePage;
})();
`;
  await fs.writeFile(appPath, app, 'utf8');
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.8.6';", "const VERSION = '6.8.7';");

const cacheAnchor = "if (!index.includes('/trade-receipt-v682.js')) index = index.replace('</body>', '<script src=\"/trade-receipt-v682.js?v=6820\"></script></body>'); // ASIRI_TRADE_RECEIPT_V682";
if (!bootstrap.includes('ASIRI_NAV_CACHE_V687')) {
  if (!bootstrap.includes(cacheAnchor)) throw new Error('v6.8.7 failed: trade receipt cache anchor not found');
  bootstrap = bootstrap.replace(
    cacheAnchor,
    `${cacheAnchor}\nindex = index.replace('/app.js?v=6820', '/app.js?v=6870');\nindex = index.replace('/v683.css?v=6860', '/v683.css?v=6870'); // ASIRI_NAV_CACHE_V687`
  );
}
await fs.writeFile(bootstrapPath, bootstrap, 'utf8');

console.log('robust-navigation-v6.8.7', { delegatedClicks: true, dynamicButtons: true, mobileNavigation: true, appCache: 6870 });
