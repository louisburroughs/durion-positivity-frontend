import { DOCUMENT, DatePipe, DecimalPipe, KeyValuePipe, NgTemplateOutlet } from '@angular/common';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, from, switchMap } from 'rxjs';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  StatementSupersedeComponent,
  SupersedeChoice,
} from '../../components/statement-supersede/statement-supersede.component';
import {
  BANK_REC_JUSTIFICATION_MIN,
  BankAccount,
  BankImport,
  BankRecFailure,
  COLUMN_ROLES,
  ColumnMapping,
  ColumnRole,
  DuplicateDecision,
  ImportRow,
  ImportRowStatus,
  SIGN_CONVENTIONS,
  SignConvention,
  StatementHeader,
  fieldErrorMessage,
  indexedFieldErrors,
} from '../../models/bank-reconciliation.models';
import { BankReconciliationService, toBankRecFailure } from '../../services/bank-reconciliation.service';
import {
  bankAccountsCommands,
  bankImportCommands,
  reconciliationWorkspaceCommands,
} from '../../utils/bank-reconciliation-routes';
import { statementFailureKey } from '../../utils/bank-statement-errors';
import { toDatePipeInput } from '../../utils/date-only.util';
import { fileToBase64, parseAmountInput } from '../../utils/file-base64.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/** The wizard step, from the import's served `status` (§3.8), plus the upload before an import exists. */
export type WizardStep = 'upload' | 'mapping' | 'rows' | 'done';

type RowDialog =
  | { readonly kind: 'correct'; readonly row: ImportRow }
  | { readonly kind: 'skip'; readonly row: ImportRow }
  | { readonly kind: 'discard' };

/** The gap prompt a 422 STATEMENT_NOT_CONTIGUOUS opens, with the expected opening balance it named. */
interface GapPrompt {
  readonly expected: string | null;
  /** The account has no statement yet: only the acknowledgement is offered. */
  readonly firstStatement: boolean;
}

const ROWS_PAGE_SIZE = 50;

/** Row rejection codes with copy of their own (§4.4); any other renders under a generic label. */
const REJECTION_KEYS: Readonly<Record<string, string>> = {
  DATE_UNPARSEABLE: 'ACCOUNTING.BANK_IMPORT.REJECTION.DATE_UNPARSEABLE',
  AMOUNT_UNPARSEABLE: 'ACCOUNTING.BANK_IMPORT.REJECTION.AMOUNT_UNPARSEABLE',
  AMOUNT_ZERO: 'ACCOUNTING.BANK_IMPORT.REJECTION.AMOUNT_ZERO',
  AMOUNT_AND_DEBIT_CREDIT_BOTH: 'ACCOUNTING.BANK_IMPORT.REJECTION.AMOUNT_AND_DEBIT_CREDIT_BOTH',
  REQUIRED_COLUMN_MISSING: 'ACCOUNTING.BANK_IMPORT.REJECTION.REQUIRED_COLUMN_MISSING',
  DATE_OUTSIDE_STATEMENT: 'ACCOUNTING.BANK_IMPORT.REJECTION.DATE_OUTSIDE_STATEMENT',
};

/**
 * Bank statement import wizard (CAP-055, SPEC-manual-bank-reconciliation
 * §4.2–§4.4, §4.9 path 3).
 *
 * Upload a CSV with its statement header → map the columns and choose the
 * sign convention → correct or skip rejected rows and decide possible
 * duplicates → commit, then open the reconciliation. Discard is offered from
 * every step. The step follows the import's served `status`; every sign,
 * running balance and total on screen is the server's (§4.4, §8.4): the
 * component adds nothing up.
 *
 * `/bank-accounts/:glAccountId/import` starts an import; once created the
 * wizard moves to `/bank-imports/:importId`, which resumes it at its step.
 *
 * ── Authorization (ADR-0040 §6a) ─────────────────────────────────────────
 * Every call here writes under `accounting:reconciliation:adjust`, which the
 * route requires; each handler still re-checks it.
 */
@Component({
  selector: 'app-bank-import-page',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    KeyValuePipe,
    MoneyPipe,
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ModalDialogDirective,
    StatementSupersedeComponent,
  ],
  templateUrl: './bank-import-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './bank-import-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankImportPageComponent {
  private readonly service = inject(BankReconciliationService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly columnRoles = COLUMN_ROLES;
  readonly signConventions = SIGN_CONVENTIONS;
  readonly justificationMin = BANK_REC_JUSTIFICATION_MIN;
  readonly rowStatusFilters: readonly (ImportRowStatus | '')[] = ['', 'REJECTED', 'POSSIBLE_DUPLICATE', 'OUT_OF_WINDOW', 'CORRECTED', 'SKIPPED', 'PARSED'];
  readonly bankAccountsLink = bankAccountsCommands();

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);

  /** The account a new import is for (label and currency); null once an import exists. */
  readonly account = signal<BankAccount | null>(null);
  private readonly glAccountId = signal<string | null>(null);
  readonly bankImport = signal<BankImport | null>(null);
  /** The user asked to revisit the mapping of a VALIDATED import. */
  readonly remapping = signal(false);

  readonly busy = signal(false);
  /** The last refusal, as a message key, with the server's own words where the spec shows them verbatim. */
  readonly failureKey = signal<string | null>(null);
  readonly failureDetail = signal<string | null>(null);
  readonly flaggedRows = signal<ReadonlySet<number>>(new Set());

  // ── Upload step ────────────────────────────────────────────────────────
  readonly file = signal<File | null>(null);
  readonly uploadForm = new FormGroup({
    startDate: new FormControl('', { nonNullable: true }),
    endDate: new FormControl('', { nonNullable: true }),
    openingBalance: new FormControl('', { nonNullable: true }),
    closingBalance: new FormControl('', { nonNullable: true }),
    statementRef: new FormControl('', { nonNullable: true }),
    gapAcknowledgement: new FormControl('', { nonNullable: true }),
  });
  readonly uploadErrorKey = signal<string | null>(null);
  readonly gapPrompt = signal<GapPrompt | null>(null);
  readonly gapLength = signal(0);
  readonly supersede = signal<SupersedeChoice>({ state: 'off' });
  private readonly supersedeControl = viewChild(StatementSupersedeComponent);

  // ── Mapping step ───────────────────────────────────────────────────────
  readonly mappingForm = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    amount: new FormControl('', { nonNullable: true }),
    debit: new FormControl('', { nonNullable: true }),
    credit: new FormControl('', { nonNullable: true }),
    reference: new FormControl('', { nonNullable: true }),
    checkNumber: new FormControl('', { nonNullable: true }),
    sourceTransactionId: new FormControl('', { nonNullable: true }),
    signConvention: new FormControl<SignConvention>('SIGNED_AMOUNT', { nonNullable: true }),
    dateFormat: new FormControl('', { nonNullable: true }),
    saveAsAccountDefault: new FormControl(false, { nonNullable: true }),
  });

  // ── Rows step ──────────────────────────────────────────────────────────
  readonly rowFilter = new FormControl<ImportRowStatus | ''>('', { nonNullable: true });
  readonly rowsState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly rows = signal<readonly ImportRow[]>([]);
  readonly rowsPage = signal(0);
  readonly rowsTotalPages = signal(0);
  readonly rowDialog = signal<RowDialog | null>(null);
  readonly correctForm = new FormGroup({
    date: new FormControl('', { nonNullable: true }),
    signedAmount: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });
  readonly reasonControl = new FormControl('', { nonNullable: true });
  readonly reasonForm = new FormGroup({ reason: this.reasonControl });
  readonly reasonLength = signal(0);
  readonly dialogErrorKey = signal<string | null>(null);
  readonly commitForm = new FormGroup({
    startReconciliation: new FormControl(true, { nonNullable: true }),
    duplicates: new FormControl<'' | DuplicateDecision>('', { nonNullable: true }),
  });

  readonly canAdjust = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.reconciliationAdjust),
  );

  readonly step = computed<WizardStep>(() => {
    const current = this.bankImport();
    if (!current) return 'upload';
    switch (current.status) {
      case 'UPLOADED':
        return 'mapping';
      case 'VALIDATED':
        return this.remapping() ? 'mapping' : 'rows';
      default:
        return 'done';
    }
  });

  readonly accountLabel = computed(() => {
    const current = this.bankImport();
    const code = current ? current.accountCode : this.account()?.accountCode;
    const name = current ? current.accountName : this.account()?.accountName;
    return [code, name].filter(Boolean).join(' ');
  });

  /** Commit waits for every REJECTED row to be corrected or skipped, as served (§4.4). */
  readonly canCommit = computed(() => {
    const current = this.bankImport();
    return !!current && current.status === 'VALIDATED' && current.rejectedCount === 0;
  });

  readonly uploadReady = computed(() => this.file() !== null && this.supersede().state !== 'incomplete');

  private readonly failureRegion = viewChild<ElementRef<HTMLElement>>('failureRegion');
  private readonly rowsHeading = viewChild<ElementRef<HTMLElement>>('rowsHeading');
  private readonly doneHeading = viewChild<ElementRef<HTMLElement>>('doneHeading');
  private dialogOpener: HTMLElement | null = null;
  /** One counter per writer (ADR-0063): the import, and the rows page. */
  private importSeq = 0;
  private accountSeq = 0;
  private rowsSeq = 0;
  /** A row write succeeded: focus the rows heading once the re-read lands. */
  private focusAfterRefresh = false;
  private rowsSub: Subscription | null = null;

  constructor() {
    this.uploadForm.controls.gapAcknowledgement.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.gapLength.set(value.trim().length));
    this.reasonControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => this.reasonLength.set(value.trim().length));
    this.rowFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.readRows(0));
    this.destroyRef.onDestroy(() => this.rowsSub?.unsubscribe());

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.resetForRoute();
      const importId = params.get('importId');
      const glAccountId = params.get('glAccountId');
      if (importId) {
        this.readImport(importId, false);
      } else if (glAccountId) {
        this.glAccountId.set(glAccountId);
        this.readAccount(glAccountId);
      }
    });
  }

  retry(): void {
    const current = this.bankImport();
    const importId = this.route.snapshot.paramMap.get('importId');
    if (importId ?? current?.importId) {
      this.readImport((importId ?? current?.importId) as string, false);
    } else if (this.glAccountId()) {
      this.readAccount(this.glAccountId() as string);
    }
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  rejectionKey(code: string | null): string {
    return (code && REJECTION_KEYS[code]) || 'ACCOUNTING.BANK_IMPORT.REJECTION.OTHER';
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.file.set(input?.files?.[0] ?? null);
  }

  onSupersede(choice: SupersedeChoice): void {
    this.supersede.set(choice);
  }

  // ── Upload ─────────────────────────────────────────────────────────────

  /** Uploads the file with its header (§4.3). The acknowledgement is sent only once the server asked for it. */
  upload(): void {
    const glAccountId = this.glAccountId();
    const file = this.file();
    if (!this.canAdjust() || this.busy() || !glAccountId || !file) return;
    const header = this.readHeader();
    if (!header) {
      this.uploadErrorKey.set('ACCOUNTING.BANK_IMPORT.UPLOAD.ERROR.HEADER');
      return;
    }
    const supersede = this.supersede();
    if (supersede.state === 'incomplete') return;
    const gap = this.gapPrompt() ? this.uploadForm.controls.gapAcknowledgement.value.trim() : '';
    if (this.gapPrompt() && gap.length < BANK_REC_JUSTIFICATION_MIN) {
      this.uploadErrorKey.set('ACCOUNTING.BANK_IMPORT.UPLOAD.ERROR.GAP_TOO_SHORT');
      return;
    }

    this.uploadErrorKey.set(null);
    this.clearFailure();
    this.busy.set(true);
    from(fileToBase64(file))
      .pipe(
        switchMap(content =>
          this.service.createImport({
            glAccountId,
            fileName: file.name,
            contentType: file.type || null,
            content,
            statement: header,
            gapAcknowledgement: gap || null,
            supersession: supersede.state === 'ready' ? supersede.supersession : null,
          }),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: created => {
          this.busy.set(false);
          this.bankImport.set(created);
          this.syncMappingForm(created);
          void this.router.navigate(bankImportCommands(created.importId), { replaceUrl: true });
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.onUploadFailure(toBankRecFailure(error));
        },
      });
  }

  private onUploadFailure(failure: BankRecFailure): void {
    switch (failure.code) {
      case 'STATEMENT_NOT_CONTIGUOUS':
        this.gapPrompt.set({
          expected: fieldErrorMessage(failure, 'openingBalance'),
          firstStatement: !this.account()?.coverageFrontier,
        });
        break;
      case 'STATEMENT_GAP_ACKNOWLEDGEMENT_NOT_APPLICABLE':
        // The statement continues the previous one: the acknowledgement is withdrawn, not resent.
        this.gapPrompt.set(null);
        this.uploadForm.controls.gapAcknowledgement.setValue('');
        break;
      case 'STATEMENT_SUPERSESSION_NOT_ELIGIBLE':
        // The chosen statement may have been superseded meanwhile.
        this.supersedeControl()?.reload();
        break;
    }
    this.showFailure(failure);
  }

  private readHeader(): StatementHeader | null {
    const value = this.uploadForm.getRawValue();
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

  // ── Mapping ────────────────────────────────────────────────────────────

  editMapping(): void {
    const current = this.bankImport();
    if (!current || current.status !== 'VALIDATED') return;
    this.syncMappingForm(current);
    this.remapping.set(true);
  }

  cancelMapping(): void {
    this.remapping.set(false);
  }

  /** Re-parses with the chosen mapping and sign convention; the preview comes back with the response (§4.4). */
  saveMapping(): void {
    const current = this.bankImport();
    if (!this.canAdjust() || this.busy() || !current) return;
    const value = this.mappingForm.getRawValue();
    const columnMapping: ColumnMapping = {};
    for (const role of COLUMN_ROLES) {
      const column = value[role];
      if (column) columnMapping[role] = column;
    }
    this.clearFailure();
    this.busy.set(true);
    this.service
      .setMapping(current.importId, {
        columnMapping,
        signConvention: value.signConvention,
        dateFormat: value.dateFormat.trim() || null,
        saveAsAccountDefault: value.saveAsAccountDefault,
        gapAcknowledgement: current.gapAcknowledgement,
        version: current.version,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.busy.set(false);
          this.remapping.set(false);
          this.setImport(updated);
        },
        error: (error: unknown) => this.onWriteFailure(toBankRecFailure(error)),
      });
  }

  // ── Rows ───────────────────────────────────────────────────────────────

  readRows(page: number): void {
    const current = this.bankImport();
    if (!current) return;
    const seq = ++this.rowsSeq;
    this.rowsSub?.unsubscribe();
    this.rowsState.set('loading');
    this.rowsSub = this.service
      .listRows(current.importId, this.rowFilter.value || null, page, ROWS_PAGE_SIZE)
      .subscribe({
        next: result => {
          if (seq !== this.rowsSeq) return;
          this.rows.set(result.rows);
          this.rowsPage.set(result.pageNumber);
          this.rowsTotalPages.set(result.totalPages);
          this.rowsState.set('ready');
        },
        error: () => {
          if (seq !== this.rowsSeq) return;
          this.rowsState.set('error');
        },
      });
  }

  openCorrect(row: ImportRow): void {
    if (!this.canAdjust() || this.busy()) return;
    this.correctForm.setValue({
      date: row.date ?? '',
      signedAmount: row.signedAmount === null ? '' : String(row.signedAmount),
      description: row.description ?? '',
    });
    this.openRowDialog({ kind: 'correct', row });
  }

  openSkip(row: ImportRow): void {
    if (!this.canAdjust() || this.busy()) return;
    this.reasonControl.setValue('');
    this.openRowDialog({ kind: 'skip', row });
  }

  openDiscard(): void {
    if (!this.canAdjust() || this.busy() || !this.bankImport()) return;
    this.reasonControl.setValue('');
    this.openRowDialog({ kind: 'discard' });
  }

  cancelRowDialog(): void {
    this.rowDialog.set(null);
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    afterNextRender(() => (opener?.isConnected ? opener.focus() : undefined), { injector: this.injector });
  }

  /** Sends the corrected fields; the row keeps its `rawValues` beside them (§4.4). */
  confirmCorrect(): void {
    const dialog = this.rowDialog();
    const current = this.bankImport();
    if (dialog?.kind !== 'correct' || !current || !this.canAdjust() || this.busy()) return;
    const value = this.correctForm.getRawValue();
    const amount = value.signedAmount.trim() ? parseAmountInput(value.signedAmount) : null;
    if (value.signedAmount.trim() && amount === null) {
      this.dialogErrorKey.set('ACCOUNTING.BANK_IMPORT.ROWS.ERROR.AMOUNT');
      return;
    }
    const correction = {
      ...(value.date ? { date: value.date } : {}),
      ...(amount !== null ? { signedAmount: amount } : {}),
      ...(value.description.trim() ? { description: value.description.trim() } : {}),
    };
    this.runRowWrite(this.service.correctRow(current.importId, dialog.row.rowId, correction, current.version));
  }

  confirmSkip(): void {
    const dialog = this.rowDialog();
    const current = this.bankImport();
    if (dialog?.kind !== 'skip' || !current || !this.canAdjust() || this.busy()) return;
    const reason = this.reasonControl.value.trim();
    if (!reason) {
      this.dialogErrorKey.set('ACCOUNTING.BANK_IMPORT.ROWS.ERROR.REASON');
      return;
    }
    this.runRowWrite(this.service.skipRow(current.importId, dialog.row.rowId, reason, current.version));
  }

  decideDuplicate(row: ImportRow, decision: DuplicateDecision): void {
    const current = this.bankImport();
    if (!current || !this.canAdjust() || this.busy()) return;
    this.runRowWrite(this.service.decideDuplicate(current.importId, row.rowId, decision, current.version));
  }

  confirmDiscard(): void {
    const current = this.bankImport();
    if (this.rowDialog()?.kind !== 'discard' || !current || !this.canAdjust() || this.busy()) return;
    const reason = this.reasonControl.value.trim();
    if (!reason) {
      this.dialogErrorKey.set('ACCOUNTING.BANK_IMPORT.DISCARD.ERROR.REASON');
      return;
    }
    this.busy.set(true);
    this.service
      .discardImport(current.importId, reason, current.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: discarded => {
          this.busy.set(false);
          this.rowDialog.set(null);
          this.dialogOpener = null;
          this.setImport(discarded);
          // The dialog and the step it was opened from are gone: focus the read-only outcome.
          afterNextRender(() => this.doneHeading()?.nativeElement.focus(), { injector: this.injector });
        },
        error: (error: unknown) => {
          this.rowDialog.set(null);
          this.onWriteFailure(toBankRecFailure(error));
        },
      });
  }

  // ── Commit ─────────────────────────────────────────────────────────────

  /**
   * Commits (§4.4). A bulk duplicate decision is sent for every still
   * undecided POSSIBLE_DUPLICATE row; left at "decide later" they commit as
   * possible duplicates for review in the workspace.
   */
  commit(): void {
    const current = this.bankImport();
    if (!current || !this.canAdjust() || this.busy() || !this.canCommit()) return;
    const { startReconciliation, duplicates } = this.commitForm.getRawValue();
    this.clearFailure();
    this.busy.set(true);

    const decisions$: Observable<{ rowNumber: number; decision: DuplicateDecision }[]> =
      duplicates && current.possibleDuplicateCount > 0
        ? this.service
            .listRows(current.importId, 'POSSIBLE_DUPLICATE', 0, current.possibleDuplicateCount)
            .pipe(
              switchMap(page =>
                from([
                  page.rows
                    .filter(row => row.duplicateDecision === null)
                    .map(row => ({ rowNumber: row.rowNumber, decision: duplicates })),
                ]),
              ),
            )
        : from([[]]);

    decisions$
      .pipe(
        switchMap(decisions => this.service.commitImport(current.importId, startReconciliation, decisions, current.version)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: result => {
          this.busy.set(false);
          void this.router.navigate(
            result.reconciliationId ? reconciliationWorkspaceCommands(result.reconciliationId) : bankAccountsCommands(),
          );
        },
        error: (error: unknown) => {
          const failure = toBankRecFailure(error);
          if (failure.code === 'IMPORT_NOT_COMMITTABLE') {
            this.flaggedRows.set(new Set(indexedFieldErrors(failure, 'rows')));
          }
          this.onWriteFailure(failure);
        },
      });
  }

  // ── Reads and shared plumbing ──────────────────────────────────────────

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
          this.state.set('ready');
        },
        error: (error: unknown) => {
          if (seq !== this.accountSeq) return;
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(this.loadErrorKey(toBankRecFailure(error)));
        },
      });
  }

  /**
   * Reads the import. A background re-read (after a write, or a 409
   * OPTIMISTIC_LOCK) keeps the step on screen; a newer read always wins.
   */
  private readImport(importId: string, background: boolean): void {
    const seq = ++this.importSeq;
    if (!background) {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    this.service
      .getImport(importId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: loaded => {
          if (seq !== this.importSeq) return;
          this.busy.set(false);
          this.setImport(loaded);
          this.state.set('ready');
          this.errorKey.set(null);
          this.restoreFocus();
        },
        error: (error: unknown) => {
          if (seq !== this.importSeq) return;
          this.busy.set(false);
          if (background && this.bankImport()) {
            // The wizard on screen stays; the refresh failure is announced (and takes focus).
            this.focusAfterRefresh = false;
            this.failureKey.set('ACCOUNTING.BANK_IMPORT.ERROR.REFRESH');
            this.failureDetail.set(null);
            afterNextRender(() => this.failureRegion()?.nativeElement.focus(), { injector: this.injector });
            return;
          }
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(this.loadErrorKey(toBankRecFailure(error)));
        },
      });
  }

  private setImport(loaded: BankImport): void {
    const previous = this.bankImport();
    this.bankImport.set(loaded);
    if (loaded.status === 'UPLOADED' || !previous) this.syncMappingForm(loaded);
    if (loaded.status === 'VALIDATED') this.readRows(this.rowsPage());
  }

  private syncMappingForm(source: BankImport): void {
    const mapping: Record<ColumnRole, string> = {
      date: '',
      description: '',
      amount: '',
      debit: '',
      credit: '',
      reference: '',
      checkNumber: '',
      sourceTransactionId: '',
    };
    for (const role of COLUMN_ROLES) mapping[role] = source.columnMapping[role] ?? '';
    this.mappingForm.setValue({
      ...mapping,
      signConvention: source.signConvention ?? 'SIGNED_AMOUNT',
      dateFormat: source.dateFormat ?? '',
      saveAsAccountDefault: false,
    });
  }

  private runRowWrite(write: Observable<ImportRow>): void {
    const current = this.bankImport();
    if (!current) return;
    this.busy.set(true);
    this.dialogErrorKey.set(null);
    write.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.rowDialog.set(null);
        this.dialogOpener = null;
        // The focused row action is rebuilt: focus moves to the rows heading once the re-read lands.
        this.focusAfterRefresh = true;
        // Counts and the version moved: re-read the import, which re-reads the rows page.
        this.readImport(current.importId, true);
      },
      error: (error: unknown) => {
        this.rowDialog.set(null);
        this.onWriteFailure(toBankRecFailure(error));
      },
    });
  }

  /** A refused write keeps the step on screen; a stale version or a concurrent change re-reads the import. */
  private onWriteFailure(failure: BankRecFailure): void {
    this.showFailure(failure);
    const current = this.bankImport();
    const stale =
      failure.code === 'OPTIMISTIC_LOCK' ||
      failure.code === 'IMPORT_ALREADY_COMMITTED' ||
      failure.code === 'IMPORT_DISCARDED' ||
      failure.code === 'IMPORT_NOT_COMMITTABLE' ||
      failure.status === 409;
    if (stale && current) {
      // Writes stay disabled against the stale version until the re-read lands (it clears `busy`).
      this.readImport(current.importId, true);
      return;
    }
    this.busy.set(false);
  }

  private restoreFocus(): void {
    if (!this.focusAfterRefresh) return;
    this.focusAfterRefresh = false;
    afterNextRender(() => this.rowsHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  /** A new route key starts over: nothing read or typed for the previous import or account carries across. */
  private resetForRoute(): void {
    this.importSeq++;
    this.accountSeq++;
    this.rowsSeq++;
    this.rowsSub?.unsubscribe();
    this.bankImport.set(null);
    this.account.set(null);
    this.glAccountId.set(null);
    this.remapping.set(false);
    this.rowDialog.set(null);
    this.dialogOpener = null;
    this.busy.set(false);
    this.clearFailure();
    this.gapPrompt.set(null);
    this.uploadErrorKey.set(null);
    this.file.set(null);
    this.uploadForm.reset();
    this.rows.set([]);
    this.rowsPage.set(0);
    this.focusAfterRefresh = false;
  }

  private showFailure(failure: BankRecFailure): void {
    const key = statementFailureKey(failure);
    this.failureKey.set(key);
    // E1: the activity-total refusal is shown verbatim; there is no override (§4.4).
    this.failureDetail.set(
      failure.code === 'IMPORT_NOT_COMMITTABLE'
        ? fieldErrorMessage(failure, 'activityTotal')
        : failure.code === 'STATEMENT_NOT_CONTIGUOUS'
          ? fieldErrorMessage(failure, 'openingBalance')
          : null,
    );
    afterNextRender(() => this.failureRegion()?.nativeElement.focus(), { injector: this.injector });
  }

  private clearFailure(): void {
    this.failureKey.set(null);
    this.failureDetail.set(null);
    this.flaggedRows.set(new Set());
  }

  private loadErrorKey(failure: BankRecFailure): string {
    switch (failure.status) {
      case 403:
        return 'ACCOUNTING.BANK_IMPORT.ERROR.FORBIDDEN';
      case 404:
        return 'ACCOUNTING.BANK_IMPORT.ERROR.NOT_FOUND';
      default:
        return 'ACCOUNTING.BANK_IMPORT.ERROR.LOAD';
    }
  }

  private openRowDialog(dialog: RowDialog): void {
    const active = this.document.activeElement;
    this.dialogOpener = active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.dialogErrorKey.set(null);
    this.rowDialog.set(dialog);
  }
}
