import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { LocationPickerComponent } from '../../../../location/components/location-picker/location-picker.component';
import { LaborOverheadReport, LaborOverheadReportLine } from '../../../models/accounting.models';
import { AccountingService } from '../../../services/accounting.service';

type ReportState = 'idle' | 'loading' | 'loaded' | 'empty' | 'error' | 'forbidden';

const YEAR_SPAN = 5;

@Component({
  selector: 'app-labor-overhead-report-page',
  standalone: true,
  imports: [CommonModule, TranslatePipe, LocationPickerComponent],
  templateUrl: './labor-overhead-report-page.component.html',
  styleUrl: './labor-overhead-report-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LaborOverheadReportPageComponent {
  private readonly accountingService = inject(AccountingService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<ReportState>('idle');
  readonly report = signal<LaborOverheadReport | null>(null);

  readonly locationId = signal('');
  readonly fiscalYear = signal(new Date().getFullYear());
  /** Undefined = full year (backend defaults to December). */
  readonly asOfMonth = signal<number | undefined>(undefined);

  /** Which line's inline help (definition + cost type) is expanded. */
  readonly openHelpCode = signal<string | null>(null);

  readonly years = computed(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: YEAR_SPAN }, (_unused, index) => current - index);
  });
  readonly monthIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  readonly canLoad = computed(() => this.locationId().trim().length > 0);

  onLocationSelected(id: string): void {
    this.locationId.set(id);
    this.load();
  }

  onYearChange(value: string): void {
    const year = Number(value);
    if (!Number.isNaN(year)) {
      this.fiscalYear.set(year);
      this.load();
    }
  }

  onAsOfMonthChange(value: string): void {
    this.asOfMonth.set(value ? Number(value) : undefined);
    this.load();
  }

  load(): void {
    if (!this.canLoad()) {
      return;
    }
    this.state.set('loading');
    this.openHelpCode.set(null);
    this.accountingService
      .getLaborOverheadReport(this.locationId().trim(), this.fiscalYear(), this.asOfMonth())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: report => {
          this.report.set(report);
          this.state.set(this.hasActivity(report) ? 'loaded' : 'empty');
        },
        error: err => {
          this.report.set(null);
          this.state.set((err?.status ?? 0) === 403 ? 'forbidden' : 'error');
        },
      });
  }

  retry(): void {
    this.load();
  }

  toggleHelp(code: string): void {
    this.openHelpCode.update(current => (current === code ? null : code));
  }

  isHelpOpen(code: string): boolean {
    return this.openHelpCode() === code;
  }

  /** Whole-dollar formatting; negatives in accounting parentheses. */
  formatAmount(value: number): string {
    const rounded = Math.round(value ?? 0);
    const grouped = Math.abs(rounded).toLocaleString('en-US');
    return rounded < 0 ? `(${grouped})` : grouped;
  }

  isNegative(value: number): boolean {
    return Math.round(value ?? 0) < 0;
  }

  costTypeKey(line: LaborOverheadReportLine): string | null {
    return line.costType ? `ACCOUNTING.LABOR_OVERHEAD_REPORT.COST_TYPE.${line.costType}` : null;
  }

  private hasActivity(report: LaborOverheadReport): boolean {
    return report.lines.some(
      line => line.ytd !== 0 || line.monthly.some(amount => amount !== 0),
    );
  }
}
