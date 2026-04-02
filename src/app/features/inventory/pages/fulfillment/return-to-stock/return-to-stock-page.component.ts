import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import {
  LocationRef,
  ReturnReasonCode,
  ReturnToStockResult,
  ReturnableItem,
  StorageLocation,
} from '../../../models/inventory.models';
import { InventoryDomainService } from '../../../services/inventory.service';

type PageState = 'idle' | 'loading' | 'ready' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'app-return-to-stock-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, RouterLink],
  templateUrl: './return-to-stock-page.component.html',
  styleUrls: ['./return-to-stock-page.component.css'],
})
export class ReturnToStockPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryDomainService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly items = signal<ReturnableItem[]>([]);
  readonly reasonCodes = signal<ReturnReasonCode[]>([]);
  readonly locations = signal<LocationRef[]>([]);
  readonly storageLocations = signal<StorageLocation[]>([]);
  readonly selectedLocationId = signal<string | null>(null);
  readonly selectedStorageLocationId = signal<string | null>(null);
  readonly selectedReasonCode = signal<string | null>(null);
  readonly returnQtys = signal<Partial<Record<string, number>>>({});
  readonly submitResult = signal<ReturnToStockResult | null>(null);

  readonly canSubmit = computed(() => {
    const hasLocation = !!this.selectedLocationId();
    const hasReason = !!this.selectedReasonCode();
    const hasLine = Object.values(this.returnQtys()).some(qty => (qty ?? 0) > 0);
    return hasLocation && hasReason && hasLine;
  });

  constructor() {
    this.loadInitial();

    effect((onCleanup) => {
      const locationId = this.selectedLocationId();
      if (!locationId) {
        this.storageLocations.set([]);
        this.selectedStorageLocationId.set(null);
        return;
      }

      const sub = this.inventoryService
        .getStorageLocations(locationId)
        .subscribe({
          next: locations => {
            this.storageLocations.set(locations);
            if (this.state() === 'error') {
              this.errorKey.set(null);
              this.state.set('ready');
            }
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.STORAGE_LOCATIONS');
            this.storageLocations.set([]);
            this.selectedStorageLocationId.set(null);
          },
        });

      onCleanup(() => sub.unsubscribe());
    }, { allowSignalWrites: true });
  }

  updateReturnQty(workorderLineId: string, quantity: number): void {
    const max = this.items().find(item => item.workorderLineId === workorderLineId)?.maxReturnableQty ?? 0;
    const normalized = Math.max(0, Math.min(quantity, max));
    this.returnQtys.update(current => ({ ...current, [workorderLineId]: normalized }));
  }

  submit(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    const locationId = this.selectedLocationId();
    const reasonCode = this.selectedReasonCode();

    if (!workorderId || !locationId || !reasonCode || !this.canSubmit()) {
      return;
    }

    const lines = this.items()
      .map(item => ({
        workorderLineId: item.workorderLineId,
        quantityToReturn: this.returnQtys()[item.workorderLineId] ?? 0,
      }))
      .filter(line => line.quantityToReturn > 0);

    this.state.set('submitting');
    this.errorKey.set(null);

    this.inventoryService
      .submitReturnToStock({
        workorderId,
        locationId,
        storageLocationId: this.selectedStorageLocationId() ?? undefined,
        reasonCode,
        lines,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.submitResult.set(result);
          this.state.set('success');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.SUBMIT');
        },
      });
  }

  private loadInitial(): void {
    const workorderId = this.route.snapshot.paramMap.get('workorderId');
    if (!workorderId) {
      this.state.set('error');
      this.errorKey.set('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.MISSING_ID');
      return;
    }

    this.state.set('loading');
    this.errorKey.set(null);

    forkJoin({
      items: this.inventoryService.getReturnableItems(workorderId),
      reasons: this.inventoryService.getReasonCodes('RETURN'),
      locations: this.inventoryService.getLocations(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ items, reasons, locations }) => {
          this.items.set(items);
          this.reasonCodes.set(reasons);
          this.locations.set(locations);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.FULFILLMENT.RETURN_TO_STOCK.ERROR.LOAD');
        },
      });
  }
}
