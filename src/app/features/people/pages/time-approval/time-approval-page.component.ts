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
import { v4 as uuidv4 } from 'uuid';
import { PeopleService } from '../../services/people.service';

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
  private readonly peopleService = inject(PeopleService);
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
    this.peopleService.listApprovalScopedPeople()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: unknown) => {
          const r = resp as Record<string, unknown>;
          this.people.set(Array.isArray(r['items']) ? (r['items'] as unknown[]) : []);
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
    this.peopleService.listTimePeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: unknown) => {
          const r = resp as Record<string, unknown>;
          this.periods.set(Array.isArray(r['items']) ? (r['items'] as unknown[]) : []);
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

    this.peopleService.listTimekeepingEntries(personId, timePeriodId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: unknown) => {
          const r = resp as Record<string, unknown>;
          this.entries.set(Array.isArray(r['items']) ? (r['items'] as unknown[]) : []);
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailError.set('Failed to load timekeeping entries.');
          this.detailLoading.set(false);
        },
      });

    this.historyLoading.set(true);
    this.peopleService.listTimePeriodApprovals(personId, timePeriodId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp: unknown) => {
          const r = resp as Record<string, unknown>;
          this.approvalHistory.set(Array.isArray(r['items']) ? (r['items'] as unknown[]) : []);
          this.historyLoading.set(false);
        },
        error: () => { this.historyLoading.set(false); },
      });
  }

  approvePeriod(): void {
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (!personId || !timePeriodId) return;
    const idempotencyKey = uuidv4();
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    this.peopleService.approveTimePeriod(timePeriodId, personId, { requestId: idempotencyKey }, idempotencyKey)
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
    this.peopleService.rejectTimePeriod(timePeriodId, personId, { requestId: uuidv4(), ...(comments.trim() ? { comments: comments.trim() } : {}) })
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
