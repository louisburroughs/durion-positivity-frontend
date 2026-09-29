/**
 * Accounting period close (CAP-054 / backend story B1).
 *
 * Periods are monthly and keyed by a `YYYY-MM` code (decision D-7). The
 * lifecycle has two states, OPEN and CLOSED; there is no soft close. A month
 * with no row reads as OPEN for posting, because periods are provisioned on
 * the first posting into a month, so the list can be missing months.
 */

/** `UNKNOWN` covers a row whose status the SDK left unset; it offers no action. */
export type AccountingPeriodStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface AccountingPeriod {
  readonly periodCode: string;
  /** First day of the period, a bare `YYYY-MM-DD`. */
  readonly startDate: string | null;
  /** Last day of the period (inclusive), a bare `YYYY-MM-DD`. */
  readonly endDate: string | null;
  readonly status: AccountingPeriodStatus;
  /** @serverGenerated */
  readonly closedAt: string | null;
  /** @serverGenerated — the acting username, or null when it is an opaque id. */
  readonly closedBy: string | null;
  /** @serverGenerated */
  readonly reopenedAt: string | null;
  /** @serverGenerated — the acting username, or null when it is an opaque id. */
  readonly reopenedBy: string | null;
  /** @serverGenerated */
  readonly reopenJustification: string | null;
}

/**
 * Why a close or reopen was refused. Each kind names one condition the
 * backend reported, so the page can say what happened and what to do next.
 */
export type PeriodActionFailure =
  /** 422 PERIOD_HAS_DRAFT_ENTRIES. `draftCount` is null when the body listed none. */
  | { readonly kind: 'DRAFT_ENTRIES'; readonly draftCount: number | null }
  /** 409 PERIOD_ALREADY_CLOSED: someone closed it first. */
  | { readonly kind: 'ALREADY_CLOSED' }
  /** 409 PERIOD_ALREADY_OPEN: someone reopened it first. */
  | { readonly kind: 'ALREADY_OPEN' }
  /** 404 PERIOD_NOT_FOUND: no row, and (on close) the month has not started. */
  | { readonly kind: 'NOT_FOUND' }
  /**
   * 422 PERIOD_BANK_RECONCILIATION_INCOMPLETE: the close policy refused the
   * close. `accountCount` counts the `fieldErrors[unreconciledGlAccountIds]`
   * entries, or is null when the body listed none.
   */
  | { readonly kind: 'BANK_RECONCILIATION_INCOMPLETE'; readonly accountCount: number | null }
  /** 403 PERIOD_CLOSE_EXCEPTION_NOT_PERMITTED: the exception needs `accounting:period:override`. */
  | { readonly kind: 'EXCEPTION_NOT_PERMITTED' }
  /** 400 JUSTIFICATION_REQUIRED: the exception justification is shorter than the server accepts. */
  | { readonly kind: 'JUSTIFICATION_REQUIRED' }
  /** 400: a malformed code, or a blank or oversized justification. */
  | { readonly kind: 'INVALID' }
  | { readonly kind: 'FORBIDDEN' }
  | { readonly kind: 'OTHER' };

/** The backend caps the reopen justification at 500 characters. */
export const REOPEN_JUSTIFICATION_MAX = 500;

/**
 * The backend refuses a bank-reconciliation exception justification shorter
 * than this (400 JUSTIFICATION_REQUIRED, decision D15). Hinted here; the
 * server stays authoritative.
 */
export const EXCEPTION_JUSTIFICATION_MIN = 10;

/**
 * Bank reconciliation close policy (SPEC-manual-bank-reconciliation §5.2).
 * `ADVISORY` reports every check but never blocks; `REQUIRED` blocks on any
 * BLOCKING check; `REQUIRED_WITH_EXCEPTION` blocks unless the close carries an
 * exception from a holder of `accounting:period:close` and `:override`.
 */
export type BankReconciliationClosePolicy = 'ADVISORY' | 'REQUIRED_WITH_EXCEPTION' | 'REQUIRED';

export type ReadinessSeverity = 'BLOCKING' | 'WARNING' | 'INFO';

/** One readiness check that fired (§5.3). `code` is kept as served, so an unknown code still renders. */
export interface ReadinessCheck {
  readonly code: string;
  readonly severity: ReadinessSeverity;
  /** What the check names: ids, frontier dates, balances, counts. Shape varies by `code`. */
  readonly references: Readonly<Record<string, unknown>>;
}

/** The readiness of one in-scope bank account. */
export interface ReadinessAccount {
  readonly glAccountId: string;
  readonly accountCode: string | null;
  readonly accountName: string | null;
  /** Baseline that applies at the period end, a bare `YYYY-MM-DD`; null before the first acknowledged statement. */
  readonly baselineDate: string | null;
  /** End date of the latest COMMITTED statement. */
  readonly coverageFrontier: string | null;
  /** End of the contiguous FINALIZED chain from the baseline. */
  readonly reconciledFrontier: string | null;
  readonly checks: readonly ReadinessCheck[];
}

/** Bank reconciliation close readiness of one period (§5.3). Every gate is served, never derived. */
export interface CloseReadiness {
  readonly periodCode: string;
  readonly policy: BankReconciliationClosePolicy | null;
  /** Whether the period may close under the policy without an exception. */
  readonly ready: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  /** Tenant-wide checks (`DRAFT_JOURNAL_ENTRIES`, `CLEARING_BALANCE_AGING`), outside any account. */
  readonly checks: readonly ReadinessCheck[];
  readonly accounts: readonly ReadinessAccount[];
}

/** The tenant's close policy as the page needs it (`GET /periods/bank-reconciliation-policy`). */
export interface BankReconciliationPolicy {
  readonly closePolicy: BankReconciliationClosePolicy | null;
  /** ISO 4217 functional currency readiness amounts are expressed in. */
  readonly currency: string | null;
}

const PERIOD_CODE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_SHAPED = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed `YYYY-MM` period code. */
export function isPeriodCode(value: string | null | undefined): value is string {
  return !!value && PERIOD_CODE.test(value);
}

/** The `YYYY-MM` code of the local calendar month containing `date` (ADR-0038). */
export function periodCodeOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The month before the one containing `today`, the usual month-end close target. */
export function previousPeriodCode(today: Date): string {
  return periodCodeOf(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

/**
 * True when the period's month has begun on the local calendar. The backend
 * provisions and closes a missing month only once it has started, and answers
 * 404 for a future one, so the page refuses a future month before asking.
 */
export function periodHasStarted(periodCode: string, today: Date): boolean {
  return isPeriodCode(periodCode) && periodCode <= periodCodeOf(today);
}

/** First local day of a period, for rendering its month through `DatePipe`. */
export function periodMonthStart(periodCode: string): Date {
  const [year, month] = periodCode.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

/**
 * The actor as display text, or null for an opaque identifier. The backend
 * records the principal's username, which is a raw UUID for some identity
 * providers, and a UUID is never rendered as a name (ADR-0064 §5).
 */
export function displayActor(actor: string | null | undefined): string | null {
  const trimmed = actor?.trim();
  return trimmed && !UUID_SHAPED.test(trimmed) ? trimmed : null;
}
