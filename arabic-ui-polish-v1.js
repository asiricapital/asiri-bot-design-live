/* ASIRI ARABIC UI POLISH V1 · presentation-only localization layer. */
(() => {
  'use strict';

  const replacements = [
    ['ASIRI COMMAND CENTER V1', 'غرفة قيادة ASIRI · الإصدار 1'],
    ['TRADING MISSION CONTROL · V1', 'مركز مهمة التداول · الإصدار 1'],
    ['ASIRI DAILY ANALYSIS CYCLE · V1', 'الدورة اليومية للتحليل · الإصدار 1'],
    ['MARKET TOPOLOGY · VISUAL LAYER', 'خريطة السوق · الطبقة البصرية'],
    ['ASIRI CAPITAL INTELLIGENCE OS', 'نظام ASIRI لاستخبارات رأس المال'],
    ['NO BROKER SUBMISSION', 'لا إرسال إلى الوسيط'],
    ['PAPER RESEARCH', 'بحث ورقي'],
    ['MARKET DATA', 'بيانات السوق'],
    ['RESEARCH SHELL', 'بيئة البحث'],
    ['PORTFOLIO PNL', 'ربح/خسارة المحفظة'],
    ['SHARPE RATIO', 'نسبة شارب'],
    ['MAX DRAWDOWN', 'أقصى تراجع'],
    ['ACTIVE RESEARCH', 'حالة البحث'],
    ['DATA QUALITY', 'جودة البيانات'],
    ['READ-ONLY', 'قراءة فقط'],
    ['Read-Only', 'قراءة فقط'],
    ['PAPER ONLY', 'ورقي فقط'],
    ['Paper Only', 'ورقي فقط'],
    ['EXECUTION', 'التنفيذ'],
    ['ACCESS', 'الوصول'],
    ['MODE', 'الوضع'],
    ['LOCKED', 'مقفول'],
    ['WAITING', 'بانتظار القراءة'],
    ['NON-EXECUTIVE', 'غير تنفيذي'],
    ['LIQUIDITY', 'السيولة'],
    ['MOMENTUM', 'الزخم'],
    ['RISK', 'المخاطر'],
    ['FUNDING', 'التمويل'],
    ['FRESH', 'حديث'],
    ['STALE', 'قديم'],
    ['DELAYED', 'متأخر'],
    ['UNAVAILABLE', 'غير متاح'],
    ['LIVE', 'مباشر'],
    ['Live', 'مباشر'],
    ['After-Hours', 'بعد الإغلاق'],
    ['Regular Session', 'الجلسة الاعتيادية'],
    ['Last Regular Close', 'آخر إغلاق اعتيادي'],
    ['Yahoo Finance', 'ياهو فاينانس'],
    ['PENDING', 'قيد الانتظار']
  ];

  function localizeText(value) {
    let text = String(value ?? '');
    for (const [from, to] of replacements) text = text.split(from).join(to);
    text = text.replace(/السيولة\s*·\s*حديث\s*(\d+)/g, 'السيولة · حديثة $1');
    text = text.replace(/الزخم\s*·\s*WATCH\s*(\d+)/g, 'الزخم · متابعة $1');
    text = text.replace(/المخاطر\s*·\s*قديم\s*(\d+)/g, 'المخاطر · قديم $1');
    text = text.replace(/التمويل\s*·\s*N\/A\s*(\d+)/g, 'التمويل · غير متاح $1');
    text = text.replace(/قراءة مباشر\b/g, 'قراءة مباشرة');
    return text;
  }

  function localizeTree(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName)) continue;
      nodes.push(node);
    }
    nodes.forEach((textNode) => {
      const next = localizeText(textNode.nodeValue);
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function init() {
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    document.title = 'ASIRI | غرفة أبحاث السوق';
    document.body?.setAttribute('dir', 'rtl');
    document.body?.classList.add('asiri-arabic-ui');
    localizeTree();
    const observer = new MutationObserver((records) => records.forEach((record) => {
      if (record.type === 'characterData' && record.target?.nodeValue) {
        record.target.nodeValue = localizeText(record.target.nodeValue);
      }
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) localizeTree(node);
        else if (node.nodeType === Node.TEXT_NODE) node.nodeValue = localizeText(node.nodeValue);
      });
    }));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.asiriArabicUiPolish = Object.freeze({ enabled: true, locale: 'ar', direction: 'rtl' });
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
