import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  OpenWorkorderRow,
  StatusBand,
  statusBand,
  statusKey,
  vehicleLabel,
} from '../../models/shop-dashboard.models';

/**
 * Every vehicle with open work at the selected location, including work that is
 * not on any repair unit — the rows with no unit are the actionable ones.
 *
 * Deliberately a superset of the card grid: a workorder on a bay appears in
 * both. Presentational only; rows arrive pre-sorted from the service.
 */
@Component({
  selector: 'app-open-workorder-roster',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './open-workorder-roster.component.html',
  styleUrls: ['./open-workorder-roster.component.css', '../../styles/status-band.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpenWorkorderRosterComponent {
  readonly rows = input.required<readonly OpenWorkorderRow[]>();
  readonly truncated = input(false);

  band(row: OpenWorkorderRow): StatusBand {
    return statusBand(row.status);
  }

  statusKeyFor(row: OpenWorkorderRow): string | undefined {
    return statusKey(row.status);
  }

  vehicleLabelFor(row: OpenWorkorderRow): string {
    return vehicleLabel(row.vehicle);
  }

  workorderLabel(row: OpenWorkorderRow): string {
    return row.workorderNumber || row.workorderId;
  }

  workorderLink(row: OpenWorkorderRow): string[] {
    return ['/app', 'workexec', 'workorders', row.workorderId];
  }
}
