import { DOCUMENT, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import {
  AccountingPeriod,
  PeriodActionFailure,
  REOPEN_JUSTIFICATION_MAX,
  isPeriodCode,
  periodHasStarted,
  periodMonthStart,
  previousPeriodCode,
} from '../../models/period-close.models';
import { PeriodCloseService, classifyPeriodActionError } from '../../services/period-close.service';
import { toDatePipeInput } from '../../utils/date-only.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type PeriodAction = 'close' | 'reopen';

/** The confirmation open over the page, and the period it will act on. */
interface PendingDialog {
  readonly action: PeriodAction;
  readonly periodCode: string;
}

/** What the last close or reopen did, announced in a persistent live region. */
interface ActionOutcome {
  readonly tone: 'success' | 'error';
  readonly key: string;
  readonly periodCode: string;
  readonly count?: number;
}

/**
 * Accounting period close (CAP-054 / backend story B1).
 *
 * Lists every provisioned period and closes or reopens one. Closing stops
 * postings dated in the month unless an override is supplied; reopening needs
 * an audited justification. A month that was never posted into has no row, so
 * the page also closes a month by code; the backend provisions it on close.
 *
 * ── Authorization (ADR-0040 §6a) ─────────────────────────────────────────
 * The route admits `accounting:period:view`. Close and reopen each gate their
 * control and their handler on their own code from `ACCOUNTING_SECTION`, so
 * the view permission never enables a write.
 *
 * ── Refused writes ───────────────────────────────────────────────────────
 * A refused close or reopen keeps the list on screen (`state` stays `ready`)
 * and reports the refusal in an assertive live region, the same split as the
 * payables resolve action: the list is still true, only the write failed. A
 * refusal that means the list is stale (already closed, already open, no such
 * period) re-reads it.
 */
@Component({
  selector: 'app-period-close-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, TranslatePipe, ModalDialogDirective],
  templateUrl: './period-close-page.component.html',
  styleUrl: './period-close-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodClosePageComponent {
  private readonly periodCloseService = inject(PeriodCloseService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly justificationMax = REOPEN_JUSTIFICATION_MAX;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly periods = signal<readonly AccountingPeriod[]>([]);

  /** Local "today", refreshed on every load and at click time, never read once (ADR-0038). */
  readonly today = signal(new Date());

  readonly dialog = signal<PendingDialog | null>(null);
  /** The period a close or reopen is in flight for; every write control waits on it. */
  readonly pendingCode = signal<string | null>(null);
  readonly pendingAction = signal<PeriodAction | null>(null);
  readonly outcome = signal<ActionOutcome | null>(null);

  readonly monthControl = new FormControl(previousPeriodCode(new Date()), { nonNullable: true });
  /** Bound with `[formGroup]` so `ngSubmit` is handled and the native submit never reloads the page. */
  readonly monthForm = new FormGroup({ month: this.monthControl });
  readonly monthErrorKey = signal<string | null>(null);

  readonly justificationControl = new FormControl('', { nonNullable: true });
  readonly reopenForm = new FormGroup({ justification: this.justificationControl });
  readonly justificationErrorKey = signal<string | null>(null);

  /**
   * `closeAccountingPeriod` enforces `accounting:period:close`. Permissions
   * unknown (a legacy token) is not "none granted", as `canAccess()` reads it;
   * the server still answers 403 either way.
   */
  readonly canClose = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.periodClose),
  );
  /** `reopenAccountingPeriod` enforces `accounting:period:reopen`; same unknown-claim fallback. */
  readonly canReopen = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.periodReopen),
  );
  readonly isViewOnly = computed(() => !this.canClose() && !this.canReopen());

  private readonly outcomeSuccess = viewChild<ElementRef<HTMLElement>>('outcomeSuccess');
  private readonly outcomeError = viewChild<ElementRef<HTMLElement>>('outcomeError');
  private readonly pendingNote = viewChild<ElementRef<HTMLElement>>('pendingNote');

  /** The control that opened the dialog; a cancelled dialog hands focus back to it. */
  private dialogOpener: HTMLElement | null = null;

  /** One writer to `periods` from reads; a superseded read never lands (ADR-0063). */
  private readSeq = 0;

  constructor() {
    // A field error describes the value it was raised for; editing the field retires it.
    this.monthControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.monthErrorKey.set(null));
    this.justificationControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.justificationErrorKey.set(null));
    this.load();
  }

  load(): void {
    const seq = ++this.readSeq;
    this.today.set(new Date());
    this.state.set('loading');
    this.errorKey.set(null);

    this.periodCloseService
      .listPeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: periods => {
          if (seq !== this.readSeq) return;
          this.periods.set(periods);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: (error: unknown) => {
          if (seq !== this.readSeq) return;
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(
            error instanceof HttpErrorResponse && error.status === 403
              ? 'ACCOUNTING.PERIOD_CLOSE.ERROR.FORBIDDEN'
              : 'ACCOUNTING.PERIOD_CLOSE.ERROR.LOAD',
          );
        },
      });
  }

  /** Opens the close confirmation for a listed OPEN period. */
  requestClose(periodCode: string): void {
    if (!this.canClose() || this.pendingCode()) return;
    const row = this.periods().find(period => period.periodCode === periodCode);
    if (row?.status !== 'OPEN') return;
    this.openDialog('close', periodCode);
  }

  /**
   * Closes a month by code, for a month with no row yet. Checked here before
   * asking: a future month would only answer 404, and a closed one 409.
   */
  submitMonth(): void {
    if (!this.canClose() || this.pendingCode()) return;
    this.today.set(new Date());
    const periodCode = this.monthControl.value.trim();

    if (!isPeriodCode(periodCode)) {
      this.monthErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.INVALID');
      return;
    }
    if (!periodHasStarted(periodCode, this.today())) {
      this.monthErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.FUTURE');
      return;
    }
    const row = this.periods().find(period => period.periodCode === periodCode);
    if (row?.status === 'CLOSED') {
      this.monthErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.ALREADY_CLOSED');
      return;
    }
    // A listed row whose status was not read offers no row action; the form must not bypass that.
    if (row?.status === 'UNKNOWN') {
      this.monthErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CLOSE_MONTH.ERROR.STATUS_UNKNOWN');
      return;
    }
    this.monthErrorKey.set(null);
    this.openDialog('close', periodCode);
  }

  /** Opens the reopen dialog for a listed CLOSED period. */
  requestReopen(periodCode: string): void {
    if (!this.canReopen() || this.pendingCode()) return;
    const row = this.periods().find(period => period.periodCode === periodCode);
    if (row?.status !== 'CLOSED') return;
    this.justificationControl.setValue('');
    this.justificationErrorKey.set(null);
    this.openDialog('reopen', periodCode);
  }

  /**
   * Closes the dialog without acting. The dialog is torn down with its `@if`,
   * which leaves focus on `<body>`, so it goes back to the opener (ADR-0029 §8.7).
   */
  cancelDialog(): void {
    this.dialog.set(null);
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    afterNextRender(() => (opener?.isConnected ? opener.focus() : undefined), { injector: this.injector });
  }

  confirmClose(): void {
    const pending = this.dialog();
    // Re-checked at click time: the dialog may have opened under a grant that has since changed.
    if (pending?.action !== 'close' || !this.canClose() || this.pendingCode()) return;

    this.dialog.set(null);
    this.startAction('close', pending.periodCode);
    this.periodCloseService
      .closePeriod(pending.periodCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: period => this.settleSuccess(pending.periodCode, period, 'ACCOUNTING.PERIOD_CLOSE.OUTCOME.CLOSED'),
        error: (error: unknown) => this.settleFailure('close', pending.periodCode, classifyPeriodActionError(error)),
      });
  }

  confirmReopen(): void {
    const pending = this.dialog();
    if (pending?.action !== 'reopen' || !this.canReopen() || this.pendingCode()) return;

    const justification = this.justificationControl.value.trim();
    if (!justification) {
      this.justificationErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CONFIRM_REOPEN.ERROR.REQUIRED');
      return;
    }
    if (justification.length > REOPEN_JUSTIFICATION_MAX) {
      this.justificationErrorKey.set('ACCOUNTING.PERIOD_CLOSE.CONFIRM_REOPEN.ERROR.TOO_LONG');
      return;
    }

    this.dialog.set(null);
    this.startAction('reopen', pending.periodCode);
    this.periodCloseService
      .reopenPeriod(pending.periodCode, justification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: period => this.settleSuccess(pending.periodCode, period, 'ACCOUNTING.PERIOD_CLOSE.OUTCOME.REOPENED'),
        error: (error: unknown) => this.settleFailure('reopen', pending.periodCode, classifyPeriodActionError(error)),
      });
  }

  /**
   * The period's month as a local `Date` for `DatePipe` (ADR-0038), or null
   * for a malformed code: `DatePipe` throws on an invalid `Date`.
   */
  monthOf(periodCode: string): Date | null {
    return isPeriodCode(periodCode) ? periodMonthStart(periodCode) : null;
  }

  /** A bare `YYYY-MM-DD` prepared for `DatePipe` as a local date (ADR-0038). */
  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  private openDialog(action: PeriodAction, periodCode: string): void {
    const active = this.document.activeElement;
    this.dialogOpener = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.outcome.set(null);
    this.dialog.set({ action, periodCode });
  }

  /** Starts a write. The dialog and every write control go away, so focus parks on the progress note. */
  private startAction(action: PeriodAction, periodCode: string): void {
    this.dialogOpener = null;
    this.outcome.set(null);
    this.pendingAction.set(action);
    this.pendingCode.set(periodCode);
    afterNextRender(() => this.pendingNote()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Writes the server's row into the list. The row is keyed by the code this
   * write asked for, captured when it was issued, so a response that left
   * `periodCode` unset still lands on the right row (ADR-0063 §1).
   */
  private settleSuccess(requestedCode: string, response: AccountingPeriod, key: string): void {
    const period: AccountingPeriod = isPeriodCode(response.periodCode)
      ? response
      : { ...response, periodCode: requestedCode };
    this.periods.update(rows =>
      [...rows.filter(row => row.periodCode !== period.periodCode), period].sort((a, b) =>
        b.periodCode.localeCompare(a.periodCode),
      ),
    );
    this.clearPending();
    this.announce({ tone: 'success', key, periodCode: period.periodCode });
  }

  private settleFailure(action: PeriodAction, periodCode: string, failure: PeriodActionFailure): void {
    this.clearPending();
    this.announce({ tone: 'error', periodCode, ...failureMessage(action, failure) });
    // These refusals mean the list no longer matches the server: re-read it.
    const listIsStale =
      failure.kind === 'ALREADY_CLOSED' || failure.kind === 'ALREADY_OPEN' || failure.kind === 'NOT_FOUND';
    if (listIsStale) {
      this.load();
    }
  }

  private clearPending(): void {
    this.pendingCode.set(null);
    this.pendingAction.set(null);
  }

  /**
   * The row's button changes or disappears after a write, which would drop
   * focus onto `<body>`. Focus moves to the announcement instead (ADR-0029 §8.7).
   */
  private announce(outcome: ActionOutcome): void {
    this.outcome.set(outcome);
    afterNextRender(
      () => (outcome.tone === 'success' ? this.outcomeSuccess() : this.outcomeError())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }
}

/** The message key (and count) for a refused close or reopen. Keys are literal so the i18n check sees them. */
function failureMessage(action: PeriodAction, failure: PeriodActionFailure): { key: string; count?: number } {
  const closing = action === 'close';
  switch (failure.kind) {
    case 'DRAFT_ENTRIES':
      return failure.draftCount === null
        ? { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.DRAFT_ENTRIES_UNCOUNTED' }
        : { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.DRAFT_ENTRIES', count: failure.draftCount };
    case 'ALREADY_CLOSED':
      return { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.ALREADY_CLOSED' };
    case 'ALREADY_OPEN':
      return { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.ALREADY_OPEN' };
    case 'NOT_FOUND':
      return { key: closing ? 'ACCOUNTING.PERIOD_CLOSE.ERROR.NOT_FOUND_CLOSE' : 'ACCOUNTING.PERIOD_CLOSE.ERROR.NOT_FOUND_REOPEN' };
    case 'INVALID':
      return { key: closing ? 'ACCOUNTING.PERIOD_CLOSE.ERROR.INVALID_CLOSE' : 'ACCOUNTING.PERIOD_CLOSE.ERROR.INVALID_REOPEN' };
    case 'FORBIDDEN':
      return { key: closing ? 'ACCOUNTING.PERIOD_CLOSE.ERROR.FORBIDDEN_CLOSE' : 'ACCOUNTING.PERIOD_CLOSE.ERROR.FORBIDDEN_REOPEN' };
    default:
      return { key: closing ? 'ACCOUNTING.PERIOD_CLOSE.ERROR.OTHER_CLOSE' : 'ACCOUNTING.PERIOD_CLOSE.ERROR.OTHER_REOPEN' };
  }
}
