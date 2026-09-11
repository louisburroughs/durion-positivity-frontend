/**
 * Site-map domain model.
 *
 * These interfaces describe the shape of `site-map.data.json` — the single
 * source of truth for the in-app site index. The same JSON file is consumed by:
 *   - the Angular sitemap page (human-readable index), and
 *   - `scripts/sitemap/generate-sitemap.mjs`, which emits the public
 *     `sitemap.json` artifact for the backend `pos-mcp-server`.
 *
 * Keeping this framework-free (interfaces only, no Angular imports) lets both
 * the app and the plain-Node generator share one contract without coupling.
 */
export interface SiteMapSection {
  /** Canonical in-app route, e.g. `/app/crm`. */
  route: string;
  /** Translation key for the section title (reuses the `SHELL.NAV.*` keys). */
  titleKey: string;
  /** Translation key for the section description under `SITEMAP.SECTIONS.*`. */
  descriptionKey: string;
  /** Roles required to see this section; undefined = all authenticated users. */
  roles?: readonly string[];
  /**
   * Any one of these permissions admits (mirrors the route group's
   * `data.permissions`); decides alone when the token carries `perm_bits`,
   * with `roles` as the fallback. Undefined = not permission-gated.
   */
  permissions?: readonly string[];
  /** Visual grouping; groups always render/serialize `main` before `admin`. */
  group: 'main' | 'admin';
  /** Sort order within the section's group (lower sorts earlier). */
  order: number;
}

export interface SiteMapData {
  /** Owning application identifier. */
  application: string;
  /** Contract version — bump on breaking shape changes (see docs/sitemap). */
  version: number;
  sections: SiteMapSection[];
}

/**
 * A single reachable route, auto-extracted from the Angular route tree by
 * `scripts/sitemap/extract-routes.mjs`. Backs the generated
 * `site-map.routes.generated.ts` (consumed by the sitemap page) and the
 * `pages[]` in the `sitemap.json` artifact.
 */
export interface SiteMapRouteEntry {
  /** Full route path, e.g. `/app/crm/customers` or `/app/crm/party/:partyId`. */
  route: string;
  /** Derived label from the last static path segment; '' for a section root. */
  label: string;
  /** True when the route contains a `:param` and cannot be linked directly. */
  dynamic: boolean;
  /** Roles required to reach this route; undefined = all authenticated users. */
  roles?: readonly string[];
  /** Any one of these permissions admits; undefined = no permission constraint. */
  permissions?: readonly string[];
  /** All of these permissions are required; undefined = no such constraint. */
  allPermissions?: readonly string[];
}

/**
 * The access requirement a group's mount route under `/app` declares
 * (`data.roles` / `data.permissions` / `data.allPermissions`), extracted by
 * `scripts/sitemap/extract-routes.mjs` into `site-map.routes.generated.ts`.
 * A section root is exactly as protected as its mount, whatever the curated
 * data says, so both the sitemap page and the public artifact filter on it.
 */
export type SiteMapMountEntry = Pick<
  SiteMapRouteEntry,
  'route' | 'roles' | 'permissions' | 'allPermissions'
>;
