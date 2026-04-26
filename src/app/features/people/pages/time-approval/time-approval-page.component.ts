import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  computed,
} from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpParams } from '@angular/common/http';
import { ApiBaseService } from '../../../../core/services/api-base.service';

type PeriodStatus = 'OPEN' | 'SUBMISSION_CLOSED' | 'PAYROLL_CLOSED';

@Component({
  selector: 'app-time-approval-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './time-approval-page.component.html',
  styleUrl: './time-approval-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeApprovalPageComponent {
  private readonly api = inject(ApiBaseService);
  private readonly destroyRef = inject(DestroyRef);

  readonly people = signal<unknown[]>([]);
  readonly peopleLoading = signal(false);
  readonly peopleError = signal<string | null>(null);

  readonly periods = signal<unknown[]>([]);
  readonly periodsLoading = signal(false);
  readonly periodsError = signal<string | null>(null);

  readonly entries = signal<unknown[]>([]);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly approvalHistory = signal<unknown[]>([]);
  readonly historyLoading = signal(false);

  readonly actionInFlight = signal(false);
  readonly actionSuccess = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly showRejectDialog = signal(false);

  readonly selectionForm = new FormGroup({
    personId: new FormControl('', { nonNullable: true }),
    timePeriodId: new FormControl('', { nonNullable: true }),
  });

  readonly rejectForm = new FormGroup({
    comments: new FormControl('', { nonNullable: true }),
  });

  readonly selectedPeriodStatus = computed<PeriodStatus | null>(() => {
    const periodId = this.selectionForm.getRawValue().timePeriodId;
    const period = (this.periods() as Array<Record<string, unknown>>).find((p) => p['id'] === periodId);
    return (period?.['status'] as PeriodStatus) ?? null;
  });

  readonly canDecide = computed<boolean>(() => {
    const status = this.selectedPeriodStatus();
    if (!this.selectionForm.getRawValue().personId || !this.selectionForm.getRawValue().timePeriodId) return false;
    if (this.detailLoading() || this.actionInFlight()) return false;
    if (this.entries().length === 0) return false;
    if (status === 'OPEN' || status === 'PAYROLL_CLOSED') return false;
    const allPending = (this.entries() as Array<Record<string, unknown>>).every(e => e['status'] === 'PENDING_APPROVAL');
    return allPending;
  });

  constructor() {
    this.loadPeople();
    this.loadPeriods();
    this.selectionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.onSelectionChange(); });
  }

  loadPeople(): void {
    this.peopleLoading.set(true);
    this.api.get<Record<string, unknown>>('/v1/people/timekeeping/approvals/people')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.people.set(Array.isArray(r['items']) ? r['items'] : []);
          this.peopleLoading.set(false);
        },
        error: () => {
          this.peopleError.set('Failed to load employees.');
          this.peopleLoading.set(false);
        },
      });
  }

  loadPeriods(): void {
    this.periodsLoading.set(true);
    this.api.get<Record<string, unknown>>('/v1/people/timekeeping/time-periods')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.periods.set(Array.isArray(r['items']) ? r['items'] : []);
          this.periodsLoading.set(false);
        },
        error: () => {
          this.periodsError.set('Failed to load time periods.');
          this.periodsLoading.set(false);
        },
      });
  }

  onSelectionChange(): void {
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (!personId || !timePeriodId) return;
    this.loadDetail(personId, timePeriodId);
  }

  loadDetail(personId: string, timePeriodId: string): void {
    this.detailLoading.set(true);
    this.detailError.set(null);
    this.entries.set([]);
    this.approvalHistory.set([]);
    this.actionSuccess.set(null);
    this.actionError.set(null);

    const params = new HttpParams().set('personId', personId).set('timePeriodId', timePeriodId);
    this.api.get<Record<string, unknown>>('/v1/people/timekeeping/timekeeping-entries', params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.entries.set(Array.isArray(r['items']) ? r['items'] : []);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailError.set('Failed to load timekeeping entries.');
          this.detailLoading.set(false);
        },
      });

    this.historyLoading.set(true);
    const historyParams = new HttpParams().set('personId', personId).set('timePeriodId', timePeriodId);
    this.api.get<Record<string, unknown>>('/v1/people/timekeeping/time-period-approvals', historyParams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.approvalHistory.set(Array.isArray(r['items']) ? r['items'] : []);
          this.historyLoading.set(false);
        },
        error: () => { this.historyLoading.set(false); },
      });
  }

  approvePeriod(): void {
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (!personId || !timePeriodId) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    this.api.post<void>('/v1/people/timekeeping/time-periods/' + timePeriodId + '/people/' + personId + '/approve', {})
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionSuccess.set('Period approved successfully.');
          this.actionInFlight.set(false);
          this.loadDetail(personId, timePeriodId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Failed to approve period.';
          this.actionError.set(msg);
          this.actionInFlight.set(false);
        },
      });
  }

  openRejectDialog(): void {
    this.rejectForm.reset();
    this.showRejectDialog.set(true);
  }

  closeRejectDialog(): void {
    this.showRejectDialog.set(false);
  }

  submitReject(): void {
    this.rejectForm.markAllAsTouched();
    if (this.rejectForm.invalid) return;
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (!personId || !timePeriodId) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    const { comments } = this.rejectForm.getRawValue();
    const body: Record<string, string> = {};
    if (comments.trim()) body['comments'] = comments.trim();
    this.api.post<void>('/v1/people/timekeeping/time-periods/' + timePeriodId + '/people/' + personId + '/reject', body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionSuccess.set('Period rejected successfully.');
          this.actionInFlight.set(false);
          this.showRejectDialog.set(false);
          this.loadDetail(personId, timePeriodId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? 'Failed to reject period.';
          this.actionError.set(msg);
          this.actionInFlight.set(false);
        },
      });
  }

  refreshDetail(): void {
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (personId && timePeriodId) this.loadDetail(personId, timePeriodId);
  }

  periodStatusMessage(): string | null {
    const status = this.selectedPeriodStatus();
    if (status === 'OPEN') return 'Approval available after submission closes.';
    if (status === 'PAYROLL_CLOSED') return 'Payroll is closed for this period.';
    return null;
  }
}
