import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RecoveryRegime } from '../../models/input-tax-recovery.models';
import { toDatePipeInput } from '../../utils/date-only.util';
import { HelpDisclosureComponent } from '../help-disclosure/help-disclosure.component';

/**
 * **Your tax registrations** (CAP:550 S33 item 3, §4.7, §5.5): a read-only, labelled region listing
 * each regime whose recovery is on today, as served — the regime code, the registration number
 * and the date it applies from, and, with accounting terms on, where recovered tax is recorded.
 *
 * - Regimes are served configuration codes and render as served (owner direction: no country,
 *   regime or tax type is named in the client). A regime whose recovery is off or cannot be
 *   determined has no row (story item 3 / AC 4, generalised from the QST row).
 * - Registration numbers are the tenant's own published indirect-tax registrations, INTERNAL under
 *   ADR-0072 Decision 1; they render as text (ADR-0065) and are never stored.
 * - The §5.5 "link to tax settings" is omitted: recording or changing a registration is not in
 *   this story (spec discrepancy, story item 3).
 */
@Component({
  selector: 'app-tax-registrations-panel',
  standalone: true,
  imports: [DatePipe, TranslatePipe, HelpDisclosureComponent],
  templateUrl: './tax-registrations-panel.component.html',
  styleUrls: ['./tax-registrations-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxRegistrationsPanelComponent {
  readonly regimes = input.required<readonly RecoveryRegime[]>();
  readonly showTerms = input(false);

  readonly shown = computed(() => this.regimes().filter(regime => regime.enabled === true));
  readonly toDatePipeInput = toDatePipeInput;

  accountText(regime: RecoveryRegime): string | null {
    const text = [regime.accountName, regime.accountCode].filter(Boolean).join(' · ');
    return text || null;
  }
}
