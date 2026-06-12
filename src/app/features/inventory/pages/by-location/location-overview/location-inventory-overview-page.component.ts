import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Location Inventory Overview — parent-location rollup with per-site
 * summaries and grand total (spec §3 Screen 1).
 *
 * F1 route scaffolding placeholder; full implementation lands with
 * story F3 (SPEC-inventory-location-rollup-frontend.md §8).
 */
@Component({
  selector: 'app-location-inventory-overview-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <section class="page-placeholder" aria-labelledby="invByLocationHeading">
      <h1 id="invByLocationHeading">{{ 'INVENTORY.BY_LOCATION.OVERVIEW_PLACEHOLDER.TITLE' | translate }}</h1>
      <p>{{ 'INVENTORY.BY_LOCATION.OVERVIEW_PLACEHOLDER.BODY' | translate }}</p>
    </section>
  `,
})
export class LocationInventoryOverviewPageComponent {}
