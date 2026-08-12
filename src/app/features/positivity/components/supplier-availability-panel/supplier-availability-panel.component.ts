import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierAvailabilityService } from '../../services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import { SupplierAvailability } from '../../models/supplier-availability.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { SupplierAvailabilityRowComponent } from '../supplier-availability-row/supplier-availability-row.component';
import { SupplierLocationSelectComponent } from '../supplier-location-select/supplier-location-select.component';

/**
 * `prompt` is a first-class state, not an empty variant of `idle`: it is the
 * screen telling the user that the one thing it needs is a delivery location.
 */
type PanelState = 'idle' | 'prompt' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

/**
 * Supplier availability section for Product Detail (issue #190).
 *
 * ── This section can never damage its host ──────────────────────────────────
 * It owns its own `state`/`errorKey` signals and injects its own services. The
 * host page passes a product id and imports the component — nothing else. A
 * vendor timeout, a 403, or a pos-location outage therefore lands here and
 * nowhere else: Product Detail keeps rendering the product, its lifecycle, its
 * costs and its UOM conversions exactly as before (DECISION-POSITIVITY-004).
 * There is no output event and no injected host reference, so there is no path
 * by which an availability failure could reach the page's own state machine —
 * that isolation is asserted in `product-detail.component.spec.ts` as well as
 * here.
 *
 * ── Nothing is requested without a delivery location ────────────────────────
 * Availability is meaningless without a "deliver where?", and every call costs
 * vendor API quota. With no location chosen the section renders a translated
 * prompt and stays silent.
 *
 * ── Vendors are peers ───────────────────────────────────────────────────────
 * Every configured vendor gets its own labelled row in backend order. There is
 * no aggregation, no "best price/fastest" pick and no sorting: choosing between
 * vendors is a commercial decision that belongs to the person reading the
 * screen, and any ordering this component applied would read as a
 * recommendation.
 */
@Component({
  selector: 'app-supplier-availability-panel',
  standalone: true,
  imports: [
    TranslatePipe,
    SupplierAvailabilityRowComponent,
    SupplierLocationSelectComponent,
  ],
  templateUrl: './supplier-availability-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-availability-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierAvailabilityPanelComponent {
  private readonly availabilityService = inject(SupplierAvailabilityService);
  private readonly locations = inject(SupplierDeliveryLocationService);

  /** Catalog product id. Null while the host page is still resolving the route. */
  readonly productId = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator on each row. */
  readonly nowMs = input<number | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly availability = signal<SupplierAvailability | null>(null);

  private readonly reloadToken = signal(0);

  readonly selectedLocationId = this.locations.selectedLocationId;

  readonly vendors = computed(() => this.availability()?.vendors ?? []);

  readonly fetchedAt = computed(() => this.availability()?.fetchedAt ?? null);

  readonly thresholdMinutes = computed(
    () => this.availability()?.stalenessThresholdMinutes ?? 0,
  );

  readonly retryable = computed(() => this.state() === 'error');

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const productId = this.productId();
      const locationId = this.selectedLocationId();

      if (!productId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.availability.set(null);
        return;
      }

      if (!locationId) {
        this.state.set('prompt');
        this.errorKey.set(null);
        this.availability.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.availabilityService
        .getAvailabilityByProductId(productId, locationId)
        .subscribe({
          next: result => {
            this.availability.set(result);
            this.state.set(result.vendors.length === 0 ? 'empty' : 'ready');
          },
          error: (err: unknown) => {
            const outcome = mapSupplierError(err, 'POSITIVITY.AVAILABILITY.ERROR.LOAD');
            // ADR-0031: state first, then the key.
            this.state.set(outcome.kind === 'forbidden' ? 'forbidden' : 'error');
            this.errorKey.set(outcome.errorKey);
            this.availability.set(null);
          },
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Retry after a degraded result. Re-runs the effect, cancelling anything in flight. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }
}
