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
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import {
  SupplierFleetAuthorization,
  SupplierFleetAuthorizationState,
  SupplierFleetCompletionApprovalState,
} from '../../models/supplier-fleet.models';
import { mapSupplierError } from '../../utils/supplier-error.util';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';

type PanelState = 'idle' | 'loading' | 'ready' | 'empty' | 'unreachable' | 'error' | 'forbidden';

/** Tone + glyph per authorization state. Colour is redundant with the text label. */
const STATE_TONES: Readonly<Record<SupplierFleetAuthorizationState, SupplierStatusTone>> = {
  PENDING: 'info',
  GRANTED: 'success',
  DENIED: 'danger',
  NOT_FOUND: 'neutral',
  MANUAL_REVIEW: 'warning',
};

const STATE_ICONS: Readonly<Record<SupplierFleetAuthorizationState, string>> = {
  PENDING: 'schedule',
  GRANTED: 'verified',
  DENIED: 'block',
  NOT_FOUND: 'search_off',
  MANUAL_REVIEW: 'rule',
};

const APPROVAL_TONES: Readonly<Record<SupplierFleetCompletionApprovalState, SupplierStatusTone>> = {
  NOT_REQUESTED: 'neutral',
  PENDING: 'info',
  APPROVED: 'success',
  MANUAL_REVIEW: 'warning',
};

const APPROVAL_ICONS: Readonly<Record<SupplierFleetCompletionApprovalState, string>> = {
  NOT_REQUESTED: 'remove',
  PENDING: 'schedule',
  APPROVED: 'check_circle',
  MANUAL_REVIEW: 'rule',
};

/**
 * Fleet authorization status panel (issue #194; #201).
 *
 * ── The frontend never mutates authorization state ──────────────────────────
 * #194 §6 makes this an acceptance criterion, and it is enforced structurally,
 * not by convention: this panel has no output, no form, and exactly one
 * control — "refresh", which re-reads. There is no request, grant, deny,
 * override, escalate or approve affordance, and `SupplierFleetService` has no
 * method that could implement one.
 *
 * ── A supplier reference is required ────────────────────────────────────────
 * The generated read is keyed by `supplierRef`. Without one the panel asks
 * nothing and stays idle — it never guesses a vendor and never substitutes
 * `vendorProfileId`. The workorder screen does not carry a verified
 * `supplierRef`, so it no longer hosts this panel (#201).
 *
 * ── Not hosted today ────────────────────────────────────────────────────────
 * No page hosts this panel at present. It becomes hostable only from a page
 * that holds a verified `supplierRef` (the vendor profile alias), never from
 * one that only knows a `vendorProfileId`.
 *
 * ── `DENIED` shows the fleet manager's own words ─────────────────────────────
 * A translated label plus the vendor's text, verbatim (#194 §4, ADR-0030).
 *
 * ── `NOT_FOUND` / 404 means "not a fleet workorder" ─────────────────────────
 * That is a fact about the workorder, not a failure of this panel, so it
 * renders as a quiet empty state with no alert and no `errorKey`.
 */
@Component({
  selector: 'app-supplier-fleet-authorization-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe, SupplierStatusChipComponent],
  templateUrl: './supplier-fleet-authorization-panel.component.html',
  styleUrls: [
    '../../positivity-shared.css',
    './supplier-fleet-authorization-panel.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFleetAuthorizationPanelComponent {
  private readonly service = inject(SupplierFleetService);

  /**
   * Vendor profile alias of the fleet manager. Required-or-empty: an empty
   * reference means no request is ever made.
   */
  readonly supplierRef = input<string | null>(null);

  /** Platform workorder UUID. Null while the host resolves the route. */
  readonly workorderId = input<string | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly authorization = signal<SupplierFleetAuthorization | null>(null);

  private readonly reloadToken = signal(0);

  readonly hasSupplierRef = computed(() => (this.supplierRef() ?? '').trim().length > 0);

  readonly authorizationState = computed(() => this.authorization()?.state ?? null);

  readonly isPending = computed(() => this.authorizationState() === 'PENDING');

  readonly isDenied = computed(() => this.authorizationState() === 'DENIED');

  readonly needsManualReview = computed(() => this.authorizationState() === 'MANUAL_REVIEW');

  readonly completionApproval = computed(() => this.authorization()?.completionApproval ?? null);

  readonly hasCompletionApproval = computed(() => {
    const approval = this.completionApproval();
    return approval !== null && approval !== 'NOT_REQUESTED';
  });

  readonly stateLabelKey = computed(() => {
    const state = this.authorizationState();
    return state
      ? `POSITIVITY.FLEET.AUTHORIZATION.STATE.${state}`
      : 'POSITIVITY.FLEET.AUTHORIZATION.STATE.UNKNOWN';
  });

  readonly stateTone = computed<SupplierStatusTone>(() => {
    const state = this.authorizationState();
    return state ? STATE_TONES[state] : 'neutral';
  });

  readonly stateIcon = computed(() => {
    const state = this.authorizationState();
    return state ? STATE_ICONS[state] : 'help';
  });

  readonly approvalLabelKey = computed(() => {
    const approval = this.completionApproval();
    return approval
      ? `POSITIVITY.FLEET.COMPLETION.STATE.${approval}`
      : 'POSITIVITY.FLEET.COMPLETION.STATE.UNKNOWN';
  });

  readonly approvalTone = computed<SupplierStatusTone>(() => {
    const approval = this.completionApproval();
    return approval ? APPROVAL_TONES[approval] : 'neutral';
  });

  readonly approvalIcon = computed(() => {
    const approval = this.completionApproval();
    return approval ? APPROVAL_ICONS[approval] : 'help';
  });

  readonly approvalNeedsManualReview = computed(() => this.completionApproval() === 'MANUAL_REVIEW');

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const workorderId = this.workorderId();
      const supplierRef = (this.supplierRef() ?? '').trim();

      if (!workorderId || !supplierRef) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.authorization.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service
        .getWorkorderAuthorization(supplierRef, workorderId)
        .subscribe({
          next: result => {
            if (result.state === 'NOT_FOUND') {
              // Not every workorder is under a fleet contract. That is a fact
              // about the workorder, not a failure of this panel.
              this.authorization.set(null);
              this.state.set('empty');
              return;
            }
            this.authorization.set(result);
            this.state.set('ready');
          },
          error: (err: unknown) => {
            this.authorization.set(null);
            if (err instanceof HttpErrorResponse && err.status === 404) {
              this.state.set('empty');
              this.errorKey.set(null);
              return;
            }
            if (err instanceof HttpErrorResponse && err.status === 422) {
              // The SDK documents 422 on the fleet operations as "the vendor
              // could not be reached or answered unreadably". That is the
              // unreachable state, and the only one worth trying again.
              // ADR-0031: state first, then the key.
              this.state.set('unreachable');
              this.errorKey.set('POSITIVITY.FLEET.AUTHORIZATION.ERROR.LOAD');
              return;
            }
            const outcome = mapSupplierError(err, 'POSITIVITY.FLEET.AUTHORIZATION.ERROR.LOAD');
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

  /**
   * Re-read the authorization the backend holds.
   *
   * This is a GET and nothing else. It does not ask the fleet manager again;
   * it asks the platform what the fleet manager has said.
   */
  refresh(): void {
    this.reloadToken.update(value => value + 1);
  }
}
