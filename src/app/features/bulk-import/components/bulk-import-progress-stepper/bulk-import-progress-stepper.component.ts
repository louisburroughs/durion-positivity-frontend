import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { JobStatus } from '../../models/bulk-import.models';

interface WizardStep {
  readonly labelKey: string;
  readonly statuses: JobStatus[];
}

const WIZARD_STEPS: WizardStep[] = [
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.UPLOAD', statuses: ['CREATED', 'UPLOADING'] },
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.DETECT', statuses: ['DETECTING'] },
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.MAPPING', statuses: ['MAPPING_REVIEW'] },
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.DEDUP', statuses: ['DEDUP'] },
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.PROCESS', statuses: ['PROCESSING'] },
  { labelKey: 'BULK_IMPORT.PROGRESS.STEP.DONE', statuses: ['COMPLETED', 'FAILED', 'CANCELLED'] },
];

@Component({
  selector: 'app-bulk-import-progress-stepper',
  templateUrl: './bulk-import-progress-stepper.component.html',
  styleUrl: './bulk-import-progress-stepper.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, TranslatePipe],
})
export class BulkImportProgressStepperComponent {
  @Input() status: JobStatus = 'CREATED';

  readonly steps = WIZARD_STEPS;

  getStepState(step: WizardStep): 'complete' | 'active' | 'pending' {
    const activeIndex = WIZARD_STEPS.findIndex(s => s.statuses.includes(this.status));
    const stepIndex = WIZARD_STEPS.indexOf(step);
    if (stepIndex < activeIndex) { return 'complete'; }
    if (stepIndex === activeIndex) { return 'active'; }
    return 'pending';
  }
}
