import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { PeopleService } from '../../services/people.service';

@Component({
  selector: 'app-time-export-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './time-export-page.component.html',
  styleUrl: './time-export-page.component.css',
})
export class TimeExportPageComponent implements OnInit {
  private readonly peopleService = inject(PeopleService);

  readonly loading = signal(false);
  readonly exportData = signal<unknown[]>([]);
  readonly discrepancyData = signal<unknown[]>([]);
  readonly filterParams = signal<Record<string, string>>({});
  readonly error = signal<string | null>(null);
  readonly loadingDiscrepancies = signal(false);

  readonly filterForm = new FormGroup({
    startDate: new FormControl('', { nonNullable: true }),
    endDate: new FormControl('', { nonNullable: true }),
    locationId: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadExport();
  }

  loadExport(): void {
    this.loading.set(true);
    this.error.set(null);
    const params = this.readParams();
    this.filterParams.set(params);

    this.peopleService.getApprovedTimeForExport(params).subscribe({
      next: (data) => {
        this.exportData.set(Array.isArray(data) ? data : []);
        this.loading.set(false);
      },
      error: () => {
        this.exportData.set([]);
        this.error.set('PEOPLE.TIME_EXPORT.ERROR.LOAD_EXPORT');
        this.loading.set(false);
      },
    });
  }

  loadDiscrepancies(): void {
    this.loadingDiscrepancies.set(true);
    const params = this.readParams();

    this.peopleService.getAttendanceDiscrepancyReport(params).subscribe({
      next: (data) => {
        this.discrepancyData.set(Array.isArray(data) ? data : []);
        this.loadingDiscrepancies.set(false);
      },
      error: () => {
        this.error.set('PEOPLE.TIME_EXPORT.ERROR.LOAD_DISCREPANCIES');
        this.discrepancyData.set([]);
        this.loadingDiscrepancies.set(false);
      },
    });
  }

  private readParams(): Record<string, string> {
    const params: Record<string, string> = {};
    const { startDate, endDate, locationId } = this.filterForm.getRawValue();
    if (startDate.trim()) {
      params['startDate'] = startDate.trim();
    }
    if (endDate.trim()) {
      params['endDate'] = endDate.trim();
    }
    if (locationId.trim()) {
      params['locationId'] = locationId.trim();
    }
    return params;
  }
}
