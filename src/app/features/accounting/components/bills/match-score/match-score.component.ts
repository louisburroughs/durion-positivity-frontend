import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MatchPoints } from '../../../models/payables.models';
import { HelpDisclosureComponent } from '../../help-disclosure/help-disclosure.component';

/** The points each criterion is scored out of, as the contract states them (S12; amount 40 · products 30 · date 20 · purchase order 5). */
export const MATCH_CRITERIA: readonly { readonly key: keyof MatchPoints; readonly labelKey: string; readonly max: number }[] = [
  { key: 'amount', labelKey: 'ACCOUNTING.BILLS.MATCH.AMOUNT', max: 40 },
  { key: 'products', labelKey: 'ACCOUNTING.BILLS.MATCH.PRODUCTS', max: 30 },
  { key: 'date', labelKey: 'ACCOUNTING.BILLS.MATCH.DATE', max: 20 },
  { key: 'purchaseOrder', labelKey: 'ACCOUNTING.BILLS.MATCH.PURCHASE_ORDER', max: 5 },
];

let nextId = 0;

/**
 * The match score (§5.2 item 4, P3): the served score and one meter per
 * criterion with its points in text. Nothing is computed here — not the score,
 * not a criterion (P7). Without a served match it says "Not matched to a
 * delivery". `compact` drops the heading and help, for a candidate row.
 */
@Component({
  selector: 'app-match-score',
  standalone: true,
  imports: [DecimalPipe, TranslatePipe, HelpDisclosureComponent],
  templateUrl: './match-score.component.html',
  styleUrls: ['../bills-shared.css', './match-score.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchScoreComponent {
  readonly score = input<number | null>(null);
  readonly points = input<MatchPoints | null>(null);
  readonly compact = input(false);

  readonly id = `match-score-${++nextId}`;

  readonly rows = computed(() => {
    const points = this.points();
    return points ? MATCH_CRITERIA.map(criterion => ({ ...criterion, points: points[criterion.key] })) : [];
  });
}
