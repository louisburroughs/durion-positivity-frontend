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
import { toDatePipeInput } from '../../utils/supplier-freshness.util';
import { StalenessIndicatorComponent } from '../staleness-indicator/staleness-indicator.component';
import {
  SupplierStatusChipComponent,
  SupplierStatusTone,
} from '../supplier-status-chip/supplier-status-chip.component';

type PanelState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'unreachable'
  | 'forbidden'
  | 'error';

/** Tone + glyph per authorization state. Colour is redundant with the text label. */
const STATE_TONES: Readonly<Record<SupplierFleetAuthorizationState, SupplierStatusTone>> = {
  PENDING: 'info',
  GRANTED: 'success',
  DENIED: 'danger',
  MANUAL_REVIEW: 'warning',
};

const STATE_ICONS: Readonly<Record<SupplierFleetAuthorizationState, string>> = {
  PENDING: 'hourglass_empty',
  GRANTED: 'verified',
  DENIED: 'block',
  MANUAL_REVIEW: 'fact_check',
};

const APPROVAL_TONES: Readonly<
  Record<SupplierFleetCompletionApprovalState, SupplierStatusTone>
> = {
  PENDING: 'neutral',
  APPROVED: 'success',
  RETRYING: 'info',
  MANUAL_REVIEW: 'warning',
};

const APPROVAL_ICONS: Readonly<Record<SupplierFleetCompletionApprovalState, string>> = {
  PENDING: 'hourglass_empty',
  APPROVED: 'assignment_turned_in',
  RETRYING: 'autorenew',
  MANUAL_REVIEW: 'fact_check',
};

/**
 * Fleet authorization status panel for the workorder screen (issue #194).
 *
 * ── The frontend never mutates authorization state ──────────────────────────
 * #194 §6 makes this an acceptance criterion, and it is enforced structurally,
 * not by convention: this panel has no output, no form, and exactly one
 * control — "refresh", which re-reads. There is no request, grant, deny,
 * override, escalate or approve affordance, and `SupplierFleetService` has no
 * method that could implement one. Authorization is the fleet manager's
 * decision recorded by the backend; a UI that could advance it would let a
 * service advisor believe Michelin has agreed to pay for work Michelin has
 * never seen. `supplier-fleet-authorization-panel.component.spec.ts` scans the
 * rendered controls for exactly that, and so does
 * `workorder-detail-page.component.spec.ts`.
 *
 * ── `DENIED` shows the fleet manager's own words ────────────────────────────
 * A translated label ("Reason from the fleet manager") plus the vendor's text,
 * verbatim (#194 §4, ADR-0030). The advisor reads that text out at the counter;
 * paraphrasing it, mapping it to a client-side code, or truncating it would
 * change what the customer is told about a bill they may have to pay
 * themselves.
 *
 * ── `PENDING` refreshes, it does not poll and it does not re-ask ────────────
 * A `202`-backed pending state arrives as `state: 'PENDING'` in the body
 * (#194 §5). The refresh control re-reads what the backend knows; it never
 * causes a second authorization request to the fleet manager, because the
 * client has no way to make one.
 *
 * ── A 404 means "not a fleet workorder" ─────────────────────────────────────
 * Most workorders are not under a fleet contract. That is a fact about the
 * workorder, not a failure of this panel, so it renders as a quiet empty state
 * with no alert and no `errorKey` — the same shape the transmission panel uses
 * for an order that never went out electronically.
 *
 * ── A vendor outage degrades this panel and nothing else ────────────────────
 * The panel owns its own `state`/`errorKey` and injects its own service. A 500,
 * a 503 or a 403 lands here; the workorder keeps rendering its items, labor,
 * parts and every transition control exactly as before.
 * `workorder-detail-page.component.spec.ts` asserts the host across all three.
 */
@Component({
  selector: 'app-supplier-fleet-authorization-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe, StalenessIndicatorComponent, SupplierStatusChipComponent],
  templateUrl: './supplier-fleet-authorization-panel.component.html',
  styleUrls: [
    '../../positivity-shared.css',
    './supplier-fleet-authorization-panel.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFleetAuthorizationPanelComponent {
  private readonly service = inject(SupplierFleetService);

  /** Platform workorder UUID. Null while the host resolves the route. */
  readonly workorderId = input<string | null>(null);

  /** Test seam for "now", forwarded to the freshness indicator. */
  readonly nowMs = input<number | null>(null);

  readonly state = signal<PanelState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly authorization = signal<SupplierFleetAuthorization | null>(null);

  private readonly reloadToken = signal(0);

  readonly authorizationState = computed(() => this.authorization()?.state ?? null);

  readonly isPending = computed(() => this.authorizationState() === 'PENDING');

  readonly isDenied = computed(() => this.authorizationState() === 'DENIED');

  readonly needsManualReview = computed(() => this.authorizationState() === 'MANUAL_REVIEW');

  readonly completionApproval = computed(() => this.authorization()?.completionApproval ?? null);

  readonly hasCompletionApproval = computed(() => this.completionApproval() !== null);

  readonly contract = computed(() => this.authorization()?.contract ?? null);

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
      ? `POSITIVITY.FLEET.COMPLETION.STATE.${approval.state}`
      : 'POSITIVITY.FLEET.COMPLETION.STATE.UNKNOWN';
  });

  readonly approvalTone = computed<SupplierStatusTone>(() => {
    const approval = this.completionApproval();
    return approval ? APPROVAL_TONES[approval.state] : 'neutral';
  });

  readonly approvalIcon = computed(() => {
    const approval = this.completionApproval();
    return approval ? APPROVAL_ICONS[approval.state] : 'help';
  });

  readonly approvalNeedsManualReview = computed(
    () => this.completionApproval()?.state === 'MANUAL_REVIEW',
  );

  /** Read at access time, not at class-field-init time (bundler hazard). */
  get stateIcons(): Readonly<Record<SupplierFleetAuthorizationState, string>> {
    return STATE_ICONS;
  }

  constructor() {
    effect(onCleanup => {
      this.reloadToken();
      const workorderId = this.workorderId();

      if (!workorderId) {
        this.state.set('idle');
        this.errorKey.set(null);
        this.authorization.set(null);
        return;
      }

      this.state.set('loading');
      this.errorKey.set(null);

      const sub: Subscription = this.service.getWorkorderAuthorization(workorderId).subscribe({
        next: result => {
          this.authorization.set(result);
          this.state.set('ready');
        },
        error: (err: unknown) => {
          this.authorization.set(null);
          if (err instanceof HttpErrorResponse && err.status === 404) {
            // Not every workorder is under a fleet contract. That is a fact
            // about the workorder, not a failure of this panel.
            this.state.set('empty');
            this.errorKey.set(null);
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

  /** Contract effective date prepared for `DatePipe` (ADR-0038). */
  effectiveDateFor(value: string | null | undefined): string | null {
    return toDatePipeInput(value);
  }
}
