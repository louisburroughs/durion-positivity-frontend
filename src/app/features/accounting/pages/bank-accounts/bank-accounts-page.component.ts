import { DOCUMENT, DatePipe, DecimalPipe } from '@angular/common';
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
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  ACTIVE_RECONCILIATION_STATUSES,
  BANK_PROFILE_CURRENCIES,
  BankAccount,
  BankRecFailure,
  BankStatement,
} from '../../models/bank-reconciliation.models';
import { BankReconciliationService, toBankRecFailure } from '../../services/bank-reconciliation.service';
import {
  bankStatementEntryCommands,
  newBankImportCommands,
  reconciliationWorkspaceCommands,
} from '../../utils/bank-reconciliation-routes';
import { toDatePipeInput } from '../../utils/date-only.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/** The four ways to start a reconciliation (§4.1). */
export type StartOption = 'STATEMENT' | 'IMPORT' | 'MANUAL' | 'INTERIM';

type StatementsState = 'loading' | 'ready' | 'error';

interface PendingDialog {
  readonly kind: 'profile' | 'start';
  readonly glAccountId: string;
}

interface Outcome {
  readonly tone: 'success' | 'error';
  readonly key: string;
  readonly account: string;
}

/** Codes with copy of their own on this page. Literal so the i18n check sees them. */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  CURRENCY_NOT_SUPPORTED: 'ACCOUNTING.BANK_ACCOUNTS.ERROR.CURRENCY_NOT_SUPPORTED',
  ACCOUNT_NOT_RECONCILABLE: 'ACCOUNTING.BANK_ACCOUNTS.ERROR.ACCOUNT_NOT_RECONCILABLE',
  RECONCILIATION_WINDOW_ALREADY_RECONCILED: 'ACCOUNTING.BANK_ACCOUNTS.ERROR.WINDOW_ALREADY_RECONCILED',
  GL_ACCOUNT_NOT_ACTIVE: 'ACCOUNTING.BANK_ACCOUNTS.ERROR.GL_ACCOUNT_NOT_ACTIVE',
};

/**
 * Bank accounts (CAP-055, SPEC-manual-bank-reconciliation §4.1).
 *
 * Lists every reconcilable `BANK_CASH` account with its profile, baseline and
 * frontiers, and starts a reconciliation four ways: from a COMMITTED
 * statement that nothing reconciles yet, by importing a file, by keying a
 * statement by hand, or as a phase-1 interim window (a manual statement to a
 * chosen date). Every count and date is served.
 *
 * ── Authorization (ADR-0040 §6a) ─────────────────────────────────────────
 * The route admits `accounting:reconciliation:view`. The profile edit and
 * every start option write, and the backend enforces
 * `accounting:reconciliation:adjust` on each, so the controls and their
 * handlers gate on `ACCOUNTING_SECTION.reconciliationAdjust`.
 */
@Component({
  selector: 'app-bank-accounts-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MoneyPipe, ReactiveFormsModule, TranslatePipe, ModalDialogDirective],
  templateUrl: './bank-accounts-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './bank-accounts-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankAccountsPageComponent {
  private readonly service = inject(BankReconciliationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly currencies = BANK_PROFILE_CURRENCIES;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly accounts = signal<readonly BankAccount[]>([]);
  /** A background re-read after a profile save; rows stay, writes wait. */
  readonly refreshing = signal(false);

  readonly dialog = signal<PendingDialog | null>(null);
  readonly saving = signal(false);
  readonly dialogErrorKey = signal<string | null>(null);
  readonly outcome = signal<Outcome | null>(null);

  readonly profileForm = new FormGroup({
    bankName: new FormControl('', { nonNullable: true }),
    accountMask: new FormControl('', { nonNullable: true }),
    currency: new FormControl<string>(BANK_PROFILE_CURRENCIES[0], { nonNullable: true }),
  });

  readonly startOption = new FormControl<StartOption>('STATEMENT', { nonNullable: true });
  readonly statementChoice = new FormControl<string>('', { nonNullable: true });
  readonly startForm = new FormGroup({ option: this.startOption, statementId: this.statementChoice });
  readonly startOptionValue = signal<StartOption>('STATEMENT');
  readonly statementsState = signal<StatementsState>('loading');
  /** COMMITTED statements with no active or FINALIZED reconciliation, for option (a). */
  readonly eligibleStatements = signal<readonly BankStatement[]>([]);

  /** `setBankAccountProfile` and every start option enforce `adjust`; same unknown-claim fallback as period close. */
  readonly canAdjust = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.reconciliationAdjust),
  );

  readonly dialogAccount = computed(() => {
    const pending = this.dialog();
    return pending ? (this.accounts().find(account => account.glAccountId === pending.glAccountId) ?? null) : null;
  });

  private readonly outcomeSuccess = viewChild<ElementRef<HTMLElement>>('outcomeSuccess');
  private readonly outcomeError = viewChild<ElementRef<HTMLElement>>('outcomeError');

  private dialogOpener: HTMLElement | null = null;
  /** One counter per writer (ADR-0063): the list, and the statements of the open start dialog. */
  private readSeq = 0;
  private statementsSeq = 0;

  constructor() {
    this.startOption.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(option => {
      this.startOptionValue.set(option);
      this.dialogErrorKey.set(null);
    });
    this.load();
  }

  load(): void {
    this.read(false);
  }

  private read(background: boolean): void {
    const seq = ++this.readSeq;
    if (background) {
      this.refreshing.set(true);
    } else {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    this.service
      .listBankAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: accounts => {
          if (seq !== this.readSeq) return;
          this.accounts.set(accounts);
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
            toBankRecFailure(error).status === 403
              ? 'ACCOUNTING.BANK_ACCOUNTS.ERROR.FORBIDDEN'
              : 'ACCOUNTING.BANK_ACCOUNTS.ERROR.LOAD',
          );
        },
      });
  }

  /** A bare `YYYY-MM-DD` prepared for `DatePipe` as a local date (ADR-0038). */
  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  accountLabel(account: BankAccount | null): string {
    if (!account) return '';
    return [account.accountCode, account.accountName].filter(Boolean).join(' ');
  }

  openProfile(glAccountId: string): void {
    if (!this.canAdjust() || this.refreshing() || this.saving()) return;
    const account = this.accounts().find(row => row.glAccountId === glAccountId);
    if (!account) return;
    this.profileForm.setValue({
      bankName: account.bankName ?? '',
      accountMask: account.accountMask ?? '',
      currency: BANK_PROFILE_CURRENCIES[0],
    });
    this.openDialog({ kind: 'profile', glAccountId });
  }

  saveProfile(): void {
    const pending = this.dialog();
    if (pending?.kind !== 'profile' || !this.canAdjust() || this.saving()) return;
    const value = this.profileForm.getRawValue();
    this.saving.set(true);
    this.dialogErrorKey.set(null);
    this.service
      .setBankAccountProfile(pending.glAccountId, {
        bankName: value.bankName.trim() || null,
        accountMask: value.accountMask.trim() || null,
        currency: value.currency,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          const account = this.accountLabel(this.dialogAccount());
          this.closeDialog(false);
          this.announce({ tone: 'success', key: 'ACCOUNTING.BANK_ACCOUNTS.OUTCOME.PROFILE_SAVED', account });
          this.read(true);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.dialogErrorKey.set(this.failureKey(toBankRecFailure(error)));
        },
      });
  }

  openStart(glAccountId: string): void {
    if (!this.canAdjust() || this.refreshing() || this.saving()) return;
    this.startForm.setValue({ option: 'STATEMENT', statementId: '' });
    this.startOptionValue.set('STATEMENT');
    this.openDialog({ kind: 'start', glAccountId });
    this.readStatements(glAccountId);
  }

  retryStatements(): void {
    const pending = this.dialog();
    if (pending?.kind === 'start') this.readStatements(pending.glAccountId);
  }

  /** Follows the chosen start option (§4.1). Only option (a) writes here; the others open their page. */
  confirmStart(): void {
    const pending = this.dialog();
    if (pending?.kind !== 'start' || !this.canAdjust() || this.saving()) return;
    const glAccountId = pending.glAccountId;
    switch (this.startOption.value) {
      case 'IMPORT':
        this.closeDialog(false);
        void this.router.navigate(newBankImportCommands(glAccountId));
        return;
      case 'MANUAL':
        this.closeDialog(false);
        void this.router.navigate(bankStatementEntryCommands(glAccountId));
        return;
      case 'INTERIM':
        this.closeDialog(false);
        void this.router.navigate(bankStatementEntryCommands(glAccountId), { queryParams: { interim: 'true' } });
        return;
      case 'STATEMENT':
        this.startFromStatement(glAccountId);
        return;
    }
  }

  cancelDialog(): void {
    this.closeDialog(true);
  }

  private startFromStatement(glAccountId: string): void {
    const statementId = this.statementChoice.value;
    if (!statementId || !this.eligibleStatements().some(statement => statement.statementId === statementId)) {
      this.dialogErrorKey.set('ACCOUNTING.BANK_ACCOUNTS.START.ERROR.CHOOSE_STATEMENT');
      return;
    }
    this.saving.set(true);
    this.dialogErrorKey.set(null);
    this.service
      .startReconciliation(glAccountId, statementId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: reconciliationId => {
          this.saving.set(false);
          this.closeDialog(false);
          void this.router.navigate(reconciliationWorkspaceCommands(reconciliationId));
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const failure = toBankRecFailure(error);
          this.dialogErrorKey.set(this.failureKey(failure));
          // Someone reconciled the statement meanwhile: the list of candidates is stale.
          if (failure.code === 'RECONCILIATION_WINDOW_ALREADY_RECONCILED') this.readStatements(glAccountId);
        },
      });
  }

  private readStatements(glAccountId: string): void {
    const seq = ++this.statementsSeq;
    this.statementsState.set('loading');
    this.eligibleStatements.set([]);
    this.service
      .listStatements(glAccountId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: statements => {
          if (seq !== this.statementsSeq) return;
          const eligible = statements.filter(
            statement =>
              statement.status === 'COMMITTED' &&
              !statement.reconciliations.some(
                link => link.status === 'FINALIZED' || ACTIVE_RECONCILIATION_STATUSES.includes(link.status ?? ''),
              ),
          );
          this.eligibleStatements.set(eligible);
          this.statementsState.set('ready');
          if (eligible.length === 0 && this.startOption.value === 'STATEMENT') this.startOption.setValue('IMPORT');
        },
        error: () => {
          if (seq !== this.statementsSeq) return;
          this.statementsState.set('error');
        },
      });
  }

  private failureKey(failure: BankRecFailure): string {
    if (failure.code && ERROR_KEYS[failure.code]) return ERROR_KEYS[failure.code];
    switch (failure.status) {
      case 400:
        return 'ACCOUNTING.BANK_ACCOUNTS.ERROR.INVALID';
      case 403:
        return 'ACCOUNTING.BANK_ACCOUNTS.ERROR.FORBIDDEN_WRITE';
      default:
        return 'ACCOUNTING.BANK_ACCOUNTS.ERROR.OTHER';
    }
  }

  private openDialog(pending: PendingDialog): void {
    const active = this.document.activeElement;
    this.dialogOpener = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.outcome.set(null);
    this.dialogErrorKey.set(null);
    this.dialog.set(pending);
  }

  /** Closes the dialog; a cancel hands focus back to its opener (ADR-0029 §8.7). */
  private closeDialog(returnFocus: boolean): void {
    this.dialog.set(null);
    this.statementsSeq++;
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    if (returnFocus) {
      afterNextRender(() => (opener?.isConnected ? opener.focus() : undefined), { injector: this.injector });
    }
  }

  private announce(outcome: Outcome): void {
    this.outcome.set(outcome);
    afterNextRender(
      () => (outcome.tone === 'success' ? this.outcomeSuccess() : this.outcomeError())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }
}
