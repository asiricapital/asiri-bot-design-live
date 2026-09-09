import { readFile } from 'node:fs/promises';

async function verify() {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('./opportunity-journey.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('./opportunity-journey.css', import.meta.url), 'utf8');

  const requiredHtml = [
    'id="opportunity-day-card"',
    'id="opt-symbol"',
    'id="opt-price"',
    'id="opt-reason"',
    'id="opt-journey-path"',
    'id="telegram-alert-preview"',
    'opportunity-journey.css',
    'opportunity-journey.js'
  ];

  for (const token of requiredHtml) {
    if (!html.includes(token)) throw new Error(`Missing HTML component: ${token}`);
  }

  const requiredJs = [
    'updateOpportunityCard',
    'updateJourneyPath',
    'showTelegramPreview',
    'window.asiriOpportunity'
  ];

  for (const token of requiredJs) {
    if (!js.includes(token)) throw new Error(`Missing JS logic: ${token}`);
  }

  const requiredCss = [
    '.opportunity-card',
    '.journey-path',
    '.journey-node',
    '.telegram-preview'
  ];

  for (const token of requiredCss) {
    if (!css.includes(token)) throw new Error(`Missing CSS styles: ${token}`);
  }

  console.log('Opportunity Journey v1 contract passed.');
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
