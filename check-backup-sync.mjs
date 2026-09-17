import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('./.github/workflows/asiri-backup-sync.yml', import.meta.url), 'utf8');
const required = [
  'git for-each-ref --format=',
  'refs/heads/asiricapital-backup/$branch',
  'git push backup --tags',
  'لا تكتب فوق main'
];
const forbidden = [
  'git push backup --all',
  'git push backup --force',
  'git push backup -f'
];

for (const marker of required) {
  if (!workflow.includes(marker)) throw new Error(`Backup safety marker missing: ${marker}`);
}
for (const marker of forbidden) {
  if (workflow.includes(marker)) throw new Error(`Unsafe backup command found: ${marker}`);
}
console.log('Backup sync checks passed: VIP branches are preserved and source refs use a separate namespace.');
