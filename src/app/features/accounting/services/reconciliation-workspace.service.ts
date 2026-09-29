import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  BankReconciliationAdjustmentResponse,
  BankReconciliationService as BankReconciliationSdk,
  BankRow,
  BankTransactionsService as BankTransactionsSdk,
  Candidate,
  ClearingAdjustment as SdkClearingAdjustment,
  DuplicateReviewRequestDecisionEnum,
  LedgerRow,
  OutstandingItemRegisterRequestItemKindEnum,
  OutstandingItemResponse,
  Posting,
  ReconciliationAdjustmentRequestTypeEnum,
  ReconciliationMatchResponse,
  ReconciliationReviewResponse,
} from '@durion-sdk/accounting';
import {
  ADJUSTMENT_TYPES,
  AdjustmentInput,
  AdjustmentType,
  ClearingAdjustment,
  DuplicateDecision,
  MatchCandidate,
  MatchState,
  OUTSTANDING_ITEM_KINDS,
  OutstandingItem,
  OutstandingItemKind,
  OutstandingItemStatus,
  RECONCILIATION_STATUSES,
  ReconciliationAdjustment,
  ReconciliationAuditEntry,
  ReconciliationMatch,
  ReconciliationReview,
  ReconciliationStatus,
  ReviewBankRow,
  ReviewLedgerRow,
} from '../models/bank-reconciliation.models';
import { displayActor } from '../models/period-close.models';
import { uuidV7 } from '../utils/uuid-v7.util';

const AUDIT_PAGE_SIZE = 50;

/**
 * The reconciliation workspace: review, matching, outstanding items,
 * adjustments and the approval lifecycle (CAP-055,
 * SPEC-manual-bank-reconciliation §4.6–§4.9).
 *
 * Backed by the generated `@durion-sdk/accounting` `BankReconciliationService`
 * and `BankTransactionsService` (ADR-0041). The backend gates each call on
 * `accounting:reconciliation:adjust` or `:approve` (§6.2); the page gates its
 * controls on the same codes. Creating writes carry a fresh UUIDv7
 * `requestId`; lifecycle transitions carry the header `version`.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationWorkspaceService {
  private readonly reconciliationSdk = inject(BankReconciliationSdk);
  private readonly transactionsSdk = inject(BankTransactionsSdk);

  /** The whole workspace model: header, E3, diagnostics, readiness, unresolved lists and evidence (§4.8). */
  getReview(reconciliationId: string): Observable<ReconciliationReview> {
    return this.reconciliationSdk
      .getReconciliationReview(reconciliationId)
      .pipe(map(response => toReview(reconciliationId, response)));
  }

  /** The stored audit trail, most recent first as served. */
  getAudit(reconciliationId: string): Observable<ReconciliationAuditEntry[]> {
    return this.reconciliationSdk.getReconciliationAudit(reconciliationId, 0, AUDIT_PAGE_SIZE).pipe(
      map(response =>
        (response?.entries ?? []).map(entry => ({
          auditLogId: entry.auditLogId ?? '',
          operation: text(entry.operation),
          entityType: text(entry.entityType),
          userId: displayActor(entry.userId),
          timestamp: entry.timestamp ?? null,
          justification: text(entry.justification),
        })),
      ),
    );
  }

  /** Ranked ledger candidates for one bank transaction (§4.6). */
  getCandidates(reconciliationId: string, bankTransactionId: string): Observable<MatchCandidate[]> {
    return this.reconciliationSdk
      .listReconciliationCandidates(reconciliationId, bankTransactionId)
      .pipe(map(response => (response?.candidates ?? []).map(toCandidate)));
  }

  /** Auto-matching only proposes (D12); answers the counts. */
  autoMatch(reconciliationId: string): Observable<{ proposed: number; ambiguous: number }> {
    return this.reconciliationSdk
      .autoMatchReconciliation(reconciliationId)
      .pipe(map(response => ({ proposed: response?.proposedCount ?? 0, ambiguous: response?.ambiguousCount ?? 0 })));
  }

  createMatch(
    reconciliationId: string,
    bankTransactionIds: readonly string[],
    glLineIds: readonly string[],
    justification: string | null,
  ): Observable<ReconciliationMatch> {
    return this.reconciliationSdk
      .createReconciliationMatch(reconciliationId, {
        bankTransactionIds: [...bankTransactionIds],
        glLineIds: [...glLineIds],
        justification: justification ?? undefined,
        requestId: uuidV7(),
      })
      .pipe(map(toMatch));
  }

  acceptMatch(reconciliationId: string, matchId: string): Observable<ReconciliationMatch> {
    return this.reconciliationSdk.acceptReconciliationMatch(reconciliationId, matchId, {}).pipe(map(toMatch));
  }

  rejectMatch(reconciliationId: string, matchId: string): Observable<ReconciliationMatch> {
    return this.reconciliationSdk.rejectReconciliationMatch(reconciliationId, matchId, {}).pipe(map(toMatch));
  }

  unmatch(reconciliationId: string, matchId: string, reason: string): Observable<ReconciliationMatch> {
    return this.reconciliationSdk.unmatchReconciliationMatch(reconciliationId, matchId, { reason }).pipe(map(toMatch));
  }

  registerOutstanding(
    reconciliationId: string,
    link: { bankTransactionId?: string; glLineId?: string },
    itemKind: OutstandingItemKind,
    justification: string | null,
  ): Observable<OutstandingItem> {
    return this.reconciliationSdk
      .registerReconciliationOutstandingItem(reconciliationId, {
        ...link,
        itemKind: itemKind as OutstandingItemRegisterRequestItemKindEnum,
        justification: justification ?? undefined,
      })
      .pipe(map(toOutstandingItem));
  }

  releaseOutstanding(reconciliationId: string, itemId: string, reason: string): Observable<OutstandingItem> {
    return this.reconciliationSdk
      .releaseReconciliationOutstandingItem(reconciliationId, itemId, { reason })
      .pipe(map(toOutstandingItem));
  }

  /** Reaffirms an aged OTHER_LEDGER_TIMING item for this window (§3.6). */
  reaffirmOutstanding(reconciliationId: string, itemId: string, justification: string): Observable<OutstandingItem> {
    return this.reconciliationSdk
      .reaffirmReconciliationOutstandingItem(reconciliationId, itemId, { justification })
      .pipe(map(toOutstandingItem));
  }

  /** Closes an earlier item whose other side appeared during an acknowledged gap (§3.6). */
  clearInGap(reconciliationId: string, itemId: string, justification: string): Observable<OutstandingItem> {
    return this.reconciliationSdk
      .clearReconciliationOutstandingItemInGap(reconciliationId, itemId, { justification })
      .pipe(map(toOutstandingItem));
  }

  /** The adjustment types the server offers; unknown codes are dropped. */
  listAdjustmentTypes(): Observable<AdjustmentType[]> {
    return this.reconciliationSdk.listReconciliationAdjustmentTypes().pipe(
      map(types =>
        (types ?? [])
          .map(type => type.code as string | undefined)
          .filter((code): code is AdjustmentType => ADJUSTMENT_TYPES.includes(code as AdjustmentType)),
      ),
    );
  }

  /** Posts an adjustment. `amount` is left out whenever the input carries none (residual, bridge). */
  addAdjustment(reconciliationId: string, input: AdjustmentInput): Observable<ReconciliationAdjustment> {
    return this.reconciliationSdk
      .addReconciliationAdjustment(reconciliationId, {
        requestId: uuidV7(),
        type: input.type as ReconciliationAdjustmentRequestTypeEnum,
        ...(input.amount === null ? {} : { amount: input.amount }),
        ...(input.description ? { description: input.description } : {}),
        ...(input.justification ? { justification: input.justification } : {}),
        ...(input.transactionDate ? { transactionDate: input.transactionDate } : {}),
        ...(input.overrideJustification ? { overrideJustification: input.overrideJustification } : {}),
        ...(input.bankTransactionId ? { bankTransactionId: input.bankTransactionId } : {}),
        ...(input.settlesMatchId ? { settlesMatchId: input.settlesMatchId } : {}),
        ...(input.bridgesStatementId ? { bridgesStatementId: input.bridgesStatementId } : {}),
        ...(input.counterGlAccountId ? { counterGlAccountId: input.counterGlAccountId } : {}),
      })
      .pipe(map(toAdjustment));
  }

  reverseAdjustment(reconciliationId: string, adjustmentId: string, reason: string): Observable<ReconciliationAdjustment> {
    return this.reconciliationSdk
      .reverseReconciliationAdjustment(reconciliationId, adjustmentId, { reason })
      .pipe(map(toAdjustment));
  }

  submit(reconciliationId: string, version: number): Observable<ReconciliationStatus | null> {
    return this.reconciliationSdk.submitReconciliation(reconciliationId, { version }).pipe(map(r => toStatus(r.status)));
  }

  approve(reconciliationId: string, version: number): Observable<ReconciliationStatus | null> {
    return this.reconciliationSdk.finalizeReconciliation(reconciliationId, { version }).pipe(map(r => toStatus(r.status)));
  }

  returnToPreparer(reconciliationId: string, reason: string, version: number): Observable<ReconciliationStatus | null> {
    return this.reconciliationSdk
      .returnReconciliation(reconciliationId, { reason, version })
      .pipe(map(r => toStatus(r.status)));
  }

  cancel(reconciliationId: string, justification: string, version: number): Observable<ReconciliationStatus | null> {
    return this.reconciliationSdk
      .cancelReconciliation(reconciliationId, { justification, version, requestId: uuidV7() })
      .pipe(map(r => toStatus(r.status)));
  }

  /** Starts a superseding reconciliation (§4.9); answers the new reconciliation's id. */
  supersede(reconciliationId: string, justification: string, version: number): Observable<string> {
    return this.reconciliationSdk
      .supersedeReconciliation(reconciliationId, { justification, version, requestId: uuidV7() })
      .pipe(map(r => r.reconciliationId ?? ''));
  }

  /** Records a duplicate review of a POSSIBLE_DUPLICATE bank transaction (§4.5). */
  reviewDuplicate(
    bankTransactionId: string,
    decision: DuplicateDecision,
    justification: string,
    duplicateOfBankTransactionId: string | null,
  ): Observable<void> {
    return this.transactionsSdk
      .reviewBankTransactionDuplicate(bankTransactionId, {
        decision:
          decision === 'DUPLICATE' ? DuplicateReviewRequestDecisionEnum.Duplicate : DuplicateReviewRequestDecisionEnum.Distinct,
        justification,
        ...(duplicateOfBankTransactionId ? { duplicateOfBankTransactionId } : {}),
      })
      .pipe(map(() => undefined));
  }

  exclude(bankTransactionId: string, justification: string): Observable<void> {
    return this.transactionsSdk.excludeBankTransaction(bankTransactionId, { justification }).pipe(map(() => undefined));
  }

  restore(bankTransactionId: string, justification: string): Observable<void> {
    return this.transactionsSdk.restoreBankTransaction(bankTransactionId, { justification }).pipe(map(() => undefined));
  }
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const num = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

function toStatus(status: string | undefined): ReconciliationStatus | null {
  return RECONCILIATION_STATUSES.includes(status as ReconciliationStatus) ? (status as ReconciliationStatus) : null;
}

function toCandidate(candidate: Candidate): MatchCandidate {
  return {
    bankTransactionId: candidate.bankTransactionId ?? null,
    glLineId: candidate.glLineId ?? null,
    date: candidate.date ?? null,
    description: text(candidate.description),
    entryNumber: text(candidate.entryNumber),
    signedAmount: num(candidate.signedAmount),
    score: num(candidate.score),
    reasons: candidate.reasons ?? [],
  };
}

function toBankRow(row: BankRow): ReviewBankRow {
  return {
    bankTransactionId: row.bankTransactionId ?? '',
    transactionDate: row.transactionDate ?? null,
    description: text(row.description),
    reference: text(row.reference),
    checkNumber: text(row.checkNumber),
    signedAmount: num(row.signedAmount),
    status: row.status ?? null,
    arrivedAfterApproval: row.arrivedAfterApproval === true,
    nearDuplicates: (row.nearDuplicates ?? []).map(toBankRow),
  };
}

function toLedgerRow(row: LedgerRow): ReviewLedgerRow {
  return {
    glLineId: row.glLineId ?? '',
    journalEntryId: row.journalEntryId ?? null,
    entryNumber: text(row.entryNumber),
    date: row.date ?? null,
    description: text(row.description),
    signedAmount: num(row.signedAmount),
  };
}

function toMatch(match: ReconciliationMatchResponse): ReconciliationMatch {
  return {
    matchId: match.matchId ?? '',
    state: (match.state as MatchState | undefined) ?? null,
    matchKind: match.matchKind ?? null,
    origin: match.origin ?? null,
    bankTransactionIds: match.bankTransactionIds ?? [],
    glLineIds: match.glLineIds ?? [],
    bankTotal: num(match.bankTotal),
    ledgerTotal: num(match.ledgerTotal),
    toleranceUsed: num(match.toleranceUsed),
    residual: num(match.residual),
    replacesMatchId: match.replacesMatchId ?? null,
    reasons: match.reasons ?? [],
    justification: text(match.justification),
    confidenceScore: num(match.confidenceScore),
  };
}

function toOutstandingItem(item: OutstandingItemResponse): OutstandingItem {
  return {
    outstandingItemId: item.outstandingItemId ?? '',
    itemKind: OUTSTANDING_ITEM_KINDS.includes(item.itemKind as OutstandingItemKind) ? (item.itemKind as OutstandingItemKind) : null,
    side: item.side === 'LEDGER' || item.side === 'BANK' ? item.side : null,
    status: (item.status as OutstandingItemStatus | undefined) ?? null,
    itemDate: item.itemDate ?? null,
    signedAmount: num(item.signedAmount),
    ageDays: num(item.ageDays),
    closedOn: item.closedOn ?? null,
    justification: text(item.justification),
    registeredInReconciliationId: item.registeredInReconciliationId ?? null,
    lastReaffirmedAt: item.lastReaffirmedAt ?? null,
  };
}

function toAdjustment(adjustment: BankReconciliationAdjustmentResponse): ReconciliationAdjustment {
  return {
    adjustmentId: adjustment.adjustmentId ?? '',
    type: ADJUSTMENT_TYPES.includes(adjustment.type as AdjustmentType) ? (adjustment.type as AdjustmentType) : null,
    status: adjustment.status === 'POSTED' || adjustment.status === 'REVERSED' ? adjustment.status : null,
    amount: num(adjustment.amount),
    transactionDate: adjustment.transactionDate ?? null,
    description: text(adjustment.description),
    justification: text(adjustment.justification),
    entryNumber: text(adjustment.entryNumber),
    bankTransactionId: adjustment.bankTransactionId ?? null,
    settlesMatchId: adjustment.settlesMatchId ?? null,
    bridgesStatementId: adjustment.bridgesStatementId ?? null,
    counterGlAccountId: adjustment.counterGlAccountId ?? null,
    createdBy: text(adjustment.createdBy),
  };
}

function toClearing(adjustment: SdkClearingAdjustment): ClearingAdjustment {
  return {
    adjustmentId: adjustment.adjustmentId ?? '',
    amount: num(adjustment.amount),
    transactionDate: adjustment.transactionDate ?? null,
    justification: text(adjustment.justification),
    linkKind: text(adjustment.linkKind),
    postedBy: text(adjustment.postedBy),
    ageDays: num(adjustment.ageDays),
    status: text(adjustment.status),
  };
}

function toPosting(posting: Posting) {
  return {
    adjustmentId: posting.adjustmentId ?? null,
    reconciliationId: posting.reconciliationId ?? null,
    amount: num(posting.amount),
    date: posting.date ?? null,
    reversal: posting.reversal === true,
  };
}

function toReview(requestedId: string, response: ReconciliationReviewResponse): ReconciliationReview {
  const header = response.header ?? {};
  const equation = response.equation ?? {};
  const diagnostics = response.diagnostics ?? {};
  const readiness = response.readiness ?? {};
  const unresolved = response.unresolved ?? {};
  const evidence = response.evidence ?? {};
  return {
    header: {
      reconciliationId: header.reconciliationId ?? requestedId,
      glAccountId: header.glAccountId ?? null,
      accountCode: text(header.accountCode),
      accountName: text(header.accountName),
      status: toStatus(header.status),
      statementId: header.statementId ?? null,
      statementStartDate: header.statementStartDate ?? null,
      statementEndDate: header.statementEndDate ?? null,
      accountingPeriodCode: text(header.accountingPeriodCode),
      periodState: text(header.periodState),
      baselineDate: header.baselineDate ?? null,
      baselineSetByThisStatement: header.baselineSetByThisStatement === true,
      gapAcknowledgement: text(header.gapAcknowledgement ?? evidence.statement?.gapAcknowledgement),
      preparer: displayActor(header.preparer),
      approver: displayActor(header.approver),
      currency: text(header.currency),
      sourceKind: header.sourceKind ?? null,
      version: header.version ?? 0,
    },
    equation: {
      statementClosingBalance: num(equation.statementClosingBalance),
      sumOutstandingLedgerItems: num(equation.sumOutstandingLedgerItems),
      sumOutstandingBankItems: num(equation.sumOutstandingBankItems),
      adjustedBankBalance: num(equation.adjustedBankBalance),
      glEndingBalance: num(equation.glEndingBalance),
      sumLateAdjustments: num(equation.sumLateAdjustments),
      adjustedBookBalance: num(equation.adjustedBookBalance),
      difference: num(equation.difference),
      outstandingLedgerItems: (equation.outstandingLedgerItems ?? []).map(toOutstandingItem),
      outstandingBankItems: (equation.outstandingBankItems ?? []).map(toOutstandingItem),
      lateAdjustments: (equation.lateAdjustments ?? []).map(toPosting),
    },
    diagnostics: {
      openingDifference: num(diagnostics.openingDifference),
      statementOpeningBalance: num(diagnostics.statementOpeningBalance),
      glOpeningBalance: num(diagnostics.glOpeningBalance),
      openingLedgerItems: num(diagnostics.openingLedgerItems),
      openingBankItems: num(diagnostics.openingBankItems),
      sumOpeningAdjustments: num(diagnostics.sumOpeningAdjustments),
      flags: diagnostics.flags ?? [],
      likelyCause: text(diagnostics.likelyCause),
      bridgeAdjustmentId: diagnostics.bridge?.adjustmentId ?? null,
    },
    readiness: {
      canSubmit: readiness.canSubmit === true,
      canApprove: readiness.canApprove === true,
      proposalsPending: readiness.proposalsPending === true,
      reasons: readiness.reasons ?? [],
      countUnexplainedBank: num(readiness.countUnexplainedBank),
      countUnexplainedLedger: num(readiness.countUnexplainedLedger),
      sumUnexplainedBank: num(readiness.sumUnexplainedBank),
      sumUnexplainedLedger: num(readiness.sumUnexplainedLedger),
    },
    unexplainedBank: (unresolved.unexplainedBank ?? []).map(toBankRow),
    unexplainedLedger: (unresolved.unexplainedLedger ?? []).map(toLedgerRow),
    lateArrivals: (unresolved.lateArrivals ?? []).map(toBankRow),
    possibleDuplicates: (unresolved.possibleDuplicates ?? []).map(toBankRow),
    proposedMatches: (unresolved.proposedMatches ?? []).map(toMatch),
    brokenMatches: (unresolved.brokenMatches ?? []).map(toMatch),
    agedItemsAwaitingReaffirmation: (unresolved.agedItemsAwaitingReaffirmation ?? []).map(toOutstandingItem),
    matches: (evidence.matches ?? []).map(toMatch),
    outstandingItems: (evidence.outstandingItems ?? []).map(toOutstandingItem),
    exclusions: (evidence.exclusions ?? []).map(toBankRow),
    adjustmentsToClearing: (evidence.adjustmentsToClearing ?? []).map(toClearing),
    adjustments: (response.adjustments ?? []).map(toAdjustment),
  };
}
