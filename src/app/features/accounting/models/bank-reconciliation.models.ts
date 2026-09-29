/**
 * Manual bank reconciliation (CAP-055, SPEC-manual-bank-reconciliation).
 *
 * These mirror the fields the pages show, mapped from the generated
 * `@durion-sdk/accounting` DTOs by `BankReconciliationService`. Every amount,
 * total, sign and gate is served: the client performs no money arithmetic and
 * infers no policy (§4.8, §5.9). Dates are bare `YYYY-MM-DD` strings rendered
 * through `toDatePipeInput` (ADR-0038).
 */

/** A reconcilable `BANK_CASH` GL account with its bank profile and frontiers (§4.1). */
export interface BankAccount {
  readonly glAccountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly bankName: string | null;
  readonly accountMask: string | null;
  readonly currency: string | null;
  /** Start of the account's reconciliation chain; null before the first acknowledged statement (§3.1). */
  readonly reconciliationBaselineDate: string | null;
  /** End date of the latest COMMITTED statement. */
  readonly coverageFrontier: string | null;
  /** End of the contiguous FINALIZED chain from the baseline. */
  readonly reconciledFrontier: string | null;
  readonly unexplainedBankTransactionCount: number | null;
  readonly openOutstandingItemCount: number | null;
  readonly profileExists: boolean;
}

/** The editable bank profile. Phase 1 profiles are `USD` only (D18). */
export interface BankAccountProfileInput {
  readonly bankName: string | null;
  readonly accountMask: string | null;
  readonly currency: string;
}

/** Profile currencies the server accepts today (D18); any other answers 422 CURRENCY_NOT_SUPPORTED. */
export const BANK_PROFILE_CURRENCIES = ['USD'] as const;

export type BankStatementStatus = 'COMMITTED' | 'SUPERSEDED';
export type BankStatementSource = 'FILE_IMPORT' | 'MANUAL_ENTRY' | 'BANK_FEED';

/** A reconciliation that covers a statement, as the statement read links it. */
export interface StatementReconciliationLink {
  readonly reconciliationId: string;
  readonly status: string | null;
}

export interface BankStatement {
  readonly statementId: string;
  readonly glAccountId: string | null;
  readonly statementRef: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly openingBalance: number | null;
  readonly closingBalance: number | null;
  readonly currency: string | null;
  readonly status: BankStatementStatus | null;
  readonly sourceKind: BankStatementSource | null;
  readonly gapAcknowledgement: string | null;
  readonly reconciliations: readonly StatementReconciliationLink[];
}

/** Reconciliation states that hold a statement: a second reconciliation of it answers 409. */
export const ACTIVE_RECONCILIATION_STATUSES: readonly string[] = ['IN_PROGRESS', 'SUBMITTED'];

/** The statement header an import or a manual statement carries (§4.2). */
export interface StatementHeader {
  readonly startDate: string;
  readonly endDate: string;
  readonly openingBalance: number;
  readonly closingBalance: number;
  readonly statementRef: string | null;
}

/**
 * Replacing a COMMITTED statement with a corrected one (§4.9 path 3). The
 * server decides eligibility; the justification is at least 10 characters.
 */
export interface StatementSupersession {
  readonly supersedesStatementId: string;
  readonly supersessionJustification: string;
}

export type SignConvention = 'SIGNED_AMOUNT' | 'SIGNED_AMOUNT_INVERTED' | 'DEBIT_CREDIT_COLUMNS';
export const SIGN_CONVENTIONS: readonly SignConvention[] = ['SIGNED_AMOUNT', 'SIGNED_AMOUNT_INVERTED', 'DEBIT_CREDIT_COLUMNS'];

/** The roles a CSV column can be mapped to; the value is the column's header name. */
export type ColumnRole = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'reference' | 'checkNumber' | 'sourceTransactionId';
export const COLUMN_ROLES: readonly ColumnRole[] = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'reference',
  'checkNumber',
  'sourceTransactionId',
];
export type ColumnMapping = Partial<Record<ColumnRole, string>>;

export type BankImportStatus = 'UPLOADED' | 'VALIDATED' | 'COMMITTED' | 'DISCARDED';
export type ImportRowStatus =
  | 'PARSED'
  | 'REJECTED'
  | 'CORRECTED'
  | 'SKIPPED'
  | 'POSSIBLE_DUPLICATE'
  | 'OUT_OF_WINDOW'
  | 'COMMITTED';
export const IMPORT_ROW_STATUSES: readonly ImportRowStatus[] = [
  'PARSED',
  'REJECTED',
  'CORRECTED',
  'SKIPPED',
  'POSSIBLE_DUPLICATE',
  'OUT_OF_WINDOW',
  'COMMITTED',
];

/** One of the first rows of the preview, with the sign and running balance the server computed. */
export interface ImportPreviewRow {
  readonly rowNumber: number;
  readonly date: string | null;
  readonly description: string | null;
  readonly signedAmount: number | null;
  readonly runningBalance: number | null;
  readonly rowStatus: ImportRowStatus | null;
}

/** `opening + Σ = closing` for one statement segment, every figure as served (§4.4, E1). */
export interface ImportSegmentTotal {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly openingBalance: number | null;
  readonly activityTotal: number | null;
  readonly expectedClosing: number | null;
  readonly closingBalance: number | null;
  readonly difference: number | null;
  readonly ties: boolean;
  readonly transactionCount: number | null;
}

export interface ImportPreview {
  readonly firstRows: readonly ImportPreviewRow[];
  readonly segments: readonly ImportSegmentTotal[];
  readonly ties: boolean;
}

export interface BankImport {
  readonly importId: string;
  readonly glAccountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly status: BankImportStatus;
  readonly mappingRequired: boolean;
  /** Raw header names of the file, for the mapping step. */
  readonly columns: readonly string[];
  readonly columnMapping: ColumnMapping;
  readonly signConvention: SignConvention | null;
  readonly dateFormat: string | null;
  readonly currency: string | null;
  readonly fileName: string | null;
  readonly statement: StatementHeader | null;
  readonly gapAcknowledgement: string | null;
  readonly rowCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly skippedCount: number;
  readonly possibleDuplicateCount: number;
  readonly outOfWindowCount: number;
  readonly preview: ImportPreview | null;
  readonly statementId: string | null;
  readonly reconciliationId: string | null;
  readonly discardReason: string | null;
  /** Sent back on every mutation; a stale one answers 409 OPTIMISTIC_LOCK. */
  readonly version: number;
}

/** The editable parsed fields of a row (`correctedValues`). */
export interface ImportRowCorrection {
  readonly date?: string;
  readonly signedAmount?: number;
  readonly description?: string;
  readonly reference?: string;
  readonly checkNumber?: string;
}

export type DuplicateDecision = 'DISTINCT' | 'DUPLICATE';

export interface ImportRow {
  readonly rowId: string;
  readonly rowNumber: number;
  readonly rowStatus: ImportRowStatus | null;
  /** The file's own cells, kept beside any correction (§4.4). */
  readonly rawValues: Readonly<Record<string, unknown>>;
  readonly correctedValues: Readonly<Record<string, unknown>> | null;
  readonly date: string | null;
  readonly description: string | null;
  readonly signedAmount: number | null;
  readonly reference: string | null;
  readonly checkNumber: string | null;
  readonly rejectionCode: string | null;
  readonly skipReason: string | null;
  readonly duplicateDecision: DuplicateDecision | null;
  readonly duplicateOfRowNumber: number | null;
}

export interface ImportRowPage {
  readonly rows: readonly ImportRow[];
  readonly columns: readonly string[];
  readonly pageNumber: number;
  readonly totalPages: number;
  readonly totalElements: number;
}

/** What a commit produced. A split import yields one statement per segment. */
export interface ImportCommitResult {
  readonly statementId: string;
  readonly statementIds: readonly string[];
  readonly reconciliationId: string | null;
  readonly bankTransactionCount: number;
  readonly possibleDuplicateCount: number;
}

/** One transaction keyed on the manual-entry form (§4.3 fallback, §4.1 d). */
export interface ManualTransactionInput {
  readonly date: string;
  readonly signedAmount: number;
  readonly description: string;
  readonly reference: string | null;
  readonly checkNumber: string | null;
}

/** A refused bank-reconciliation request, as the `ApiError` envelope stated it (ADR-0017). */
export interface BankRecFailure {
  readonly code: string | null;
  readonly status: number;
  readonly message: string | null;
  readonly fieldErrors: readonly { readonly field: string; readonly message: string }[];
}

/**
 * Justifications (gap acknowledgement, supersession, discard reason) are at
 * least this long (D15). Hinted and gated client-side; the server answers 400
 * JUSTIFICATION_REQUIRED either way.
 */
export const BANK_REC_JUSTIFICATION_MIN = 10;

/** The row numbers named by `fieldErrors[<prefix>[n]]`, e.g. `rows[12]` or `transactions[3]`. */
export function indexedFieldErrors(failure: BankRecFailure, prefix: string): number[] {
  const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]$`);
  return failure.fieldErrors
    .map(entry => pattern.exec(entry.field)?.[1])
    .filter((index): index is string => index !== undefined)
    .map(Number);
}

/** The message of the first `fieldErrors[field]` entry, shown verbatim where the spec says so (E1). */
export function fieldErrorMessage(failure: BankRecFailure, field: string): string | null {
  return failure.fieldErrors.find(entry => entry.field === field)?.message?.trim() || null;
}

// ── Reconciliation workspace (§4.6–§4.9) ─────────────────────────────────

export type ReconciliationStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'FINALIZED' | 'INVALIDATED' | 'SUPERSEDED' | 'CANCELLED';
export const RECONCILIATION_STATUSES: readonly ReconciliationStatus[] = [
  'IN_PROGRESS',
  'SUBMITTED',
  'FINALIZED',
  'INVALIDATED',
  'SUPERSEDED',
  'CANCELLED',
];

export type CandidateReason =
  | 'EXACT_AMOUNT'
  | 'WITHIN_TOLERANCE'
  | 'DATE_IN_WINDOW'
  | 'DATE_OUT_OF_WINDOW'
  | 'REFERENCE_MATCH'
  | 'DESCRIPTION_SIMILAR';

/** A ranked match candidate. `score` runs 0–110 and is not a percentage. */
export interface MatchCandidate {
  readonly bankTransactionId: string | null;
  readonly glLineId: string | null;
  readonly date: string | null;
  readonly description: string | null;
  readonly entryNumber: string | null;
  readonly signedAmount: number | null;
  readonly score: number | null;
  readonly reasons: readonly string[];
}

/** An unexplained bank transaction as the review lists it. */
export interface ReviewBankRow {
  readonly bankTransactionId: string;
  readonly transactionDate: string | null;
  readonly description: string | null;
  readonly reference: string | null;
  readonly checkNumber: string | null;
  readonly signedAmount: number | null;
  readonly status: string | null;
  /** A phase-2 late arrival (D10); listed first. */
  readonly arrivedAfterApproval: boolean;
  /** The served near-duplicate candidates (§4.5), offered as candidate originals. */
  readonly nearDuplicates: readonly ReviewBankRow[];
}

/** An unexplained ledger line as the review lists it. */
export interface ReviewLedgerRow {
  readonly glLineId: string;
  readonly journalEntryId: string | null;
  readonly entryNumber: string | null;
  readonly date: string | null;
  readonly description: string | null;
  readonly signedAmount: number | null;
}

export type MatchState = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'UNMATCHED' | 'BROKEN';

export interface ReconciliationMatch {
  readonly matchId: string;
  readonly state: MatchState | null;
  readonly matchKind: string | null;
  readonly origin: string | null;
  readonly bankTransactionIds: readonly string[];
  readonly glLineIds: readonly string[];
  readonly bankTotal: number | null;
  readonly ledgerTotal: number | null;
  readonly toleranceUsed: number | null;
  /** Signed; what a residual settlement would post (§3.4). */
  readonly residual: number | null;
  readonly replacesMatchId: string | null;
  readonly reasons: readonly string[];
  readonly justification: string | null;
  readonly confidenceScore: number | null;
}

export type OutstandingItemKind = 'DEPOSIT_IN_TRANSIT' | 'OUTSTANDING_CHECK' | 'OTHER_LEDGER_TIMING' | 'BANK_ERROR_PENDING';
export const OUTSTANDING_ITEM_KINDS: readonly OutstandingItemKind[] = [
  'DEPOSIT_IN_TRANSIT',
  'OUTSTANDING_CHECK',
  'OTHER_LEDGER_TIMING',
  'BANK_ERROR_PENDING',
];
export type OutstandingItemStatus = 'OPEN' | 'CLEARED' | 'CLEARED_IN_GAP' | 'VOIDED' | 'RELEASED';

export interface OutstandingItem {
  readonly outstandingItemId: string;
  readonly itemKind: OutstandingItemKind | null;
  readonly side: 'LEDGER' | 'BANK' | null;
  readonly status: OutstandingItemStatus | null;
  readonly itemDate: string | null;
  readonly signedAmount: number | null;
  readonly ageDays: number | null;
  readonly closedOn: string | null;
  readonly justification: string | null;
  readonly registeredInReconciliationId: string | null;
  readonly lastReaffirmedAt: string | null;
}

export type AdjustmentType = 'BANK_FEE' | 'NSF_FEE' | 'INTEREST_EARNED' | 'OTHER' | 'TRANSFER';
export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = ['BANK_FEE', 'NSF_FEE', 'INTEREST_EARNED', 'OTHER', 'TRANSFER'];

export interface ReconciliationAdjustment {
  readonly adjustmentId: string;
  readonly type: AdjustmentType | null;
  readonly status: 'POSTED' | 'REVERSED' | null;
  readonly amount: number | null;
  readonly transactionDate: string | null;
  readonly description: string | null;
  readonly justification: string | null;
  readonly entryNumber: string | null;
  readonly bankTransactionId: string | null;
  readonly settlesMatchId: string | null;
  readonly bridgesStatementId: string | null;
  readonly counterGlAccountId: string | null;
  readonly createdBy: string | null;
}

/** An `OTHER` adjustment posted to a clearing account, with its link and age (§4.7). */
export interface ClearingAdjustment {
  readonly adjustmentId: string;
  readonly amount: number | null;
  readonly transactionDate: string | null;
  readonly justification: string | null;
  readonly linkKind: string | null;
  readonly postedBy: string | null;
  readonly ageDays: number | null;
  readonly status: string | null;
}

export interface LateAdjustment {
  readonly adjustmentId: string | null;
  readonly reconciliationId: string | null;
  readonly amount: number | null;
  readonly date: string | null;
  readonly reversal: boolean;
}

/** The live equation E3, every term as served (§3.7). */
export interface ReconciliationEquation {
  readonly statementClosingBalance: number | null;
  readonly sumOutstandingLedgerItems: number | null;
  readonly sumOutstandingBankItems: number | null;
  readonly adjustedBankBalance: number | null;
  readonly glEndingBalance: number | null;
  readonly sumLateAdjustments: number | null;
  readonly adjustedBookBalance: number | null;
  readonly difference: number | null;
  readonly outstandingLedgerItems: readonly OutstandingItem[];
  readonly outstandingBankItems: readonly OutstandingItem[];
  readonly lateAdjustments: readonly LateAdjustment[];
}

/** The opening diagnostics, never a blocker (§4.8, D2). */
export interface ReconciliationDiagnostics {
  readonly openingDifference: number | null;
  readonly statementOpeningBalance: number | null;
  readonly glOpeningBalance: number | null;
  readonly openingLedgerItems: number | null;
  readonly openingBankItems: number | null;
  readonly sumOpeningAdjustments: number | null;
  readonly flags: readonly string[];
  readonly likelyCause: string | null;
  /** The posted gap bridge, if any. */
  readonly bridgeAdjustmentId: string | null;
}

export type ReadinessReason = 'NOT_BALANCED' | 'UNEXPLAINED_BANK' | 'UNEXPLAINED_LEDGER' | 'PROPOSALS_PENDING' | 'SELF_APPROVAL';

export interface ReconciliationReadiness {
  readonly canSubmit: boolean;
  readonly canApprove: boolean;
  readonly proposalsPending: boolean;
  readonly reasons: readonly string[];
  readonly countUnexplainedBank: number | null;
  readonly countUnexplainedLedger: number | null;
  readonly sumUnexplainedBank: number | null;
  readonly sumUnexplainedLedger: number | null;
}

export interface ReconciliationHeader {
  readonly reconciliationId: string;
  readonly glAccountId: string | null;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  readonly status: ReconciliationStatus | null;
  readonly statementId: string | null;
  readonly statementStartDate: string | null;
  readonly statementEndDate: string | null;
  readonly accountingPeriodCode: string | null;
  readonly periodState: string | null;
  readonly baselineDate: string | null;
  readonly baselineSetByThisStatement: boolean;
  readonly gapAcknowledgement: string | null;
  readonly preparer: string | null;
  readonly approver: string | null;
  readonly currency: string | null;
  readonly sourceKind: string | null;
  /** Sent back on every lifecycle transition; a stale one answers 409 OPTIMISTIC_LOCK. */
  readonly version: number;
}

/** `GET /reconciliations/{id}/review`: everything the workspace renders (§4.8). */
export interface ReconciliationReview {
  readonly header: ReconciliationHeader;
  readonly equation: ReconciliationEquation;
  readonly diagnostics: ReconciliationDiagnostics;
  readonly readiness: ReconciliationReadiness;
  readonly unexplainedBank: readonly ReviewBankRow[];
  readonly unexplainedLedger: readonly ReviewLedgerRow[];
  readonly lateArrivals: readonly ReviewBankRow[];
  readonly possibleDuplicates: readonly ReviewBankRow[];
  readonly proposedMatches: readonly ReconciliationMatch[];
  readonly brokenMatches: readonly ReconciliationMatch[];
  readonly agedItemsAwaitingReaffirmation: readonly OutstandingItem[];
  readonly matches: readonly ReconciliationMatch[];
  readonly outstandingItems: readonly OutstandingItem[];
  readonly exclusions: readonly ReviewBankRow[];
  readonly adjustmentsToClearing: readonly ClearingAdjustment[];
  readonly adjustments: readonly ReconciliationAdjustment[];
}

export interface ReconciliationAuditEntry {
  readonly auditLogId: string;
  readonly operation: string | null;
  readonly entityType: string | null;
  readonly userId: string | null;
  readonly timestamp: string | null;
  readonly justification: string | null;
}

/** The body of an adjustment (§3.5). `amount` is omitted for a residual settlement or a gap bridge. */
export interface AdjustmentInput {
  readonly type: AdjustmentType;
  readonly amount: number | null;
  readonly description: string | null;
  readonly justification: string | null;
  readonly transactionDate: string | null;
  readonly overrideJustification: string | null;
  readonly bankTransactionId: string | null;
  readonly settlesMatchId: string | null;
  readonly bridgesStatementId: string | null;
  readonly counterGlAccountId: string | null;
}

/** The diagnostics flag the review raises when the opening balances disagree (§4.8). */
export const OPENING_DIFFERENCE_FLAG = 'OPENING_DIFFERENCE';
