import { DatePipe } from '@angular/common';
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
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import {
  StatementSupersedeComponent,
  SupersedeChoice,
} from '../../components/statement-supersede/statement-supersede.component';
import {
  ACTIVE_RECONCILIATION_STATUSES,
  BANK_REC_JUSTIFICATION_MIN,
  BankAccount,
  BankRecFailure,
  ManualTransactionInput,
  StatementHeader,
  fieldErrorMessage,
  indexedFieldErrors,
} from '../../models/bank-reconciliation.models';
import { BankReconciliationService, toBankRecFailure } from '../../services/bank-reconciliation.service';
import { bankAccountsCommands, reconciliationWorkspaceCommands } from '../../utils/bank-reconciliation-routes';
import { statementFailureKey } from '../../utils/bank-statement-errors';
import { toDatePipeInput } from '../../utils/date-only.util';
import { parseAmountInput } from '../../utils/file-base64.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

interface GapPrompt {
  readonly expected: string | null;
  readonly firstStatement: boolean;
}

type TransactionGroup = FormGroup<{
  date: FormControl<string>;
  amount: FormControl<string>;
  description: FormControl<string>;
  reference: FormControl<string>;
  checkNumber: FormControl<string>;
}>;

/** The day after a bare `YYYY-MM-DD`, as a bare date; calendar arithmetic, not money. */
export function nextDay(date: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1, day + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

/**
 * Manual statement entry (CAP-055, SPEC-manual-bank-reconciliation §4.3
 * fallback) and the phase-1 interim reconciliation to a date (§4.1 d, §5.7 b):
 * the header and the transactions keyed from online banking, sent through
 * `POST /bank-statements`. In interim mode the window starts the day after
 * the account's reconciled frontier.
 *
 * A 422 STATEMENT_NOT_CONTIGUOUS opens the gap acknowledgement; a 422
 * STATEMENT_TRANSACTION_OUT_OF_WINDOW highlights the rows the server named in
 * `fieldErrors[transactions[n]]`. The form carries the shared "replace a
 * committed statement" control (§4.9 path 3).
 *
 * ── Authorization (ADR-0040 §6a) ─────────────────────────────────────────
 * `createBankStatement` enforces `accounting:reconciliation:adjust`, which
 * the route requires; the submit handler re-checks it.
 */
@Component({
  selector: 'app-bank-statement-entry-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, StatementSupersedeComponent],
  templateUrl: './bank-statement-entry-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './bank-statement-entry-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankStatementEntryPageComponent {
  private readonly service = inject(BankReconciliationService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly justificationMin = BANK_REC_JUSTIFICATION_MIN;
  readonly bankAccountsLink = bankAccountsCommands();

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly account = signal<BankAccount | null>(null);
  readonly interim = signal(false);

  readonly transactions = new FormArray<TransactionGroup>([]);
  readonly form = new FormGroup({
    startDate: new FormControl('', { nonNullable: true }),
    endDate: new FormControl('', { nonNullable: true }),
    openingBalance: new FormControl('', { nonNullable: true }),
    closingBalance: new FormControl('', { nonNullable: true }),
    statementRef: new FormControl('', { nonNullable: true }),
    gapAcknowledgement: new FormControl('', { nonNullable: true }),
    startReconciliation: new FormControl(true, { nonNullable: true }),
    transactions: this.transactions,
  });

  readonly submitting = signal(false);
  readonly formErrorKey = signal<string | null>(null);
  readonly failureKey = signal<string | null>(null);
  readonly failureDetail = signal<string | null>(null);
  readonly flaggedTransactions = signal<ReadonlySet<number>>(new Set());
  readonly gapPrompt = signal<GapPrompt | null>(null);
  readonly gapLength = signal(0);
  readonly supersede = signal<SupersedeChoice>({ state: 'off' });
  private readonly supersedeControl = viewChild(StatementSupersedeComponent);
  private readonly failureRegion = viewChild<ElementRef<HTMLElement>>('failureRegion');

  readonly canAdjust = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.reconciliationAdjust),
  );

  readonly accountLabel = computed(() =>
    [this.account()?.accountCode, this.account()?.accountName].filter(Boolean).join(' '),
  );

  /**
   * An interim window starts the day after the reconciled frontier (§4.1 d).
   * Without a frontier there is no interim window to key: the account's first
   * statement is entered as a normal statement.
   */
  readonly interimUnavailable = computed(() => this.interim() && !!this.account() && !this.account()?.reconciledFrontier);

  /** One writer to `account` (ADR-0063): a superseded account read never lands. */
  private accountSeq = 0;

  constructor() {
    this.form.controls.gapAcknowledgement.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.gapLength.set(value.trim().length));
    this.addTransaction();

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.resetForRoute();
      this.interim.set(this.route.snapshot.queryParamMap.get('interim') === 'true');
      const glAccountId = params.get('glAccountId');
      if (glAccountId) this.readAccount(glAccountId);
    });
  }

  retry(): void {
    const glAccountId = this.route.snapshot.paramMap.get('glAccountId');
    if (glAccountId) this.readAccount(glAccountId);
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  addTransaction(): void {
    this.transactions.push(
      new FormGroup({
        date: new FormControl('', { nonNullable: true }),
        amount: new FormControl('', { nonNullable: true }),
        description: new FormControl('', { nonNullable: true }),
        reference: new FormControl('', { nonNullable: true }),
        checkNumber: new FormControl('', { nonNullable: true }),
      }),
    );
  }

  removeTransaction(index: number): void {
    if (this.transactions.length > 1) this.transactions.removeAt(index);
    this.flaggedTransactions.set(new Set());
  }

  onSupersede(choice: SupersedeChoice): void {
    this.supersede.set(choice);
  }

  submit(): void {
    const account = this.account();
    if (!this.canAdjust() || this.submitting() || !account || this.interimUnavailable()) return;
    const header = this.readHeader();
    const transactions = this.readTransactions();
    if (!header || !transactions) {
      this.formErrorKey.set(
        !header ? 'ACCOUNTING.BANK_STATEMENT_ENTRY.ERROR.HEADER' : 'ACCOUNTING.BANK_STATEMENT_ENTRY.ERROR.TRANSACTIONS',
      );
      return;
    }
    const supersede = this.supersede();
    if (supersede.state === 'incomplete') return;
    const gap = this.gapPrompt() ? this.form.controls.gapAcknowledgement.value.trim() : '';
    if (this.gapPrompt() && gap.length < BANK_REC_JUSTIFICATION_MIN) {
      this.formErrorKey.set('ACCOUNTING.BANK_IMPORT.UPLOAD.ERROR.GAP_TOO_SHORT');
      return;
    }

    this.formErrorKey.set(null);
    this.failureKey.set(null);
    this.failureDetail.set(null);
    this.flaggedTransactions.set(new Set());
    this.submitting.set(true);
    this.service
      .createManualStatement({
        glAccountId: account.glAccountId,
        statement: header,
        transactions,
        gapAcknowledgement: gap || null,
        supersession: supersede.state === 'ready' ? supersede.supersession : null,
        startReconciliation: this.form.controls.startReconciliation.value,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: statement => {
          this.submitting.set(false);
          const started = statement.reconciliations.find(link =>
            ACTIVE_RECONCILIATION_STATUSES.includes(link.status ?? ''),
          );
          void this.router.navigate(
            started ? reconciliationWorkspaceCommands(started.reconciliationId) : bankAccountsCommands(),
          );
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.onFailure(toBankRecFailure(error));
        },
      });
  }

  private onFailure(failure: BankRecFailure): void {
    switch (failure.code) {
      case 'STATEMENT_NOT_CONTIGUOUS':
        this.gapPrompt.set({
          expected: fieldErrorMessage(failure, 'openingBalance'),
          firstStatement: !this.account()?.coverageFrontier,
        });
        break;
      case 'STATEMENT_GAP_ACKNOWLEDGEMENT_NOT_APPLICABLE':
        this.gapPrompt.set(null);
        this.form.controls.gapAcknowledgement.setValue('');
        break;
      case 'STATEMENT_TRANSACTION_OUT_OF_WINDOW':
        this.flaggedTransactions.set(new Set(indexedFieldErrors(failure, 'transactions')));
        break;
      case 'STATEMENT_SUPERSESSION_NOT_ELIGIBLE':
        this.supersedeControl()?.reload();
        break;
    }
    this.failureKey.set(statementFailureKey(failure));
    this.failureDetail.set(
      failure.code === 'STATEMENT_NOT_CONTIGUOUS' ? fieldErrorMessage(failure, 'openingBalance') : null,
    );
    afterNextRender(() => this.failureRegion()?.nativeElement.focus(), { injector: this.injector });
  }

  private readAccount(glAccountId: string): void {
    const seq = ++this.accountSeq;
    this.state.set('loading');
    this.errorKey.set(null);
    this.service
      .listBankAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: accounts => {
          if (seq !== this.accountSeq) return;
          const account = accounts.find(row => row.glAccountId === glAccountId) ?? null;
          if (!account) {
            this.state.set('error');
            this.errorKey.set('ACCOUNTING.BANK_IMPORT.ERROR.ACCOUNT_NOT_FOUND');
            return;
          }
          this.account.set(account);
          // The interim window starts the day after the reconciled frontier (§4.1 d).
          if (this.interim() && account.reconciledFrontier) {
            // The server's frontier fixes the start: the field shows it and cannot be edited.
            this.form.controls.startDate.setValue(nextDay(account.reconciledFrontier));
            this.form.controls.startDate.disable();
          }
          this.state.set('ready');
        },
        error: (error: unknown) => {
          if (seq !== this.accountSeq) return;
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(
            toBankRecFailure(error).status === 403
              ? 'ACCOUNTING.BANK_IMPORT.ERROR.FORBIDDEN'
              : 'ACCOUNTING.BANK_IMPORT.ERROR.LOAD',
          );
        },
      });
  }

  /** A new route key starts over: nothing read or keyed for the previous account carries across. */
  private resetForRoute(): void {
    this.accountSeq++;
    this.account.set(null);
    this.form.controls.startDate.enable();
    this.form.reset({ startReconciliation: true });
    this.transactions.clear();
    this.addTransaction();
    this.gapPrompt.set(null);
    this.formErrorKey.set(null);
    this.failureKey.set(null);
    this.failureDetail.set(null);
    this.flaggedTransactions.set(new Set());
    this.supersede.set({ state: 'off' });
  }

  private readHeader(): StatementHeader | null {
    const value = this.form.getRawValue();
    const opening = parseAmountInput(value.openingBalance);
    const closing = parseAmountInput(value.closingBalance);
    if (!value.startDate || !value.endDate || opening === null || closing === null) return null;
    return {
      startDate: value.startDate,
      endDate: value.endDate,
      openingBalance: opening,
      closingBalance: closing,
      statementRef: value.statementRef.trim() || null,
    };
  }

  /** Every keyed row, or null when one lacks a date, a readable amount or a description. */
  private readTransactions(): ManualTransactionInput[] | null {
    const out: ManualTransactionInput[] = [];
    for (const row of this.transactions.getRawValue()) {
      const amount = parseAmountInput(row.amount);
      if (!row.date || amount === null || !row.description.trim()) return null;
      out.push({
        date: row.date,
        signedAmount: amount,
        description: row.description.trim(),
        reference: row.reference.trim() || null,
        checkNumber: row.checkNumber.trim() || null,
      });
    }
    return out;
  }
}
