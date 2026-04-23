import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkLoadRecordAudit, SubmitCorrectionRequest } from '../../models/bulk-import.models';

export interface CorrectionSubmitEvent {
  record: BulkLoadRecordAudit;
  request: SubmitCorrectionRequest;
}

@Component({
  selector: 'app-bulk-import-error-records-table',
  standalone: true,
  templateUrl: './bulk-import-error-records-table.component.html',
  styleUrl: './bulk-import-error-records-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, TranslatePipe],
})
export class BulkImportErrorRecordsTableComponent {
  @Input() records: BulkLoadRecordAudit[] = [];
  @Input() pendingRecordIds: Set<string> = new Set();
  @Output() readonly submitCorrection = new EventEmitter<CorrectionSubmitEvent>();

  private readonly correctionDraft = signal<Record<string, Record<string, unknown>>>({});  // signal is readonly by interface, field stays

  updateDraft(recordId: string, field: string, value: string): void {
    this.correctionDraft.update(prev => {
      const recordDraft = prev[recordId];

      return {
        ...prev,
        [recordId]: recordDraft
          ? { ...recordDraft, [field]: value }
          : { [field]: value },
      };
    });
  }

  getDraft(recordId: string, field: string): string {
    return String(this.correctionDraft()[recordId]?.[field] ?? '');
  }

  hasDraft(recordId: string): boolean {
    const draft = this.correctionDraft()[recordId];
    return !!draft && Object.keys(draft).length > 0;
  }

  onSubmit(record: BulkLoadRecordAudit): void {
    const correctedValues = this.correctionDraft()[record.recordId];
    if (!correctedValues || Object.keys(correctedValues).length === 0) { return; }
    this.submitCorrection.emit({ record, request: { correctedValues } });
  }

  getFieldKeys(record: BulkLoadRecordAudit): string[] {
    return Object.keys(record.originalValues);
  }
}
