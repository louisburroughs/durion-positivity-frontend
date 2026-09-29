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
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  AccountingPeriod,
  BankReconciliationClosePolicy,
  BankReconciliationPolicy,
  CloseReadiness,
  EXCEPTION_JUSTIFICATION_MIN,
  PeriodActionFailure,
  REOPEN_JUSTIFICATION_MAX,
  ReadinessCheck,
  ReadinessSeverity,
  isPeriodCode,
  periodHasStarted,
  periodMonthStart,
  previousPeriodCode,
} from '../../models/period-close.models';
import { PeriodCloseService, classifyPeriodActionError } from '../../services/period-close.service';
import { bankAccountsCommands, reconciliationWorkspaceCommands } from '../../utils/bank-reconciliation-routes';
import { toDatePipeInput } from '../../utils/date-only.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';
type PeriodAction = 'close' | 'reopen';
/** `exception` is a close carrying a bank-reconciliation exception justification. */
type DialogKind = PeriodAction | 'exception';

/** The confirmation open over the page, and the period it will act on. */
interface PendingDialog {
  readonly action: DialogKind;
  readonly periodCode: string;
}

/** One period's readiness read. Actionability gates on `'OK'` (ADR-0064). */
export type ReadinessRead =
  | { readonly status: 'loading' }
  | { readonly status: 'OK'; readonly readiness: CloseReadiness }
  | { readonly status: 'ERROR' };

/**
 * What a close of this period does next, from the served readiness and policy
 * only (§5.9): `CLOSE` confirms a plain close, `EXCEPTION` opens the exception
 * dialog, `BLOCKED` refuses with the blocking reasons, `UNAVAILABLE` refuses
 * because readiness could not be read outside `ADVISORY`, and `UNREAD` reads
 * readiness first.
 */
export type CloseGate = 'CLOSE' | 'EXCEPTION' | 'BLOCKED' | 'UNAVAILABLE' | 'LOADING' | 'UNREAD';

/** Check codes with copy of their own; any other code renders under a generic label. Literal so the i18n check sees them. */
const CHECK_LABEL_KEYS: Readonly<Record<string, string>> = {
  DRAFT_JOURNAL_ENTRIES: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.DRAFT_JOURNAL_ENTRIES',
  STATEMENT_COVERAGE: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.STATEMENT_COVERAGE',
  RECONCILIATION_APPROVED: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.RECONCILIATION_APPROVED',
  RECONCILIATION_IN_FLIGHT: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.RECONCILIATION_IN_FLIGHT',
  RECONCILIATION_INVALIDATED: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.RECONCILIATION_INVALIDATED',
  BALANCE_AGREEMENT: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.BALANCE_AGREEMENT',
  UNEXPLAINED_BANK_TRANSACTIONS: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.UNEXPLAINED_BANK_TRANSACTIONS',
  UNEXPLAINED_LEDGER_LINES: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.UNEXPLAINED_LEDGER_LINES',
  UNPOSTED_ADJUSTMENTS: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.UNPOSTED_ADJUSTMENTS',
  COVERAGE_LAG_APPLIED: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.COVERAGE_LAG_APPLIED',
  INCOMPLETE_IMPORTS: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.INCOMPLETE_IMPORTS',
  OUTSTANDING_ITEMS_AGING: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.OUTSTANDING_ITEMS_AGING',
  CLEARING_BALANCE_AGING: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.CLEARING_BALANCE_AGING',
  LATE_BANK_TRANSACTIONS: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.LATE_BANK_TRANSACTIONS',
  RECONCILED_AFTER_CLOSE: 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.RECONCILED_AFTER_CLOSE',
};

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
 * A close under a `REQUIRED_WITH_EXCEPTION` policy with BLOCKING checks needs
 * `accounting:period:override` too (`canOverride`), and only then opens the
 * exception dialog (SPEC-manual-bank-reconciliation §5.2, decision D4).
 *
 * ── Bank reconciliation readiness (§5.3, §5.9) ───────────────────────────
 * Each row expands to its close readiness: per-account frontiers and check
 * badges, plus the tenant-wide checks in their own block. A close reads
 * readiness first when it has not been read, then follows `closeGate()`:
 * every gate is the served `ready` flag and `policy`, never a rule the page
 * derives from the checks. When readiness cannot be read, the close stays
 * available only under an `ADVISORY` policy, read once per load.
 *
 * ── Refused writes ───────────────────────────────────────────────────────
 * A refused close or reopen keeps the list on screen (`state` stays `ready`)
 * and reports the refusal in an assertive live region, the same split as the
 * payables resolve action: the list is still true, only the write failed. A
 * refusal that means the list is stale (already closed, already open, no such
 * period) re-reads it in the background, keeping the rows on screen.
 */
@Component({
  selector: 'app-period-close-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MoneyPipe, ReactiveFormsModule, RouterLink, TranslatePipe, ModalDialogDirective],
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
  readonly exceptionJustificationMin = EXCEPTION_JUSTIFICATION_MIN;
  /** Named in the copy that tells a close-only user what the exception needs (ADR-0040 §6a). */
  readonly overridePermission = ACCOUNTING_SECTION.periodOverride[0];

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
  /** A background re-read is in flight; the rows on screen may be stale, so writes wait. */
  readonly refreshing = signal(false);

  readonly monthControl = new FormControl(previousPeriodCode(new Date()), { nonNullable: true });
  /** Bound with `[formGroup]` so `ngSubmit` is handled and the native submit never reloads the page. */
  readonly monthForm = new FormGroup({ month: this.monthControl });
  readonly monthErrorKey = signal<string | null>(null);

  readonly justificationControl = new FormControl('', { nonNullable: true });
  readonly reopenForm = new FormGroup({ justification: this.justificationControl });
  readonly justificationErrorKey = signal<string | null>(null);

  readonly exceptionControl = new FormControl('', { nonNullable: true });
  readonly exceptionForm = new FormGroup({ justification: this.exceptionControl });
  /** Trimmed length of the exception justification, for the confirm button's gate. */
  readonly exceptionLength = signal(0);

  /** Readiness reads by period code; a row's panel and its close gate read from here. */
  readonly readiness = signal<ReadonlyMap<string, ReadinessRead>>(new Map());
  /** Period codes whose readiness panel is open. */
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** The tenant policy, or null while unread or when the read failed; `policyStatus` tells which. */
  readonly policy = signal<BankReconciliationPolicy | null>(null);
  /** The policy read's own status, so "still loading" and "failed" gate differently (ADR-0064). */
  readonly policyStatus = signal<'loading' | 'OK' | 'ERROR'>('loading');
  /**
   * The period a close is waiting on (its readiness or the policy); every
   * close control waits with it, including close-by-month.
   */
  readonly closePending = signal<string | null>(null);

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
  /**
   * The exception body is accepted only from a holder of
   * `accounting:period:override` as well as `close` (D4); same unknown-claim
   * fallback, the server still answers 403 PERIOD_CLOSE_EXCEPTION_NOT_PERMITTED.
   */
  readonly canOverride = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.periodOverride),
  );
  readonly isViewOnly = computed(() => !this.canClose() && !this.canReopen());

  private readonly outcomeSuccess = viewChild<ElementRef<HTMLElement>>('outcomeSuccess');
  private readonly outcomeError = viewChild<ElementRef<HTMLElement>>('outcomeError');
  private readonly pendingNote = viewChild<ElementRef<HTMLElement>>('pendingNote');

  /** The control that opened the dialog; a cancelled dialog hands focus back to it. */
  private dialogOpener: HTMLElement | null = null;

  /** One writer to `periods` from reads; a superseded read never lands (ADR-0063). */
  private readSeq = 0;
  /** One counter per period's readiness entry, and one for the policy (ADR-0063). */
  private readonly readinessSeq = new Map<string, number>();
  private policySeq = 0;
  /** Bumped on every foreground load, so a readiness read from before it never lands. */
  private readinessEpoch = 0;

  constructor() {
    // A field error describes the value it was raised for; editing the field retires it.
    this.monthControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.monthErrorKey.set(null));
    this.justificationControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.justificationErrorKey.set(null));
    this.exceptionControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        this.exceptionLength.set(value.trim().length);
        this.justificationErrorKey.set(null);
      });
    this.load();
  }

  load(): void {
    // A read already in flight belongs to the previous load: bumping the epoch drops it.
    this.readinessEpoch++;
    this.readiness.set(new Map());
    this.expanded.set(new Set());
    this.closePending.set(null);
    this.readPolicy();
    this.read(false);
  }

  /**
   * Reads the list. A foreground read replaces the page with the loading
   * panel; a background refresh (after a refusal that means the list is
   * stale) keeps the current rows on screen, with every write control
   * disabled, until the answer lands. Both share `readSeq`: they write the
   * same signal and a newer read always supersedes an older one (ADR-0063).
   * A failed refresh drops to the error panel, because the rows it would
   * leave behind are known to be stale.
   */
  private read(background: boolean): void {
    const seq = ++this.readSeq;
    this.today.set(new Date());
    if (background) {
      this.refreshing.set(true);
    } else {
      this.state.set('loading');
      this.errorKey.set(null);
    }

    this.periodCloseService
      .listPeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: periods => {
          if (seq !== this.readSeq) return;
          this.periods.set(periods);
          this.refreshing.set(false);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: (error: unknown) => {
          if (seq !== this.readSeq) return;
          this.refreshing.set(false);
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

  /** Starts a close of a listed OPEN period, through its readiness gate. */
  requestClose(periodCode: string): void {
    if (!this.canClose() || this.pendingCode() || this.refreshing() || this.closePending()) return;
    const row = this.periods().find(period => period.periodCode === periodCode);
    if (row?.status !== 'OPEN') return;
    this.proceedToClose(periodCode);
  }

  /**
   * The next step of a close of `periodCode` (see {@link CloseGate}). Under
   * `REQUIRED` any BLOCKING check refuses; under `REQUIRED_WITH_EXCEPTION` a
   * holder of both `close` and `override` gets the exception dialog and anyone
   * else is refused. The page never weighs the checks itself.
   */
  closeGate(periodCode: string): CloseGate {
    const read = this.readiness().get(periodCode);
    if (read?.status === 'OK') {
      const { ready, policy } = read.readiness;
      if (ready || policy === 'ADVISORY') return 'CLOSE';
      if (policy === 'REQUIRED_WITH_EXCEPTION') return this.canOverride() ? 'EXCEPTION' : 'BLOCKED';
      return 'BLOCKED';
    }
    if (read?.status === 'ERROR') {
      // Readiness failed: only a policy read as ADVISORY lets the close go ahead; one still loading waits.
      if (this.policyStatus() === 'loading') return 'LOADING';
      return this.policyStatus() === 'OK' && this.policy()?.closePolicy === 'ADVISORY' ? 'CLOSE' : 'UNAVAILABLE';
    }
    return read?.status === 'loading' ? 'LOADING' : 'UNREAD';
  }

  /** The refusal copy: naming the override permission only where an exception exists (REQUIRED_WITH_EXCEPTION). */
  blockedKey(periodCode: string): string {
    const read = this.readiness().get(periodCode);
    const exceptionPolicy = read?.status === 'OK' && read.readiness.policy === 'REQUIRED_WITH_EXCEPTION';
    return exceptionPolicy && !this.canOverride()
      ? 'ACCOUNTING.PERIOD_CLOSE.READINESS.REFUSED.BLOCKED_NO_OVERRIDE'
      : 'ACCOUNTING.PERIOD_CLOSE.READINESS.REFUSED.BLOCKED';
  }

  /** True when a close of the period cannot go ahead from its current readiness. */
  closeRefused(periodCode: string): boolean {
    const gate = this.closeGate(periodCode);
    return gate === 'BLOCKED' || gate === 'UNAVAILABLE' || gate === 'LOADING';
  }

  /** Opens or closes a row's readiness panel, reading readiness the first time it opens. */
  toggleReadiness(periodCode: string): void {
    const open = new Set(this.expanded());
    if (open.delete(periodCode)) {
      this.expanded.set(open);
      return;
    }
    open.add(periodCode);
    this.expanded.set(open);
    const status = this.readiness().get(periodCode)?.status;
    if (status !== 'OK' && status !== 'loading') this.readReadiness(periodCode);
  }

  /** Re-reads one period's readiness, e.g. after it could not be read. */
  retryReadiness(periodCode: string): void {
    this.readReadiness(periodCode);
  }

  readinessOf(periodCode: string): ReadinessRead | null {
    return this.readiness().get(periodCode) ?? null;
  }

  policyLabelKey(policy: BankReconciliationClosePolicy | null): string {
    switch (policy) {
      case 'ADVISORY':
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.POLICY.ADVISORY';
      case 'REQUIRED':
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.POLICY.REQUIRED';
      case 'REQUIRED_WITH_EXCEPTION':
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.POLICY.REQUIRED_WITH_EXCEPTION';
      default:
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.POLICY.UNKNOWN';
    }
  }

  severityLabelKey(severity: ReadinessSeverity): string {
    switch (severity) {
      case 'BLOCKING':
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.SEVERITY.BLOCKING';
      case 'WARNING':
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.SEVERITY.WARNING';
      default:
        return 'ACCOUNTING.PERIOD_CLOSE.READINESS.SEVERITY.INFO';
    }
  }

  checkLabelKey(check: ReadinessCheck): string {
    return CHECK_LABEL_KEYS[check.code] ?? 'ACCOUNTING.PERIOD_CLOSE.READINESS.CHECK.OTHER';
  }

  /** A served amount from a check's references, or null when absent or not numeric. */
  amountRef(check: ReadinessCheck, key: string): number | null {
    const value = check.references[key];
    const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
    return Number.isFinite(amount) ? amount : null;
  }

  readonly bankAccountsLink = bankAccountsCommands();

  /** The links into bank reconciliation need its view permission (same unknown-claim fallback). */
  readonly canViewReconciliation = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_PAGE.reconciliationWorkspace),
  );

  /** The workspace of the reconciliation a check names, when it names one. */
  workspaceLink(check: ReadinessCheck): string[] | null {
    const id = this.textRef(check, 'reconciliationId');
    return id ? reconciliationWorkspaceCommands(id) : null;
  }

  /** A served text reference (a code or a bare date), or null. */
  textRef(check: ReadinessCheck, key: string): string | null {
    const value = check.references[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  /** How many ids a check's list reference names. */
  countRef(check: ReadinessCheck, key: string): number {
    const value = check.references[key];
    return Array.isArray(value) ? value.length : 0;
  }

  /**
   * Closes a month by code, for a month with no row yet. Checked here before
   * asking: a future month would only answer 404, and a closed one 409.
   */
  submitMonth(): void {
    if (!this.canClose() || this.pendingCode() || this.refreshing() || this.closePending()) return;
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
    this.proceedToClose(periodCode);
  }

  /** Opens the reopen dialog for a listed CLOSED period. */
  requestReopen(periodCode: string): void {
    if (!this.canReopen() || this.pendingCode() || this.refreshing()) return;
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
    if (pending?.action !== 'close' || !this.canClose() || this.pendingCode() || this.refreshing()) return;

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

  /**
   * Closes despite BLOCKING bank-reconciliation checks, with the audited
   * justification (§5.2). Gated on both `close` and `override`, re-checked here.
   */
  confirmException(): void {
    const pending = this.dialog();
    if (pending?.action !== 'exception' || !this.canClose() || !this.canOverride() || this.pendingCode() || this.refreshing()) {
      return;
    }
    const justification = this.exceptionControl.value.trim();
    if (justification.length < EXCEPTION_JUSTIFICATION_MIN) {
      this.justificationErrorKey.set('ACCOUNTING.PERIOD_CLOSE.EXCEPTION.ERROR.TOO_SHORT');
      return;
    }

    this.dialog.set(null);
    this.startAction('close', pending.periodCode);
    this.periodCloseService
      .closePeriod(pending.periodCode, justification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: period =>
          this.settleSuccess(pending.periodCode, period, 'ACCOUNTING.PERIOD_CLOSE.OUTCOME.CLOSED_WITH_EXCEPTION'),
        error: (error: unknown) => this.settleFailure('close', pending.periodCode, classifyPeriodActionError(error)),
      });
  }

  confirmReopen(): void {
    const pending = this.dialog();
    if (pending?.action !== 'reopen' || !this.canReopen() || this.pendingCode() || this.refreshing()) return;

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

  /** Follows the close gate; an unread readiness is read first and the close continues when it lands. */
  private proceedToClose(periodCode: string): void {
    switch (this.closeGate(periodCode)) {
      case 'CLOSE':
        this.openDialog('close', periodCode);
        return;
      case 'EXCEPTION':
        this.exceptionControl.setValue('');
        this.justificationErrorKey.set(null);
        this.openDialog('exception', periodCode);
        return;
      case 'BLOCKED':
        this.refuseClose(periodCode, this.blockedKey(periodCode));
        return;
      case 'UNAVAILABLE':
        this.refuseClose(periodCode, 'ACCOUNTING.PERIOD_CLOSE.READINESS.REFUSED.UNAVAILABLE');
        return;
      case 'UNREAD':
        this.rememberOpener();
        this.closePending.set(periodCode);
        this.expanded.update(open => new Set(open).add(periodCode));
        this.readReadiness(periodCode);
        return;
      case 'LOADING':
        // Readiness or the policy is still being read: the close continues when it lands.
        if (!this.closePending()) this.rememberOpener();
        this.closePending.set(periodCode);
        return;
    }
  }

  /**
   * Refuses a close before asking the server, and opens the row's readiness
   * so the reasons are in view. Focus moves to the announcement, so no
   * dialog will hand it back to the button that started the close.
   */
  private refuseClose(periodCode: string, key: string): void {
    this.dialogOpener = null;
    this.expanded.update(open => new Set(open).add(periodCode));
    this.announce({ tone: 'error', key, periodCode });
  }

  /**
   * Reads one period's readiness. Each period has its own sequence, so an
   * older read of the same period never overwrites a newer one (ADR-0063),
   * and a close waiting on this read continues once it settles, on either
   * branch.
   */
  private readReadiness(periodCode: string): void {
    const seq = (this.readinessSeq.get(periodCode) ?? 0) + 1;
    const epoch = this.readinessEpoch;
    this.readinessSeq.set(periodCode, seq);
    this.setReadiness(periodCode, { status: 'loading' });
    const current = (): boolean => epoch === this.readinessEpoch && this.readinessSeq.get(periodCode) === seq;

    this.periodCloseService
      .getCloseReadiness(periodCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: readiness => {
          if (!current()) return;
          this.setReadiness(periodCode, { status: 'OK', readiness });
          this.continueClose(periodCode);
        },
        error: () => {
          if (!current()) return;
          this.setReadiness(periodCode, { status: 'ERROR' });
          this.continueClose(periodCode);
        },
      });
  }

  /** Continues a close that waited; it keeps waiting while the gate is still LOADING (the policy read). */
  private continueClose(periodCode: string): void {
    if (this.closePending() !== periodCode) return;
    if (this.closeGate(periodCode) === 'LOADING') return;
    this.closePending.set(null);
    if (!this.canClose() || this.pendingCode() || this.refreshing()) {
      this.dialogOpener = null;
      return;
    }
    this.proceedToClose(periodCode);
  }

  private setReadiness(periodCode: string, read: ReadinessRead): void {
    this.readiness.update(map => new Map(map).set(periodCode, read));
  }

  /** Forgets a period's readiness after a write changed it; an open panel reads it again. */
  private invalidateReadiness(periodCode: string): void {
    if (this.expanded().has(periodCode)) {
      this.readReadiness(periodCode);
      return;
    }
    this.readinessSeq.set(periodCode, (this.readinessSeq.get(periodCode) ?? 0) + 1);
    this.readiness.update(map => {
      const next = new Map(map);
      next.delete(periodCode);
      return next;
    });
  }

  /**
   * The policy decides whether a close may go ahead when readiness cannot be
   * read. A close waiting on it continues once it settles, on either branch.
   */
  private readPolicy(): void {
    const seq = ++this.policySeq;
    this.policy.set(null);
    this.policyStatus.set('loading');
    this.periodCloseService
      .getBankReconciliationPolicy()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: policy => {
          if (seq !== this.policySeq) return;
          this.policy.set(policy);
          this.policyStatus.set('OK');
          this.resumePendingClose();
        },
        error: () => {
          if (seq !== this.policySeq) return;
          this.policy.set(null);
          this.policyStatus.set('ERROR');
          this.resumePendingClose();
        },
      });
  }

  private resumePendingClose(): void {
    const pending = this.closePending();
    if (pending) this.continueClose(pending);
  }

  private openDialog(action: DialogKind, periodCode: string): void {
    // A close that waited on its readiness read kept the opener from the click.
    if (!this.dialogOpener) this.rememberOpener();
    this.outcome.set(null);
    this.dialog.set({ action, periodCode });
  }

  private rememberOpener(): void {
    const active = this.document.activeElement;
    this.dialogOpener = active instanceof HTMLElement && active !== this.document.body ? active : null;
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
    this.invalidateReadiness(period.periodCode);
    this.announce({ tone: 'success', key, periodCode: period.periodCode });
  }

  private settleFailure(action: PeriodAction, periodCode: string, failure: PeriodActionFailure): void {
    this.clearPending();
    this.dialogOpener = null;
    this.announce({ tone: 'error', periodCode, ...failureMessage(action, failure) });
    // These refusals mean the list no longer matches the server: re-read it.
    const listIsStale =
      failure.kind === 'ALREADY_CLOSED' || failure.kind === 'ALREADY_OPEN' || failure.kind === 'NOT_FOUND';
    if (listIsStale) {
      this.read(true);
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
    case 'BANK_RECONCILIATION_INCOMPLETE':
      return failure.accountCount === null
        ? { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.BANK_RECONCILIATION_INCOMPLETE_UNCOUNTED' }
        : { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.BANK_RECONCILIATION_INCOMPLETE', count: failure.accountCount };
    case 'EXCEPTION_NOT_PERMITTED':
      return { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.EXCEPTION_NOT_PERMITTED' };
    case 'JUSTIFICATION_REQUIRED':
      return { key: 'ACCOUNTING.PERIOD_CLOSE.ERROR.JUSTIFICATION_REQUIRED' };
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
