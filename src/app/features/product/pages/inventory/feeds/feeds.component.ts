import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  FeedSourceType,
  LeadTime,
  SkuAvailability,
} from '../../../models/availability.models';
import { ProductInventoryService } from '../../../services/product-inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-feeds',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './feeds.component.html',
  styleUrl: './feeds.component.css',
})
export class FeedsComponent {
  private readonly inventory = inject(ProductInventoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly activeTab = signal<FeedSourceType>('MFR');
  readonly sku = signal('');
  readonly availability = signal<SkuAvailability[]>([]);
  readonly leadTime = signal<LeadTime[]>([]);

  search(): void {
    const sku = this.sku().trim();
    if (!sku) {
      this.availability.set([]);
      this.leadTime.set([]);
      this.state.set('idle');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      availability: this.inventory.queryAvailabilityBySku(sku, this.activeTab()),
      leadTime: this.inventory.queryLeadTime(sku, this.activeTab()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.availability.set(result.availability);
          this.leadTime.set(result.leadTime);
          this.state.set(result.availability.length > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.INVENTORY.FEEDS.ERROR.LOAD');
        },
      });
  }
}
