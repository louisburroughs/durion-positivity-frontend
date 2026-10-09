import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  PageVendorBillStageRow,
  VendorBillAPIService,
  VendorBillApproveRequest,
  VendorBillClassification,
  VendorBillClassificationDebitClassEnum,
  VendorBillDifference,
  VendorBillDifferenceClassEnum,
  VendorBillPosting,
  VendorBillSubmitRequest,
  VendorDirectoryAPIService,
  VendorBillAvailableAction,
  VendorBillCheck,
  VendorBillDueDateRequest,
  VendorBillExceptionResolutionRequest,
  VendorBillExceptionResolutionRequestResolutionActionEnum,
  VendorBillInputTaxRecovery,
  VendorBillLine,
  VendorBillMatch,
  VendorBillMatchCandidateSummary,
  VendorBillMatchPoints,
  VendorBillResponse,
  VendorBillStageCounts,
  VendorBillStageRow,
  VendorBillTaxByType,
} from '@durion-sdk/accounting';
import {
  ApprovalTier,
  BillAction,
  BillActionCode,
  BillApproveCommand,
  BillCandidate,
  BillChannel,
  BillClassification,
  BillDifference,
  BillCheck,
  BillDetail,
  BillDueDateCommand,
  BillInputTaxRecovery,
  BillLine,
  BillMatch,
  BillPosting,
  BillPostingInput,
  BillResolveCommand,
  BillSelection,
  BillSubmitCommand,
  BillVoidCommand,
  DebitClass,
  DifferenceClass,
  PostingDateRule,
  VendorDefaultClass,
  BillStage,
  BillStageCounts,
  BillStagePage,
  BillStageRow,
  BillStatus,
  BillTaxByType,
  CheckOutcome,
  MatchConfidence,
  MatchPoints,
} from '../models/payables.models';

/** Rows per page of one stage (the read caps a page at 100). */
export const BILL_PAGE_SIZE = 25;

const STATUSES: readonly BillStatus[] = [
  'PENDING_RECEIPT_MATCH',
  'MATCH_EXCEPTION',
  'CURRENCY_HOLD',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'PAID',
  'VOIDED',
];
const CHANNELS: readonly BillChannel[] = ['GOODS_RECEIPT', 'SUPPLIER_CONNECTION'];
const TIERS: readonly ApprovalTier[] = ['CLERK', 'OVER_LIMIT'];
const ACTIONS: readonly BillActionCode[] = [
  'SUBMIT_FOR_APPROVAL',
  'APPROVE',
  'REJECT',
  'ACCEPT_EXCEPTION',
  'CORRECT_EXCEPTION',
  'VOID_EXCEPTION',
  'SELECT_CANDIDATE',
  'VOID_APPROVED',
  'VOID_UNMATCHED',
  'SET_DUE_DATE',
];
const OUTCOMES: readonly CheckOutcome[] = ['PASS', 'FAIL', 'NOT_APPLICABLE'];
const CONFIDENCES: readonly MatchConfidence[] = ['HIGH_CONFIDENCE', 'MEDIUM_CONFIDENCE', 'AMBIGUOUS', 'NO_MATCH'];
const DEBIT_CLASSES: readonly DebitClass[] = ['GOODS', 'EXPENSE', 'RECEIPT_MATCHED', 'PRICE_ALLOWANCE'];
const DIFFERENCE_CLASSES: readonly DifferenceClass[] = ['FREIGHT', 'GOODS', 'PRICE_DIFFERENCE', 'EXPENSE'];
const POSTING_DATE_RULES: readonly PostingDateRule[] = ['BILL_DATE', 'APPROVAL_DATE_BILL_PERIOD_NOT_OPEN', 'APPROVAL_DATE_BILL_DATE_FUTURE'];
/** The actor the server records for an automatic decision (S12, S13). */
const SYSTEM_ACTOR = 'SYSTEM';

/** A served enum value this build knows, else `UNKNOWN` (§8.2: never hard-code, never drop). */
function known<T extends string>(values: readonly T[], value: string | null | undefined): T | 'UNKNOWN' {
  return value && (values as readonly string[]).includes(value) ? (value as T) : 'UNKNOWN';
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;
const amount = (value: number | null | undefined): number | null => (typeof value === 'number' ? value : null);

/**
 * Bills to pay (CAP:550 S14, SPEC-accounting-workspace §5.2): the stage counts
 * and lists, one bill's review read and the decisions on it, through the
 * generated `@durion-sdk/accounting` `VendorBillAPIService` (ADR-0041).
 *
 * The backend enforces `accounting:ap:view` on the reads,
 * `accounting:ap:approve` or `accounting:ap:approve_over_limit` on submit,
 * approve, `ACCEPT`, `CORRECT` and the candidate selection, `accounting:ap:reject`
 * on reject and `VOID`, and `accounting:ap:approve` on the due date; the page
 * gates each control and handler on the same code (`ACCOUNTING_SECTION`).
 *
 * The acting person comes from the token (ADR-0018): no body carries an
 * `operatorId`. The commands take no idempotency key — a transition is its own
 * guard (a replay answers 409) — so each one resolves to nothing and the panel
 * re-reads the bill, the counts and the list.
 */
@Injectable({ providedIn: 'root' })
export class PayablesService {
  private readonly sdk = inject(VendorBillAPIService);
  private readonly vendors = inject(VendorDirectoryAPIService);

  getStageCounts(): Observable<BillStageCounts> {
    return this.sdk.getVendorBillStageCounts().pipe(map(toStageCounts));
  }

  /** One page of a stage, in the server's order (no due-date window). */
  listByStage(stage: BillStage, page = 0, size = BILL_PAGE_SIZE): Observable<BillStagePage> {
    return this.sdk.listVendorBillsByStage(stage, page, size).pipe(map(toStagePage));
  }

  getBill(billId: string): Observable<BillDetail> {
    return this.sdk.getVendorBillById(billId).pipe(map(toBillDetail));
  }

  /**
   * Send for approval: from `PENDING_RECEIPT_MATCH` "without a delivery
   * match", from `MATCH_EXCEPTION` resolving it. A classification or
   * difference is a proposal the approver may change (Q1).
   */
  submitForApproval(billId: string, command: BillSubmitCommand): Observable<void> {
    const request: VendorBillSubmitRequest = { justification: command.justification, ...postingFields(command.posting, false) };
    return this.sdk.submitVendorBillForApproval(billId, request).pipe(map(() => undefined));
  }

  /**
   * Approve bill. S32d's `taxByType` is never sent (omitted, the bill keeps
   * what it states; entering it is S33's). Classification, difference and the
   * period override go only when the panel shows and fills them.
   */
  approve(billId: string, command: BillApproveCommand): Observable<void> {
    const request: VendorBillApproveRequest = {
      ...(command.justification ? { justification: command.justification } : {}),
      ...(command.taxOnResaleOverrideJustification
        ? { taxOnResaleOverrideJustification: command.taxOnResaleOverrideJustification }
        : {}),
      ...postingFields(command.posting, true),
    };
    return this.sdk.approveVendorBill(billId, request).pipe(map(() => undefined));
  }

  reject(billId: string, reason: string): Observable<void> {
    return this.sdk.rejectVendorBill(billId, { reason }).pipe(map(() => undefined));
  }

  /** Void an approved bill (reversed today, AW42) or a goods-receipt placeholder (posts nothing, AW45). */
  voidBill(billId: string, command: BillVoidCommand): Observable<void> {
    return this.sdk
      .voidVendorBill(billId, {
        reason: command.reason,
        ...(command.overrideJustification ? { overrideJustification: command.overrideJustification } : {}),
      })
      .pipe(map(() => undefined));
  }

  /** Accept as billed, Correct the bill or Void the bill. The override reason and posting choices go with `ACCEPT` only. */
  resolveException(billId: string, command: BillResolveCommand): Observable<void> {
    const accept = command.resolutionAction === 'ACCEPT';
    const request: VendorBillExceptionResolutionRequest = {
      resolutionAction: command.resolutionAction as VendorBillExceptionResolutionRequestResolutionActionEnum,
      reason: command.reason,
      ...(accept && command.taxOnResaleOverrideJustification
        ? { taxOnResaleOverrideJustification: command.taxOnResaleOverrideJustification }
        : {}),
      ...(accept ? postingFields(command.posting, true) : {}),
    };
    return this.sdk.resolveVendorBillMatchException(billId, request).pipe(map(() => undefined));
  }

  /**
   * Matching only: the chosen bill moves to `AWAITING_APPROVAL`. No body.
   * Answers with the chosen bill, which may be another than the one shown (Q5).
   */
  selectMatchCandidate(candidateId: string): Observable<BillSelection> {
    return this.sdk
      .selectVendorBillMatchCandidate(candidateId)
      .pipe(map(view => ({ billId: view.vendorBillId, billNumber: view.billNumber })));
  }

  /** The vendor's served AP default class, pre-filling "What is this bill for?" (`accounting:ap:view`). */
  getVendorDefaultClass(vendorId: string): Observable<VendorDefaultClass> {
    return this.vendors.getVendorById(vendorId).pipe(
      map(vendor => {
        const value = vendor.apSettings?.defaultDebitClass;
        return value === 'GOODS' || value === 'EXPENSE' ? value : null;
      }),
    );
  }

  setDueDate(billId: string, command: BillDueDateCommand): Observable<void> {
    const request: VendorBillDueDateRequest = {
      dueDate: command.dueDate,
      ...(command.justification ? { justification: command.justification } : {}),
    };
    return this.sdk.setVendorBillDueDate(billId, request).pipe(map(() => undefined));
  }
}

function toStageCounts(view: VendorBillStageCounts): BillStageCounts {
  return {
    check: view.check,
    approve: view.approve,
    pay: view.pay,
    done: view.done,
    asOf: text(view.asOf),
  };
}

function toStagePage(response: PageVendorBillStageRow): BillStagePage {
  const content = response.content ?? [];
  return {
    items: content.map(toStageRow),
    page: response.number ?? 0,
    size: response.size ?? content.length,
    totalElements: response.totalElements ?? content.length,
    totalPages: response.totalPages ?? 1,
  };
}

function toStageRow(row: VendorBillStageRow): BillStageRow {
  return {
    billId: row.vendorBillId,
    billNumber: row.billNumber,
    vendorName: text(row.vendorName),
    totalAmount: row.totalAmount,
    openAmount: row.openAmount,
    currencyCode: text(row.currencyCode),
    billDate: text(row.billDate),
    dueDate: text(row.dueDate),
    status: known(STATUSES, row.status),
    channel: known(CHANNELS, row.channel),
    requiredTier: row.requiredTier ? known(TIERS, row.requiredTier) : null,
    submittedAt: text(row.submittedAt),
    vendorApHold: row.vendorApHold === true,
  };
}

function toBillDetail(view: VendorBillResponse): BillDetail {
  return {
    billId: view.vendorBillId,
    vendorId: view.vendorId,
    billNumber: view.billNumber,
    vendorName: text(view.vendorName),
    channel: known(CHANNELS, view.channel),
    status: known(STATUSES, view.status),
    billDate: text(view.billDate),
    dueDate: text(view.dueDate),
    totalAmount: view.totalAmount,
    netAmount: amount(view.netAmount),
    taxAmount: amount(view.taxAmount),
    openAmount: view.openAmount,
    currency: text(view.currency),
    statusExplanation: text(view.statusExplanation),
    approval: view.approval
      ? {
          requiredTier: known(TIERS, view.approval.requiredTier),
          clerkLimit: view.approval.clerkLimit,
          currencyCode: text(view.approval.currencyCode),
          submittedAt: text(view.approval.submittedAt),
          submissionJustification: text(view.approval.submissionJustification),
          approvedAt: text(view.approval.approvedAt),
          approvalJustification: text(view.approval.approvalJustification),
          approvedAutomatically: view.approval.approvedByKind === 'SYSTEM',
          submittedAutomatically: view.approval.submittedBy === SYSTEM_ACTOR,
          proposedClassification: view.approval.proposedClassification
            ? toClassification(view.approval.proposedClassification)
            : null,
          proposedDifference: view.approval.proposedDifference ? toDifference(view.approval.proposedDifference) : null,
        }
      : null,
    rejection: view.rejection
      ? { reason: view.rejection.reason, rejectedAt: text(view.rejection.rejectedAt) }
      : null,
    match: view.match ? toMatch(view.match) : null,
    openCandidates: (view.openCandidates ?? []).filter(candidate => !!candidate.candidateId).map(toCandidate),
    checks: (view.checks ?? []).map(toCheck),
    lines: (view.lines ?? []).map(toLine),
    availableActions: (view.availableActions ?? []).map(toAction),
    taxByType: (view.taxByType ?? []).map(toTaxByType),
    inputTaxRecovery: (view.inputTaxRecovery ?? []).map(toInputTaxRecovery),
    taxOnResaleOverride: view.taxOnResaleOverride
      ? {
          source: known(['BILL', 'VENDOR_SETTING'] as const, view.taxOnResaleOverride.source),
          justification: text(view.taxOnResaleOverride.justification),
        }
      : null,
    posting: view.posting ? toPosting(view.posting) : null,
  };
}

/** The request fields for the posting choices; the override only where the command posts. */
function postingFields(
  posting: BillPostingInput,
  posts: boolean,
): { classification?: VendorBillClassification; difference?: VendorBillDifference; overrideJustification?: string } {
  return {
    ...(posting.classification
      ? { classification: { debitClass: posting.classification as VendorBillClassificationDebitClassEnum } }
      : {}),
    ...(posting.difference
      ? {
          difference: {
            class: posting.difference.differenceClass as VendorBillDifferenceClassEnum,
            justification: posting.difference.justification,
          },
        }
      : {}),
    ...(posts && posting.overrideJustification ? { overrideJustification: posting.overrideJustification } : {}),
  };
}

function toClassification(classification: VendorBillClassification): BillClassification {
  return {
    debitClass: known(DEBIT_CLASSES, classification.debitClass),
    expenseMappingKey: text(classification.expenseMappingKey),
  };
}

function toDifference(difference: VendorBillDifference): BillDifference {
  return { differenceClass: known(DIFFERENCE_CLASSES, difference.class), justification: text(difference.justification) };
}

function toPosting(posting: VendorBillPosting): BillPosting {
  return {
    journalEntryId: posting.journalEntryId,
    journalEntryReference: text(posting.journalEntryReference),
    postingDate: posting.postingDate,
    postingDateRule: known(POSTING_DATE_RULES, posting.postingDateRule),
    differenceClass: posting.differenceClass ? known(DIFFERENCE_CLASSES, posting.differenceClass) : null,
    differenceAmount: amount(posting.differenceAmount),
    roundingAdjustment: posting.roundingAdjustment,
    reversalReference: text(posting.reversalReference),
    currencyCode: text(posting.currencyCode),
  };
}

function toPoints(points: VendorBillMatchPoints): MatchPoints {
  return {
    amount: points.amount,
    products: points.products,
    date: points.date,
    purchaseOrder: points.purchaseOrder,
  };
}

function toMatch(match: VendorBillMatch): BillMatch {
  return {
    score: match.score,
    confidence: known(CONFIDENCES, match.confidence),
    points: toPoints(match.points),
    invoiceReference: text(match.invoiceReference),
    invoiceDate: text(match.invoiceDate),
    withinTolerance: match.withinTolerance === true,
  };
}

function toCandidate(candidate: VendorBillMatchCandidateSummary): BillCandidate {
  return {
    candidateId: candidate.candidateId,
    billNumber: text(candidate.billNumber),
    billTotal: amount(candidate.billTotal),
    currencyCode: text(candidate.currencyCode),
    score: candidate.score,
    points: candidate.points ? toPoints(candidate.points) : null,
  };
}

function toCheck(check: VendorBillCheck): BillCheck {
  return {
    code: check.code,
    outcome: known(OUTCOMES, check.outcome),
    args: { ...(check.args ?? {}) },
  };
}

function toLine(line: VendorBillLine): BillLine {
  return {
    lineNumber: line.lineNumber,
    description: text(line.description),
    inventoryItem: line.inventoryItem === true,
    receivedQuantity: line.receivedQuantity,
    receivedUnitPrice: line.receivedUnitPrice,
    billedQuantity: amount(line.billedQuantity),
    billedUnitPrice: amount(line.billedUnitPrice),
    currencyCode: text(line.currencyCode),
  };
}

function toAction(action: VendorBillAvailableAction): BillAction {
  return {
    action: known(ACTIONS, action.action),
    allowed: action.allowed === true,
    blockedReason: text(action.blockedReason),
    justificationRequired: action.justificationRequired === true,
  };
}

function toTaxByType(tax: VendorBillTaxByType): BillTaxByType {
  return {
    taxType: tax.taxType,
    amount: tax.amount,
    source: known(['DOCUMENT', 'APPROVAL'] as const, tax.source),
  };
}

function toInputTaxRecovery(recovery: VendorBillInputTaxRecovery): BillInputTaxRecovery {
  return {
    taxType: text(recovery.taxType),
    regime: text(recovery.regime),
    statedAmount: recovery.statedAmount,
    recoveredAmount: recovery.recoveredAmount,
    accountCode: text(recovery.accountCode),
    accountName: text(recovery.accountName),
    recoveryWithheldReason: text(recovery.recoveryWithheldReason),
  };
}
