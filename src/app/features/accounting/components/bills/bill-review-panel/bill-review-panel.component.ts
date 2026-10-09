import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Observable, Subscription, map } from 'rxjs';
import { canAccess } from '../../../../../core/security/route-access';
import { ACCOUNTING_PAGE, ACCOUNTING_SECTION } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../../../../shared/material-symbol.pipe';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import {
  BILL_REASON_MAX,
  BILL_REASON_MIN,
  BillActionCode,
  BillDecisionDone,
  BillDecisionKind,
  BillDecisionRequest,
  BillDetail,
  BillPermissions,
  BillPostingInput,
  BillSelection,
  NO_POSTING_INPUT,
  VendorDefaultClass,
} from '../../../models/payables.models';
import { AccountingPreferencesService } from '../../../services/accounting-preferences.service';
import { PayablesService } from '../../../services/payables.service';
import {
  CHANNEL_ICONS,
  CHANNEL_KEYS,
  Copy,
  OUTCOME_ICONS,
  OUTCOME_KEYS,
  checkView,
  classificationPrefill,
  classificationShown,
  copy,
  findAction,
  postingDecisionServed,
  reasonValid,
  statusLabelKey,
  statusTermKey,
  statusTone,
  unreconciledTotals,
  withParam,
} from '../../../utils/bill-display';
import { BillDecisionFailure, billReadFailure, classifyBillError } from '../../../utils/bill-errors';
import { toDatePipeInput } from '../../../utils/date-only.util';
import { HelpDisclosureComponent } from '../../help-disclosure/help-disclosure.component';
import { BillCandidatePickerComponent } from '../bill-candidate-picker/bill-candidate-picker.component';
import { BillDecisionComponent } from '../bill-decision/bill-decision.component';
import { BillDueDateComponent } from '../bill-due-date/bill-due-date.component';
import { BillExceptionResolutionComponent } from '../bill-exception-resolution/bill-exception-resolution.component';
import { BillPostingFieldsComponent, DifferenceChoice } from '../bill-posting-fields/bill-posting-fields.component';
import { MatchScoreComponent } from '../match-score/match-score.component';

let nextId = 0;

/** `none → loading → ready | error`, with `refreshing` keeping the bill visible while writes are off (story State model). */
export type BillPanelState = 'none' | 'loading' | 'ready' | 'refreshing' | 'error';

/** The read outcome (ADR-0064): actions are enabled only on `OK`. */
export type BillReadStatus = 'PENDING' | 'OK' | 'FAILED';

/** Statuses in review: the routing note applies (§4.3). */
const IN_REVIEW = new Set(['PENDING_RECEIPT_MATCH', 'MATCH_EXCEPTION', 'AWAITING_APPROVAL']);

/** The served action and the write code each decision needs (ADR-0040 §6a). */
const GATES: Readonly<Record<BillDecisionKind, { readonly permission: keyof BillPermissions; readonly code: string }>> = {
  SUBMIT: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  RESOLVE_AND_SEND: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  APPROVE: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  REJECT: { permission: 'reject', code: ACCOUNTING_SECTION.apReject[0] },
  VOID: { permission: 'reject', code: ACCOUNTING_SECTION.apReject[0] },
  RESOLVE: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  SELECT: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  DUE_DATE: { permission: 'setDueDate', code: ACCOUNTING_SECTION.apSetDueDate[0] },
};

const DONE_KEYS: Readonly<Record<BillDecisionKind, string>> = {
  SUBMIT: 'ACCOUNTING.BILLS.DONE.SENT',
  RESOLVE_AND_SEND: 'ACCOUNTING.BILLS.DONE.SENT',
  APPROVE: 'ACCOUNTING.BILLS.DONE.APPROVED',
  REJECT: 'ACCOUNTING.BILLS.DONE.REJECTED',
  VOID: 'ACCOUNTING.BILLS.DONE.VOIDED',
  RESOLVE: 'ACCOUNTING.BILLS.DONE.RESOLVED',
  SELECT: 'ACCOUNTING.BILLS.DONE.MATCHED',
  DUE_DATE: 'ACCOUNTING.BILLS.DONE.DUE_DATE',
};

/**
 * One bill's review panel (§5.2 item 4; story item 5; Accounting ruling on
 * #464): header and details, the served checks, the lines, the match score,
 * the routing note, **On the books** once posted, the posting choices and the
 * decisions the session may take. Reused by S20's home to-do panels.
 *
 * - The read is sequence-guarded per bill: a slow read of bill A never paints
 *   over bill B (ADR-0063 §1); a re-read keeps the bill visible with every
 *   write disabled (`refreshing`). Another tenant or person (`tid|sub`) drops
 *   everything held and in flight and reads again (ADR-0063 §7).
 * - Every decision is re-checked here — the write code and the served action —
 *   before the call (ADR-0040 §6a). Success and every refusal that may mean the
 *   bill moved re-read the bill and emit `changed`. A decision still in flight
 *   when another bill is picked settles anyway: it emits `changed` so the list
 *   and counts re-read, and only the panel-local updates are skipped
 *   (ADR-0063 §4).
 * - A candidate selection that matched another bill emits `moved` with it, so
 *   the host opens that bill (Q5).
 * - Nothing is computed: totals, tier, limit and actions are as served (P7).
 */
@Component({
  selector: 'app-bill-review-panel',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    MoneyPipe,
    MaterialSymbolPipe,
    RouterLink,
    TranslatePipe,
    HelpDisclosureComponent,
    MatchScoreComponent,
    BillDueDateComponent,
    BillDecisionComponent,
    BillExceptionResolutionComponent,
    BillCandidatePickerComponent,
    BillPostingFieldsComponent,
  ],
  templateUrl: './bill-review-panel.component.html',
  styleUrls: ['../../../bank-reconciliation-shared.css', '../bills-shared.css', './bill-review-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BillReviewPanelComponent {
  private readonly auth = inject(AuthService);
  private readonly payables = inject(PayablesService);
  private readonly preferences = inject(AccountingPreferencesService);
  private readonly injector = inject(Injector);

  readonly billId = input.required<string>();
  /** A decision landed (or may have): the host re-reads its counts and list. */
  readonly changed = output<void>();
  /** The bill read answered for the current id. */
  readonly loaded = output<BillDetail>();
  /** A candidate selection matched another bill than the one shown: the host opens it (Q5). */
  readonly moved = output<BillSelection>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  readonly bill = signal<BillDetail | null>(null);
  readonly readStatus = signal<BillReadStatus>('PENDING');
  readonly readFailure = signal<'NOT_FOUND' | 'FORBIDDEN' | 'FAILED' | null>(null);
  readonly inFlight = signal<BillDecisionKind | null>(null);
  readonly failure = signal<BillDecisionFailure | null>(null);
  readonly done = signal<BillDecisionDone | null>(null);
  /** The panel's polite announcement: one live region that survives every rebuild (ADR-0029 §8.8). */
  readonly announcement = signal<Copy | null>(null);

  // ── Posting choices (Q1), two-way bound to the posting block ──────────
  readonly postClass = signal<'GOODS' | null>(null);
  readonly diffClass = signal<DifferenceChoice | null>(null);
  readonly diffReason = signal('');
  readonly overrideReason = signal('');
  /** The vendor's served default class, read only when the classification can show. */
  readonly vendorDefault = signal<VendorDefaultClass>(null);

  readonly showTerms = this.preferences.showTerms;
  readonly withParam = withParam;
  readonly toDate = toDatePipeInput;
  readonly channelKeys = CHANNEL_KEYS;
  readonly channelIcons = CHANNEL_ICONS;
  readonly outcomeKeys = OUTCOME_KEYS;
  readonly outcomeIcons = OUTCOME_ICONS;
  readonly readCode = 'accounting:ap:view';
  readonly id = `bill-panel-${++nextId}`;

  // ── Gates (the unknown-perm_bits case follows canAccess) ──────────────
  readonly permissions = computed<BillPermissions>(() => ({
    approve: canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apApprove }),
    reject: canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apReject }),
    setDueDate: canAccess(this.auth, { permissions: ACCOUNTING_SECTION.apSetDueDate }),
    periodOverride: canAccess(this.auth, { permissions: ACCOUNTING_SECTION.periodOverride }),
  }));
  /** The journal-entry page's own gate; without it "On the books" is text only. */
  readonly canOpenEntry = computed(() => canAccess(this.auth, { permissions: ACCOUNTING_PAGE.journalEntry }));

  readonly state = computed<BillPanelState>(() => {
    const status = this.readStatus();
    const held = this.bill();
    if (status === 'FAILED') return held ? 'ready' : 'error';
    if (status === 'PENDING') return held ? 'refreshing' : 'loading';
    return held ? 'ready' : 'none';
  });
  /** Writes need a bill read `OK`, nothing in flight and no re-read pending (ADR-0064 §2). */
  readonly busy = computed(() => this.readStatus() !== 'OK' || this.inFlight() !== null);

  readonly statusKey = computed(() => {
    const bill = this.bill();
    return bill ? statusLabelKey(bill.status, bill.channel, bill.openCandidates.length > 0) : null;
  });
  readonly termKey = computed(() => {
    const bill = this.bill();
    return bill ? statusTermKey(bill.status) : null;
  });
  readonly tone = computed(() => statusTone(this.bill()?.status ?? 'UNKNOWN'));
  readonly checks = computed(() => {
    const bill = this.bill();
    return bill ? bill.checks.map(check => ({ check, sentence: checkView(check, bill.currency) })) : [];
  });
  readonly currency = computed(() => this.bill()?.currency ?? this.bill()?.approval?.currencyCode ?? null);
  readonly routing = computed<Copy | null>(() => {
    const bill = this.bill();
    const approval = bill?.approval;
    if (!bill || !approval || !IN_REVIEW.has(bill.status)) return null;
    if (approval.clerkLimit === 0) return copy('ACCOUNTING.BILLS.ROUTING.NO_CLERK');
    const limit = { param: 'limit', value: approval.clerkLimit, currency: approval.currencyCode ?? bill.currency };
    if (approval.requiredTier === 'CLERK') return copy('ACCOUNTING.BILLS.ROUTING.CLERK', { limit: '' }, limit);
    if (approval.requiredTier === 'OVER_LIMIT') return copy('ACCOUNTING.BILLS.ROUTING.OVER_LIMIT', { limit: '' }, limit);
    return null;
  });
  readonly routingTermKey = computed(() => {
    const tier = this.bill()?.approval?.requiredTier;
    if (tier === 'CLERK') return 'ACCOUNTING.BILLS.ROUTING.TERM_CLERK';
    if (tier === 'OVER_LIMIT') return 'ACCOUNTING.BILLS.ROUTING.TERM_OVER_LIMIT';
    return null;
  });

  // ── Posting visibility and readiness (Q1, ruling row 8) ───────────────
  private readonly lastCode = computed(() => this.failure()?.view.code ?? null);
  readonly classificationVisible = computed(
    () => this.permissions().approve && classificationShown(this.bill(), this.lastCode()),
  );
  readonly prefill = computed(() => classificationPrefill(this.bill(), this.vendorDefault()));
  readonly totals = computed(() => unreconciledTotals(this.bill()));
  readonly differenceRequired = computed(() => this.lastCode() === 'AP_BILL_TOTALS_UNRECONCILED');
  readonly differenceVisible = computed(
    () => this.permissions().approve && postingDecisionServed(this.bill()) && (!!this.totals() || this.differenceRequired()),
  );
  /** A proposed difference in a class this page cannot send (EXPENSE, S14b): the server keeps it. */
  readonly proposedExpenseDifference = computed(() => this.bill()?.approval?.proposedDifference?.differenceClass === 'EXPENSE');
  readonly overrideVisible = computed(
    () =>
      this.permissions().periodOverride &&
      this.lastCode() === 'PERIOD_CLOSED' &&
      (this.failure()?.kind === 'APPROVE' || this.failure()?.kind === 'RESOLVE'),
  );
  private readonly differenceOk = computed(
    () =>
      !this.differenceVisible() ||
      this.proposedExpenseDifference() ||
      (!!this.diffClass() && reasonValid(this.diffReason(), BILL_REASON_MIN, BILL_REASON_MAX)),
  );
  private readonly classificationOk = computed(
    () => !this.classificationVisible() || this.prefill()?.debitClass === 'EXPENSE' || this.postClass() === 'GOODS',
  );
  private readonly overrideOk = computed(
    () => !this.overrideVisible() || reasonValid(this.overrideReason(), BILL_REASON_MIN, BILL_REASON_MAX),
  );
  /** Approve and Accept: the class is required, the difference and the override when shown. */
  readonly postingReady = computed(() => this.classificationOk() && this.differenceOk() && this.overrideOk());
  /** Send: the class is only a proposal there. */
  readonly sendReady = computed(() => this.differenceOk());

  readonly postingDateNote = computed(() => {
    const rule = this.bill()?.posting?.postingDateRule;
    return !!rule && rule !== 'BILL_DATE';
  });

  private readSeq = 0;
  private readSubscription: Subscription | null = null;
  private vendorSeq = 0;
  private vendorSubscription: Subscription | null = null;
  private decisionToken = 0;
  /** Bumped when the tenant or person changes: decisions sent before it settle silently (ADR-0063 §7). */
  private identityEpoch = 0;
  private readonly decisions = new Set<Subscription>();
  private doneSeq = 0;
  private destroyed = false;
  /** Focus the heading once the re-read after a decision settles (ADR-0029 §8.7). */
  private focusAfterRead = false;
  /** `tid|sub` the held bill belongs to; seeded so the effect's first run is not a change. */
  private trackedIdentity = this.identity();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.readSeq++;
      this.vendorSeq++;
      this.readSubscription?.unsubscribe();
      this.vendorSubscription?.unsubscribe();
      // A decision in flight is left to settle; with the panel gone nothing more is emitted.
    });
    // Another bill: drop the held one, then read the new one. A decision in flight keeps going (A5).
    effect(() => {
      const billId = this.billId();
      untracked(() => {
        this.clearForBill();
        this.read(billId);
      });
    });
    // ADR-0063 §7: another tenant or person drops everything held and in flight, then reads again (review A2).
    effect(() => {
      const identity = this.identity();
      if (identity === this.trackedIdentity) return;
      this.trackedIdentity = identity;
      untracked(() => {
        this.identityEpoch++;
        for (const decision of this.decisions) decision.unsubscribe();
        this.decisions.clear();
        this.readSeq++;
        this.readSubscription?.unsubscribe();
        this.clearForBill();
        this.read(this.billId());
      });
    });
  }

  private identity(): string {
    const part = (value: string | null | undefined): string => encodeURIComponent(value?.trim() ?? '');
    return `${part(this.auth.tenantId())}|${part(this.auth.currentUserClaims()?.sub)}`;
  }

  private clearForBill(): void {
    this.inFlight.set(null);
    this.failure.set(null);
    this.done.set(null);
    this.announcement.set(null);
    this.bill.set(null);
    this.vendorSeq++;
    this.vendorSubscription?.unsubscribe();
    this.vendorDefault.set(null);
    this.resetPosting();
    this.focusAfterRead = false;
  }

  private resetPosting(): void {
    this.postClass.set(null);
    this.diffClass.set(null);
    this.diffReason.set('');
    this.overrideReason.set('');
  }

  /** Moves focus to the panel heading (phones: when a row is picked, §5.7). */
  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }

  retry(): void {
    this.read(this.billId());
  }

  /** Reads the bill for `billId`; only the latest read may write (ADR-0063 §1). */
  private read(billId: string): void {
    const seq = ++this.readSeq;
    this.readSubscription?.unsubscribe();
    this.readStatus.set('PENDING');
    this.readSubscription = this.payables.getBill(billId).subscribe({
      next: bill => {
        if (seq !== this.readSeq || billId !== this.billId()) return;
        const first = this.bill()?.billId !== bill.billId;
        this.bill.set(bill);
        this.readFailure.set(null);
        this.readStatus.set('OK');
        if (first) this.prefillPosting(bill);
        this.loaded.emit(bill);
        this.settleFocus();
      },
      error: (error: unknown) => {
        if (seq !== this.readSeq || billId !== this.billId()) return;
        const failure = billReadFailure(error);
        // Gone or refused: nothing read before keeps rendering (ADR-0064 §6).
        if (failure !== 'FAILED') this.bill.set(null);
        this.readFailure.set(failure);
        this.readStatus.set('FAILED');
        this.settleFocus();
      },
    });
  }

  /**
   * Pre-fills the posting choices from what is served: the clerk's proposal,
   * else (read here, once per bill) the vendor's default class (Q1 A, B).
   */
  private prefillPosting(bill: BillDetail): void {
    const proposed = bill.approval?.proposedClassification?.debitClass;
    if (proposed === 'GOODS') this.postClass.set('GOODS');
    const difference = bill.approval?.proposedDifference;
    if (difference && difference.differenceClass !== 'EXPENSE' && difference.differenceClass !== 'UNKNOWN') {
      this.diffClass.set(difference.differenceClass);
      this.diffReason.set(difference.justification ?? '');
    }
    if (proposed || !classificationShown(bill, null)) return;
    const seq = ++this.vendorSeq;
    this.vendorSubscription?.unsubscribe();
    this.vendorSubscription = this.payables.getVendorDefaultClass(bill.vendorId).subscribe({
      next: value => {
        if (seq !== this.vendorSeq || bill.billId !== this.bill()?.billId) return;
        this.vendorDefault.set(value);
        if (value === 'GOODS' && this.postClass() === null) this.postClass.set('GOODS');
      },
      // No default read: the field simply starts empty.
      error: () => undefined,
    });
  }

  private settleFocus(): void {
    if (!this.focusAfterRead) return;
    this.focusAfterRead = false;
    afterNextRender(() => this.focusHeading(), { injector: this.injector });
  }

  /**
   * Runs one decision. Re-checked here, not only at the control: the write
   * code, the served action (allowed), the posting choices, nothing in flight
   * and a bill read `OK` (ADR-0040 §6a, ADR-0064).
   */
  run(request: BillDecisionRequest): void {
    const bill = this.bill();
    if (!bill || this.busy() || !this.permits(request, bill)) return;
    const token = ++this.decisionToken;
    const epoch = this.identityEpoch;
    const billId = bill.billId;
    const posting = this.postingFor(request);
    // Same tenant and person, the panel still alive: the list and counts must hear of it.
    const live = (): boolean => epoch === this.identityEpoch && !this.destroyed;
    // …and the panel still shows the bill the decision was for, with no later decision on it.
    const current = (): boolean => live() && token === this.decisionToken && billId === this.billId();
    this.inFlight.set(request.kind);
    this.failure.set(null);
    let subscription: Subscription | null = null;
    const settled = (): void => {
      if (subscription) this.decisions.delete(subscription);
    };
    subscription = this.command(request, billId, posting).subscribe({
      next: selection => {
        settled();
        if (!live()) return;
        // Settled even when another bill was picked meanwhile: the list and counts re-read (A5).
        this.changed.emit();
        if (request.kind === 'SELECT' && selection && selection.billId !== billId) {
          // The chosen bill is another one: the host opens it, unless the person already moved on (Q5).
          if (current()) {
            this.inFlight.set(null);
            this.moved.emit(selection);
          }
          return;
        }
        if (!current()) return;
        this.inFlight.set(null);
        this.done.set({ kind: request.kind, seq: ++this.doneSeq });
        const number = request.kind === 'SELECT' ? (request.billNumber ?? bill.billNumber) : bill.billNumber;
        this.announcement.set(copy(DONE_KEYS[request.kind], { number }));
        this.resetPosting();
        this.focusAfterRead = true;
        this.read(billId);
      },
      error: (error: unknown) => {
        settled();
        if (!live()) return;
        const view = classifyBillError(error, {
          clerkLimit: bill.approval?.clerkLimit ?? null,
          currency: bill.approval?.currencyCode ?? bill.currency,
          permission: this.gate(request).code,
          canOverride: this.permissions().periodOverride,
        });
        if (view.reread) this.changed.emit();
        if (!current()) return;
        this.inFlight.set(null);
        this.failure.set({ kind: request.kind, view });
        if (view.reread) this.read(billId);
      },
    });
    if (!subscription.closed) this.decisions.add(subscription);
  }

  /** The posting choices a decision carries: only what is shown, and the override only where it posts. */
  private postingFor(request: BillDecisionRequest): BillPostingInput {
    const carries =
      request.kind === 'SUBMIT' ||
      request.kind === 'RESOLVE_AND_SEND' ||
      request.kind === 'APPROVE' ||
      (request.kind === 'RESOLVE' && request.action === 'ACCEPT');
    if (!carries) return NO_POSTING_INPUT;
    const posts = request.kind === 'APPROVE' || request.kind === 'RESOLVE';
    const diffClass = this.diffClass();
    return {
      classification: this.classificationVisible() && this.postClass() === 'GOODS' ? 'GOODS' : null,
      difference:
        this.differenceVisible() && !this.proposedExpenseDifference() && diffClass
          ? { differenceClass: diffClass, justification: this.diffReason().trim() }
          : null,
      overrideJustification: posts && this.overrideVisible() ? this.overrideReason().trim() : null,
    };
  }

  /** The write code a decision needs: `VOID` is a rejection (`accounting:ap:reject`), the other resolutions approvals. */
  private gate(request: BillDecisionRequest): { readonly permission: keyof BillPermissions; readonly code: string } {
    return request.kind === 'RESOLVE' && request.action === 'VOID' ? GATES.REJECT : GATES[request.kind];
  }

  private permits(request: BillDecisionRequest, bill: BillDetail): boolean {
    if (!this.permissions()[this.gate(request).permission]) return false;
    const served = (code: BillActionCode): boolean => findAction(bill, code)?.allowed === true;
    switch (request.kind) {
      case 'SUBMIT':
      case 'RESOLVE_AND_SEND':
        return served('SUBMIT_FOR_APPROVAL') && this.sendReady();
      case 'APPROVE':
        return served('APPROVE') && this.postingReady();
      case 'REJECT':
        return served('REJECT');
      case 'VOID':
        return served(request.voidKind);
      case 'RESOLVE':
        if (request.action === 'VOID') return served('VOID_EXCEPTION');
        if (request.action === 'ACCEPT') return served('ACCEPT_EXCEPTION') && this.postingReady();
        return served('CORRECT_EXCEPTION');
      case 'SELECT':
        return served('SELECT_CANDIDATE') && bill.openCandidates.some(candidate => candidate.candidateId === request.candidateId);
      case 'DUE_DATE':
        return served('SET_DUE_DATE');
    }
  }

  private command(request: BillDecisionRequest, billId: string, posting: BillPostingInput): Observable<BillSelection | null> {
    const done = map((): BillSelection | null => null);
    switch (request.kind) {
      case 'SUBMIT':
        return this.payables.submitForApproval(billId, { justification: request.justification, posting }).pipe(done);
      case 'RESOLVE_AND_SEND':
        return this.payables.submitForApproval(billId, { justification: request.reason, posting }).pipe(done);
      case 'APPROVE':
        return this.payables
          .approve(billId, { justification: request.justification, taxOnResaleOverrideJustification: request.taxOnResale, posting })
          .pipe(done);
      case 'REJECT':
        return this.payables.reject(billId, request.reason).pipe(done);
      case 'VOID':
        return this.payables.voidBill(billId, { reason: request.reason, overrideJustification: request.overrideJustification }).pipe(done);
      case 'RESOLVE':
        return this.payables
          .resolveException(billId, {
            resolutionAction: request.action,
            reason: request.reason,
            taxOnResaleOverrideJustification: request.taxOnResale,
            posting,
          })
          .pipe(done);
      case 'SELECT':
        return this.payables.selectMatchCandidate(request.candidateId);
      case 'DUE_DATE':
        return this.payables.setDueDate(billId, { dueDate: request.dueDate, justification: request.justification }).pipe(done);
    }
  }
}
