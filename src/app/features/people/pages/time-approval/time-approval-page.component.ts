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
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ApprovalPersonDto,
  TimePeriodApprovalDto,
  TimePeriodDto,
  TimekeepingEntryDto,
} from '@durion-sdk/people';

import { AuthService } from '../../../../core/services/auth.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { PeopleService } from '../../services/people.service';

type PeriodStatus = TimePeriodDto['status'];

/**
 * The person named by `?personId=` when the approval-people list omits them. That list only
 * holds employees with at least one timekeeping entry, so an employee opened from the
 * register before logging any time would otherwise leave the select silently blank.
 * `name` is null until (or unless) the person lookup resolves.
 */
interface RequestedPerson {
  personId: string;
  name: string | null;
}

@Component({
  selector: 'app-time-approval-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './time-approval-page.component.html',
  styleUrl: './time-approval-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeApprovalPageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  readonly people = signal<ApprovalPersonDto[]>([]);
  readonly requestedPerson = signal<RequestedPerson | null>(null);
  readonly peopleLoading = signal(false);
  readonly peopleError = signal<string | null>(null);

  readonly periods = signal<TimePeriodDto[]>([]);
  readonly periodsLoading = signal(false);
  readonly periodsError = signal<string | null>(null);

  readonly entries = signal<TimekeepingEntryDto[]>([]);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);

  readonly approvalHistory = signal<TimePeriodApprovalDto[]>([]);
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
    return this.periods().find(p => p.timePeriodId === periodId)?.status ?? null;
  });

  readonly canDecide = computed<boolean>(() => {
    const status = this.selectedPeriodStatus();
    if (!this.selectionForm.getRawValue().personId || !this.selectionForm.getRawValue().timePeriodId) return false;
    if (this.detailLoading() || this.actionInFlight()) return false;
    if (this.entries().length === 0) return false;
    if (status === 'OPEN' || status === 'PAYROLL_CLOSED') return false;
    const allPending = this.entries().every(e => e.approvalStatus === 'PENDING_APPROVAL');
    return allPending;
  });

  // Each decision control and its handler share one predicate (EXEMPLARS §5): viewing the page
  // does not grant the write, so a keyboard or programmatic call is refused just like the button.
  readonly canApprove = computed(() => this.canDecide() && this.allows(PEOPLE_SECTION.timeApprove));
  readonly canReject = computed(() => this.canDecide() && this.allows(PEOPLE_SECTION.timeReject));

  constructor() {
    // The employee register links here per row ("Time for <employee>"), so the person it names
    // has to arrive selected — otherwise the link promises a row-specific destination and hands
    // over an empty form. The value is patched before the option list loads; the select binds to
    // it as soon as the matching option renders.
    const personId = this.route.snapshot.queryParamMap.get('personId');
    if (personId) this.selectionForm.controls.personId.setValue(personId);

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
          const people = Array.isArray(r) ? r : [];
          this.people.set(people);
          this.peopleLoading.set(false);
          this.includeRequestedPerson(people);
        },
        error: () => {
          this.peopleError.set(this.translate.instant('PEOPLE.TIME_APPROVAL.ERROR.LOAD_EMPLOYEES'));
          this.peopleLoading.set(false);
        },
      });
  }

  /** Adds the `?personId=` employee as an option when the entries-based list does not hold them. */
  private includeRequestedPerson(people: readonly ApprovalPersonDto[]): void {
    const personId = this.route.snapshot.queryParamMap.get('personId');
    if (!personId || people.some(p => p.personId === personId)) {
      this.requestedPerson.set(null);
      return;
    }
    this.requestedPerson.set({ personId, name: null });
    // Name lookup is best-effort: without people-contact:person:view the option keeps its
    // generic label rather than provoking a 403 (issue #255).
    if (!this.allows(PEOPLE_SECTION.personLookup)) {
      return;
    }
    this.peopleService.getPerson(personId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (person) => {
          const name = [person.firstName, person.lastName].map(part => part?.trim()).filter(Boolean).join(' ');
          this.requestedPerson.set({ personId, name: name || null });
        },
        error: () => { /* keep the generic label */ },
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
    this.peopleService.getTimePeriodApproval(personId, timePeriodId)
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
    if (!this.canApprove()) return;
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
    if (!this.canReject()) return;
    this.rejectForm.reset();
    this.showRejectDialog.set(true);
  }

  closeRejectDialog(): void {
    this.showRejectDialog.set(false);
  }

  submitReject(): void {
    if (!this.canReject()) return;
    this.rejectForm.markAllAsTouched();
    if (this.rejectForm.invalid) return;
    const { personId, timePeriodId } = this.selectionForm.getRawValue();
    if (!personId || !timePeriodId) return;
    this.actionInFlight.set(true);
    this.actionError.set(null);
    this.actionSuccess.set(null);
    const { comments } = this.rejectForm.getRawValue();
    this.peopleService.rejectTimePeriod(timePeriodId, personId, { reason: comments.trim() })
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

  /** Open when the token carries no permission claim, matching `canAccess()`; a 403 is the backstop. */
  private allows(permissions: readonly string[]): boolean {
    return !this.auth.permissionsKnown() || this.auth.hasAnyPermission(permissions);
  }
}
