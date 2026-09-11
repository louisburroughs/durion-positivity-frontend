import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  RouteAccessRequirement,
  canAccess,
} from '../../../../core/security/route-access';
import { AuthService } from '../../../../core/services/auth.service';
import {
  SiteMapData,
  SiteMapMountEntry,
  SiteMapRouteEntry,
  SiteMapSection,
} from '../../models/site-map-section.model';
import siteMapData from '../../site-map.data.json';
import { SITE_MAP_MOUNTS, SITE_MAP_ROUTES } from '../../site-map.routes.generated';

interface SiteMapSectionView {
  readonly section: SiteMapSection;
  /** Static (directly linkable) child pages of this section, role-filtered. */
  readonly pages: readonly SiteMapRouteEntry[];
}

interface SiteMapGroup {
  /** Translation key for the group heading, e.g. `SITEMAP.GROUP.MAIN`. */
  readonly headingKey: string;
  readonly sections: readonly SiteMapSectionView[];
}

const DATA = siteMapData as SiteMapData;

const GROUP_ORDER: readonly SiteMapSection['group'][] = ['main', 'admin'];
const GROUP_HEADING_KEYS: Record<SiteMapSection['group'], string> = {
  main: 'SITEMAP.GROUP.MAIN',
  admin: 'SITEMAP.GROUP.ADMIN',
};

/** Top-level section route a page belongs to (`/app/crm/x` → `/app/crm`). */
function sectionRouteOf(route: string): string {
  if (route === '/app') return '/app';
  return `/app/${route.slice('/app/'.length).split('/')[0]}`;
}

const MOUNT_BY_ROUTE = new Map<string, SiteMapMountEntry>(
  SITE_MAP_MOUNTS.map(mount => [mount.route, mount]),
);

/**
 * What admits a section: the requirement its group's mount route declares in
 * `app.routes.ts` (the guard's own source), with the curated fields as the
 * fallback for a section whose route has no mount of its own.
 */
export function sectionRequirement(section: SiteMapSection): RouteAccessRequirement {
  const mount = MOUNT_BY_ROUTE.get(section.route);
  return {
    roles: mount?.roles ?? section.roles,
    permissions: mount?.permissions ?? section.permissions,
    allPermissions: mount?.allPermissions,
  };
}

/**
 * Human-readable index ("site map") of the application. Sections come from the
 * curated `site-map.data.json` (translated titles, grouping, roles); each
 * section's directly-navigable child pages are pulled from the auto-generated
 * route manifest (`site-map.routes.generated.ts`). Dynamic `:param` routes are
 * omitted from the page (they need an entity id) but are present in the
 * `sitemap.json` artifact. Everything is role-filtered for the current user.
 */
@Component({
  selector: 'app-sitemap-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './sitemap-page.component.html',
  styleUrl: './sitemap-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitemapPageComponent {
  private readonly authService = inject(AuthService);

  /**
   * Access-filtered sections (with their static pages) grouped for display.
   *
   * Runs the same `canAccess` decision as the route guard and the nav registry,
   * so the sitemap never lists a page the guard would bounce (#236). Sections
   * are admitted by their group's mount requirement from the route tree (see
   * `sectionRequirement`); generated page entries carry whatever their route
   * declares.
   */
  readonly groups = computed<SiteMapGroup[]>(() => {
    const canSee = (requirement: RouteAccessRequirement): boolean =>
      canAccess(this.authService, requirement);

    const buildView = (section: SiteMapSection): SiteMapSectionView => ({
      section,
      pages: SITE_MAP_ROUTES.filter(
        page =>
          !page.dynamic &&
          page.route !== section.route &&
          sectionRouteOf(page.route) === section.route &&
          canSee(page),
      ).sort((a, b) => a.label.localeCompare(b.label)),
    });

    const visible = DATA.sections.filter(section => canSee(sectionRequirement(section)));

    return GROUP_ORDER.map(group => ({
      headingKey: GROUP_HEADING_KEYS[group],
      sections: visible
        .filter(section => section.group === group)
        .sort((a, b) => a.order - b.order)
        .map(buildView),
    })).filter(entry => entry.sections.length > 0);
  });

  readonly state = computed<'ready' | 'empty'>(() =>
    this.groups().length > 0 ? 'ready' : 'empty',
  );
}
