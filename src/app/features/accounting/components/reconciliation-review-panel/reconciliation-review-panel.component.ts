import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  OPENING_DIFFERENCE_FLAG,
  ReconciliationAdjustment,
  ReconciliationMatch,
  ReconciliationReview,
  ReviewBankRow,
} from '../../models/bank-reconciliation.models';
import { toDatePipeInput } from '../../utils/date-only.util';

/** Readiness reasons with copy of their own; literal so the i18n check sees them. */
const REASON_KEYS: Readonly<Record<string, string>> = {
  NOT_BALANCED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.NOT_BALANCED',
  UNEXPLAINED_BANK: 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.UNEXPLAINED_BANK',
  UNEXPLAINED_LEDGER: 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.UNEXPLAINED_LEDGER',
  SELF_APPROVAL: 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.SELF_APPROVAL',
};

/**
 * The review panel of the reconciliation workspace (SPEC-manual-bank-
 * reconciliation §4.8): the E3 equation term by term with its drill-downs,
 * the Diagnostics block, readiness with its reasons, and the Evidence block.
 *
 * Every figure is rendered exactly as `GET /{id}/review` served it: the panel
 * adds nothing up. The opening difference renders only in Diagnostics, as
 * information, and never gates anything (D2). Actions are raised to the page,
 * which owns the writes and their permission gates.
 */
@Component({
  selector: 'app-reconciliation-review-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MoneyPipe, TranslatePipe],
  templateUrl: './reconciliation-review-panel.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './reconciliation-review-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationReviewPanelComponent {
  readonly review = input.required<ReconciliationReview>();
  /** Unmatch is offered while the reconciliation is IN_PROGRESS to a holder of `adjust`. */
  readonly canUnmatch = input(false);
  /** Settle residual is an `OTHER` adjustment: `adjust`, IN_PROGRESS. */
  readonly canSettleResidual = input(false);
  /** Restore and reverse need `approve`. */
  readonly canRestore = input(false);
  readonly canReverse = input(false);
  readonly busy = input(false);

  readonly unmatch = output<ReconciliationMatch>();
  readonly settleResidual = output<ReconciliationMatch>();
  readonly restore = output<ReviewBankRow>();
  readonly reverse = output<ReconciliationAdjustment>();

  readonly currency = computed(() => this.review().header.currency);

  readonly openingFlagged = computed(() => this.review().diagnostics.flags.includes(OPENING_DIFFERENCE_FLAG));

  /** The likely cause the copy names: a gap not yet bridged, or an earlier window invalidated (§4.8). */
  readonly likelyCauseKey = computed(() =>
    this.review().header.gapAcknowledgement
      ? 'ACCOUNTING.RECONCILIATION_WORKSPACE.DIAGNOSTICS.CAUSE_GAP'
      : 'ACCOUNTING.RECONCILIATION_WORKSPACE.DIAGNOSTICS.CAUSE_INVALIDATED',
  );

  /** Reasons that hold submit or approve; PROPOSALS_PENDING is shown on its own. */
  readonly blockingReasons = computed(() => this.review().readiness.reasons.filter(reason => reason !== 'PROPOSALS_PENDING'));

  reasonKey(reason: string): string {
    return REASON_KEYS[reason] ?? 'ACCOUNTING.RECONCILIATION_WORKSPACE.READINESS.REASON.OTHER';
  }

  /** Settle residual is offered on an ACCEPTED match whose served tolerance is not zero (§4.6). */
  settleable(match: ReconciliationMatch): boolean {
    return match.state === 'ACCEPTED' && match.toleranceUsed !== null && match.toleranceUsed !== 0;
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }
}
