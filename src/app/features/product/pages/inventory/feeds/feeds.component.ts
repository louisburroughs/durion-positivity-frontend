import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { FeedSourceType } from '../../../models/availability.models';

type PageState = 'idle' | 'unavailable';

@Component({
  selector: 'app-feeds',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './feeds.component.html',
  styleUrl: './feeds.component.css',
})
export class FeedsComponent {
  readonly state = signal<PageState>('idle');
  readonly activeTab = signal<FeedSourceType>('MFR');
  readonly sku = signal('');

  /**
   * Vendor-feed availability/lead-time isn't available yet: the corrected
   * `/v1/inventory/availability/*` paths (issue #370) expect a `productSku` +
   * WAREHOUSE/SUPPLIER/TRANSIT `sourceType` contract, not this MFR/DISTRIBUTOR
   * vendor-feed shape, and the backend has no equivalent for it yet
   * (backend #2213). Rather than call an endpoint that cannot serve this
   * request, show a notice — `ProductInventoryService.queryAvailabilityBySku`/
   * `queryLeadTime` were removed with the same change.
   */
  search(): void {
    const sku = this.sku().trim();
    if (!sku) {
      this.state.set('idle');
      return;
    }

    this.state.set('unavailable');
  }
}
