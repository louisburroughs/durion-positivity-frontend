/**
 * Generate the public `sitemap.json` build artifact (contract v2).
 *
 * Combines two sources:
 *   - `site-map.data.json` — curated top-level sections (translated titles,
 *     descriptions, grouping, order).
 *   - the Angular route tree (via extract-routes.mjs) — every reachable page
 *     under `/app`, attached to its section as `pages[]` (including dynamic
 *     `:param` routes as patterns, with required roles).
 *
 * This is the decoupled contract consumed by the backend `pos-mcp-server`:
 *   - The frontend OWNS the site structure and publishes it as a read-only,
 *     versioned JSON artifact served at `/sitemap.json`.
 *   - `pos-mcp-server` PULLS that artifact (or bakes it in at deploy time).
 *   - Neither repo imports the other; the only shared thing is the JSON schema
 *     documented in `docs/sitemap/`.
 *
 * i18n title/description keys are resolved to the base (en-US) locale so the
 * artifact is self-contained; the key is preserved alongside the resolved text.
 *
 * Usage: node scripts/sitemap/generate-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractAppRoutes, deriveLabel, repoRoot } from './extract-routes.mjs';

const sourcePath = path.join(repoRoot, 'src/app/features/sitemap/site-map.data.json');
const baseLocalePath = path.join(repoRoot, 'src/assets/i18n/en-US.json');
const outputPath = path.join(repoRoot, 'public/sitemap.json');

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Resolve a dotted translation key (e.g. `SHELL.NAV.CRM`) against a locale tree. */
function resolveKey(tree, key) {
  const value = key.split('.').reduce((node, part) => {
    if (node && typeof node === 'object' && part in node) return node[part];
    return undefined;
  }, tree);
  return typeof value === 'string' ? value : null;
}

/** Top-level section route a page belongs to (e.g. `/app/crm/x` → `/app/crm`). */
function sectionRouteOf(route) {
  if (route === '/app') return '/app';
  return `/app/${route.slice('/app/'.length).split('/')[0]}`;
}

function titleCase(segment) {
  return segment
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// Group precedence for the artifact. This is a SUPERSET of the page's order:
// sitemap-page.component.ts renders only the curated 'main'/'admin' groups, while
// the artifact appends 'other' (auto-discovered top-level segments) after them.
// Keep the shared 'main' < 'admin' precedence aligned; 'other' is artifact-only.
const GROUP_ORDER = ['main', 'admin', 'other'];

const source = loadJson(sourcePath);
const baseLocale = loadJson(baseLocalePath);
const curatedByRoute = new Map(source.sections.map(s => [s.route, s]));

// Group every reachable route under its section.
const groups = new Map();
for (const entry of extractAppRoutes()) {
  const key = sectionRouteOf(entry.route);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(entry);
}

const missingKeys = [];
let synthOrder = 900;

const sections = [];
for (const [sectionRoute, entries] of groups) {
  const curated = curatedByRoute.get(sectionRoute);
  let base;

  if (curated) {
    const title = resolveKey(baseLocale, curated.titleKey);
    const description = resolveKey(baseLocale, curated.descriptionKey);
    if (title === null) missingKeys.push(curated.titleKey);
    if (description === null) missingKeys.push(curated.descriptionKey);
    base = {
      route: curated.route,
      titleKey: curated.titleKey,
      title: title ?? curated.titleKey,
      descriptionKey: curated.descriptionKey,
      description: description ?? curated.descriptionKey,
      ...(curated.roles ? { roles: curated.roles } : {}),
      group: curated.group,
      order: curated.order,
    };
  } else {
    // Auto-discovered top-level segment with no curated metadata.
    base = {
      route: sectionRoute,
      title: titleCase(sectionRoute.slice('/app/'.length)) || 'App',
      group: 'other',
      order: synthOrder++,
    };
  }

  base.pages = entries
    .filter(e => e.route !== base.route)
    .sort((a, b) => Number(a.dynamic) - Number(b.dynamic) || a.route.localeCompare(b.route))
    .map(e => ({
      route: e.route,
      label: deriveLabel(e.route),
      dynamic: e.dynamic,
      ...(e.params && e.params.length ? { params: e.params } : {}),
      ...(e.roles ? { roles: e.roles } : {}),
    }));

  sections.push(base);
}

if (missingKeys.length > 0) {
  console.error('FAIL sitemap generation: missing i18n keys in en-US.json:');
  for (const key of missingKeys) console.error(`  - ${key}`);
  process.exit(1);
}

sections.sort((a, b) => {
  const byGroup = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
  return byGroup !== 0 ? byGroup : a.order - b.order;
});

const pageCount = sections.reduce((n, s) => n + s.pages.length, 0);

const artifact = {
  application: source.application,
  version: source.version,
  generatedAt: new Date().toISOString(),
  sections,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(
  `Generated ${path.relative(repoRoot, outputPath)} ` +
    `(${sections.length} sections, ${pageCount} pages) from site-map.data.json + route tree.`,
);
