/**
 * Static route extractor for the site map.
 *
 * Parses the Angular route tree with the TypeScript compiler API (no Angular
 * runtime, no eager component imports) and returns every reachable route under
 * the authenticated `/app` shell, with its required roles and dynamic-param
 * flag, plus the access requirement on each group's mount route
 * (`extractAppMounts`). Shared by:
 *   - generate-routes-module.mjs → the committed `site-map.routes.generated.ts`
 *     consumed by the Angular sitemap page, and
 *   - generate-sitemap.mjs → the public `sitemap.json` artifact.
 *
 * Only structural fields are read (`path`, `children`, `data.roles`,
 * `loadChildren`, `loadComponent`/`component`, `redirectTo`). Redirects and
 * `**` wildcards are not pages and are skipped.
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '../..');
const APP_ROUTES = resolve(repoRoot, 'src/app/app.routes.ts');

function parseFile(file) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Find an array-initialized const by name (or the first one) in a source file. */
function findRoutesArray(sourceFile, exportName) {
  let result = null;
  const visit = node => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          (!exportName || decl.name.text === exportName) &&
          decl.initializer &&
          ts.isArrayLiteralExpression(decl.initializer)
        ) {
          result = result ?? decl.initializer;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function getProp(objLiteral, name) {
  for (const p of objLiteral.properties) {
    if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name) {
      return p.initializer;
    }
  }
  return null;
}

function stringValue(node) {
  return node && ts.isStringLiteral(node) ? node.text : null;
}

/**
 * The backend permission catalog (`PERMISSION_BY_BIT`), read once from
 * `src/app/core/security/permission-catalog.ts`, so group constants computed
 * with `permissionsInDomains(...)` can be resolved here exactly as at runtime.
 */
let catalogCodes = null;
function catalog() {
  if (catalogCodes) return catalogCodes;
  const file = parseFile(resolve(repoRoot, 'src/app/core/security/permission-catalog.ts'));
  const array = findRoutesArray(file, 'PERMISSION_BY_BIT');
  if (!array) throw new Error('Could not find PERMISSION_BY_BIT in permission-catalog.ts');
  catalogCodes = array.elements.filter(ts.isStringLiteral).map(e => e.text);
  return catalogCodes;
}

/** Same rule as `permissionsInDomains` in route-permissions.ts. */
function permissionsInDomains(selectors) {
  return catalog().filter(code =>
    selectors.some(selector => (selector.endsWith(':') ? code.startsWith(selector) : code === selector)),
  );
}

/**
 * Permission constants from `src/app/core/security/route-permissions.ts`,
 * read once. Gates reference those constants rather than inlining codes, so
 * the route files alone cannot be read literally:
 *   - `X_PAGE.key`      — page gates: `{ key: ['code', ...] }` tables;
 *   - `X_PERMISSIONS`   — group gates on the `/app` mounts: either
 *                         `permissionsInDomains('a:', 'b:c:d')`, resolved
 *                         against the catalog, or an array of string literals
 *                         and `...X_PAGE.key` / `...Y_PERMISSIONS` spreads, or a
 *                         plain `X_PAGE.key` alias.
 */
let permissionTablesCache = null;
function permissionTables() {
  if (permissionTablesCache) return permissionTablesCache;
  const tables = new Map();
  const file = parseFile(resolve(repoRoot, 'src/app/core/security/route-permissions.ts'));

  const unwrap = init => {
    while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) {
      init = init.expression;
    }
    return init;
  };

  // Pass 1: page tables, which group constants may spread.
  const declarations = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(init)) {
        for (const prop of init.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isArrayLiteralExpression(prop.initializer)) continue;
          const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
          if (!key) continue;
          const codes = prop.initializer.elements.filter(ts.isStringLiteral).map(e => e.text);
          if (codes.length) tables.set(`${node.name.text}.${key}`, codes);
        }
      } else {
        declarations.push({ name: node.name.text, init });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  // Pass 2: group constants, in source order so a spread of an earlier one resolves.
  const resolveExpression = expr => {
    expr = unwrap(expr);
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'permissionsInDomains') {
      const selectors = expr.arguments.filter(ts.isStringLiteral).map(a => a.text);
      return selectors.length === expr.arguments.length ? permissionsInDomains(selectors) : null;
    }
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && ts.isIdentifier(expr.name)) {
      return tables.get(`${expr.expression.text}.${expr.name.text}`) ?? null;
    }
    if (ts.isIdentifier(expr)) {
      return tables.get(expr.text) ?? null;
    }
    if (ts.isArrayLiteralExpression(expr)) {
      const codes = [];
      for (const el of expr.elements) {
        if (ts.isStringLiteral(el)) {
          codes.push(el.text);
        } else if (ts.isSpreadElement(el)) {
          const inner = resolveExpression(el.expression);
          if (!inner) return null;
          codes.push(...inner);
        } else {
          return null;
        }
      }
      return codes;
    }
    return null;
  };
  for (const { name, init } of declarations) {
    const codes = resolveExpression(init);
    if (codes && codes.length) tables.set(name, [...new Set(codes)]);
  }

  permissionTablesCache = tables;
  return tables;
}

/**
 * Read a `permissions` / `allPermissions` entry: an array literal, `X_PAGE.key`,
 * or a group constant such as `CRM_PERMISSIONS`.
 */
function permissionsFromData(dataNode, key) {
  if (!dataNode || !ts.isObjectLiteralExpression(dataNode)) return null;
  const node = getProp(dataNode, key);
  if (!node) return null;
  if (ts.isArrayLiteralExpression(node)) {
    const codes = node.elements.filter(ts.isStringLiteral).map(e => e.text);
    return codes.length ? codes : null;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
    return permissionTables().get(`${node.expression.text}.${node.name.text}`) ?? null;
  }
  if (ts.isIdentifier(node)) {
    return permissionTables().get(node.text) ?? null;
  }
  return null;
}

/** Read `data: { roles: [...] }` → array of role strings, or null. */
function rolesFromData(dataNode) {
  if (!dataNode || !ts.isObjectLiteralExpression(dataNode)) return null;
  const rolesNode = getProp(dataNode, 'roles');
  if (rolesNode && ts.isArrayLiteralExpression(rolesNode)) {
    const roles = rolesNode.elements.filter(ts.isStringLiteral).map(e => e.text);
    return roles.length ? roles : null;
  }
  return null;
}

/** From `() => import('x').then(m => m.NAME)` pull the import path + export name. */
function loadChildrenTarget(node) {
  let importPath = null;
  const propNames = [];
  const walk = n => {
    if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      n.arguments[0] &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      importPath = n.arguments[0].text;
    }
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.name)) {
      propNames.push(n.name.text);
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  const exportName = propNames.filter(n => !['then', 'catch', 'finally'].includes(n)).pop() ?? null;
  return importPath ? { importPath, exportName } : null;
}

function mergeRoles(inherited, own) {
  const merged = [...(inherited ?? []), ...(own ?? [])];
  return merged.length ? [...new Set(merged)] : null;
}

function joinPath(base, segment) {
  if (!segment) return base;
  return base === '/' ? `/${segment}` : `${base}/${segment}`;
}

function paramsOf(route) {
  return route
    .split('/')
    .filter(s => s.startsWith(':'))
    .map(s => s.slice(1));
}

/**
 * Explicit overrides for routes whose last path segment title-cases into a
 * bare imperative verb (e.g. `submit` → "Submit"). Those labels read as page
 * actions rather than page names, which trips the audit's anchor-as-action
 * check (ADR-0037) on the sitemap page and are poor UX regardless — a link
 * just called "Submit" doesn't say what it submits.
 */
const LABEL_OVERRIDES = {
  '/app/accounting/events/submit': 'Event Submission',
};

/**
 * Derive a human label from a route's last static segment (title-cased).
 * Returns '' for a bare section root (e.g. `/app`, `/app/crm`) — callers use the
 * curated section title in that case.
 */
export function deriveLabel(route) {
  if (LABEL_OVERRIDES[route]) return LABEL_OVERRIDES[route];
  const segments = route
    .replace(/^\/app\/?/, '')
    .split('/')
    .filter(s => s && !s.startsWith(':'));
  if (segments.length <= 1) return ''; // section root — use curated title
  const last = segments[segments.length - 1];
  return last
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Recursively walk a Routes array literal, accumulating full paths.
 * @returns array of { route, roles, dynamic, params }
 */
function walkRoutes(arrayLiteral, basePath, inheritedRoles, currentDir) {
  const out = [];
  for (const el of arrayLiteral.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;

    const path = stringValue(getProp(el, 'path'));
    if (path === null || path === '**') continue;
    if (getProp(el, 'redirectTo')) continue; // redirects are not pages

    const roles = mergeRoles(inheritedRoles, rolesFromData(getProp(el, 'data')));
    const full = joinPath(basePath, path);

    const loadChildren = getProp(el, 'loadChildren');
    const children = getProp(el, 'children');

    if (loadChildren) {
      // Fail fast on any unrecognized loadChildren shape or unresolved target —
      // silently skipping would drop whole subtrees from the manifest/contract
      // without a signal, and CI would not catch a route-tree pattern change.
      const target = loadChildrenTarget(loadChildren);
      if (!target) {
        throw new Error(
          `Unable to parse loadChildren for route "${full}" — unexpected pattern. ` +
            `Expected () => import('...').then(m => m.NAME).`,
        );
      }
      const childFile = resolve(currentDir, `${target.importPath}.ts`);
      const childArray = findRoutesArray(parseFile(childFile), target.exportName);
      if (!childArray) {
        throw new Error(
          `Could not find routes array "${target.exportName ?? '(unknown)'}" in ` +
            `${childFile} (referenced by loadChildren on route "${full}").`,
        );
      }
      out.push(...walkRoutes(childArray, full, roles, dirname(childFile)));
      continue; // the mount point itself is not a page
    }

    if (children && ts.isArrayLiteralExpression(children)) {
      // Layout/wrapper node — its own path is a prefix, not a page.
      out.push(...walkRoutes(children, full, roles, currentDir));
      continue;
    }

    if (getProp(el, 'loadComponent') || getProp(el, 'component')) {
      const data = getProp(el, 'data');
      out.push({
        route: full,
        roles,
        permissions: permissionsFromData(data, 'permissions'),
        allPermissions: permissionsFromData(data, 'allPermissions'),
        dynamic: paramsOf(full).length > 0,
        params: paramsOf(full),
      });
    }
  }
  return out;
}

/** The `/app` shell route's children array literal. */
function appShellChildren() {
  const appSource = parseFile(APP_ROUTES);
  const topArray = findRoutesArray(appSource, 'routes');
  if (!topArray) throw new Error('Could not find `routes` array in app.routes.ts');

  for (const el of topArray.elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;
    if (stringValue(getProp(el, 'path')) === 'app') {
      const children = getProp(el, 'children');
      if (children && ts.isArrayLiteralExpression(children)) return children;
    }
  }
  throw new Error('Could not find /app route children in app.routes.ts');
}

/**
 * The access requirement each group mounted directly under `/app` declares on
 * its mount route (`data.roles` / `data.permissions` / `data.allPermissions`
 * on the `/app` child that `loadChildren`s or renders it). That gate admits or
 * refuses the whole group, so a section root is exactly as protected as its
 * mount — which the pages walked by `extractAppRoutes()` do not express, since
 * only `roles` is inherited onto them.
 *
 * Redirects and `**` are skipped; the shell's own '' child (`/app`) is
 * included so the dashboard's (absent) requirement is on record too.
 *
 * @returns array of { route, roles, permissions, allPermissions } sorted by route
 */
export function extractAppMounts() {
  const out = [];
  for (const el of appShellChildren().elements) {
    if (!ts.isObjectLiteralExpression(el)) continue;
    const path = stringValue(getProp(el, 'path'));
    if (path === null || path === '**') continue;
    if (getProp(el, 'redirectTo')) continue;
    if (!getProp(el, 'loadChildren') && !getProp(el, 'loadComponent') && !getProp(el, 'component')) {
      continue;
    }
    const data = getProp(el, 'data');
    out.push({
      route: joinPath('/app', path),
      roles: rolesFromData(data),
      permissions: permissionsFromData(data, 'permissions'),
      allPermissions: permissionsFromData(data, 'allPermissions'),
    });
  }
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Extract every reachable page under `/app`, de-duplicated by route.
 * @returns array of { route, roles, dynamic, params } sorted by route.
 */
export function extractAppRoutes() {
  const routes = walkRoutes(appShellChildren(), '/app', null, dirname(APP_ROUTES));

  // De-dup by route (same path can map to the same component twice); keep first.
  const byRoute = new Map();
  for (const r of routes) {
    if (!byRoute.has(r.route)) byRoute.set(r.route, r);
  }
  return [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route));
}
