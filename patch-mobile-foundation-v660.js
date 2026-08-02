import fs from 'node:fs/promises';

const path = new URL('./index.html', import.meta.url);
let html = await fs.readFile(path, 'utf8');

const cssHref = '/mobile-foundation-v660.css?v=6600';
const jsSrc = '/mobile-foundation-v660.js?v=6600';
const cssTag = `<link rel="stylesheet" href="${cssHref}">`;
const jsTag = `<script src="${jsSrc}" defer></script>`;

html = html
  .replace(/\s*<link\s+rel=["']stylesheet["']\s+href=["']\/broker-mobile-fix\.css\?v=\d+["']\s*\/?>/gi, '')
  .replace(/\s*<link\s+rel=["']stylesheet["']\s+href=["']\/mobile-foundation-v660\.css\?v=\d+["']\s*\/?>/gi, '')
  .replace(/\s*<script\s+src=["']\/mobile-foundation-v660\.js\?v=\d+["']\s+defer><\/script>/gi, '');

if (!html.includes('</head>')) throw new Error('v6.6.0 head anchor not found');
if (!html.includes('</body>')) throw new Error('v6.6.0 body anchor not found');

html = html.replace('</head>', `  ${cssTag}\n</head>`);
html = html.replace('</body>', `  ${jsTag}\n</body>`);

await fs.writeFile(path, html, 'utf8');
console.log('mobile-foundation-v6.6.0', {
  applied: true,
  cssCacheVersion: 6600,
  runtimeGuard: true,
  stickyNavigationDisabledOnMobile: true
});
