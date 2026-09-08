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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PeopleService } from '../../services/people.service';

type PeriodStatus = 'OPEN' | 'SUBMISSION_CLOSED' | 'PAYROLL_CLOSED';

@Component({
  selector: 'app-time-approval-page',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './time-approval-page.component.html',
  styleUrl: './time-approval-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeApprovalPageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

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
    const period = (this.periods() as Array<Record<string, unknown>>).find((p) => p['timePeriodId'] === periodId);
    return (period?.['status'] as PeriodStatus) ?? null;
  });

  readonly canDecide = computed<boolean>(() => {
    const status = this.selectedPeriodStatus();
    if (!this.selectionForm.getRawValue().personId || !this.selectionForm.getRawValue().timePeriodId) return false;
    if (this.detailLoading() || this.actionInFlight()) return false;
    if (this.entries().length === 0) return false;
    if (status === 'OPEN' || status === 'PAYROLL_CLOSED') return false;
    const allPending = (this.entries() as Array<Record<string, unknown>>).every(e => e['approvalStatus'] === 'PENDING_APPROVAL');
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
    this.peopleService.listApprovalPeople()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.people.set(Array.isArray(r) ? r : []);
          this.peopleLoading.set(false);
        },
        error: () => {
          this.peopleError.set(this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.LOAD_EMPLOYEES'));
          this.peopleLoading.set(false);
        },
      });
  }

  loadPeriods(): void {
    this.periodsLoading.set(true);
    this.peopleService.listTimePeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.periods.set(Array.isArray(r) ? r : []);
          this.periodsLoading.set(false);
        },
        error: () => {
          this.periodsError.set(this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.LOAD_PERIODS'));
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

    this.peopleService.listTimekeepingEntries(personId, timePeriodId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.entries.set(Array.isArray(r) ? r : []);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailError.set(this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.LOAD_ENTRIES'));
          this.detailLoading.set(false);
        },
      });

    this.historyLoading.set(true);
    this.peopleService.listTimePeriodApprovals(personId, timePeriodId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.approvalHistory.set(r ? [r] : []);
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
    this.peopleService.approveTimePeriod(timePeriodId, personId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionSuccess.set(this.translate.instant('PEOPLE.TIME_APPROVAL.APPROVE_SUCCESS'));
          this.actionInFlight.set(false);
          this.loadDetail(personId, timePeriodId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.APPROVE_PERIOD');
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
    const body: Record<string, string> = { reason: comments.trim() };
    this.peopleService.rejectTimePeriod(timePeriodId, personId, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.actionSuccess.set(this.translate.instant('PEOPLE.TIME_APPROVAL.REJECT_SUCCESS'));
          this.actionInFlight.set(false);
          this.showRejectDialog.set(false);
          this.loadDetail(personId, timePeriodId);
        },
        error: (err) => {
          const msg = err?.error?.message ?? this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.REJECT_PERIOD');
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
    if (status === 'OPEN') return this.translate.instant('PEOPLE.TIME_APPROVAL.STATUS_OPEN');
    if (status === 'PAYROLL_CLOSED') return this.translate.instant('PEOPLE.TIME_APPROVAL.STATUS_PAYROLL_CLOSED');
    return null;
  }
}
