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
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { integerAtLeast, notBlank } from '../../../../core/util/form-validators';
import {
  SupplierAvailability,
  SupplierAvailabilityLine,
  SupplierAvailabilityVendor,
} from '../../models/supplier-availability.models';
import { ProductSupplierAvailabilityService } from '../../services/product-supplier-availability.service';

type PanelState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Live supplier availability check for a catalog product (#212).
 *
 * Read-only: this panel only issues the fan-out GET
 * (`getSupplierStockAvailability`); it never mutates anything. A delivery
 * location and, optionally, a quantity are supplied by the operator, because
 * availability is consignee-specific and there is no location context on
 * the product itself.
 *
 * Per-vendor answers are partial by design (bounded fan-out deadline): a
 * vendor that did not answer is a normal row (`SUPPLIER_UNAVAILABLE`), never
 * an error state for the whole panel. Only a transport/validation failure of
 * the request itself (4xx/5xx from the availability endpoint) moves this
 * panel to `error`.
 */
@Component({
  selector: 'app-supplier-availability-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, CurrencyPipe, DatePipe],
  templateUrl: './supplier-availability-panel.component.html',
  styleUrl: './supplier-availability-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAvailabilityPanelComponent {
  private readonly service = inject(ProductSupplierAvailabilityService);
  private readonly destroyRef = inject(DestroyRef);

  /** Catalog product this panel checks. */
  readonly productId = input.required<string>();

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly result = signal<SupplierAvailability | null>(null);

  readonly form = new FormGroup({
    deliveryLocationId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank],
    }),
    quantity: new FormControl<number | null>(null, { validators: [integerAtLeast(1)] }),
  });

  readonly vendors = computed<readonly SupplierAvailabilityVendor[]>(() => this.result()?.vendors ?? []);

  readonly hasSearched = computed(() => this.state() !== 'idle');

  checkAvailability(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const deliveryLocationId = this.form.controls.deliveryLocationId.value.trim();
    const quantity = this.form.controls.quantity.value;

    this.state.set('loading');
    this.errorKey.set(null);

    this.service
      .checkAvailability({
        productId: this.productId(),
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
          this.errorKey.set('PRODUCT.CATALOG.DETAIL.AVAILABILITY.ERROR.LOAD');
        },
      });
  }

  /** Best-effort single line for a vendor's answer about this one product. */
  firstLine(vendor: SupplierAvailabilityVendor): SupplierAvailabilityLine | null {
    return vendor.lines.length > 0 ? vendor.lines[0] : null;
  }
}
