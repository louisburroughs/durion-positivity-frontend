import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  RepairUnitCard,
  StatusBand,
  statusBand,
  statusKey,
  vehicleLabel,
} from '../../models/shop-dashboard.models';

/**
 * One bay or mobile unit on the Shop Manager Dashboard, with the work on it.
 *
 * Presentational only — no service injection — so it is testable without HTTP
 * mocks and reusable by any surface that shows repair units.
 */
@Component({
  selector: 'app-repair-unit-card',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './repair-unit-card.component.html',
  styleUrls: ['./repair-unit-card.component.css', '../../styles/status-band.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepairUnitCardComponent {
  readonly unit = input.required<RepairUnitCard>();

  /** Stable id so the card's <article> can be labelled by its own header. */
  readonly headerId = computed(() => `repair-unit-${this.unit().unitId}`);

  readonly band = computed<StatusBand>(() => statusBand(this.unit().workorder?.status));

  /** Translation key for a known status; undefined for an unrecognised one. */
  readonly statusKey = computed(() => statusKey(this.unit().workorder?.status));

  /** Raw server value, shown verbatim when the status is not a known member. */
  readonly rawStatus = computed(() => this.unit().workorder?.status ?? '');

  readonly vehicleLabel = computed(() => vehicleLabel(this.unit().workorder?.vehicle));

  readonly vin = computed(() => this.unit().workorder?.vehicle?.vin ?? '');

  readonly workorderLink = computed(() => {
    const workorderId = this.unit().workorder?.workorderId;
    return workorderId ? ['/app', 'workexec', 'workorders', workorderId] : null;
  });

  readonly workorderLabel = computed(() => {
    const workorder = this.unit().workorder;
    return workorder?.workorderNumber || workorder?.workorderId || '';
  });
}
