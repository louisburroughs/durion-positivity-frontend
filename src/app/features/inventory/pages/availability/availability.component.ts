import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { AvailabilityView } from '../../models/inventory.models';
import { InventoryService } from '../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-inventory-availability',
  standalone: true,
  imports: [CommonModule, TranslatePipe, FormsModule, RouterLink],
  templateUrl: './availability.component.html',
  styleUrl: './availability.component.css',
})
export class AvailabilityComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly skuInput = signal('');
  readonly locationIdInput = signal('');
  readonly results = signal<AvailabilityView[]>([]);

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const sku = params.get('sku');
    const locationId = params.get('locationId') ?? undefined;
    if (sku) {
      this.skuInput.set(sku);
      if (locationId) {
        this.locationIdInput.set(locationId);
      }
      this.search();
    }
  }

  onSkuChange(v: string): void {
    this.skuInput.set(v);
  }

  onLocationChange(v: string): void {
    this.locationIdInput.set(v);
  }

  search(): void {
    const sku = this.skuInput().trim();
    if (!sku) {
      return;
    }
    const locationId = this.locationIdInput().trim() || undefined;

    this.state.set('loading');
    this.errorKey.set(null);

    this.inventoryService
      .queryAvailability(sku, locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => {
          this.results.set(rows);
          this.state.set(rows.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.AVAILABILITY.ERROR.LOAD');
        },
      });
  }
}
