import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CurrencyPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  SupplierAvailability,
  SupplierAvailabilityLine,
  SupplierAvailabilityVendor,
} from '../../models/supplier-availability.models';
import { InventorySupplierAvailabilityService } from '../../services/inventory-supplier-availability.service';

type PanelState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Live supplier availability check for one purchase-order line (#212).
 *
 * Read-only: issues only the `@durion-sdk/supplier` fan-out GET
 * (`getSupplierStockAvailability`), keyed by the line's SKU, and never
 * mutates anything. A delivery location and, optionally, a quantity are
 * supplied by the operator — the PO form carries neither today. See
 * `InventorySupplierAvailabilityService` for why the fan-out read was chosen
 * over `getPurchaseOrderSupplierAvailability`.
 *
 * Per-vendor answers are partial by design (bounded fan-out deadline): a
 * vendor that did not answer is a normal row (`SUPPLIER_UNAVAILABLE`), never
 * an error state for the whole panel.
 */
@Component({
  selector: 'app-po-supplier-availability-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, CurrencyPipe],
  templateUrl: './po-supplier-availability-panel.component.html',
  styleUrl: './po-supplier-availability-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PoSupplierAvailabilityPanelComponent {
  private readonly service = inject(InventorySupplierAvailabilityService);
  private readonly destroyRef = inject(DestroyRef);

  /** SKU of the purchase-order line this panel checks. */
  readonly sku = input.required<string>();

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly result = signal<SupplierAvailability | null>(null);

  readonly form = new FormGroup({
    deliveryLocationId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    quantity: new FormControl<number | null>(null),
  });

  readonly vendors = computed<readonly SupplierAvailabilityVendor[]>(() => this.result()?.vendors ?? []);

  readonly hasSku = computed(() => this.sku().trim().length > 0);

  checkAvailability(): void {
    if (!this.hasSku() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const deliveryLocationId = this.form.controls.deliveryLocationId.value.trim();
    const quantity = this.form.controls.quantity.value;

    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .checkAvailability({
        sku: this.sku(),
        deliveryLocationId,
        quantity: quantity ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: availability => {
          this.result.set(availability);
          this.state.set('ready');
        },
        error: () => {
          this.result.set(null);
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set('INVENTORY.PURCHASE_ORDERS.FORM.AVAILABILITY.ERROR.LOAD');
        },
      });
  }

  /** Best-effort single line for a vendor's answer about this one SKU. */
  firstLine(vendor: SupplierAvailabilityVendor): SupplierAvailabilityLine | null {
    return vendor.lines.length > 0 ? vendor.lines[0] : null;
  }
}
