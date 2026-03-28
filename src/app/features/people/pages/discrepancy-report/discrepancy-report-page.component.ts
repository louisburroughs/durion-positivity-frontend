import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PeopleService } from '../../services/people.service';

type SortField = 'technicianName' | 'locationId' | 'reportDate' | 'totalAttendanceHours' | 'totalJobHours' | 'discrepancyHours';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-discrepancy-report-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './discrepancy-report-page.component.html',
  styleUrl: './discrepancy-report-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscrepancyReportPageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly rows = signal<unknown[]>([]);
  readonly priorRows = signal<unknown[]>([]); // preserved on error

  readonly sortField = signal<SortField>('reportDate');
  readonly sortDir = signal<SortDir>('desc');

  readonly filterForm = new FormGroup({
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    timezone: new FormControl('UTC', { nonNullable: true, validators: [Validators.required] }),
    locationId: new FormControl('', { nonNullable: true }),
    technicianIds: new FormControl('', { nonNullable: true }), // comma-separated IDs
    flaggedOnly: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    // Init from query params
    const qp = this.route.snapshot.queryParams;
    if (qp['startDate']) this.filterForm.controls.startDate.setValue(qp['startDate']);
    if (qp['endDate']) this.filterForm.controls.endDate.setValue(qp['endDate']);
    if (qp['timezone']) this.filterForm.controls.timezone.setValue(qp['timezone']);
    if (qp['locationId']) this.filterForm.controls.locationId.setValue(qp['locationId']);
    if (qp['technicianIds']) this.filterForm.controls.technicianIds.setValue(qp['technicianIds']);
    if (qp['flaggedOnly'] === 'true') this.filterForm.controls.flaggedOnly.setValue(true);
    if (qp['startDate'] && qp['endDate']) this.runReport();
  }

  runReport(): void {
    this.filterForm.markAllAsTouched();
    if (this.filterForm.invalid) return;

    const { startDate, endDate, timezone, locationId, technicianIds, flaggedOnly } = this.filterForm.getRawValue();
    const params: Record<string, string> = { startDate, endDate, timezone };
    if (locationId.trim()) params['locationId'] = locationId.trim();
    if (technicianIds.trim()) params['technicianIds'] = technicianIds.trim();
    if (flaggedOnly) params['flaggedOnly'] = 'true';

    // Update query params for bookmarkability
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      replaceUrl: true,
    });

    this.loading.set(true);
    this.error.set(null);

    this.peopleService.getAttendanceDiscrepancyReport(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const items = Array.isArray(data) ? data : [];
          this.priorRows.set(items);
          this.rows.set(this.applyFilters(items, flaggedOnly));
          this.loading.set(false);
        },
        error: (err) => {
          // Preserve prior rows on error
          this.rows.set(this.priorRows());
          this.error.set(err?.error?.message ?? 'Failed to load discrepancy report.');
          this.loading.set(false);
        },
      });
  }

  private applyFilters(items: unknown[], flaggedOnly: boolean): unknown[] {
    if (!flaggedOnly) return items;
    return (items as Array<Record<string, unknown>>).filter(r => r['isFlagged'] === true);
  }

  toggleFlaggedOnly(): void {
    const current = this.filterForm.controls.flaggedOnly.value;
    this.filterForm.controls.flaggedOnly.setValue(!current);
    // Re-filter existing rows without new API call
    const flagged = !current;
    this.rows.set(this.applyFilters(this.priorRows(), flagged));
  }

  sortBy(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
    this.rows.set(this.sortRows(this.rows()));
  }

  private sortRows(rows: unknown[]): unknown[] {
    const field = this.sortField();
    const dir = this.sortDir();
    return [...rows as Array<Record<string, unknown>>].sort((a, b) => {
      const va = a[field] ?? '';
      const vb = b[field] ?? '';
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) return '';
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }
}
