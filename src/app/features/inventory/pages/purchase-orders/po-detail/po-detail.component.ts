
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { SupplierTransmissionPanelComponent } from '../../../../positivity/components/supplier-transmission-panel/supplier-transmission-panel.component';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

/**
 * Purchase-order detail — the committed, read-only view of an order.
 *
 * The vendor transmission panel (#191) is hosted here because this is the
 * screen that answers "what is happening with this order?": `po-form` edits
 * lines before commitment, where no transmission state can exist. The
 * shipment-event timeline (#193) was retired in #201 — the generated supplier
 * client has no shipment-event read.
 *
 * The panel is a supplier-domain component that owns its own state and its
 * own generated client (ADR-0010). This page passes a purchase-order id and
 * nothing else — no supplier service is injected here and no supplier model
 * is imported, so a vendor outage degrades that section only.
 */
@Component({
  selector: 'app-po-detail',
  standalone: true,
  imports: [TranslatePipe, SupplierTransmissionPanelComponent],
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
