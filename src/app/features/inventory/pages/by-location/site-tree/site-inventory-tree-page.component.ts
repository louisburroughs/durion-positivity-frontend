import { ChangeDetectionStrategy, Component } from '@angular/core';

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
  template: `
    <section class="page-placeholder" aria-labelledby="siteInventoryHeading">
      <h1 id="siteInventoryHeading">Site Inventory</h1>
      <p>Site storage-location tree arrives with story F2.</p>
    </section>
  `,
})
export class SiteInventoryTreePageComponent {}
