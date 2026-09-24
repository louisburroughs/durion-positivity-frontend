import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  CreateTimePeriodRequestStatusEnum,
  TransitionTimePeriodRequestStatusEnum,
  type TimePeriodDto,
} from '@durion-sdk/people';

import { AuthService } from '../../../../core/services/auth.service';
import { LocaleService } from '../../../../core/services/locale.service';
import { PEOPLE_SECTION } from '../../../../core/security/route-permissions';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { isoDateLocal, parseIsoDateLocal } from '../../../shopmgmt/models/capacity-calendar.models';
import { PeopleService } from '../../services/people.service';

type PageState = 'loading' | 'ready' | 'error';
type PeriodStatus = TimePeriodDto['status'];

/** Backend default grid (`pos.people.time-period.period-length-days`); only seeds the form. */
const DEFAULT_PERIOD_DAYS = 14;

/**
 * Allowed lifecycle moves, mirroring `transitionTimePeriod`: OPEN → SUBMISSION_CLOSED | PAYROLL_CLOSED,
 * SUBMISSION_CLOSED → PAYROLL_CLOSED | OPEN (reopen for corrections); PAYROLL_CLOSED is terminal.
 */
const TRANSITIONS: Record<PeriodStatus, readonly TransitionTimePeriodRequestStatusEnum[]> = {
  OPEN: [TransitionTimePeriodRequestStatusEnum.SubmissionClosed, TransitionTimePeriodRequestStatusEnum.PayrollClosed],
  SUBMISSION_CLOSED: [TransitionTimePeriodRequestStatusEnum.PayrollClosed, TransitionTimePeriodRequestStatusEnum.Open],
  PAYROLL_CLOSED: [],
};

interface PendingTransition {
  period: TimePeriodDto;
  target: TransitionTimePeriodRequestStatusEnum;
}

function endNotBeforeStart(group: AbstractControl): ValidationErrors | null {
  const { startDate, endDate } = group.value as { startDate: string; endDate: string };
  return startDate && endDate && endDate < startDate ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-pay-periods-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ModalDialogDirective],
  templateUrl: './pay-periods-page.component.html',
  styleUrl: './pay-periods-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayPeriodsPageComponent {
  private readonly peopleService = inject(PeopleService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly locale = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  // ── List ────────────────────────────────────────────────────────────────
  // `state` always moves before `errorKey` (EXEMPLARS §1).
  readonly state = signal<PageState>('loading');
  readonly errorKey = signal<string | null>(null);
  private readonly periods = signal<TimePeriodDto[]>([]);
  private loadSeq = 0;

  /** Newest first: `listTimePeriods` returns repository order when not tenant-scoped. */
  readonly sortedPeriods = computed(() =>
    [...this.periods()].sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );

  // ── Permissions: each control and its handler share one predicate (EXEMPLARS §5) ──
  readonly canCreate = computed(() => this.allows(PEOPLE_SECTION.payPeriodCreate));
  readonly canTransition = computed(() => this.allows(PEOPLE_SECTION.payPeriodTransition));
  readonly tenantId = computed(() => this.auth.tenantId());

  // ── Create ──────────────────────────────────────────────────────────────
  readonly createForm = new FormGroup(
    {
      startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      status: new FormControl<CreateTimePeriodRequestStatusEnum>(CreateTimePeriodRequestStatusEnum.Open, {
        nonNullable: true,
      }),
    },
    { validators: endNotBeforeStart },
  );
  readonly statusOptions = Object.values(CreateTimePeriodRequestStatusEnum);
  readonly creating = signal(false);
  readonly createErrorKey = signal<string | null>(null);
  readonly createSuccess = signal(false);

  // ── Transition ──────────────────────────────────────────────────────────
  readonly transitioningId = signal<string | null>(null);
  readonly transitionErrorKey = signal<string | null>(null);
  /** An irreversible move (to PAYROLL_CLOSED) waiting on confirmation. */
  readonly pendingConfirm = signal<PendingTransition | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.state.set('loading');
    this.errorKey.set(null);
    this.peopleService.listTimePeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (periods) => {
          if (seq !== this.loadSeq) return;
          this.periods.set(Array.isArray(periods) ? periods : []);
          this.state.set('ready');
          this.seedCreateForm();
        },
        error: (err) => {
          if (seq !== this.loadSeq) return;
          this.state.set('error');
          this.errorKey.set(err?.status === 403 ? 'PEOPLE.PAY_PERIODS.ERROR.FORBIDDEN' : 'PEOPLE.PAY_PERIODS.ERROR.LOAD');
        },
      });
  }

  allowedTransitions(period: TimePeriodDto): readonly TransitionTimePeriodRequestStatusEnum[] {
    return TRANSITIONS[period.status] ?? [];
  }

  /**
   * A date-only `YYYY-MM-DD` in the user's chosen locale. Parsed as a local date: `new Date(iso)`
   * would read it as UTC midnight and show the previous day west of Greenwich (ADR-0038). Reading
   * `currentLocale()` here re-renders the table when the language changes.
   */
  displayDate(iso: string): string {
    return parseIsoDateLocal(iso).toLocaleDateString(this.locale.currentLocale(), { dateStyle: 'medium' });
  }

  statusKey(status: string): string {
    return `PEOPLE.PAY_PERIODS.STATUS.${status}`;
  }

  transitionKey(from: PeriodStatus, to: TransitionTimePeriodRequestStatusEnum): string {
    if (to === TransitionTimePeriodRequestStatusEnum.Open) return 'PEOPLE.PAY_PERIODS.ACTION.REOPEN';
    if (to === TransitionTimePeriodRequestStatusEnum.SubmissionClosed) return 'PEOPLE.PAY_PERIODS.ACTION.CLOSE_SUBMISSIONS';
    return from === 'OPEN' ? 'PEOPLE.PAY_PERIODS.ACTION.CLOSE_PAYROLL_NOW' : 'PEOPLE.PAY_PERIODS.ACTION.CLOSE_PAYROLL';
  }

  create(): void {
    if (!this.canCreate() || this.creating()) return;
    const tenantId = this.tenantId();
    this.createForm.markAllAsTouched();
    if (!tenantId || this.createForm.invalid) return;

    const { startDate, endDate, status } = this.createForm.getRawValue();
    this.creating.set(true);
    this.createErrorKey.set(null);
    this.createSuccess.set(false);
    this.peopleService.createTimePeriod({ tenantId, startDate, endDate, status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.creating.set(false);
          this.createSuccess.set(true);
          this.load();
        },
        error: (err) => {
          this.creating.set(false);
          this.createErrorKey.set(this.createError(err?.status));
        },
      });
  }

  /** Irreversible moves go through the confirm dialog; the rest apply straight away. */
  requestTransition(period: TimePeriodDto, target: TransitionTimePeriodRequestStatusEnum): void {
    if (!this.canTransition() || this.transitioningId()) return;
    if (!this.allowedTransitions(period).includes(target)) return;
    if (target === TransitionTimePeriodRequestStatusEnum.PayrollClosed) {
      this.pendingConfirm.set({ period, target });
      return;
    }
    this.applyTransition(period, target);
  }

  confirmTransition(): void {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    if (!pending) return;
    // The dialog is torn down now; park focus on the period's row until the result lands.
    this.focusAfterRender(pending.period.timePeriodId);
    this.applyTransition(pending.period, pending.target);
  }

  cancelTransition(): void {
    const pending = this.pendingConfirm();
    this.pendingConfirm.set(null);
    // Nothing changed: hand focus back to the control that opened the dialog.
    if (pending) this.focusAfterRender(pending.period.timePeriodId, pending.target);
  }

  private applyTransition(period: TimePeriodDto, target: TransitionTimePeriodRequestStatusEnum): void {
    if (!this.canTransition() || this.transitioningId()) return;
    this.transitioningId.set(period.timePeriodId);
    this.transitionErrorKey.set(null);
    this.peopleService.transitionTimePeriod(period.timePeriodId, target)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.periods.update(list => list.map(p => (p.timePeriodId === updated.timePeriodId ? updated : p)));
          this.transitioningId.set(null);
          // The clicked button may be gone (its move no longer applies), so the row header takes focus.
          this.focusAfterRender(updated.timePeriodId);
        },
        error: (err) => {
          this.transitioningId.set(null);
          this.transitionErrorKey.set(this.transitionError(err?.status));
          // The period moved or vanished under us: show what the server holds now.
          if (err?.status === 404 || err?.status === 409) this.load();
        },
      });
  }

  /**
   * Moves focus once the DOM reflects the change (ADR-0029 §8.7): to the transition button for
   * `target` when given and still rendered, otherwise to the period's row header.
   */
  private focusAfterRender(timePeriodId: string, target?: TransitionTimePeriodRequestStatusEnum): void {
    afterNextRender(() => {
      const row = this.host.nativeElement.querySelector(`[data-period-id="${timePeriodId}"]`);
      const button = target ? row?.querySelector<HTMLElement>(`button[data-target="${target}"]`) : null;
      (button ?? row?.querySelector<HTMLElement>('th'))?.focus();
    }, { injector: this.injector });
  }

  /** Suggest the period right after the newest one on the default grid; never overwrite user input. */
  private seedCreateForm(): void {
    const { startDate, endDate } = this.createForm.controls;
    if (startDate.dirty || endDate.dirty || startDate.value || endDate.value) return;
    const newest = this.sortedPeriods()[0];
    const start = newest ? parseIsoDateLocal(newest.endDate) : new Date();
    if (newest) start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setDate(end.getDate() + DEFAULT_PERIOD_DAYS - 1);
    this.createForm.patchValue({ startDate: isoDateLocal(start), endDate: isoDateLocal(end) });
  }

  private createError(status: number | undefined): string {
    if (status === 409) return 'PEOPLE.PAY_PERIODS.ERROR.OVERLAP';
    if (status === 400) return 'PEOPLE.PAY_PERIODS.ERROR.INVALID_RANGE';
    if (status === 403) return 'PEOPLE.PAY_PERIODS.ERROR.CREATE_FORBIDDEN';
    return 'PEOPLE.PAY_PERIODS.ERROR.CREATE';
  }

  private transitionError(status: number | undefined): string {
    if (status === 409) return 'PEOPLE.PAY_PERIODS.ERROR.TRANSITION_NOT_ALLOWED';
    if (status === 404) return 'PEOPLE.PAY_PERIODS.ERROR.NOT_FOUND';
    if (status === 403) return 'PEOPLE.PAY_PERIODS.ERROR.TRANSITION_FORBIDDEN';
    return 'PEOPLE.PAY_PERIODS.ERROR.TRANSITION';
  }

  /** Open when the token carries no permission claim, matching `canAccess()`; the 403 path is the backstop. */
  private allows(permissions: readonly string[]): boolean {
    return !this.auth.permissionsKnown() || this.auth.hasAnyPermission(permissions);
  }
}
