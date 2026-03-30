import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseOrderDetail, PurchaseOrderPageResponse } from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-po-list',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './po-list.component.html',
  styleUrl: './po-list.component.css',
})
export class PoListComponent {
  private readonly poService = inject(InventoryPurchaseOrderService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly orders = signal<PurchaseOrderDetail[]>([]);
  readonly nextPageToken = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.poService
      .queryPurchaseOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page: PurchaseOrderPageResponse) => {
          this.orders.set(page.items);
          this.nextPageToken.set(page.nextPageToken);
          this.state.set(page.items.length ? 'ready' : 'empty');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.LIST.ERROR.LOAD');
        },
      });
  }

  loadMore(): void {
    const token = this.nextPageToken();
    if (!token) {
      return;
    }
    this.state.set('loading');
    this.poService
      .queryPurchaseOrders({ pageToken: token })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page: PurchaseOrderPageResponse) => {
          this.orders.update(existing => [...existing, ...page.items]);
          this.nextPageToken.set(page.nextPageToken);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.LIST.ERROR.LOAD');
        },
      });
  }

  selectOrder(poId: string): void {
    this.router.navigate(['/app/inventory/purchase-orders', poId]);
  }

  createOrder(): void {
    this.router.navigate(['/app/inventory/purchase-orders/new']);
  }
}
