
import { Component, DestroyRef, Type, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseOrderDetail } from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';
import { SUPPLIER_TRANSMISSION_PANELS } from '../../../../../shared/positivity/supplier-transmission-panels.tokens';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

interface HostedPanelTypes {
  readonly first: Type<unknown> | null;
  readonly second: Type<unknown> | null;
}

/**
 * Purchase-order detail — the committed, read-only view of an order.
 *
 * The vendor transmission panel (#191) is hosted here because this is the
 * screen that answers "what is happening with this order?": `po-form` edits
 * lines before commitment, where no transmission state can exist.
 *
 * The vendor transmission timeline (#215) is hosted alongside it: one read
 * (`listPurchaseOrderTransmissionEvents`, `@durion-sdk/order`) now replaces
 * both the shipment-event timeline and the transmission-status history that
 * were retired in #201.
 *
 * Both panels are self-contained domain components that own their own state
 * and their own generated client (ADR-0010). This page passes a purchase-order
 * id and nothing else — no supplier/order service is injected here and no
 * supplier/order model is imported, so a vendor outage degrades one section
 * only. Since #347, the panels themselves are positivity's, resolved through
 * the `SUPPLIER_TRANSMISSION_PANELS` shared contract (LAY-03) and rendered
 * with `NgComponentOutlet` rather than imported directly.
 */
@Component({
  selector: 'app-po-detail',
  standalone: true,
  imports: [TranslatePipe, NgComponentOutlet],
  templateUrl: './po-detail.component.html',
  styleUrl: './po-detail.component.css',
})
export class PoDetailComponent {
  private readonly poService = inject(InventoryPurchaseOrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly panelSource = inject(SUPPLIER_TRANSMISSION_PANELS);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly order = signal<PurchaseOrderDetail | null>(null);

  /** `first` hosts #191, `second` hosts #215 — see the template. */
  readonly panelTypes = signal<HostedPanelTypes>({ first: null, second: null });

  constructor() {
    this.panelSource.loadSupplierTransmissionPanel().then(type =>
      this.panelTypes.update(current => ({ ...current, first: type })),
    );
    this.panelSource.loadPurchaseOrderTransmissionTimelinePanel().then(type =>
      this.panelTypes.update(current => ({ ...current, second: type })),
    );

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
