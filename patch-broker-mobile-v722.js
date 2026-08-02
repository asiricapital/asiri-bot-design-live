import fs from 'node:fs/promises';

function replaceRequired(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`v7.2.2 failed: ${label} anchor not found`);
  return text.replace(before, after);
}

const realtimePath = new URL('./v700-realtime.js', import.meta.url);
let realtime = await fs.readFile(realtimePath, 'utf8');

const oldPlacement = `    if (!host.contains(panel)) {
      const anchor = host.querySelector('.page-title') || host.firstElementChild;
      if (anchor) anchor.insertAdjacentElement('afterend', panel);
      else host.prepend(panel);
    }`;

const newPlacement = `    if (!host.contains(panel)) {
      if (host.id === 'brokergateway' && host.dataset.brokerUi === 'v721') {
        let disclosure = q('#rt700DisclosureV722', host);
        if (!disclosure) {
          disclosure = document.createElement('details');
          disclosure.id = 'rt700DisclosureV722';
          disclosure.className = 'panel rt700-disclosure-v722';
          disclosure.innerHTML = \`<summary><span><b>تشخيص Saxo المتقدم</b><small>Streaming · صلاحيات الأسعار · عمر النبضة</small></span><i aria-hidden="true">⌄</i></summary>\`;
          const roadmap = host.querySelector('.broker-v2-roadmap');
          const snapshot = host.querySelector('#broker62SnapshotEmpty');
          if (roadmap) roadmap.insertAdjacentElement('afterend', disclosure);
          else if (snapshot) snapshot.insertAdjacentElement('beforebegin', disclosure);
          else host.append(disclosure);
        }
        disclosure.append(panel);
      } else {
        const anchor = host.querySelector('.page-title') || host.firstElementChild;
        if (anchor) anchor.insertAdjacentElement('afterend', panel);
        else host.prepend(panel);
      }
    } // ASIRI_BROKER_MOBILE_START_V722`;

if (!realtime.includes('ASIRI_BROKER_MOBILE_START_V722')) {
  realtime = replaceRequired(realtime, oldPlacement, newPlacement, 'realtime diagnostics placement');
  await fs.writeFile(realtimePath, realtime, 'utf8');
}

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');

if (!bootstrap.includes('/broker-mobile-v722.css')) {
  const scopedAnchor = 'const scopedQueries = [';
  const assetPatch = `if (!index.includes('/broker-mobile-v722.css')) index = index.replace('</head>', '<link rel="stylesheet" href="/broker-mobile-v722.css?v=7220"></head>'); // ASIRI_BROKER_MOBILE_CSS_V722\n\n`;
  bootstrap = replaceRequired(bootstrap, scopedAnchor, assetPatch + scopedAnchor, 'late mobile stylesheet');

  const staticAnchor = "app.get('/broker-ui-v721.css', (_req, res) => res.sendFile(path.join(root, 'broker-ui-v721.css')));";
  bootstrap = replaceRequired(
    bootstrap,
    staticAnchor,
    `${staticAnchor}\napp.get('/broker-mobile-v722.css', (_req, res) => res.sendFile(path.join(root, 'broker-mobile-v722.css')));`,
    'mobile stylesheet route'
  );
  await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
}

console.log('broker-mobile-start-v7.2.2', {
  applied: true,
  fullWidthMobileShell: true,
  diagnosticsCollapsedBelowPrimaryExperience: true,
  tradingEnabled: false,
  executionAllowed: false
});
