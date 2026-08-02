import fs from 'node:fs/promises';

const bootstrapPath=new URL('./bootstrap-v65.js',import.meta.url);
let bootstrap=await fs.readFile(bootstrapPath,'utf8');

if(!bootstrap.includes("from './ui-page-v661.js'")){
  bootstrap=bootstrap.replace("import { intelligenceOsPage } from './ui-page-v65.js';","import { intelligenceOsPage } from './ui-page-v65.js';\nimport { portfolioCenterPage } from './ui-page-v661.js';");
}
bootstrap=bootstrap.replace("const VERSION = '6.5.1';","const VERSION = '6.6.1';");

const styleAnchor="if (!index.includes('/v65.css')) index = replaceRequired(index, styleNeedle, `${styleNeedle}${extraStyles}`, 'stylesheet');";
if(!bootstrap.includes("/v661.css?v=6610")){
  bootstrap=bootstrap.replace(styleAnchor,styleAnchor+"\nif (!index.includes('/v661.css')) index = replaceRequired(index, '</head>', '<link rel=\"stylesheet\" href=\"/v661.css?v=6610\"></head>', 'portfolio center stylesheet');");
}

const navAnchor="if (!index.includes('data-page=\"portfoliosync\"')) index = replaceRequired(index, '<button data-page=\"portfolio\"><span>◫</span> المحفظة</button>', '<button data-page=\"portfolio\"><span>◫</span> المحفظة</button><button data-page=\"portfoliosync\"><span>⇄</span> مزامنة المحفظة</button>', 'portfolio navigation');";
if(!bootstrap.includes("data-page=\"portfoliocenter\"")){
  bootstrap=bootstrap.replace(navAnchor,navAnchor+"\nif (!index.includes('data-page=\"portfoliocenter\"')) index = replaceRequired(index, '<button data-page=\"portfoliosync\"><span>⇄</span> مزامنة المحفظة</button>', '<button data-page=\"portfoliosync\"><span>⇄</span> مزامنة المحفظة</button><button data-page=\"portfoliocenter\"><span>▣</span> مركز المحفظة</button>', 'portfolio center navigation');");
}

const pageAnchor="if (!index.includes('id=\"portfoliosync\"')) index = replaceRequired(index, '<section id=\"investment\" class=\"page\">', `${portfolioSyncPage}\\n<section id=\"investment\" class=\"page\">`, 'investment page');";
if(!bootstrap.includes("id=\"portfoliocenter\"")){
  bootstrap=bootstrap.replace(pageAnchor,pageAnchor+"\nif (!index.includes('id=\"portfoliocenter\"')) index = replaceRequired(index, '<section id=\"investment\" class=\"page\">', `${portfolioCenterPage}\\n<section id=\"investment\" class=\"page\">`, 'portfolio center page');");
}

const scriptAnchor="if (!index.includes('/v65.js')) index = replaceRequired(index, scriptNeedle, scripts, 'application script');";
if(!bootstrap.includes("/v661.js?v=6610")){
  bootstrap=bootstrap.replace(scriptAnchor,scriptAnchor+"\nif (!index.includes('/v661.js')) index = replaceRequired(index, '</body>', '<script src=\"/v661.js?v=6610\" type=\"module\"></script></body>', 'portfolio center script');");
}

const staticAnchor="app.get('/v65.css', (_req, res) => res.sendFile(path.join(root, 'v65.css')));`;\n";
if(!bootstrap.includes("app.get('/v661.js'")){
  bootstrap=bootstrap.replace(staticAnchor,"app.get('/v65.css', (_req, res) => res.sendFile(path.join(root, 'v65.css')));\napp.get('/v661.js', (_req, res) => res.sendFile(path.join(root, 'v661.js')));\napp.get('/v661.css', (_req, res) => res.sendFile(path.join(root, 'v661.css')));`;\n");
}
await fs.writeFile(bootstrapPath,bootstrap,'utf8');

const gatewayPath=new URL('./broker-gateway.js',import.meta.url);
let gateway=await fs.readFile(gatewayPath,'utf8');
if(!gateway.includes('async function loadLatestStoredSnapshot')){
  const anchor='async function publicStatus(userId) {';
  const helper=`async function loadLatestStoredSnapshot(userId) {
  const memory = lastSnapshots.get(userId);
  if (memory) return memory;
  if (!config().supabaseServiceRoleKey) return null;
  try {
    const rows = await adminRest(\`broker_snapshots?select=snapshot,captured_at&user_id=eq.\${encodeURIComponent(userId)}&provider=eq.saxo&order=captured_at.desc&limit=1\`);
    const stored = rows?.[0]?.snapshot || null;
    const snapshot = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (snapshot) lastSnapshots.set(userId, snapshot);
    return snapshot;
  } catch (error) {
    markStorageError(error);
    return null;
  }
}

`;
  if(gateway.includes(anchor))gateway=gateway.replace(anchor,helper+anchor);
  else console.warn('v6.6.1: publicStatus anchor not found');
}
gateway=gateway.replace('const snapshot = lastSnapshots.get(userId) || null;','const snapshot = lastSnapshots.get(userId) || await loadLatestStoredSnapshot(userId);');
gateway=gateway.replaceAll('const snapshot = lastSnapshots.get(user.id);','const snapshot = lastSnapshots.get(user.id) || await loadLatestStoredSnapshot(user.id);');
await fs.writeFile(gatewayPath,gateway,'utf8');

console.log('portfolio-center-v6.6.1-patch',{page:true,saxoReadOnly:true,persistedLatestSnapshot:true,tradingEnabled:false});
