import fs from 'node:fs/promises';

const path = new URL('./index.html', import.meta.url);
let html = await fs.readFile(path, 'utf8');

const href = '/broker-mobile-fix.css?v=6590';
const tag = `<link rel="stylesheet" href="${href}">`;

html = html.replace(/\s*<link\s+rel=["']stylesheet["']\s+href=["']\/broker-mobile-fix\.css\?v=\d+["']\s*\/?>/gi, '');

if (!html.includes(href)) {
  if (!html.includes('</head>')) throw new Error('v6.5.9 head anchor not found');
  html = html.replace('</head>', `  ${tag}\n</head>`);
}

await fs.writeFile(path, html, 'utf8');
console.log('broker-mobile-v6.5.9-patch', {
  applied: true,
  mobileNavigationSticky: false,
  cacheVersion: 6590
});
