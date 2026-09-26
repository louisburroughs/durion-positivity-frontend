import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DomainType } from '../../../../shared/bulk-import/models/bulk-import.models';
import { BulkImportWizardPageBase } from '../../../../shared/bulk-import/components/bulk-import-wizard-page/bulk-import-wizard-page.base';
import { BulkImportColumnMappingTableComponent } from '../../../../shared/bulk-import/components/bulk-import-column-mapping-table/bulk-import-column-mapping-table.component';
import { BulkImportErrorRecordsTableComponent } from '../../../../shared/bulk-import/components/bulk-import-error-records-table/bulk-import-error-records-table.component';
import { BulkImportFileDropComponent } from '../../../../shared/bulk-import/components/bulk-import-file-drop/bulk-import-file-drop.component';
import { BulkImportProgressStepperComponent } from '../../../../shared/bulk-import/components/bulk-import-progress-stepper/bulk-import-progress-stepper.component';
import { BulkImportResultsSummaryComponent } from '../../../../shared/bulk-import/components/bulk-import-results-summary/bulk-import-results-summary.component';
import { BulkImportUploadProgressComponent } from '../../../../shared/bulk-import/components/bulk-import-upload-progress/bulk-import-upload-progress.component';

/** INVENTORY bulk-import wizard; all behaviour lives in {@link BulkImportWizardPageBase}. */
@Component({
  selector: 'app-inventory-bulk-import-page',
  templateUrl: './inventory-bulk-import-page.component.html',
  styleUrl: '../../../../shared/bulk-import/components/bulk-import-wizard-page/bulk-import-wizard-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, TranslatePipe,
    BulkImportFileDropComponent, BulkImportUploadProgressComponent,
    BulkImportColumnMappingTableComponent, BulkImportProgressStepperComponent,
    BulkImportResultsSummaryComponent, BulkImportErrorRecordsTableComponent,
  ],
})
export class InventoryBulkImportPageComponent extends BulkImportWizardPageBase {
  readonly domainType: DomainType = 'INVENTORY';
}
