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
import { Observable, Subscription } from 'rxjs';
import { canAccess } from '../../../../../core/security/route-access';
import { ACCOUNTING_SECTION } from '../../../../../core/security/route-permissions';
import { AuthService } from '../../../../../core/services/auth.service';
import { MaterialSymbolPipe } from '../../../../../shared/material-symbol.pipe';
import { MoneyPipe } from '../../../../../shared/money.pipe';
import {
  BillActionCode,
  BillDecisionDone,
  BillDecisionKind,
  BillDecisionRequest,
  BillDetail,
  BillPermissions,
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
  copy,
  findAction,
  statusLabelKey,
  statusTermKey,
  statusTone,
  withParam,
} from '../../../utils/bill-display';
import { BillDecisionFailure, billReadFailure, classifyBillError } from '../../../utils/bill-errors';
import { toDatePipeInput } from '../../../utils/date-only.util';
import { HelpDisclosureComponent } from '../../help-disclosure/help-disclosure.component';
import { BillCandidatePickerComponent } from '../bill-candidate-picker/bill-candidate-picker.component';
import { BillDecisionComponent } from '../bill-decision/bill-decision.component';
import { BillDueDateComponent } from '../bill-due-date/bill-due-date.component';
import { BillExceptionResolutionComponent } from '../bill-exception-resolution/bill-exception-resolution.component';
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
  RESOLVE: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  SELECT: { permission: 'approve', code: ACCOUNTING_SECTION.apApprove[0] },
  DUE_DATE: { permission: 'setDueDate', code: ACCOUNTING_SECTION.apSetDueDate[0] },
};

const DONE_KEYS: Readonly<Record<BillDecisionKind, string>> = {
  SUBMIT: 'ACCOUNTING.BILLS.DONE.SENT',
  RESOLVE_AND_SEND: 'ACCOUNTING.BILLS.DONE.SENT',
  APPROVE: 'ACCOUNTING.BILLS.DONE.APPROVED',
  REJECT: 'ACCOUNTING.BILLS.DONE.REJECTED',
  RESOLVE: 'ACCOUNTING.BILLS.DONE.RESOLVED',
  SELECT: 'ACCOUNTING.BILLS.DONE.MATCHED',
  DUE_DATE: 'ACCOUNTING.BILLS.DONE.DUE_DATE',
};

/**
 * One bill's review panel (§5.2 item 4; story item 5): header and details,
 * the served checks, the lines, the match score, the routing note and the
 * decisions the session may take. Reused by S20's home to-do panels.
 *
 * - The read is sequence-guarded per bill: a slow read of bill A never paints
 *   over bill B (ADR-0063 §1); a re-read keeps the bill visible with every
 *   write disabled (`refreshing`).
 * - Every decision is re-checked here — the write code and the served action —
 *   before the call (ADR-0040 §6a). Success and every refusal that may mean the
 *   bill moved (409, the tier or creator 403, an unknown outcome) re-read the
 *   bill and emit `changed` so the page re-reads its counts and list.
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

  private readonly heading = viewChild<ElementRef<HTMLElement>>('panelHeading');

  readonly bill = signal<BillDetail | null>(null);
  readonly readStatus = signal<BillReadStatus>('PENDING');
  readonly readFailure = signal<'NOT_FOUND' | 'FORBIDDEN' | 'FAILED' | null>(null);
  readonly inFlight = signal<BillDecisionKind | null>(null);
  readonly failure = signal<BillDecisionFailure | null>(null);
  readonly done = signal<BillDecisionDone | null>(null);
  /** The panel's polite announcement: one live region that survives every rebuild (ADR-0029 §8.8). */
  readonly announcement = signal<Copy | null>(null);

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
  }));

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

  private readSeq = 0;
  private readSubscription: Subscription | null = null;
  private decisionToken = 0;
  private decisionSubscription: Subscription | null = null;
  private doneSeq = 0;
  /** Focus the heading once the re-read after a decision settles (ADR-0029 §8.7). */
  private focusAfterRead = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.readSeq++;
      this.decisionToken++;
      this.readSubscription?.unsubscribe();
      this.decisionSubscription?.unsubscribe();
    });
    // Another bill: drop the held one and anything in flight, then read the new one.
    effect(() => {
      const billId = this.billId();
      untracked(() => {
        this.decisionToken++;
        this.decisionSubscription?.unsubscribe();
        this.inFlight.set(null);
        this.failure.set(null);
        this.done.set(null);
        this.announcement.set(null);
        this.bill.set(null);
        this.focusAfterRead = false;
        this.read(billId);
      });
    });
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
        this.bill.set(bill);
        this.readFailure.set(null);
        this.readStatus.set('OK');
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

  private settleFocus(): void {
    if (!this.focusAfterRead) return;
    this.focusAfterRead = false;
    afterNextRender(() => this.focusHeading(), { injector: this.injector });
  }

  /**
   * Runs one decision. Re-checked here, not only at the control: the write
   * code, the served action (allowed), nothing in flight and a bill read `OK`
   * (ADR-0040 §6a, ADR-0064).
   */
  run(request: BillDecisionRequest): void {
    const bill = this.bill();
    if (!bill || this.busy() || !this.permits(request, bill)) return;
    const token = ++this.decisionToken;
    const billId = bill.billId;
    this.inFlight.set(request.kind);
    this.failure.set(null);
    this.decisionSubscription = this.command(request, billId).subscribe({
      next: () => {
        if (token !== this.decisionToken) return;
        this.inFlight.set(null);
        this.done.set({ kind: request.kind, seq: ++this.doneSeq });
        const number = request.kind === 'SELECT' ? (request.billNumber ?? bill.billNumber) : bill.billNumber;
        this.announcement.set(copy(DONE_KEYS[request.kind], { number }));
        this.focusAfterRead = true;
        this.read(billId);
        this.changed.emit();
      },
      error: (error: unknown) => {
        if (token !== this.decisionToken) return;
        this.inFlight.set(null);
        const view = classifyBillError(error, {
          clerkLimit: bill.approval?.clerkLimit ?? null,
          currency: bill.approval?.currencyCode ?? bill.currency,
          permission: this.gate(request).code,
        });
        this.failure.set({ kind: request.kind, view });
        if (view.reread) {
          this.read(billId);
          this.changed.emit();
        }
      },
    });
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
        return served('SUBMIT_FOR_APPROVAL');
      case 'APPROVE':
        return served('APPROVE');
      case 'REJECT':
        return served('REJECT');
      case 'RESOLVE':
        if (request.action === 'VOID') return served('VOID_EXCEPTION');
        return served(request.action === 'ACCEPT' ? 'ACCEPT_EXCEPTION' : 'CORRECT_EXCEPTION');
      case 'SELECT':
        return served('SELECT_CANDIDATE') && bill.openCandidates.some(candidate => candidate.candidateId === request.candidateId);
      case 'DUE_DATE':
        return served('SET_DUE_DATE');
    }
  }

  private command(request: BillDecisionRequest, billId: string): Observable<void> {
    switch (request.kind) {
      case 'SUBMIT':
        return this.payables.submitForApproval(billId, request.justification);
      case 'RESOLVE_AND_SEND':
        return this.payables.submitForApproval(billId, request.reason);
      case 'APPROVE':
        return this.payables.approve(billId, {
          justification: request.justification,
          taxOnResaleOverrideJustification: request.taxOnResale,
        });
      case 'REJECT':
        return this.payables.reject(billId, request.reason);
      case 'RESOLVE':
        return this.payables.resolveException(billId, {
          resolutionAction: request.action,
          reason: request.reason,
          taxOnResaleOverrideJustification: request.taxOnResale,
        });
      case 'SELECT':
        return this.payables.selectMatchCandidate(request.candidateId);
      case 'DUE_DATE':
        return this.payables.setDueDate(billId, { dueDate: request.dueDate, justification: request.justification });
    }
  }
}
