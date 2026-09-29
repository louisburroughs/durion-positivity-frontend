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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, concatMap, from, last } from 'rxjs';
import { ACCOUNTING_SECTION } from '../../../../core/security/route-permissions';
import { AuthService } from '../../../../core/services/auth.service';
import { ModalDialogDirective } from '../../../../shared/modal-dialog.directive';
import { MoneyPipe } from '../../../../shared/money.pipe';
import {
  AdjustmentPreset,
  ReconciliationAdjustmentDialogComponent,
} from '../../components/reconciliation-adjustment-dialog/reconciliation-adjustment-dialog.component';
import { ReconciliationReviewPanelComponent } from '../../components/reconciliation-review-panel/reconciliation-review-panel.component';
import {
  AdjustmentInput,
  AdjustmentType,
  BANK_REC_JUSTIFICATION_MIN,
  BankAccount,
  BankRecFailure,
  DuplicateDecision,
  MatchCandidate,
  OUTSTANDING_ITEM_KINDS,
  OutstandingItem,
  OutstandingItemKind,
  ReconciliationAdjustment,
  ReconciliationAuditEntry,
  ReconciliationMatch,
  ReconciliationReview,
  ReviewBankRow,
  ReviewLedgerRow,
} from '../../models/bank-reconciliation.models';
import { AccountingPeriod, isPeriodCode } from '../../models/period-close.models';
import { BankReconciliationService, toBankRecFailure } from '../../services/bank-reconciliation.service';
import { PeriodCloseService } from '../../services/period-close.service';
import { ReconciliationWorkspaceService } from '../../services/reconciliation-workspace.service';
import { bankAccountsCommands, reconciliationWorkspaceCommands } from '../../utils/bank-reconciliation-routes';
import { toDatePipeInput } from '../../utils/date-only.util';

type PageState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The prompts that ask for a reason or a justification before a write. Each
 * names the write it confirms; `min` is the justification floor (D15), 1 for
 * a plain reason.
 */
export type PromptKind =
  | 'unmatch'
  | 'release'
  | 'reaffirm'
  | 'clearInGap'
  | 'reverse'
  | 'return'
  | 'cancel'
  | 'supersede'
  | 'exclude'
  | 'restore'
  | 'matchJustification'
  | 'duplicateReview'
  | 'register';

interface Prompt {
  readonly kind: PromptKind;
  readonly targetId: string | null;
  /** For `register`: which side the item is on. */
  readonly side?: 'BANK' | 'LEDGER';
  /** For `matchJustification`: the reasons the server gave (`fieldErrors[justification]`). */
  readonly reasons?: readonly string[];
  /** For `duplicateReview`: the served near-duplicates, offered as candidate originals (§4.5). */
  readonly originals?: readonly ReviewBankRow[];
}

interface Outcome {
  readonly tone: 'success' | 'error';
  readonly key: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

const PROMPT_MIN: Readonly<Record<PromptKind, number>> = {
  unmatch: 1,
  release: 1,
  reaffirm: BANK_REC_JUSTIFICATION_MIN,
  clearInGap: BANK_REC_JUSTIFICATION_MIN,
  reverse: 1,
  return: 1,
  cancel: BANK_REC_JUSTIFICATION_MIN,
  supersede: BANK_REC_JUSTIFICATION_MIN,
  exclude: BANK_REC_JUSTIFICATION_MIN,
  restore: BANK_REC_JUSTIFICATION_MIN,
  matchJustification: BANK_REC_JUSTIFICATION_MIN,
  duplicateReview: BANK_REC_JUSTIFICATION_MIN,
  register: 0,
};

/** Codes the workspace classifies (§4.10). Literal so the i18n check sees every key. */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  MATCH_AMOUNT_MISMATCH: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.MATCH_AMOUNT_MISMATCH',
  MATCH_CARDINALITY_NOT_ALLOWED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.MATCH_CARDINALITY_NOT_ALLOWED',
  MATCH_REQUIRES_REVIEW: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.MATCH_REQUIRES_REVIEW',
  MATCH_STATE_INVALID: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.MATCH_STATE_INVALID',
  RECONCILIATION_LINE_INELIGIBLE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.LINE_INELIGIBLE',
  OUTSTANDING_ITEM_NOT_ELIGIBLE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.OUTSTANDING_ITEM_NOT_ELIGIBLE',
  ADJUSTMENT_LINK_REQUIRED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_LINK_REQUIRED',
  ADJUSTMENT_LINK_NOT_ELIGIBLE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_LINK_NOT_ELIGIBLE',
  GL_ACCOUNT_NOT_ACTIVE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.GL_ACCOUNT_NOT_ACTIVE',
  ACCOUNT_NOT_RECONCILABLE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ACCOUNT_NOT_RECONCILABLE',
  RECONCILIATION_ADJUSTMENT_SIGN_INVALID: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_SIGN_INVALID',
  ADJUSTMENT_BRIDGE_ALREADY_POSTED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.BRIDGE_ALREADY_POSTED',
  RECONCILIATION_ADJUSTMENT_APPROVAL_REQUIRED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_APPROVAL_REQUIRED',
  JUSTIFICATION_REQUIRED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.JUSTIFICATION_REQUIRED',
  RECONCILIATION_NOT_BALANCED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.NOT_BALANCED',
  RECONCILIATION_HAS_UNEXPLAINED_ITEMS: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.HAS_UNEXPLAINED_ITEMS',
  RECONCILIATION_SELF_APPROVAL: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.SELF_APPROVAL',
  RECONCILIATION_NOT_SUBMITTED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.NOT_SUBMITTED',
  RECONCILIATION_ALREADY_FINALIZED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ALREADY_FINALIZED',
  RECONCILIATION_NOT_EDITABLE: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.NOT_EDITABLE',
  RECONCILIATION_WINDOW_ALREADY_RECONCILED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.WINDOW_ALREADY_RECONCILED',
  ADJUSTMENT_ALREADY_REVERSED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.ADJUSTMENT_ALREADY_REVERSED',
  PERIOD_CLOSED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.PERIOD_CLOSED',
  PERIOD_HARD_LOCKED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.PERIOD_HARD_LOCKED',
  GL_MAPPING_NOT_CONFIGURED: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.GL_MAPPING_NOT_CONFIGURED',
  AMOUNT_PRECISION_EXCEEDS_CURRENCY: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.AMOUNT_PRECISION_EXCEEDS_CURRENCY',
  OPTIMISTIC_LOCK: 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.OPTIMISTIC_LOCK',
};

/** Refusals meaning the review on screen is stale: it is re-read with the rows kept (§4.10, §6.3). */
const STALE_CODES: ReadonlySet<string> = new Set([
  'OPTIMISTIC_LOCK',
  'RECONCILIATION_NOT_BALANCED',
  'ADJUSTMENT_LINK_NOT_ELIGIBLE',
  'MATCH_STATE_INVALID',
  'RECONCILIATION_NOT_EDITABLE',
  'RECONCILIATION_HAS_UNEXPLAINED_ITEMS',
  'OUTSTANDING_ITEM_NOT_ELIGIBLE',
]);

/**
 * The reconciliation workspace (CAP-055, SPEC-manual-bank-reconciliation
 * §4.6–§4.9).
 *
 * Two columns — unexplained bank transactions (late arrivals first) and
 * unexplained ledger lines — both from `GET /{id}/review`, with ranked
 * candidates for a selected bank row; auto-match proposals to accept or
 * reject; manual matching; outstanding items (register, release, reaffirm,
 * clear in gap); duplicate review; exclude and restore; typed and linked
 * adjustments; the review panel; the lifecycle; and the stored audit trail.
 * The client decides no matchability, sign, balance or eligibility: every gate
 * is a served field and the server's refusal stays authoritative (§4.8).
 *
 * ── Authorization (ADR-0040 §6a, §6.2) ───────────────────────────────────
 * `adjust`: match, unmatch, proposals, outstanding register / release /
 * reaffirm, adjustments (incl. OTHER, residual, bridge, TRANSFER), duplicate
 * review, submit. `approve`: approve, return, cancel, supersede, exclude,
 * restore, reverse, clear in gap. Each control and its handler gate on the
 * exact code; the view permission never enables a write.
 *
 * ── Status (§3.8) ─────────────────────────────────────────────────────────
 * IN_PROGRESS is editable; SUBMITTED allows approver actions only;
 * FINALIZED / INVALIDATED allow supersede only; SUPERSEDED / CANCELLED are
 * read-only.
 */
@Component({
  selector: 'app-reconciliation-workspace-page',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MoneyPipe,
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ModalDialogDirective,
    ReconciliationReviewPanelComponent,
    ReconciliationAdjustmentDialogComponent,
  ],
  templateUrl: './reconciliation-workspace-page.component.html',
  styleUrls: ['../../bank-reconciliation-shared.css', './reconciliation-workspace-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReconciliationWorkspacePageComponent {
  private readonly workspace = inject(ReconciliationWorkspaceService);
  private readonly bankRec = inject(BankReconciliationService);
  private readonly periods = inject(PeriodCloseService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  readonly bankAccountsLink = bankAccountsCommands();
  readonly itemKinds = OUTSTANDING_ITEM_KINDS;

  readonly state = signal<PageState>('idle');
  readonly errorKey = signal<string | null>(null);
  readonly review = signal<ReconciliationReview | null>(null);
  /** A background re-read; rows stay on screen and every write waits (`refreshing` pattern). */
  readonly refreshing = signal(false);
  readonly busy = signal(false);
  readonly outcome = signal<Outcome | null>(null);
  /** Ids a refusal named (`fieldErrors`), highlighted in the columns. */
  readonly flaggedIds = signal<ReadonlySet<string>>(new Set());

  readonly selectedBank = signal<ReadonlySet<string>>(new Set());
  readonly selectedLedger = signal<ReadonlySet<string>>(new Set());
  readonly candidatesFor = signal<ReviewBankRow | null>(null);
  readonly candidatesState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly candidates = signal<readonly MatchCandidate[]>([]);

  readonly audit = signal<readonly ReconciliationAuditEntry[]>([]);
  readonly auditState = signal<'loading' | 'ready' | 'error'>('loading');

  readonly adjustmentTypes = signal<readonly AdjustmentType[]>([]);
  /** A failed type read is not "no types": the dialog says it could not load them. */
  readonly adjustmentTypesStatus = signal<'loading' | 'OK' | 'ERROR'>('loading');
  readonly bankAccounts = signal<readonly BankAccount[]>([]);
  /** A failed bank-account read is not "no other accounts": the TRANSFER picker says so. */
  readonly bankAccountsStatus = signal<'idle' | 'loading' | 'OK' | 'ERROR'>('idle');
  readonly adjustmentPreset = signal<AdjustmentPreset | null>(null);
  readonly adjustmentOpen = signal(false);
  readonly adjustmentErrorKey = signal<string | null>(null);
  readonly proposedDate = signal<string | null>(null);

  readonly prompt = signal<Prompt | null>(null);
  readonly promptText = new FormControl('', { nonNullable: true });
  readonly promptKind = new FormControl<OutstandingItemKind>('OUTSTANDING_CHECK', { nonNullable: true });
  readonly promptDecision = new FormControl<DuplicateDecision>('DISTINCT', { nonNullable: true });
  readonly promptOriginal = new FormControl('', { nonNullable: true });
  readonly promptForm = new FormGroup({
    text: this.promptText,
    kind: this.promptKind,
    decision: this.promptDecision,
    original: this.promptOriginal,
  });
  readonly promptLength = signal(0);
  readonly promptErrorKey = signal<string | null>(null);

  readonly canAdjust = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.reconciliationAdjust),
  );
  readonly canApprove = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.reconciliationApprove),
  );
  readonly canOverridePeriod = computed(
    () => !this.auth.permissionsKnown() || this.auth.hasAnyPermission(ACCOUNTING_SECTION.periodOverride),
  );

  readonly status = computed(() => this.review()?.header.status ?? null);
  private readonly idle = computed(() => !this.busy() && !this.refreshing());

  /** Preparer writes: `adjust`, IN_PROGRESS only (a SUBMITTED reconciliation refuses them). */
  readonly preparerEnabled = computed(() => this.canAdjust() && this.status() === 'IN_PROGRESS' && this.idle());
  /** Approver writes on the window's content: `approve`, IN_PROGRESS. */
  readonly approverEditEnabled = computed(() => this.canApprove() && this.status() === 'IN_PROGRESS' && this.idle());

  readonly canSubmit = computed(
    () => this.preparerEnabled() && (this.review()?.readiness.canSubmit ?? false),
  );
  readonly canApproveNow = computed(
    () => this.canApprove() && this.status() === 'SUBMITTED' && (this.review()?.readiness.canApprove ?? false) && this.idle(),
  );
  readonly canReturn = computed(() => this.canApprove() && this.status() === 'SUBMITTED' && this.idle());
  readonly canCancel = computed(
    () => this.canApprove() && (this.status() === 'IN_PROGRESS' || this.status() === 'SUBMITTED') && this.idle(),
  );
  readonly canSupersede = computed(
    () => this.canApprove() && (this.status() === 'FINALIZED' || this.status() === 'INVALIDATED') && this.idle(),
  );

  /** Unexplained bank rows, late arrivals first (D10), each once. */
  readonly bankRows = computed<readonly ReviewBankRow[]>(() => {
    const review = this.review();
    if (!review) return [];
    const seen = new Set<string>();
    return [...review.lateArrivals, ...review.unexplainedBank].filter(row => {
      if (seen.has(row.bankTransactionId)) return false;
      seen.add(row.bankTransactionId);
      return true;
    });
  });

  readonly canMatchSelected = computed(
    () => this.preparerEnabled() && this.selectedBank().size > 0 && this.selectedLedger().size > 0,
  );

  /** Clear in gap is offered on an acknowledged statement, for an OPEN item registered in an earlier reconciliation (§3.6). */
  readonly gapClearable = computed(() => {
    const review = this.review();
    if (!review?.header.gapAcknowledgement) return new Set<string>();
    return new Set(
      review.outstandingItems
        .filter(
          item =>
            item.status === 'OPEN' &&
            !!item.registeredInReconciliationId &&
            item.registeredInReconciliationId !== review.header.reconciliationId,
        )
        .map(item => item.outstandingItemId),
    );
  });

  private readonly outcomeSuccess = viewChild<ElementRef<HTMLElement>>('outcomeSuccess');
  private readonly outcomeError = viewChild<ElementRef<HTMLElement>>('outcomeError');
  private readonly candidatesRegion = viewChild<ElementRef<HTMLElement>>('candidatesRegion');

  private reconciliationId = '';
  private dialogOpener: HTMLElement | null = null;
  /** One counter per writer (ADR-0063): review, audit, candidates. */
  private reviewSeq = 0;
  private auditSeq = 0;
  private candidatesSeq = 0;
  /** A match waiting on a justification after 422 MATCH_REQUIRES_REVIEW. */
  private pendingMatch: { bank: string[]; ledger: string[] } | null = null;

  constructor() {
    this.promptText.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => {
      this.promptLength.set(value.trim().length);
      this.promptErrorKey.set(null);
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = params.get('reconciliationId');
      if (!id) return;
      this.resetForRoute();
      this.reconciliationId = id;
      this.load();
    });
    this.readAdjustmentTypes();
  }

  /** Re-reads the adjustment types, e.g. after the first read failed. */
  readAdjustmentTypes(): void {
    this.adjustmentTypesStatus.set('loading');
    this.workspace
      .listAdjustmentTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: types => {
          this.adjustmentTypes.set(types);
          this.adjustmentTypesStatus.set('OK');
        },
        error: () => {
          this.adjustmentTypes.set([]);
          this.adjustmentTypesStatus.set('ERROR');
        },
      });
  }

  /**
   * Angular reuses this page when only `reconciliationId` changes: nothing
   * read, selected or open for the previous reconciliation carries across,
   * and its in-flight reads are superseded.
   */
  private resetForRoute(): void {
    this.reviewSeq++;
    this.auditSeq++;
    this.candidatesSeq++;
    this.review.set(null);
    this.audit.set([]);
    this.outcome.set(null);
    this.flaggedIds.set(new Set());
    this.selectedBank.set(new Set());
    this.selectedLedger.set(new Set());
    this.candidatesFor.set(null);
    this.candidates.set([]);
    this.prompt.set(null);
    this.adjustmentOpen.set(false);
    this.adjustmentPreset.set(null);
    this.pendingMatch = null;
    this.dialogOpener = null;
    this.busy.set(false);
    this.refreshing.set(false);
  }

  load(): void {
    this.readReview(false);
    this.readAudit();
  }

  dateOnly(value: string | null): string | null {
    return toDatePipeInput(value);
  }

  accountLabel(): string {
    const header = this.review()?.header;
    return [header?.accountCode, header?.accountName].filter(Boolean).join(' ');
  }

  // ── Selection and candidates ───────────────────────────────────────────

  toggleBank(id: string): void {
    this.selectedBank.update(set => toggled(set, id));
  }

  toggleLedger(id: string): void {
    this.selectedLedger.update(set => toggled(set, id));
  }

  /** Loads ranked candidates for one bank row (§4.6); a newer request supersedes an older one. */
  showCandidates(row: ReviewBankRow): void {
    const seq = ++this.candidatesSeq;
    this.candidatesFor.set(row);
    this.candidatesState.set('loading');
    this.candidates.set([]);
    this.workspace
      .getCandidates(this.reconciliationId, row.bankTransactionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: candidates => {
          if (seq !== this.candidatesSeq) return;
          this.candidates.set(candidates);
          this.candidatesState.set('ready');
          afterNextRender(() => this.candidatesRegion()?.nativeElement.focus(), { injector: this.injector });
        },
        error: () => {
          if (seq !== this.candidatesSeq) return;
          this.candidatesState.set('error');
        },
      });
  }

  /** Selects the candidate's ledger line together with the bank row it was ranked for. */
  pickCandidate(candidate: MatchCandidate): void {
    const row = this.candidatesFor();
    if (!row || !candidate.glLineId) return;
    this.selectedBank.update(set => new Set(set).add(row.bankTransactionId));
    this.selectedLedger.update(set => toggled(set, candidate.glLineId as string));
  }

  // ── Matching ───────────────────────────────────────────────────────────

  matchSelected(): void {
    if (!this.canMatchSelected()) return;
    this.createMatch([...this.selectedBank()], [...this.selectedLedger()], null);
  }

  autoMatch(): void {
    if (!this.preparerEnabled()) return;
    this.run(this.workspace.autoMatch(this.reconciliationId), result => ({
      key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.AUTO_MATCHED',
      params: { proposed: result.proposed, ambiguous: result.ambiguous },
    }));
  }

  acceptProposal(match: ReconciliationMatch): void {
    if (!this.preparerEnabled()) return;
    this.run(this.workspace.acceptMatch(this.reconciliationId, match.matchId), () => ({
      key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.PROPOSAL_ACCEPTED',
    }));
  }

  rejectProposal(match: ReconciliationMatch): void {
    if (!this.preparerEnabled()) return;
    this.run(this.workspace.rejectMatch(this.reconciliationId, match.matchId), () => ({
      key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.PROPOSAL_REJECTED',
    }));
  }

  /** "Accept all" is the bulk path for proposals (D12): accepted one after another. */
  acceptAllProposals(): void {
    const proposals = this.review()?.proposedMatches ?? [];
    if (!this.preparerEnabled() || proposals.length === 0) return;
    const accepts: Observable<unknown> = from(proposals).pipe(
      concatMap(match => this.workspace.acceptMatch(this.reconciliationId, match.matchId)),
      last(),
    );
    this.busy.set(true);
    accepts.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.afterWrite({ key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.PROPOSALS_ACCEPTED', params: { count: proposals.length } });
      },
      error: (error: unknown) => {
        this.onWriteFailure(toBankRecFailure(error), false);
        // Earlier acceptances may have committed before the one that failed: the review is re-read either way.
        this.readReview(true);
        this.readAudit();
      },
    });
  }

  // ── Prompts ────────────────────────────────────────────────────────────

  openUnmatch(match: ReconciliationMatch): void {
    if (this.preparerEnabled()) this.openPrompt({ kind: 'unmatch', targetId: match.matchId });
  }

  openRegister(side: 'BANK' | 'LEDGER', id: string): void {
    if (!this.preparerEnabled()) return;
    this.promptKind.setValue(side === 'BANK' ? 'BANK_ERROR_PENDING' : 'OUTSTANDING_CHECK');
    this.openPrompt({ kind: 'register', targetId: id, side });
  }

  openRelease(item: OutstandingItem): void {
    if (this.preparerEnabled()) this.openPrompt({ kind: 'release', targetId: item.outstandingItemId });
  }

  openReaffirm(item: OutstandingItem): void {
    if (this.preparerEnabled()) this.openPrompt({ kind: 'reaffirm', targetId: item.outstandingItemId });
  }

  openClearInGap(item: OutstandingItem): void {
    if (this.approverEditEnabled()) this.openPrompt({ kind: 'clearInGap', targetId: item.outstandingItemId });
  }

  openDuplicateReview(row: ReviewBankRow): void {
    if (!this.preparerEnabled()) return;
    this.promptDecision.setValue('DISTINCT');
    this.promptOriginal.setValue(row.nearDuplicates[0]?.bankTransactionId ?? '');
    this.openPrompt({ kind: 'duplicateReview', targetId: row.bankTransactionId, originals: row.nearDuplicates });
  }

  openExclude(row: ReviewBankRow): void {
    if (this.approverEditEnabled()) this.openPrompt({ kind: 'exclude', targetId: row.bankTransactionId });
  }

  openRestore(row: ReviewBankRow): void {
    if (this.approverEditEnabled()) this.openPrompt({ kind: 'restore', targetId: row.bankTransactionId });
  }

  openReverse(adjustment: ReconciliationAdjustment): void {
    if (this.approverEditEnabled()) this.openPrompt({ kind: 'reverse', targetId: adjustment.adjustmentId });
  }

  openReturn(): void {
    if (this.canReturn()) this.openPrompt({ kind: 'return', targetId: null });
  }

  openCancel(): void {
    if (this.canCancel()) this.openPrompt({ kind: 'cancel', targetId: null });
  }

  openSupersede(): void {
    if (this.canSupersede()) this.openPrompt({ kind: 'supersede', targetId: null });
  }

  promptMin(kind: PromptKind): number {
    return PROMPT_MIN[kind];
  }

  cancelPrompt(): void {
    this.prompt.set(null);
    this.pendingMatch = null;
    this.returnFocus();
  }

  /** Sends the write the prompt confirms, re-checking its permission and status gate. */
  confirmPrompt(): void {
    const prompt = this.prompt();
    const review = this.review();
    if (!prompt || !review || this.busy()) return;
    const text = this.promptText.value.trim();
    if (text.length < PROMPT_MIN[prompt.kind]) {
      this.promptErrorKey.set('ACCOUNTING.RECONCILIATION_WORKSPACE.PROMPT.TOO_SHORT');
      return;
    }
    const id = this.reconciliationId;
    const version = review.header.version;
    const target = prompt.targetId ?? '';

    switch (prompt.kind) {
      case 'unmatch':
        if (!this.preparerEnabled()) return;
        return this.runPrompt(this.workspace.unmatch(id, target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.UNMATCHED');
      case 'register': {
        if (!this.preparerEnabled()) return;
        const link = prompt.side === 'BANK' ? { bankTransactionId: target } : { glLineId: target };
        return this.runPrompt(
          this.workspace.registerOutstanding(id, link, this.promptKind.value, text || null),
          'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.REGISTERED',
        );
      }
      case 'release':
        if (!this.preparerEnabled()) return;
        return this.runPrompt(this.workspace.releaseOutstanding(id, target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.RELEASED');
      case 'reaffirm':
        if (!this.preparerEnabled()) return;
        return this.runPrompt(this.workspace.reaffirmOutstanding(id, target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.REAFFIRMED');
      case 'clearInGap':
        if (!this.approverEditEnabled()) return;
        return this.runPrompt(this.workspace.clearInGap(id, target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.CLEARED_IN_GAP');
      case 'duplicateReview':
        if (!this.preparerEnabled()) return;
        return this.runPrompt(
          this.workspace.reviewDuplicate(
            target,
            this.promptDecision.value,
            text,
            this.promptDecision.value === 'DUPLICATE' ? this.promptOriginal.value || null : null,
          ),
          'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.DUPLICATE_REVIEWED',
        );
      case 'exclude':
        if (!this.approverEditEnabled()) return;
        return this.runPrompt(this.workspace.exclude(target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.EXCLUDED');
      case 'restore':
        if (!this.approverEditEnabled()) return;
        return this.runPrompt(this.workspace.restore(target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.RESTORED');
      case 'reverse':
        if (!this.approverEditEnabled()) return;
        return this.runPrompt(this.workspace.reverseAdjustment(id, target, text), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.REVERSED');
      case 'return':
        if (!this.canReturn()) return;
        return this.runPrompt(this.workspace.returnToPreparer(id, text, version), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.RETURNED');
      case 'cancel':
        if (!this.canCancel()) return;
        return this.runPrompt(this.workspace.cancel(id, text, version), 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.CANCELLED');
      case 'supersede':
        if (!this.canSupersede()) return;
        this.busy.set(true);
        this.workspace
          .supersede(id, text, version)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: newId => {
              this.busy.set(false);
              this.prompt.set(null);
              void this.router.navigate(reconciliationWorkspaceCommands(newId));
            },
            error: (error: unknown) => this.onWriteFailure(toBankRecFailure(error), true),
          });
        return;
      case 'matchJustification': {
        const pending = this.pendingMatch;
        if (!pending || !this.preparerEnabled()) return;
        this.prompt.set(null);
        this.createMatch(pending.bank, pending.ledger, text);
        return;
      }
    }
  }

  // ── Adjustments ────────────────────────────────────────────────────────

  openAdjustment(preset: AdjustmentPreset | null = null): void {
    if (!this.preparerEnabled()) return;
    this.rememberOpener();
    this.adjustmentPreset.set(preset);
    this.adjustmentErrorKey.set(null);
    this.proposeDate();
    this.ensureBankAccounts();
    this.adjustmentOpen.set(true);
  }

  adjustBankRow(row: ReviewBankRow): void {
    this.openAdjustment({ type: 'OTHER', link: 'BANK', bankTransactionId: row.bankTransactionId });
  }

  settleResidual(match: ReconciliationMatch): void {
    this.openAdjustment({ type: 'OTHER', link: 'RESIDUAL', settlesMatchId: match.matchId });
  }

  cancelAdjustment(): void {
    this.adjustmentOpen.set(false);
    this.returnFocus();
  }

  submitAdjustment(input: AdjustmentInput): void {
    if (!this.preparerEnabled()) return;
    this.busy.set(true);
    this.adjustmentErrorKey.set(null);
    this.workspace
      .addAdjustment(this.reconciliationId, input)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.adjustmentOpen.set(false);
          this.dialogOpener = null;
          this.afterWrite({ key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.ADJUSTED' });
        },
        error: (error: unknown) => {
          const failure = toBankRecFailure(error);
          this.busy.set(false);
          this.adjustmentErrorKey.set(this.failureKey(failure));
          // The served residual, the opening difference or the counter may have moved.
          if (failure.code && STALE_CODES.has(failure.code)) this.readReview(true);
        },
      });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  submit(): void {
    const review = this.review();
    if (!review || !this.canSubmit()) return;
    this.run(this.workspace.submit(this.reconciliationId, review.header.version), () => ({
      key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.SUBMITTED',
    }));
  }

  approve(): void {
    const review = this.review();
    if (!review || !this.canApproveNow()) return;
    this.run(this.workspace.approve(this.reconciliationId, review.header.version), () => ({
      key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.APPROVED',
    }));
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  /**
   * Reads the review. A background re-read (after a write, or a stale
   * refusal) keeps the rows on screen with writes disabled; a newer read
   * always wins, and a failed background read drops to the error panel since
   * the rows are known to be stale.
   */
  private readReview(background: boolean): void {
    const seq = ++this.reviewSeq;
    if (background) {
      this.refreshing.set(true);
    } else {
      this.state.set('loading');
      this.errorKey.set(null);
    }
    this.workspace
      .getReview(this.reconciliationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: review => {
          if (seq !== this.reviewSeq) return;
          this.review.set(review);
          this.pruneSelection(review);
          this.refreshing.set(false);
          this.state.set('ready');
          this.errorKey.set(null);
        },
        error: (error: unknown) => {
          if (seq !== this.reviewSeq) return;
          this.refreshing.set(false);
          const failure = toBankRecFailure(error);
          // ADR-0031: state first, then the key.
          this.state.set('error');
          this.errorKey.set(
            failure.status === 403
              ? 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.FORBIDDEN'
              : failure.status === 404
                ? 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.NOT_FOUND'
                : 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.LOAD',
          );
        },
      });
  }

  private readAudit(): void {
    const seq = ++this.auditSeq;
    this.auditState.set('loading');
    this.workspace
      .getAudit(this.reconciliationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          if (seq !== this.auditSeq) return;
          this.audit.set(entries);
          this.auditState.set('ready');
        },
        error: () => {
          if (seq !== this.auditSeq) return;
          this.auditState.set('error');
        },
      });
  }

  retryAudit(): void {
    this.readAudit();
  }

  /** Reads the bank accounts for the TRANSFER picker; a failed read stays distinguishable from an empty list. */
  retryBankAccounts(): void {
    this.bankAccountsStatus.set('idle');
    this.ensureBankAccounts();
  }

  private ensureBankAccounts(): void {
    const status = this.bankAccountsStatus();
    if (status === 'OK' || status === 'loading') return;
    this.bankAccountsStatus.set('loading');
    this.bankRec
      .listBankAccounts()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: accounts => {
          this.bankAccounts.set(accounts);
          this.bankAccountsStatus.set('OK');
        },
        error: () => {
          this.bankAccounts.set([]);
          this.bankAccountsStatus.set('ERROR');
        },
      });
  }

  /**
   * D7: an adjustment takes its explaining date while that period is OPEN
   * (the server's default, so nothing is proposed); when it is CLOSED the
   * dialog proposes the first day of the earliest later period not closed.
   */
  private proposeDate(): void {
    this.proposedDate.set(null);
    const header = this.review()?.header;
    const end = header?.statementEndDate;
    if (!end || header?.periodState !== 'CLOSED') return;
    this.periods
      .listPeriods()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: periods => this.proposedDate.set(firstOpenDayAfter(end, periods)),
        error: () => this.proposedDate.set(null),
      });
  }

  // ── Write plumbing ─────────────────────────────────────────────────────

  private createMatch(bank: string[], ledger: string[], justification: string | null): void {
    this.busy.set(true);
    this.workspace
      .createMatch(this.reconciliationId, bank, ledger, justification)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.pendingMatch = null;
          this.selectedBank.set(new Set());
          this.selectedLedger.set(new Set());
          this.candidatesFor.set(null);
          this.afterWrite({ key: 'ACCOUNTING.RECONCILIATION_WORKSPACE.OUTCOME.MATCHED' });
        },
        error: (error: unknown) => {
          const failure = toBankRecFailure(error);
          if (failure.code === 'MATCH_REQUIRES_REVIEW' && justification === null) {
            // The server wants a justification for this match: ask for it, listing its reasons.
            this.busy.set(false);
            this.pendingMatch = { bank, ledger };
            this.openPrompt({
              kind: 'matchJustification',
              targetId: null,
              reasons: failure.fieldErrors.filter(entry => entry.field === 'justification').map(entry => entry.message),
            });
            return;
          }
          this.pendingMatch = null;
          this.onWriteFailure(failure, false);
        },
      });
  }

  private run<T>(write: Observable<T>, success: (result: T) => Omit<Outcome, 'tone'>): void {
    this.busy.set(true);
    write.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.busy.set(false);
        this.afterWrite(success(result));
      },
      error: (error: unknown) => this.onWriteFailure(toBankRecFailure(error), false),
    });
  }

  private runPrompt(write: Observable<unknown>, key: string): void {
    this.busy.set(true);
    write.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.prompt.set(null);
        this.dialogOpener = null;
        this.afterWrite({ key });
      },
      error: (error: unknown) => this.onWriteFailure(toBankRecFailure(error), true),
    });
  }

  private afterWrite(outcome: Omit<Outcome, 'tone'>): void {
    this.flaggedIds.set(new Set());
    this.announce({ tone: 'success', ...outcome });
    this.readReview(true);
    this.readAudit();
  }

  /**
   * A refused write keeps the workspace on screen. Stale refusals re-read the
   * review; RECONCILIATION_HAS_UNEXPLAINED_ITEMS highlights the ids the
   * server named and reports both counts.
   */
  private onWriteFailure(failure: BankRecFailure, fromPrompt: boolean): void {
    this.busy.set(false);
    if (fromPrompt) {
      this.prompt.set(null);
      this.dialogOpener = null;
    }
    if (failure.code === 'RECONCILIATION_HAS_UNEXPLAINED_ITEMS') {
      this.flaggedIds.set(new Set(failure.fieldErrors.map(entry => entry.message.trim()).filter(Boolean)));
    }
    const readiness = this.review()?.readiness;
    this.announce({
      tone: 'error',
      key: this.failureKey(failure),
      params: {
        bank: readiness?.countUnexplainedBank ?? 0,
        ledger: readiness?.countUnexplainedLedger ?? 0,
        permission: ACCOUNTING_SECTION.reconciliationApprove[0],
      },
    });
    if ((failure.code && STALE_CODES.has(failure.code)) || failure.status === 409) this.readReview(true);
  }

  private failureKey(failure: BankRecFailure): string {
    if (failure.code && ERROR_KEYS[failure.code]) return ERROR_KEYS[failure.code];
    switch (failure.status) {
      case 400:
        return 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.INVALID';
      case 403:
        return 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.FORBIDDEN_WRITE';
      case 404:
        return 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.NOT_FOUND';
      default:
        return 'ACCOUNTING.RECONCILIATION_WORKSPACE.ERROR.OTHER';
    }
  }

  private pruneSelection(review: ReconciliationReview): void {
    const bank = new Set([...review.lateArrivals, ...review.unexplainedBank].map(row => row.bankTransactionId));
    const ledger = new Set(review.unexplainedLedger.map((row: ReviewLedgerRow) => row.glLineId));
    this.selectedBank.update(set => new Set([...set].filter(id => bank.has(id))));
    this.selectedLedger.update(set => new Set([...set].filter(id => ledger.has(id))));
  }

  private openPrompt(prompt: Prompt): void {
    this.rememberOpener();
    this.promptText.setValue('');
    this.promptErrorKey.set(null);
    this.outcome.set(null);
    this.prompt.set(prompt);
  }

  private rememberOpener(): void {
    const active = this.document.activeElement;
    this.dialogOpener = active instanceof HTMLElement && active !== this.document.body ? active : null;
  }

  private returnFocus(): void {
    const opener = this.dialogOpener;
    this.dialogOpener = null;
    afterNextRender(() => (opener?.isConnected ? opener.focus() : undefined), { injector: this.injector });
  }

  private announce(outcome: Outcome): void {
    this.outcome.set(outcome);
    afterNextRender(
      () => (outcome.tone === 'success' ? this.outcomeSuccess() : this.outcomeError())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * The first day (`YYYY-MM-01`) of the earliest month after `endDate`'s month
 * that is not CLOSED. A month with no period row reads as OPEN (periods are
 * provisioned on first posting). Calendar arithmetic, not money.
 */
export function firstOpenDayAfter(endDate: string, periods: readonly AccountingPeriod[]): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(endDate);
  if (!match) return null;
  const closed = new Set(periods.filter(period => period.status === 'CLOSED').map(period => period.periodCode));
  let year = Number(match[1]);
  let month = Number(match[2]);
  for (let i = 0; i < 36; i++) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    const code = `${year}-${String(month).padStart(2, '0')}`;
    if (isPeriodCode(code) && !closed.has(code)) return `${code}-01`;
  }
  return null;
}
