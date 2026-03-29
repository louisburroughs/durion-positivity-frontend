import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { v4 as uuidv4 } from 'uuid';
import { AccountingService } from '../../../accounting/services/accounting.service';
import { LocationService } from '../../../location/services/location.service';

type ExportState = 'IDLE' | 'REQUESTING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED';

@Component({
  selector: 'app-time-export-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './time-export-page.component.html',
  styleUrl: './time-export-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeExportPageComponent {
  private readonly accountingService = inject(AccountingService);
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  // Locations for multi-select
  readonly locations = signal<unknown[]>([]);
  readonly locationsLoading = signal(false);
  readonly locationsError = signal<string | null>(null);

  // Export job state
  readonly exportState = signal<ExportState>('IDLE');
  readonly exportId = signal<string | null>(null);
  readonly exportStatus = signal<string | null>(null);
  readonly recordsExportedCount = signal<number | null>(null);
  readonly recordsSkippedCount = signal<number | null>(null);
  readonly requestedAt = signal<string | null>(null);
  readonly completedAt = signal<string | null>(null);
  readonly exportError = signal<string | null>(null);

  // History
  readonly historyItems = signal<unknown[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);

  // Current idempotency key (preserved across retries)
  private currentIdempotencyKey: string | null = null;

  readonly form = new FormGroup({
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    locationIds: new FormControl<string[]>([], { nonNullable: true, validators: [Validators.required] }),
    format: new FormControl<'CSV' | 'JSON'>('CSV', { nonNullable: true, validators: [Validators.required] }),
  });



  constructor() {
    this.loadLocations();
    this.loadHistory();
  }

  loadLocations(): void {
    this.locationsLoading.set(true);
    this.locationsError.set(null);
    this.locationService.getAllLocations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (locs) => {
          this.locations.set(Array.isArray(locs) ? locs : []);
          this.locationsLoading.set(false);
        },
        error: () => {
          this.locationsError.set('Failed to load locations.');
          this.locationsLoading.set(false);
        },
      });
  }

  requestExport(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { startDate, endDate, locationIds, format } = this.form.getRawValue();

    // Validate endDate >= startDate
    if (endDate < startDate) {
      this.exportError.set('End date must be on or after start date.');
      return;
    }

    if (!locationIds || locationIds.length === 0) {
      this.exportError.set('At least one location must be selected.');
      return;
    }

    this.currentIdempotencyKey = uuidv4();
    this.exportState.set('REQUESTING');
    this.exportError.set(null);
    this.exportId.set(null);

    this.accountingService
      .requestExport({ startDate, endDate, locationIds, format }, this.currentIdempotencyKey)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.exportId.set(resp.exportId);
          this.exportStatus.set(resp.status);
          this.exportState.set((resp.status as ExportState) ?? 'QUEUED');
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Failed to request export.';
          this.exportError.set(msg);
          this.exportState.set('IDLE');
        },
      });
  }

  refreshStatus(): void {
    const id = this.exportId();
    if (!id) return;

    this.accountingService
      .getExportStatus(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          this.exportStatus.set(resp.status);
          this.exportState.set((resp.status as ExportState));
          if (resp.recordsExportedCount !== undefined) this.recordsExportedCount.set(resp.recordsExportedCount);
          if (resp.recordsSkippedCount !== undefined) this.recordsSkippedCount.set(resp.recordsSkippedCount);
          if (resp.requestedAt) this.requestedAt.set(resp.requestedAt);
          if (resp.completedAt) this.completedAt.set(resp.completedAt);
          if (resp.status === 'FAILED') this.exportError.set(resp.message ?? resp.errorCode ?? 'Export failed.');
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Failed to refresh status.';
          this.exportError.set(msg);
        },
      });
  }

  downloadExport(): void {
    const id = this.exportId();
    if (!id) return;
    this.accountingService.downloadExport(id);
  }

  loadHistory(): void {
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.accountingService
      .getExportHistory({ pageIndex: 0, pageSize: 20 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.historyItems.set(Array.isArray(items) ? items : []);
          this.historyLoading.set(false);
        },
        error: () => {
          this.historyError.set('Failed to load export history.');
          this.historyLoading.set(false);
        },
      });
  }

  onLocationToggle(locationId: string): void {
    const current = this.form.controls.locationIds.value;
    if (current.includes(locationId)) {
      this.form.controls.locationIds.setValue(current.filter(id => id !== locationId));
    } else {
      this.form.controls.locationIds.setValue([...current, locationId]);
    }
  }

  get isFormBusy(): boolean {
    return this.exportState() === 'REQUESTING';
  }

  get canDownload(): boolean {
    return this.exportState() === 'READY' && this.exportId() != null;
  }

  get canRefresh(): boolean {
    return this.exportId() != null && this.exportState() !== 'IDLE' && this.exportState() !== 'REQUESTING';
  }
}
