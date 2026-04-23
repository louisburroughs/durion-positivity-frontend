import { DatePipe, NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { BulkImportService } from '../../services/bulk-import.service';
import { BulkLoadJob, DomainType, JobStatus } from '../../models/bulk-import.models';

type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

@Component({
  selector: 'app-bulk-import-jobs-page',
  standalone: true,
  templateUrl: './bulk-import-jobs-page.component.html',
  styleUrl: './bulk-import-jobs-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgClass, TranslatePipe, DatePipe],
})
export class BulkImportJobsPageComponent implements OnInit {
  private readonly service = inject(BulkImportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly jobs = signal<BulkLoadJob[]>([]);

  readonly filterDomainType = signal<DomainType | ''>('');
  readonly filterStatus = signal<JobStatus | ''>('');

  ngOnInit(): void {
    this.loadJobs();
  }

  loadJobs(): void {
    this.state.set('loading');
    this.errorKey.set(null);
    const filters = {
      domainType: this.filterDomainType() || undefined,
      status: this.filterStatus() || undefined,
    };
    this.service.listJobs(filters)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.jobs.set(result.items);
          this.state.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: () => {
          this.state.set('error');
          this.errorKey.set('BULK_IMPORT.JOBS.ERROR.LOAD');
        },
      });
  }

  applyFilter(domainType: string, status: string): void {
    this.filterDomainType.set(domainType as DomainType | '');
    this.filterStatus.set(status as JobStatus | '');
    this.loadJobs();
  }

  readonly domainTypes: DomainType[] = [
    'CATALOG', 'INVENTORY', 'LOCATION', 'CUSTOMER', 'PEOPLE',
    'PRICE', 'VEHICLE_INVENTORY', 'VEHICLE_FITMENT',
  ];

  readonly jobStatuses: JobStatus[] = [
    'CREATED', 'UPLOADING', 'DETECTING', 'MAPPING_REVIEW', 'DEDUP',
    'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED',
  ];
}
