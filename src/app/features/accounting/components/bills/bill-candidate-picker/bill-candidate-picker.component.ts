import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import { BillAction, BillCandidate, BillDecisionRequest, BillDetail, BillPermissions } from '../../../models/payables.models';
import { Copy, blockedCopy, findAction, withParam } from '../../../utils/bill-display';
import { BillDecisionFailure } from '../../../utils/bill-errors';
import { MatchScoreComponent } from '../match-score/match-score.component';

let nextId = 0;

/**
 * Pick a match (§5.2 item 4, §7.1): the served candidates of an ambiguous
 * invoice match, compared by bill number, total and score breakdown — never by
 * id (ADR-0064). Picking one is matching only: the bill still needs approval.
 * The pick buttons need `accounting:ap:approve`/`…:approve_over_limit` and the
 * served `SELECT_CANDIDATE`; without them the comparison stays readable.
 */
@Component({
  selector: 'app-bill-candidate-picker',
  standalone: true,
  imports: [TranslatePipe, MoneyPipe, MatchScoreComponent],
  templateUrl: './bill-candidate-picker.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-candidate-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillCandidatePickerComponent {
  readonly bill = input.required<BillDetail>();
  readonly permissions = input.required<BillPermissions>();
  readonly busy = input(false);
  readonly failure = input<BillDecisionFailure | null>(null);

  readonly decide = output<BillDecisionRequest>();

  readonly id = `bill-candidates-${++nextId}`;
  readonly withParam = withParam;

  readonly candidates = computed(() => this.bill().openCandidates);
  readonly selectAction = computed(() => (this.permissions().approve ? findAction(this.bill(), 'SELECT_CANDIDATE') : null));
  readonly ownFailure = computed(() => (this.failure()?.kind === 'SELECT' ? this.failure() : null));

  blocked(action: BillAction): Copy {
    return blockedCopy(action, this.bill());
  }

  pick(candidate: BillCandidate): void {
    if (!this.selectAction()?.allowed || this.busy()) return;
    if (!this.candidates().some(entry => entry.candidateId === candidate.candidateId)) return;
    this.decide.emit({ kind: 'SELECT', candidateId: candidate.candidateId, billNumber: candidate.billNumber });
  }
}
