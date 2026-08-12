import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import {
  SupplierFleetContract,
  SupplierFleetVehicleLookup,
} from '../../models/supplier-fleet.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';

/**
 * Panel states.
 *
 * `found` and `not-found` are **both** successful answers. `unreachable` is the
 * vendor being down, which is a different thing from either and is the only one
 * of the three that suggests trying again.
 */
type PanelState =
  | 'idle'
  | 'loading'
  | 'found'
  | 'not-found'
  | 'unreachable'
  | 'forbidden'
  | 'error';

/**
 * Fleet vehicle/contract lookup panel for the estimate screen (issue #194).
 *
 * ── `NOT_FOUND` is an answer, and is rendered like one ──────────────────────
 * "The fleet manager does not know this vehicle" is a complete reply. It gets
 * its own state, plain informational styling, **no** `role="alert"`, and
 * `errorKey` stays null (#194 §4). Dressing it as an error would push the
 * advisor into retrying a question that has already been answered, and would
 * put a red banner on the perfectly ordinary case of a walk-in customer whose
 * van is simply not on a fleet contract.
 *
 * ── Advisory only — open question #194 §7, ruled ────────────────────────────
 * Estimating is **not** blocked on a granted authorization in v1. The panel
 * surfaces the fleet position prominently and stops there: it renders no
 * disabled state, sets no output, and touches nothing the estimate screen uses
 * to decide whether work can be promoted. A per-deployment blocking policy
 * needs the workexec domain agreement the story itself defers to (#194 §3), and
 * of the two ways to be wrong, silently refusing to write up work at the
 * counter — for a customer standing there, on a vendor lookup that may simply
 * be down — is the more damaging one. A visible advisory that an advisor can
 * act on beats a hard stop nobody at the counter can override.
 *
 * ── A vendor outage degrades this panel and nothing else ────────────────────
 * The panel owns its own `state`/`errorKey` and injects its own service. A 500,
 * a 503 or a 403 lands here; the estimate keeps rendering its lines, totals and
 * promotion controls exactly as before. `estimate-detail-page.component.spec.ts`
 * asserts the host's `pageState()` and `errorMessage()` across all three.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 * The only control here is "look up again", which is a GET. There is nothing on
 * this panel that requests, grants or advances an authorization, and the
 * service behind it has no method that could.
 */
@Component({
  selector: 'app-supplier-fleet-lookup-panel',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslatePipe,
    StalenessIndicatorComponent,
    SupplierStatusChipComponent,
  ],
  templateUrl: './supplier-fleet-lookup-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-fleet-lookup-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFleetLookupPanelComponent {
  private readonly service = inject(SupplierFleetService);

  /**
   * Vehicle identifier the host already knows (VIN, plate or fleet number).
   *
   * Null while the host resolves its own data — the panel then simply waits and
   * offers the manual lookup, rather than asking the vendor about nothing.
   */
  readonly vehicleIdentifier = input<string | null>(null);

  /** Optional vendor profile to scope the lookup to one fleet manager. */
  readonly vendorProfileId = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = input<number | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly lookup = signal<SupplierFleetVehicleLookup | null>(null);

  /** The identifier actually asked about — host-supplied or operator-entered. */
  private readonly requestedIdentifier = signal<string | null>(null);

  readonly lookupForm = new FormGroup({
    vehicleIdentifier: new FormControl('', { nonNullable: true }),
  });

  readonly contracts = computed<SupplierFleetContract[]>(() => this.lookup()?.contracts ?? []);

  readonly hasContracts = computed(() => this.contracts().length > 0);

  readonly isNotFound = computed(() => this.state() === 'not-found');

  readonly outcomeLabelKey = computed(() => {
    switch (this.state()) {
      case 'found':
        return 'POSITIVITY.FLEET.LOOKUP.OUTCOME.FOUND';
      case 'not-found':
        return 'POSITIVITY.FLEET.LOOKUP.OUTCOME.NOT_FOUND';
      case 'unreachable':
        return 'POSITIVITY.FLEET.LOOKUP.OUTCOME.UNREACHABLE';
      default:
        return 'POSITIVITY.FLEET.LOOKUP.OUTCOME.UNKNOWN';
    }
  });

  readonly outcomeTone = computed<SupplierStatusTone>(() => {
    switch (this.state()) {
      case 'found':
        return 'success';
      // Not an error tone: the fleet manager answered, and the answer was "no".
      case 'not-found':
        return 'neutral';
      case 'unreachable':
        return 'warning';
      default:
        return 'neutral';
    }
  });

  readonly outcomeIcon = computed(() => {
    switch (this.state()) {
      case 'found':
        return 'verified';
      case 'not-found':
        return 'search_off';
      case 'unreachable':
        return 'cloud_off';
      default:
        return 'help';
    }
  });

  constructor() {
    // Seed the manual field and the request from whatever the host knows. The
    // operator can then ask about a different identifier without the host
    // re-supplying one.
    effect(() => {
      const hostIdentifier = this.vehicleIdentifier();
      if (hostIdentifier) {
        this.lookupForm.controls.vehicleIdentifier.setValue(hostIdentifier);
        this.requestedIdentifier.set(hostIdentifier);
      }
    });

    effect(onCleanup => {
      const identifier = this.requestedIdentifier();
      const vendorProfileId = this.vendorProfileId();

      if (!identifier) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.lookup.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service
        .lookupVehicle(identifier, vendorProfileId ?? undefined)
        .subscribe({
          next: result => {
            this.lookup.set(result);
            // A `NOT_FOUND` outcome is a successful answer: no errorKey, no
            // alert styling, nothing for the advisor to retry.
            this.state.set(result.outcome === 'NOT_FOUND' ? 'not-found' : 'found');
            this.errorKey.set(null);
          },
          error: (err: unknown) => {
            this.lookup.set(null);
            if (err instanceof HttpErrorResponse && err.status === 404) {
              // Some deployments answer an unknown vehicle with a 404 rather
              // than a NOT_FOUND body. Same fact, same rendering.
              this.state.set('not-found');
              this.errorKey.set(null);
              return;
            }
            const outcome = mapSupplierError(err, 'POSITIVITY.FLEET.LOOKUP.ERROR.LOAD');
            // ADR-0031: state first, then the key.
            if (outcome.kind === 'forbidden') {
              this.state.set('forbidden');
            } else if (outcome.kind === 'retryable') {
              this.state.set('unreachable');
            } else {
              this.state.set('error');
            }
            this.errorKey.set(outcome.errorKey);
          },
        });

      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Ask the fleet manager about the identifier currently in the field. */
  submitLookup(): void {
    const value = this.lookupForm.controls.vehicleIdentifier.value.trim();
    if (!value) {
      return;
    }
    // Re-running the same identifier must still re-query: `set` on an unchanged
    // signal value would not, so the request is nudged through a fresh string.
    this.requestedIdentifier.set(null);
    this.requestedIdentifier.set(value);
  }

  /** Re-run the current lookup — the retry offered on an unreachable vendor. */
  reload(): void {
    this.submitLookup();
  }

  /** Contract effective date prepared for `DatePipe` (ADR-0038). */
  effectiveDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }
}
