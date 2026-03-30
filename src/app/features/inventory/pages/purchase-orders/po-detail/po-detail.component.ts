import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-po-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './po-detail.component.html',
  styleUrl: './po-detail.component.css',
})
export class PoDetailComponent {
  private readonly poService = inject(InventoryPurchaseOrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<PurchaseOrderDetail | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const poId = params.get('poId');
        if (!poId) {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.DETAIL.ERROR.LOAD');
          return;
        }
        this.loadOrder(poId);
      });
  }

  loadOrder(poId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.poService
      .getPurchaseOrder(poId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: order => {
          this.order.set(order);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.DETAIL.ERROR.LOAD');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/app/inventory/purchase-orders']);
  }

  goToEdit(): void {
    const order = this.order();
    if (order) {
      this.router.navigate(['/app/inventory/purchase-orders', order.poId, 'edit']);
    }
  }

  cancel(): void {
    const order = this.order();
    if (!order) return;

    this.poService
      .cancelPurchaseOrder(order.poId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.router.navigate(['/app/inventory/purchase-orders']);
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.DETAIL.ERROR.CANCEL');
        },
      });
  }
}
