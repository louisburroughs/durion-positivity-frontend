import { describe, expect, it } from 'vitest';
import { buildSitemap } from './build-sitemap.mjs';
import { extractAppMounts } from './extract-routes.mjs';

interface PublicPage {
  route: string;
  [key: string]: unknown;
}
interface PublicSection {
  route: string;
  pages: PublicPage[];
  [key: string]: unknown;
}

/**
 * The public sitemap.json is served unauthenticated (src/server.ts), so it must
 * enumerate only what any authenticated user can reach: no section whose group
 * mount is gated in app.routes.ts, no gated page, no access fields at all.
 */
describe('public sitemap artifact', () => {
  const { artifact } = buildSitemap() as { artifact: { sections: PublicSection[] } };
  const sections = artifact.sections;
  const sectionRoutes = sections.map(section => section.route);
  const mounts = extractAppMounts() as {
    route: string;
    roles: string[] | null;
    permissions: string[] | null;
    allPermissions: string[] | null;
  }[];

  it('finds the mounts it is meant to check', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(14);
    expect(mounts.some(m => m.permissions)).toBe(true);
    expect(mounts.some(m => m.roles)).toBe(true);
  });

  it('publishes no section root whose group mount is role- or permission-gated', () => {
    const gatedMounts = mounts
      .filter(m => m.roles || m.permissions || m.allPermissions)
      .map(m => m.route);
    const leaked = gatedMounts.filter(route => sectionRoutes.includes(route));

    expect(gatedMounts).toEqual(expect.arrayContaining(['/app/crm', '/app/people', '/app/billing', '/app/security', '/app/platform']));
    expect(leaked).toEqual([]);
  });

  it('keeps the sections every authenticated user can reach', () => {
    expect(sectionRoutes).toContain('/app');
    expect(sectionRoutes).toContain('/app/sitemap');
  });

  it('emits no access fields on any section or page', () => {
    const fields = ['roles', 'permissions', 'allPermissions'];
    const offenders = sections.flatMap(section => [
      ...fields.filter(f => f in section).map(f => `${section.route}: ${f}`),
      ...section.pages.flatMap(page => fields.filter(f => f in page).map(f => `${page.route}: ${f}`)),
    ]);

    expect(offenders).toEqual([]);
  });
});
