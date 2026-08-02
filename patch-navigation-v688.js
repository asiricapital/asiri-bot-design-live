import fs from 'node:fs/promises';

const bootstrapPath = new URL('./bootstrap-v65.js', import.meta.url);
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace("const VERSION = '6.8.7';", "const VERSION = '6.8.8';");

const cacheAnchor = "index = index.replace('/v683.css?v=6860', '/v683.css?v=6870'); // ASIRI_NAV_CACHE_V687";
if (!bootstrap.includes('ASIRI_STANDALONE_NAV_V688')) {
  if (!bootstrap.includes(cacheAnchor)) throw new Error('v6.8.8 failed: navigation cache anchor not found');
  bootstrap = bootstrap.replace(
    cacheAnchor,
    `${cacheAnchor}\nif (!index.includes('/navigation-v688.js')) index = index.replace('</body>', '<script src=\"/navigation-v688.js?v=6880\" defer></script></body>'); // ASIRI_STANDALONE_NAV_V688`
  );
}

const routeAnchor = "app.get('/v683.css', (_req, res) => res.sendFile(path.join(root, 'v683.css')));";
if (!bootstrap.includes("app.get('/navigation-v688.js'")) {
  if (!bootstrap.includes(routeAnchor)) throw new Error('v6.8.8 failed: navigation static route anchor not found');
  bootstrap = bootstrap.replace(
    routeAnchor,
    `${routeAnchor}\napp.get('/navigation-v688.js', (_req, res) => {\n  res.setHeader('Cache-Control', 'no-store, max-age=0');\n  res.sendFile(path.join(root, 'navigation-v688.js'));\n});`
  );
}

await fs.writeFile(bootstrapPath, bootstrap, 'utf8');
console.log('standalone-navigation-v6.8.8', { independentRuntime: true, noStore: true, forcedPageDisplay: true, hashRouting: true });
