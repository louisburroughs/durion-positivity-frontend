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
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import { SupplierDeliveryLocation } from '../../models/supplier-availability.models';
import { mapSupplierError } from '../../utils/supplier-error.util';

type SelectState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

let instanceCounter = 0;

/**
 * Delivery-location picker for the supplier availability surfaces (#190).
 *
 * ── Interim, and deliberately narrow ────────────────────────────────────────
 * The story presumes a platform current-location context. There is none (see
 * `SupplierDeliveryLocationService`), so the availability surfaces own a small
 * picker rather than inventing platform-wide location state. When a real
 * location context lands, this component should defer to it and the selection
 * signal in the service should be deleted rather than reconciled.
 *
 * ── Nothing is requested until a location is chosen ─────────────────────────
 * The picker starts on an explicit "choose a location" option rather than
 * defaulting to the first active location. Defaulting would quietly fire vendor
 * lookups — which cost real money against vendor API quotas — against a
 * warehouse the user never picked, and would show delivery estimates for the
 * wrong place with nothing on screen to reveal the mistake.
 *
 * Roster failure is reported in place: the picker cannot be used, but it never
 * escalates to the host page's state (a product page must still render its
 * product when pos-location is down).
 */
@Component({
  selector: 'app-supplier-location-select',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './supplier-location-select.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-location-select.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierLocationSelectComponent {
  private readonly locations = inject(SupplierDeliveryLocationService);

  /** Translation key for the visible field label. */
  readonly labelKey = input<string>('POSITIVITY.AVAILABILITY.LOCATION.LABEL');

  /** Unique control id so the `<label for>` association holds with several on a page. */
  readonly controlId = `supplier-location-select-${++instanceCounter}`;

  readonly state = signal<SelectState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly options = signal<SupplierDeliveryLocation[]>([]);

  /** Bumped by `reload()`; read inside the effect so a retry re-runs it. */
  private readonly reloadToken = signal(0);

  /** The session-scoped choice, owned by the service so every surface agrees. */
  readonly selectedLocationId = this.locations.selectedLocationId;

  readonly hasSelection = computed(() => !!this.selectedLocationId());

  constructor() {
    effect(onCleanup => {
      this.reloadToken();

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.locations.listActiveLocations().subscribe({
        next: items => {
          this.options.set(items);
          this.state.set(items.length === 0 ? 'empty' : 'ready');
          this.dropStaleSelection(items);
        },
        error: (err: unknown) => {
          const outcome = mapSupplierError(err, 'POSITIVITY.AVAILABILITY.LOCATION.ERROR.LOAD');
          this.state.set('error');
          this.errorKey.set(outcome.errorKey);
        },
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Retry the roster read after a failure. */
  reload(): void {
    this.reloadToken.update(value => value + 1);
  }

  onSelect(value: string): void {
    this.locations.select(value || null);
  }

  /**
   * Forget a remembered location that is no longer active.
   *
   * A location can be deactivated between sessions; keeping the stale id would
   * send lookups for a warehouse that no longer takes delivery, and the select
   * would show a blank value with no explanation.
   */
  private dropStaleSelection(items: SupplierDeliveryLocation[]): void {
    const current = this.selectedLocationId();
    if (current && !items.some(item => item.locationId === current)) {
      this.locations.select(null);
    }
  }
}
