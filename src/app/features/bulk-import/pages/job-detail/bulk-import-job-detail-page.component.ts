import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkImportService } from '../../services/bulk-import.service';
import { BulkImportErrorRecordsTableComponent } from '../../components/bulk-import-error-records-table/bulk-import-error-records-table.component';
import {
  BulkLoadJob,
  BulkLoadRecordAudit,
  SubmitCorrectionRequest,
} from '../../models/bulk-import.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-bulk-import-job-detail-page',
  templateUrl: './bulk-import-job-detail-page.component.html',
  styleUrl: './bulk-import-job-detail-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, BulkImportErrorRecordsTableComponent],
})
export class BulkImportJobDetailPageComponent implements OnInit {
  private readonly service = inject(BulkImportService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly job = signal<BulkLoadJob | null>(null);
  readonly auditRecords = signal<BulkLoadRecordAudit[]>([]);
  readonly correctionPending = signal<Set<string>>(new Set());
  readonly correctionValues = signal<Record<string, Record<string, unknown>>>({});

  private jobId = '';

  ngOnInit(): void {
    this.jobId = this.route.snapshot.paramMap.get('jobId') ?? '';
    this.loadDetail();
  }

  loadDetail(): void {
    if (!this.jobId) { return; }
    this.state.set('loading');
    this.errorKey.set(null);
    this.service.getJob(this.jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: job => {
          this.job.set(job);
          this.loadAuditRecords();
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD');
        },
      });
  }

  private loadAuditRecords(): void {
    this.service.listAuditRecords(this.jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.auditRecords.set(result.items);
          this.state.set('ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD_AUDIT');
        },
      });
  }

  updateCorrectionValue(recordId: string, field: string, value: unknown): void {
    this.correctionValues.update(prev => ({
      ...prev,
      [recordId]: { ...prev[recordId], [field]: value },
    }));
  }

  submitCorrection(record: BulkLoadRecordAudit): void {
    const corrected = this.correctionValues()[record.recordId];
    if (!corrected || Object.keys(corrected).length === 0) { return; }
    this.correctionPending.update(s => { const n = new Set(s); n.add(record.recordId); return n; });
    const req: SubmitCorrectionRequest = { correctedValues: corrected };
    this.service.submitCorrection(this.jobId, record.recordId, req)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.auditRecords.update(records =>
            records.map(r => r.recordId === updated.recordId ? updated : r),
          );
          this.correctionPending.update(s => { const n = new Set(s); n.delete(record.recordId); return n; });
        },
        error: () => {
          this.correctionPending.update(s => { const n = new Set(s); n.delete(record.recordId); return n; });
        },
      });
  }

  cancelJob(): void {
    if (!this.jobId) { return; }
    this.service.cancelJob(this.jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadDetail(),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.CANCEL');
        },
      });
  }

  retryJob(): void {
    if (!this.jobId) { return; }
    this.service.retryJob(this.jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadDetail(),
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.RETRY');
        },
      });
  }

  downloadErrorReport(): void {
    window.open(this.service.getErrorReportUrl(this.jobId), '_blank', 'noopener,noreferrer');
  }

  isCorrectionPending(recordId: string): boolean {
    return this.correctionPending().has(recordId);
  }

  getFieldKeys(record: BulkLoadRecordAudit): string[] {
    return Object.keys(record.originalValues);
  }
}
