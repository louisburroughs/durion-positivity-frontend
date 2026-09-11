/**
 * Generate `src/app/features/sitemap/site-map.routes.generated.ts` from the
 * Angular route tree (via extract-routes.mjs).
 *
 * The generated module is COMMITTED (like the msIcon glyph map) so the app and
 * its tests always have it, and `--check` fails CI if it drifts from the routes.
 *
 * Usage:
 *   node scripts/sitemap/generate-routes-module.mjs           # write
 *   node scripts/sitemap/generate-routes-module.mjs --check   # verify fresh
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { extractAppMounts, extractAppRoutes, deriveLabel, deriveLabelKey, repoRoot } from './extract-routes.mjs';

const OUT = resolve(repoRoot, 'src/app/features/sitemap/site-map.routes.generated.ts');
const checkOnly = process.argv.includes('--check');

const entries = extractAppRoutes().map(r => ({
  route: r.route,
  label: deriveLabel(r.route),
  labelKey: deriveLabelKey(r.route),
  dynamic: r.dynamic,
  roles: r.roles ?? null,
  permissions: r.permissions ?? null,
  allPermissions: r.allPermissions ?? null,
}));

const list = (name, codes) => (codes ? `, ${name}: [${codes.map(c => `'${c}'`).join(', ')}]` : '');
const accessOf = e => list('roles', e.roles) + list('permissions', e.permissions) + list('allPermissions', e.allPermissions);

const lines = entries
  .map(
    e =>
      `  { route: '${e.route}', label: ${JSON.stringify(e.label)}, labelKey: ${JSON.stringify(e.labelKey)}, dynamic: ${e.dynamic}${accessOf(e)} },`,
  )
  .join('\n');

const mountLines = extractAppMounts()
  .map(m => `  { route: '${m.route}'${accessOf(m)} },`)
  .join('\n');

const content = `// GENERATED — do not edit by hand.
// Source: src/app/app.routes.ts + feature *.routes.ts (parsed by scripts/sitemap/extract-routes.mjs)
// Regenerate: npm run sitemap:routes:generate
//
// Every reachable route under the authenticated /app shell, with a derived label
// (English, kept for stable sorting — never rendered), its translation key
// (SITEMAP.LABEL.*, what the sitemap page actually renders), dynamic-param flag,
// and required roles/permissions.
import type { SiteMapMountEntry, SiteMapRouteEntry } from './models/site-map-section.model';

export const SITE_MAP_ROUTES: readonly SiteMapRouteEntry[] = [
${lines}
];

// The access requirement on each group's mount route under /app — what admits
// or refuses the whole group, and so its section root in the sitemap.
export const SITE_MAP_MOUNTS: readonly SiteMapMountEntry[] = [
${mountLines}
];
`;

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error('FAIL sitemap routes check: site-map.routes.generated.ts is missing.');
    console.error('Run: npm run sitemap:routes:generate');
    process.exit(1);
  }
  if (readFileSync(OUT, 'utf8') !== content) {
    console.error('FAIL sitemap routes check: site-map.routes.generated.ts is stale.');
    console.error('Run: npm run sitemap:routes:generate');
    process.exit(1);
  }
  console.log('PASS sitemap routes check: site-map.routes.generated.ts is up to date.');
  process.exit(0);
}

writeFileSync(OUT, content, 'utf8');
console.log(`Generated ${relative(repoRoot, OUT)} (${entries.length} routes).`);
