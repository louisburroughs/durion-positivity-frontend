/**
 * Petty-expense categories behind Approval limits (CAP:550 S15 / S21,
 * SPEC-accounting-workspace §4.6, §5.5), as `@durion-sdk/accounting`
 * `AccountingPettyExpenseCategoriesService` serves them. Accounting owns the
 * categories and their accounts (AW18). Codes are permanent; categories are
 * turned off, never deleted; there is no "Other".
 *
 * S33 (#470) extends a category with its input-tax recovery (served by
 * `GET /v1/accounting/input-tax-recovery`, keyed by `code`), so nothing here
 * carries recovery fields.
 */

/** An expense account a category posts to. The id is never shown (P8). */
export interface PettyExpenseAccount {
  readonly glAccountId: string | null;
  /** Account number, shown in mono. */
  readonly accountCode: string | null;
  readonly accountName: string | null;
  /** First day it applies (`YYYY-MM-DD`). */
  readonly effectiveFrom: string | null;
}

export type PettyExpenseCategoryStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';

export type PettyExpenseChangeType = 'CREATE' | 'RELABEL' | 'DEACTIVATE' | 'REMAP' | 'UNKNOWN';

/**
 * One change of a category. The served actor is a login username and is never
 * shown (Accounting ruling Q4 on #464), so it is not kept; no role is served.
 */
export interface PettyExpenseCategoryChange {
  readonly changedAt: string;
  readonly changeType: PettyExpenseChangeType;
  /** Served text; untrusted. */
  readonly oldValue: string | null;
  readonly newValue: string | null;
  /** Untrusted text. */
  readonly justification: string;
}

export interface PettyExpenseCategory {
  /** The permanent code; never sent as a change. */
  readonly code: string;
  /** Untrusted text: the label the cashier sees. */
  readonly label: string;
  /** Untrusted text. */
  readonly examples: string | null;
  readonly status: PettyExpenseCategoryStatus;
  readonly currentAccount: PettyExpenseAccount | null;
  /** An account that takes over on a later date. */
  readonly laterAccount: PettyExpenseAccount | null;
  /** @serverGenerated The category's version, sent back on a relabel for the optimistic check. */
  readonly version: number | null;
  /** Every change, oldest first, as served. */
  readonly history: readonly PettyExpenseCategoryChange[];
}

/** An active expense account offered by the account picker. */
export interface ExpenseAccountOption {
  readonly glAccountId: string;
  readonly accountCode: string;
  readonly accountName: string;
}

export interface PettyExpenseCategoryCreate {
  readonly code: string;
  readonly label: string;
  readonly examples: string | null;
  readonly glAccountId: string;
  readonly justification: string;
  readonly requestId: string;
}

export interface PettyExpenseCategoryRelabel {
  readonly label: string;
  readonly examples: string | null;
  readonly version: number | null;
  readonly justification: string;
  readonly requestId: string;
}

export interface PettyExpenseCategoryDeactivate {
  readonly justification: string;
  readonly requestId: string;
}

export interface PettyExpenseCategoryRemap {
  readonly glAccountId: string;
  /** Local calendar day, `YYYY-MM-DD` (ADR-0038). */
  readonly effectiveFrom: string;
  readonly justification: string;
  readonly requestId: string;
}

/** "Why?" is at least this long (S15). */
export const CATEGORY_REASON_MIN = 10;
/** A code: 1 to 40 capital letters, digits and underscores (S15). */
export const CATEGORY_CODE_PATTERN = /^[A-Z0-9_]{1,40}$/;
export const CATEGORY_LABEL_MAX = 100;
export const CATEGORY_EXAMPLES_MAX = 500;
