/**
 * Build the public `sitemap.json` artifact (contract v2) in memory.
 *
 * Split from `generate-sitemap.mjs` (which writes it) so the redaction
 * invariant can be asserted by a test without touching the filesystem.
 * See that script's header for what the artifact is and who consumes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractAppMounts, extractAppRoutes, deriveLabel, repoRoot } from './extract-routes.mjs';

const sourcePath = path.join(repoRoot, 'src/app/features/sitemap/site-map.data.json');
const baseLocalePath = path.join(repoRoot, 'src/assets/i18n/en-US.json');

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

/**
 * @returns {{ artifact: object, stats: { sections: number, pages: number, redactedSections: number, redactedPages: number } }}
 */
export function buildSitemap() {
const source = loadJson(sourcePath);
const baseLocale = loadJson(baseLocalePath);
const curatedByRoute = new Map(source.sections.map(s => [s.route, s]));
// The gate each group's mount route declares: what actually admits a section.
const mountByRoute = new Map(extractAppMounts().map(m => [m.route, m]));

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

  // Access metadata for the redaction pass below, never emitted: the mount
  // route's requirement from app.routes.ts, with the curated fields as the
  // fallback for a section without a mount of its own.
  const mount = mountByRoute.get(sectionRoute);
  const roles = mount?.roles ?? curated?.roles ?? null;
  const permissions = mount?.permissions ?? curated?.permissions ?? null;
  const allPermissions = mount?.allPermissions ?? null;
  if (roles) base.roles = roles;
  if (permissions) base.permissions = permissions;
  if (allPermissions) base.allPermissions = allPermissions;

  base.pages = entries
    .filter(e => e.route !== base.route)
    .sort((a, b) => Number(a.dynamic) - Number(b.dynamic) || a.route.localeCompare(b.route))
    .map(e => ({
      route: e.route,
      label: deriveLabel(e.route),
      dynamic: e.dynamic,
      ...(e.params && e.params.length ? { params: e.params } : {}),
      // Access metadata travels to the redaction pass below and is never emitted.
      ...(e.roles ? { roles: e.roles } : {}),
      ...(e.permissions ? { permissions: e.permissions } : {}),
      ...(e.allPermissions ? { allPermissions: e.allPermissions } : {}),
    }));

  sections.push(base);
}

if (missingKeys.length > 0) {
  throw new Error(
    `FAIL sitemap generation: missing i18n keys in en-US.json:\n${missingKeys.map(k => `  - ${k}`).join('\n')}`,
  );
}

sections.sort((a, b) => {
  const byGroup = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
  return byGroup !== 0 ? byGroup : a.order - b.order;
});

// The artifact is served unauthenticated (see src/server.ts), so it must not
// enumerate the privileged surface to anonymous callers. Redact it:
//   - drop every section whose mount route (or curated data) is role- or
//     permission-gated — that is every domain group, since each one is gated;
//   - drop role- or permission-gated pages from the sections that remain
//     (e.g. identity-compliance, employees/new);
//   - emit no `roles`, `permissions` or `allPermissions` fields at all.
// The result is an invariant: every route in the artifact is reachable by any
// authenticated user. The in-app route manifest (site-map.routes.generated.ts)
// keeps the full, role-aware tree — the sitemap PAGE is auth-gated and filters
// per user, so admins still see their pages there.
const publicSections = sections
  .filter(section => !section.roles && !section.permissions && !section.allPermissions)
  .map(({ roles: _sectionRoles, permissions: _sectionPermissions, allPermissions: _sectionAll, ...section }) => ({
    ...section,
    pages: section.pages
      .filter(page => !page.roles && !page.permissions && !page.allPermissions)
      .map(
        ({ roles: _pageRoles, permissions: _pagePermissions, allPermissions: _pageAll, ...page }) => page,
      ),
  }));

const redactedSections = sections.length - publicSections.length;
const redactedPages =
  sections.reduce((n, s) => n + s.pages.length, 0) -
  publicSections.reduce((n, s) => n + s.pages.length, 0);
const pageCount = publicSections.reduce((n, s) => n + s.pages.length, 0);

const artifact = {
  application: source.application,
  version: source.version,
  generatedAt: new Date().toISOString(),
  sections: publicSections,
};

return {
  artifact,
  stats: { sections: publicSections.length, pages: pageCount, redactedSections, redactedPages },
};
}
