/**
 * Domain shapes for Bills to pay (CAP:550 S14, SPEC-accounting-workspace §4.3,
 * §5.2), mirroring the served shapes of S12 and S13 (`@durion-sdk/accounting`
 * `VendorBillAPIService`) and kept separate from the generated types.
 *
 * Named `Bill*` here and never `VendorBill`, which `accounting.models.ts` uses
 * for the AP payment-selection surface (`APPaymentsService.listApBills`, a
 * different read).
 *
 * Every value is as served: the client never computes a total, a tier, a limit
 * or an open amount (P7). An enum value this build does not know maps to
 * `UNKNOWN` (§8.2), so a new server value renders as "Unknown" instead of
 * vanishing.
 */

export type BillStage = 'CHECK' | 'APPROVE' | 'PAY' | 'DONE';

/** The four steps of "How a bill moves", in order (§5.2 item 3). */
export const BILL_STAGES: readonly BillStage[] = ['CHECK', 'APPROVE', 'PAY', 'DONE'];

export type BillStatus =
  | 'PENDING_RECEIPT_MATCH'
  | 'MATCH_EXCEPTION'
  | 'CURRENCY_HOLD'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'VOIDED'
  | 'UNKNOWN';

export type BillChannel = 'GOODS_RECEIPT' | 'SUPPLIER_CONNECTION' | 'UNKNOWN';

/** The tier an approval needs, derived by the server from the current clerk limit. */
export type ApprovalTier = 'CLERK' | 'OVER_LIMIT' | 'UNKNOWN';

export type BillActionCode =
  | 'SUBMIT_FOR_APPROVAL'
  | 'APPROVE'
  | 'REJECT'
  | 'ACCEPT_EXCEPTION'
  | 'CORRECT_EXCEPTION'
  | 'VOID_EXCEPTION'
  | 'SELECT_CANDIDATE'
  | 'VOID_APPROVED'
  | 'VOID_UNMATCHED'
  | 'SET_DUE_DATE'
  | 'UNKNOWN';

export type CheckOutcome = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'UNKNOWN';

export type MatchConfidence = 'HIGH_CONFIDENCE' | 'MEDIUM_CONFIDENCE' | 'AMBIGUOUS' | 'NO_MATCH' | 'UNKNOWN';

export type ExceptionResolutionAction = 'ACCEPT' | 'CORRECT' | 'VOID';

/** Every justification, reason and note the bill commands take is at least this long (400 `JUSTIFICATION_REQUIRED`). */
export const BILL_REASON_MIN = 10;
/** And at most this long (400 `ARGUMENT_NOT_VALID` / `VALIDATION_ERROR`). */
export const BILL_REASON_MAX = 1000;

/** `GET /vendor-bills/stages`: read-only figures, never summed (P7). */
export interface BillStageCounts {
  readonly check: number;
  readonly approve: number;
  readonly pay: number;
  readonly done: number;
  /** When the counts were taken. */
  readonly asOf: string | null;
}

/** One row of `GET /vendor-bills/by-stage`, in the server's order. */
export interface BillStageRow {
  readonly billId: string;
  readonly billNumber: string;
  readonly vendorName: string | null;
  readonly totalAmount: number;
  readonly openAmount: number;
  readonly currencyCode: string | null;
  readonly billDate: string | null;
  readonly dueDate: string | null;
  readonly status: BillStatus;
  readonly channel: BillChannel;
  /** Null outside review. */
  readonly requiredTier: ApprovalTier | null;
  readonly submittedAt: string | null;
  /** The vendor is on AP hold (#2615): approved and posted, not paid until released. */
  readonly vendorApHold: boolean;
}

export interface BillStagePage {
  readonly items: readonly BillStageRow[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/** A decision the caller may take now (`availableActions[]`, P5). */
export interface BillAction {
  readonly action: BillActionCode;
  readonly allowed: boolean;
  /** `AP_APPROVAL_LIMIT_EXCEEDED`, `AP_BILL_SELF_APPROVAL` or a later code; null when allowed. */
  readonly blockedReason: string | null;
  readonly justificationRequired: boolean;
}

/** One served check; `args` are the values its sentence is built from. */
export interface BillCheck {
  readonly code: string;
  readonly outcome: CheckOutcome;
  readonly args: Readonly<Record<string, string>>;
}

export interface BillLine {
  readonly lineNumber: number;
  readonly description: string | null;
  readonly inventoryItem: boolean;
  readonly receivedQuantity: number;
  readonly receivedUnitPrice: number;
  /** Null until the bill is matched. */
  readonly billedQuantity: number | null;
  readonly billedUnitPrice: number | null;
  readonly currencyCode: string | null;
}

/** Points per criterion: amount of 40, products of 30, date of 20, purchase order of 5. */
export interface MatchPoints {
  readonly amount: number;
  readonly products: number;
  readonly date: number;
  readonly purchaseOrder: number;
}

/** The latest match evidence. */
export interface BillMatch {
  readonly score: number;
  readonly confidence: MatchConfidence;
  readonly points: MatchPoints;
  readonly invoiceReference: string | null;
  readonly invoiceDate: string | null;
  readonly withinTolerance: boolean;
}

/** One candidate of an ambiguous match, compared by number, total and score — never by id (§7.1). */
export interface BillCandidate {
  /** For the select command only; never rendered. */
  readonly candidateId: string;
  readonly billNumber: string | null;
  readonly billTotal: number | null;
  readonly currencyCode: string | null;
  readonly score: number;
  readonly points: MatchPoints | null;
}

export interface BillApproval {
  readonly requiredTier: ApprovalTier;
  /** The clerk approval limit in force now; 0 means no clerk approves. */
  readonly clerkLimit: number;
  readonly currencyCode: string | null;
  readonly submittedAt: string | null;
  readonly submissionJustification: string | null;
  /** @serverGenerated — only on an approved bill. */
  readonly approvedAt?: string | null;
  readonly approvalJustification: string | null;
}

export interface BillRejection {
  readonly reason: string;
  readonly rejectedAt: string | null;
}

/** S32d: the tax the vendor's document states, by type. Kept for S33, not rendered here. */
export interface BillTaxByType {
  readonly taxType: string;
  readonly amount: number;
  readonly source: 'DOCUMENT' | 'APPROVAL' | 'UNKNOWN';
}

/** S32d: what the posting did with each stated tax amount. Kept for S33, not rendered here. */
export interface BillInputTaxRecovery {
  readonly taxType: string | null;
  readonly regime: string | null;
  readonly statedAmount: number;
  readonly recoveredAmount: number;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly recoveryWithheldReason: string | null;
}

/** S43: why tax on goods for resale was accepted on an approved bill. */
export interface BillTaxOnResaleOverride {
  readonly source: 'BILL' | 'VENDOR_SETTING' | 'UNKNOWN';
  /** The approver's reason for a `BILL` override; null for `VENDOR_SETTING`. */
  readonly justification: string | null;
}

/** `GET /vendor-bills/{billId}`: one bill as the review panel reads it. */
export interface BillDetail {
  readonly billId: string;
  readonly billNumber: string;
  readonly vendorName: string | null;
  readonly channel: BillChannel;
  readonly status: BillStatus;
  readonly billDate: string | null;
  readonly dueDate: string | null;
  readonly totalAmount: number;
  /** The net the vendor's document states; null on a bill without header totals. */
  readonly netAmount: number | null;
  /** The tax the vendor's document states, never recalculated. */
  readonly taxAmount: number | null;
  readonly openAmount: number;
  /** ISO 4217; null means the ledger currency. */
  readonly currency: string | null;
  /** Why the bill is held (`MATCH_EXCEPTION`, `CURRENCY_HOLD`); untrusted text. */
  readonly statusExplanation: string | null;
  readonly approval: BillApproval | null;
  readonly rejection: BillRejection | null;
  readonly match: BillMatch | null;
  readonly openCandidates: readonly BillCandidate[];
  readonly checks: readonly BillCheck[];
  readonly lines: readonly BillLine[];
  readonly availableActions: readonly BillAction[];
  readonly taxByType: readonly BillTaxByType[];
  readonly inputTaxRecovery: readonly BillInputTaxRecovery[];
  readonly taxOnResaleOverride: BillTaxOnResaleOverride | null;
}

/** Approve bill: the justification is optional unless served as required. */
export interface BillApproveCommand {
  readonly justification: string | null;
  /** S43: why tax on goods for resale is accepted for this bill (10–1000 characters). */
  readonly taxOnResaleOverrideJustification: string | null;
}

export interface BillResolveCommand {
  readonly resolutionAction: ExceptionResolutionAction;
  readonly reason: string;
  /** S43, `ACCEPT` only. */
  readonly taxOnResaleOverrideJustification: string | null;
}

export interface BillDueDateCommand {
  /** `YYYY-MM-DD`. */
  readonly dueDate: string;
  readonly justification: string | null;
}

/**
 * A decision the review panel's controls ask for. The panel runs it, after
 * re-checking the permission and the served action (ADR-0040 §6a).
 */
export type BillDecisionRequest =
  | { readonly kind: 'SUBMIT'; readonly justification: string }
  | { readonly kind: 'APPROVE'; readonly justification: string | null; readonly taxOnResale: string | null }
  | { readonly kind: 'REJECT'; readonly reason: string }
  | {
      readonly kind: 'RESOLVE';
      readonly action: ExceptionResolutionAction;
      readonly reason: string;
      readonly taxOnResale: string | null;
    }
  | { readonly kind: 'RESOLVE_AND_SEND'; readonly reason: string }
  | { readonly kind: 'SELECT'; readonly candidateId: string; readonly billNumber: string | null }
  | { readonly kind: 'DUE_DATE'; readonly dueDate: string; readonly justification: string | null };

export type BillDecisionKind = BillDecisionRequest['kind'];

/** The write codes the session holds, computed once by the panel and handed to its controls. */
export interface BillPermissions {
  /** `accounting:ap:approve` or `…:approve_over_limit`: send, approve, accept, correct, pick a match. */
  readonly approve: boolean;
  /** `accounting:ap:reject`: reject, void. */
  readonly reject: boolean;
  /** `accounting:ap:approve`: the due date. */
  readonly setDueDate: boolean;
}

/** A decision that succeeded; `seq` tells a repeat of the same kind apart. */
export interface BillDecisionDone {
  readonly kind: BillDecisionKind;
  readonly seq: number;
}
