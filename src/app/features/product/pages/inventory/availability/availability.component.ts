import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import {
  InventoryAvailability,
  LocationInventory,
} from '../../../models/availability.models';
import { ProductInventoryService } from '../../../services/product-inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-availability',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './availability.component.html',
  styleUrl: './availability.component.css',
})
export class AvailabilityComponent {
  private readonly inventory = inject(ProductInventoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly sku = signal('');
  readonly locationId = signal<string | null>(null);
  readonly availability = signal<InventoryAvailability | null>(null);
  readonly locationBreakdown = signal<LocationInventory[]>([]);

  search(): void {
    const sku = this.sku().trim();
    if (!sku) {
      this.availability.set(null);
      this.locationBreakdown.set([]);
      this.state.set('idle');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    this.inventory
      .queryInventoryAvailability(sku, this.locationId() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: availability => {
          this.availability.set(availability);
          this.locationBreakdown.set(availability.locationBreakdown ?? []);
          this.state.set((availability.locationBreakdown?.length ?? 0) > 0 ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('PRODUCT.INVENTORY.AVAILABILITY.ERROR.LOAD');
        },
      });
  }
}
