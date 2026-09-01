import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import { SupplierFleetVehicleLookup } from '../../models/supplier-fleet.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
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
  | 'error'
  | 'forbidden';

/**
 * Fleet vehicle lookup panel (issue #194; #201).
 *
 * ── `NOT_FOUND` is an answer, and is rendered like one ──────────────────────
 * "The fleet manager does not know this vehicle" is a complete reply. It gets
 * its own state, plain informational styling, **no** `role="alert"`, and
 * `errorKey` stays null (#194 §4).
 *
 * ── A supplier reference is required ────────────────────────────────────────
 * The generated read is keyed by `supplierRef`. Without one the panel asks
 * nothing and stays idle — it never guesses a vendor and never falls back to
 * `vendorProfileId`, which is a different identifier. The estimate screen does
 * not carry a verified `supplierRef`, so it no longer hosts this panel (#201).
 *
 * ── Not hosted today ────────────────────────────────────────────────────────
 * No page hosts this panel at present. It becomes hostable only from a page
 * that holds a verified `supplierRef` (the vendor profile alias), never from
 * one that only knows a `vendorProfileId`.
 *
 * ── Advisory only — open question #194 §7, ruled ────────────────────────────
 * The panel renders no disabled state, sets no output, and touches nothing a
 * host uses to decide whether work can be promoted.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 * The only control here is "look up again", which is a GET. There is nothing on
 * this panel that requests, grants or advances an authorization, and the
 * service behind it has no method that could.
 */
@Component({
  selector: 'app-supplier-fleet-lookup-panel',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './supplier-fleet-lookup-panel.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-fleet-lookup-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFleetLookupPanelComponent {
  private readonly service = inject(SupplierFleetService);

  /**
   * Vendor profile alias of the fleet manager to ask. Required-or-empty: an
   * empty reference means no request is ever made.
   */
  readonly supplierRef = input<string | null>(null);

  /**
   * Vehicle identifier the host already knows (VIN, plate or fleet number).
   *
   * Null while the host resolves its own data — the panel then simply waits and
   * offers the manual lookup, rather than asking the vendor about nothing.
   */
  readonly vehicleIdentifier = input<string | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly lookup = signal<SupplierFleetVehicleLookup | null>(null);

  /** The identifier actually asked about — host-supplied or operator-entered. */
  private readonly requestedIdentifier = signal<string | null>(null);

  readonly lookupForm = new FormGroup({
    vehicleIdentifier: new FormControl('', { nonNullable: true }),
  });

  readonly hasSupplierRef = computed(() => (this.supplierRef() ?? '').trim().length > 0);

  readonly isNotFound = computed(() => this.state() === 'not-found');

  readonly vehicle = computed(() => this.lookup()?.vehicle ?? null);

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
      const supplierRef = (this.supplierRef() ?? '').trim();

      if (!identifier || !supplierRef) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.lookup.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.lookupVehicle(supplierRef, identifier).subscribe({
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
            // An unknown vehicle answered as a 404. Same fact, same rendering.
            this.state.set('not-found');
            this.errorKey.set(null);
            return;
          }
          if (err instanceof HttpErrorResponse && err.status === 422) {
            // The SDK documents 422 on the fleet operations as "the vendor
            // could not be reached or answered unreadably". That is the
            // unreachable state, and the only one worth trying again.
            // ADR-0031: state first, then the key.
            this.state.set('unreachable');
            this.errorKey.set('POSITIVITY.FLEET.LOOKUP.ERROR.LOAD');
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
}
