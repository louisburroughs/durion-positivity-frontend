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
