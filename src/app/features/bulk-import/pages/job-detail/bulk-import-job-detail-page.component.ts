import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkImportService } from '../../../../shared/bulk-import/services/bulk-import.service';
import { BulkImportCorrectionReloader } from '../../../../shared/bulk-import/services/bulk-import-correction-reloader';
import { BulkImportErrorRecordsTableComponent, CorrectionSubmitEvent } from '../../../../shared/bulk-import/components/bulk-import-error-records-table/bulk-import-error-records-table.component';
import {
  BulkLoadJob,
  BulkLoadRecordAudit,
} from '../../../../shared/bulk-import/models/bulk-import.models';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-bulk-import-job-detail-page',
  templateUrl: './bulk-import-job-detail-page.component.html',
  styleUrl: './bulk-import-job-detail-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgClass, TranslatePipe, BulkImportErrorRecordsTableComponent],
})
export class BulkImportJobDetailPageComponent {
  private readonly service = inject(BulkImportService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly downloadErrorKey = signal<string | null>(null);
  readonly job = signal<BulkLoadJob | null>(null);
  readonly auditRecords = signal<BulkLoadRecordAudit[]>([]);
  readonly correctionPending = signal<Set<string>>(new Set());
  private readonly correctionReloader = new BulkImportCorrectionReloader(this.correctionPending);

  private jobId = '';

  constructor() {
    this.route.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.jobId = params.get('jobId') ?? '';
        this.loadDetail();
      });
  }

  loadDetail(): void {
    if (!this.jobId) { return; }
    this.state.set('loading');
    this.errorKey.set(null);
    this.downloadErrorKey.set(null);
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

  onSubmitCorrection(event: CorrectionSubmitEvent): void {
    const { record, request } = event;
    this.correctionReloader.run(
      record.recordId,
      this.service.submitCorrection(this.jobId, record.recordId, request),
      {
        reload$: this.service.listAuditRecords(this.jobId),
        onReloadSuccess: result => {
          this.auditRecords.set(result.items);
          this.state.set('ready');
        },
        onReloadError: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.LOAD_AUDIT');
        },
        onSubmitError: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.CORRECTION');
        },
      },
    ).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
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

  /**
   * (durion-positivity-backend#2216 precedent, issue #350) A bare `window.open()` of the
   * legacy `/api/...` path sent no bearer token and was rejected by the gateway for a real
   * session; the download now goes through the authenticated SDK blob download instead.
   */
  downloadErrorReport(): void {
    const jobId = this.jobId;
    if (!jobId) { return; }
    this.downloadErrorKey.set(null);
    this.service.downloadErrorReport(jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // Per-action error, like the wizard pages: a failed download must not
        // hide the job (and its retry controls) behind the page-level error state.
        // Dropped if the route has since moved to another job (ADR-0063 §3).
        error: () => {
          if (jobId !== this.jobId) return;
          this.downloadErrorKey.set('BULK_IMPORT.JOB_DETAIL.ERROR.DOWNLOAD');
        },
      });
  }

  isCorrectionPending(recordId: string): boolean {
    return this.correctionPending().has(recordId);
  }

  getFieldKeys(record: BulkLoadRecordAudit): string[] {
    return Object.keys(record.originalValues);
  }
}
