import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { SupplierManualReviewAction } from '../../models/supplier-order-transmission.models';

/**
 * Backend-delivered resolution actions this UI can name.
 *
 * A display aid, never a gate: an action token absent from this table is still
 * rendered (verbatim) and still posted. The backend decides which actions exist
 * and which caller may use them; hard-coding a closed list here would let the UI
 * hide an action the backend had just started offering.
 *
 * Read through a getter, never a class-field initialiser — see
 * `utils/supplier-capability-keys.ts` for why.
 */
const ACTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  CONFIRM_MATCHED: 'POSITIVITY.MANUAL_REVIEW.ACTION.CONFIRM_MATCHED',
  MARK_REJECTED: 'POSITIVITY.MANUAL_REVIEW.ACTION.MARK_REJECTED',
};

const ACTION_RISK_KEYS: Readonly<Record<string, string>> = {
  CONFIRM_MATCHED: 'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_CONFIRM_MATCHED',
  MARK_REJECTED: 'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_MARK_REJECTED',
};

let instanceCounter = 0;

/**
 * Resolution controls for one ambiguous vendor transmission (issue #191).
 *
 * ── There is no re-send button here, and there must never be one ────────────
 * The only thing this component can emit is one of the action tokens the
 * backend delivered in `actions`. It cannot invent an action, and the backend
 * does not deliver a re-transmit one, so no amount of clicking here can put a
 * second copy of a purchase order in front of a vendor. That is the entire
 * safety property #191 asks for: a `MANUAL_REVIEW` order is ambiguous precisely
 * because the vendor *may already hold it*, and re-sending would turn an
 * uncertainty into a duplicate physical delivery.
 *
 * ── Every action is confirmed, and the confirmation names the risk ──────────
 * Each action opens a modal that states, in translated copy, what the operator
 * is asserting and what it costs if they are wrong — a duplicate physical order,
 * or a real delivery arriving against an order marked rejected. Confirming an
 * ambiguous transmission is a judgement about the physical world that the
 * platform cannot verify, so it is never one click away.
 */
@Component({
  selector: 'app-supplier-manual-review-actions',
  standalone: true,
  imports: [TranslatePipe, ModalDialogDirective],
  templateUrl: './supplier-manual-review-actions.component.html',
  styleUrls: ['../../positivity-shared.css', './supplier-manual-review-actions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierManualReviewActionsComponent {
  /**
   * Actions the backend offered for this row and this caller.
   *
   * Empty means no action is rendered — for a non-permitted caller, and for any
   * state that is not `MANUAL_REVIEW`.
   */
  readonly actions = input<readonly SupplierManualReviewAction[]>([]);

  /** True while a resolution is in flight; disables every trigger. */
  readonly busy = input(false);

  /** Vendor/PO context echoed into the dialog so the operator sees what they are resolving. */
  readonly contextLabel = input<string | null>(null);

  /** The chosen backend action token, emitted only after explicit confirmation. */
  readonly resolve = output<string>();

  readonly dialogId = `supplier-manual-review-${++instanceCounter}`;

  readonly pending = signal<SupplierManualReviewAction | null>(null);

  readonly hasActions = computed(() => this.actions().length > 0);

  /** Read at access time, not at class-field-init time (bundler hazard). */
  get actionLabelKeys(): Readonly<Record<string, string>> {
    return ACTION_LABEL_KEYS;
  }

  /** Translated label for a recognised token; the token itself otherwise. */
  labelFor(action: SupplierManualReviewAction): string | null {
    return ACTION_LABEL_KEYS[action.action] ?? null;
  }

  /** Risk copy for the confirmation dialog; a generic warning for an unknown token. */
  riskKeyFor(action: SupplierManualReviewAction | null): string {
    if (!action) {
      return 'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_GENERIC';
    }
    return ACTION_RISK_KEYS[action.action] ?? 'POSITIVITY.MANUAL_REVIEW.CONFIRM.RISK_GENERIC';
  }

  /** Opens the confirmation. Nothing is emitted until the operator confirms. */
  request(action: SupplierManualReviewAction): void {
    if (this.busy()) {
      return;
    }
    this.pending.set(action);
  }

  confirm(): void {
    const action = this.pending();
    this.pending.set(null);
    if (action) {
      this.resolve.emit(action.action);
    }
  }

  cancel(): void {
    this.pending.set(null);
  }
}
