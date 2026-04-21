import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkLoadJob } from '../../models/bulk-import.models';

@Component({
  selector: 'app-bulk-import-results-summary',
  templateUrl: './bulk-import-results-summary.component.html',
  styleUrl: './bulk-import-results-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
})
export class BulkImportResultsSummaryComponent {
  @Input() job!: BulkLoadJob;
  @Output() readonly downloadReport = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
}
