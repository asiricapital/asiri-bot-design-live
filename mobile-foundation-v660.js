// Asiri Capital v6.6.0 — Mobile Foundation runtime guard
(() => {
  const MOBILE_QUERY = '(max-width: 900px)';
  let observer;

  function enforceMobileLayout() {
    if (!window.matchMedia(MOBILE_QUERY).matches) return;

    const nav = document.querySelector('.main-nav');
    const topbar = document.querySelector('.topbar');
    const appShell = document.querySelector('.app-shell');

    if (topbar) {
      topbar.style.setProperty('position', 'relative', 'important');
      topbar.style.setProperty('top', 'auto', 'important');
      topbar.style.setProperty('inset', 'auto', 'important');
    }

    if (appShell) {
      appShell.style.setProperty('display', 'block', 'important');
      appShell.style.setProperty('overflow', 'visible', 'important');
    }

    if (!nav) return;

    const rules = {
      position: 'relative',
      inset: 'auto',
      top: 'auto',
      right: 'auto',
      bottom: 'auto',
      left: 'auto',
      transform: 'none',
      translate: 'none',
      minHeight: 'auto',
      height: 'auto',
      width: '100%',
      maxWidth: '100%',
      alignSelf: 'auto',
      display: 'flex',
      overflowX: 'auto',
      overflowY: 'hidden',
      zIndex: '5'
    };

    Object.entries(rules).forEach(([property, value]) => {
      const cssName = property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
      nav.style.setProperty(cssName, value, 'important');
    });

    if (!observer) {
      observer = new MutationObserver(() => enforceMobileLayout());
      observer.observe(nav, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    }
  }

  function boot() {
    enforceMobileLayout();
    window.addEventListener('resize', enforceMobileLayout, { passive: true });
    window.addEventListener('orientationchange', enforceMobileLayout, { passive: true });
    window.addEventListener('pageshow', enforceMobileLayout, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) enforceMobileLayout();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
