(() => {
  'use strict';
  if (window.__asiriDashboardLayoutV704) return;
  window.__asiriDashboardLayoutV704 = true;

  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  let observer = null;
  let applyTimer = null;
  let applying = false;
  let navigationGuardInstalled = false;

  function dashboard() {
    return document.getElementById('dashboard');
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function setAttribute(node, name, value) {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  }

  function directPageTitle(root) {
    return [...root.children].find((node) => node.classList?.contains('page-title')) || root.querySelector('.page-title');
  }

  function findPanelByText(root, phrase) {
    const wanted = cleanText(phrase);
    const nodes = root.querySelectorAll('h1,h2,h3,h4');
    for (const node of nodes) {
      if (!cleanText(node.textContent).includes(wanted)) continue;
      const panel = node.closest('section.panel, article.panel, .panel, section, article');
      if (panel && panel !== root) return panel;
    }
    return null;
  }

  function upgradeCommandBar(root) {
    const title = directPageTitle(root);
    if (!title) return null;

    title.classList.add('dash702-commandbar');
    setAttribute(title, 'data-dashboard-role', 'commandbar');
    setText(title.querySelector('.eyebrow'), 'ASIRI COMMAND CENTER · DAILY BRIEF');

    const heading = title.querySelector('h2');
    if (heading && /Asiri Capital Dashboard|ملخص القيادة اليومي/i.test(cleanText(heading.textContent))) {
      setText(heading, 'ملخص القيادة اليومي');
    }

    setText(title.querySelector('p'), 'ابدأ بالقرار التنفيذي، ثم راجع السوق والفرص والمخاطر.');

    const refresh = title.querySelector('#refreshAll');
    if (refresh) {
      setText(refresh, 'تحديث لوحة القيادة');
      setAttribute(refresh, 'aria-label', 'تحديث جميع بيانات لوحة القيادة');
    }

    return title;
  }

  function prioritizeExecutiveDecision(root, commandBar) {
    const panel = findPanelByText(root, 'القرار التنفيذي لكل سهم');
    if (!panel || !commandBar) return;

    panel.classList.add('dash702-executive-first');
    setAttribute(panel, 'data-dashboard-role', 'executive-decision');
    setText(panel.querySelector('.eyebrow'), 'EXECUTIVE DECISION · الأولوية الأولى');

    const header = panel.querySelector('.section-head > div') || panel.querySelector('.section-head');
    if (header && !header.querySelector('.dash702-executive-note')) {
      const note = document.createElement('p');
      note.className = 'dash702-executive-note';
      note.textContent = 'القرار والإجراء المطلوب لكل سهم قبل الاطلاع على بقية المؤشرات.';
      header.appendChild(note);
    }

    if (commandBar.nextElementSibling !== panel) commandBar.after(panel);
  }

  function movePortfolioUpdatesToBottom(root) {
    const panel = findPanelByText(root, 'سجل تحديثات المحفظة');
    if (!panel) return;

    panel.classList.add('dash702-portfolio-history');
    setAttribute(panel, 'data-dashboard-role', 'portfolio-update-history');

    const heading = [...panel.querySelectorAll('h2,h3,h4')]
      .find((node) => cleanText(node.textContent).includes('سجل تحديثات المحفظة'));
    const header = heading?.closest('.section-head') || heading?.parentElement;
    if (header && !header.querySelector('.dash702-history-note')) {
      const note = document.createElement('p');
      note.className = 'dash702-history-note';
      note.textContent = 'سجل مرجعي للمراجعة — تم نقله إلى نهاية لوحة القيادة.';
      header.appendChild(note);
    }

    const disclaimer = root.querySelector('.dashboard-disclaimer');
    if (disclaimer) {
      if (panel.nextElementSibling !== disclaimer) disclaimer.before(panel);
    } else if (root.lastElementChild !== panel) {
      root.appendChild(panel);
    }
  }

  function cleanRepeatedName(root) {
    const disclaimer = root.querySelector('.dashboard-disclaimer');
    if (!disclaimer) return;
    const current = disclaimer.textContent;
    if (current.includes('Asiri Capital Dashboard')) {
      setText(disclaimer, current.replace('Asiri Capital Dashboard', 'Asiri Capital'));
    }
  }

  function installNavigationGuard() {
    if (navigationGuardInstalled) return;
    navigationGuardInstalled = true;
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('.main-nav button[data-page]');
      if (!button) return;
      const page = String(button.dataset.page || '');
      if (!page) return;
      queueMicrotask(() => {
        const target = document.getElementById(page);
        if (!target || target.classList.contains('active')) return;
        document.querySelectorAll('.main-nav button,.page').forEach((node) => node.classList.remove('active'));
        button.classList.add('active');
        target.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'auto' });
        window.dispatchEvent(new CustomEvent('asiri:navigation-fallback', { detail: { page } }));
      });
    }, true);
  }

  function observe(root) {
    if (!observer) {
      observer = new MutationObserver((records) => {
        const structuralChange = records.some((record) => record.type === 'childList' && (record.addedNodes.length || record.removedNodes.length));
        if (structuralChange) scheduleApply(100);
      });
    }
    observer.observe(root, { childList: true });
  }

  function applyLayout() {
    if (applying) return;
    const root = dashboard();
    if (!root) return;

    applying = true;
    observer?.disconnect();
    try {
      const commandBar = upgradeCommandBar(root);
      prioritizeExecutiveDecision(root, commandBar);
      movePortfolioUpdatesToBottom(root);
      cleanRepeatedName(root);
      setAttribute(root, 'data-layout-version', '7.0.4');
    } finally {
      applying = false;
      observe(root);
    }
  }

  function scheduleApply(delay = 0) {
    clearTimeout(applyTimer);
    applyTimer = setTimeout(applyLayout, delay);
  }

  function boot() {
    installNavigationGuard();
    applyLayout();
    scheduleApply(500);
    setTimeout(applyLayout, 1800);
    setTimeout(applyLayout, 5000);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
