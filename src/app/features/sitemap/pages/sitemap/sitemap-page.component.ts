import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { SiteMapData, SiteMapSection } from '../../models/site-map-section.model';
import siteMapData from '../../site-map.data.json';

interface SiteMapGroup {
  /** Translation key for the group heading, e.g. `SITEMAP.GROUP.MAIN`. */
  readonly headingKey: string;
  readonly sections: readonly SiteMapSection[];
}

const DATA = siteMapData as SiteMapData;

const GROUP_ORDER: readonly SiteMapSection['group'][] = ['main', 'admin'];
const GROUP_HEADING_KEYS: Record<SiteMapSection['group'], string> = {
  main: 'SITEMAP.GROUP.MAIN',
  admin: 'SITEMAP.GROUP.ADMIN',
};

/**
 * Human-readable index ("site map") of the application. Renders the curated,
 * role-filtered section list from `site-map.data.json`. The same data file is
 * exported as the public `sitemap.json` artifact for `pos-mcp-server`, so the
 * page and the machine-readable contract never drift.
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

  /** Role-filtered sections grouped for display; empty groups are omitted. */
  readonly groups = computed<SiteMapGroup[]>(() => {
    const visible = DATA.sections.filter(
      section => !section.roles || this.authService.hasAnyRole(section.roles),
    );

    return GROUP_ORDER.map(group => ({
      headingKey: GROUP_HEADING_KEYS[group],
      sections: visible
        .filter(section => section.group === group)
        .sort((a, b) => a.order - b.order),
    })).filter(entry => entry.sections.length > 0);
  });

  readonly state = computed<'ready' | 'empty'>(() =>
    this.groups().length > 0 ? 'ready' : 'empty',
  );
}
