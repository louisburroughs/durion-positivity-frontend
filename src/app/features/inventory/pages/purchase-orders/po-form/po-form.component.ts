import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  CreatePurchaseOrderLine,
  CreatePurchaseOrderRequest,
} from '../../../models/inventory.models';
import { InventoryPurchaseOrderService } from '../../../services/inventory-purchase-order.service';

type PageState = 'idle' | 'loading' | 'empty' | 'ready' | 'error';

@Component({
  selector: 'app-po-form',
  standalone: true,
  imports: [CommonModule, TranslatePipe, FormsModule],
  templateUrl: './po-form.component.html',
  styleUrl: './po-form.component.css',
})
export class PoFormComponent {
  private readonly poService = inject(InventoryPurchaseOrderService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly supplierId = signal('');
  readonly scheduledDeliveryDate = signal('');
  readonly notes = signal('');
  readonly lines = signal<CreatePurchaseOrderLine[]>([]);
  readonly submitting = signal(false);
  readonly editingPoId = signal<string | null>(null);

  constructor() {
    const poId = this.route.snapshot.paramMap.get('poId');
    if (poId) {
      this.editingPoId.set(poId);
      this.loadExistingPo(poId);
    } else {
      this.state.set('ready');
    }
  }

  private loadExistingPo(poId: string): void {
    this.state.set('loading');
    this.errorKey.set(null);

    this.poService
      .getPurchaseOrder(poId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: po => {
          this.supplierId.set(po.supplierId);
          this.scheduledDeliveryDate.set(po.scheduledDeliveryDate);
          this.notes.set(po.notes ?? '');
          this.lines.set(
            po.lines.map(l => ({
              productSku: l.productSku,
              orderedQty: l.orderedQty,
              unitPrice: l.unitPrice,
            })),
          );
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.FORM.ERROR.LOAD');
        },
      });
  }

  addLine(): void {
    this.lines.update(lines => [...lines, { productSku: '', orderedQty: 1, unitPrice: 0 }]);
  }

  removeLine(idx: number): void {
    this.lines.update(lines => lines.filter((_, i) => i !== idx));
  }

  updateLine(idx: number, field: keyof CreatePurchaseOrderLine, val: string | number): void {
    this.lines.update(lines =>
      lines.map((line, i) => (i === idx ? { ...line, [field]: val } : line)),
    );
  }

  submit(): void {
    const poId = this.editingPoId();

    this.submitting.set(true);
    this.errorKey.set(null);

    if (poId) {
      this.poService
        .revisePurchaseOrder(poId, {
          scheduledDeliveryDate: this.scheduledDeliveryDate(),
          notes: this.notes(),
          lines: this.lines(),
        })
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.submitting.set(false)),
        )
        .subscribe({
          next: updated => {
            this.router.navigate(['/app/inventory/purchase-orders', updated.poId]);
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('INVENTORY.PURCHASE_ORDERS.FORM.ERROR.REVISE');
          },
        });
    } else {
      const request: CreatePurchaseOrderRequest = {
        supplierId: this.supplierId(),
        scheduledDeliveryDate: this.scheduledDeliveryDate(),
        notes: this.notes() || undefined,
        lines: this.lines(),
      };

      this.poService
        .createPurchaseOrder(request)
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          finalize(() => this.submitting.set(false)),
        )
        .subscribe({
          next: created => {
            this.router.navigate(['/app/inventory/purchase-orders', created.poId]);
          },
          error: () => {
            this.state.set('error');
            this.errorKey.set('INVENTORY.PURCHASE_ORDERS.FORM.ERROR.CREATE');
          },
        });
    }
  }

  goBack(): void {
    const poId = this.editingPoId();
    if (poId) {
      this.router.navigate(['/app/inventory/purchase-orders', poId]);
    } else {
      this.router.navigate(['/app/inventory/purchase-orders']);
    }
  }
}
