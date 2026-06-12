import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Site Inventory Tree — storage-location hierarchy with own/rolled-up
 * quantities for one site (spec §3 Screen 2).
 *
 * F1 route scaffolding placeholder; full implementation lands with
 * story F2 (SPEC-inventory-location-rollup-frontend.md §8).
 */
@Component({
  selector: 'app-site-inventory-tree-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="page-placeholder" aria-labelledby="siteInventoryHeading">
      <h1 id="siteInventoryHeading">{{ 'INVENTORY.BY_LOCATION.SITE_PLACEHOLDER.TITLE' | translate }}</h1>
      <p>{{ 'INVENTORY.BY_LOCATION.SITE_PLACEHOLDER.BODY' | translate }}</p>
    </section>
  `,
})
export class SiteInventoryTreePageComponent {}
