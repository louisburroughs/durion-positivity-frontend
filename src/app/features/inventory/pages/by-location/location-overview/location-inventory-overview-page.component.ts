import { ChangeDetectionStrategy, Component } from '@angular/core';

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
  template: `
    <section class="page-placeholder" aria-labelledby="invByLocationHeading">
      <h1 id="invByLocationHeading">Inventory by Location</h1>
      <p>Location overview arrives with story F3.</p>
    </section>
  `,
})
export class LocationInventoryOverviewPageComponent {}
