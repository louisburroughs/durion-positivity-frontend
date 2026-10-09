import { HttpErrorResponse } from '@angular/common/http';
import { BILL_REASON_MIN, BillDecisionKind } from '../models/payables.models';
import { Copy, copy } from './bill-display';

/** The field a refusal marks, inside the form that sent it. */
export type BillErrorField =
  | 'reason'
  | 'taxOnResale'
  | 'dueDate'
  | 'classification'
  | 'difference'
  | 'differenceReason'
  | 'override'
  | null;

/** Fields the posting block (classification, difference, period override) shows its own error for. */
export const POSTING_FIELDS: readonly BillErrorField[] = ['classification', 'difference', 'differenceReason', 'override'];

/** A classified refusal of a bill decision (story item 12; ADR-0017 codes, never the status alone). */
export interface BillErrorView {
  /** The served `ApiError.code`, when there was one. */
  readonly code: string | null;
  readonly message: Copy;
  readonly field: BillErrorField;
  /** The bill, the counts and the list are read again: the bill may have changed. */
  readonly reread: boolean;
  /** The bill is gone or invisible: the panel says so and offers the way back. */
  readonly notFound: boolean;
}

/** What the sentences need: the served limit and the write permission of the decision. */
export interface BillErrorContext {
  readonly clerkLimit: number | null;
  readonly currency: string | null;
  readonly permission: string;
  /** The session holds `accounting:period:override`: a closed month can be posted into with a reason. */
  readonly canOverride: boolean;
}

interface Failure {
  readonly status: number;
  readonly code: string | null;
  readonly fields: readonly string[];
  readonly retryAfter: number | null;
}

/** The S43 tax-quote refusals: a configuration to fix, never retried (ADR-0017 §2). */
const TAX_CONFIGURATION_KEYS: Readonly<Record<string, string>> = {
  TAX_JURISDICTION_NOT_CONFIGURED: 'ACCOUNTING.BILLS.ERROR.TAX_JURISDICTION_NOT_CONFIGURED',
  CURRENCY_NOT_SUPPORTED: 'ACCOUNTING.BILLS.ERROR.CURRENCY_NOT_SUPPORTED',
  TAX_CAPABILITY_UNSUPPORTED: 'ACCOUNTING.BILLS.ERROR.TAX_CAPABILITY_UNSUPPORTED',
};

const OVERRIDE_FIELD = 'taxOnResaleOverrideJustification';
const DUE_DATE_FIELD = 'dueDate';

function toFailure(error: unknown): Failure {
  if (!(error instanceof HttpErrorResponse)) return { status: 0, code: null, fields: [], retryAfter: null };
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as {
    code?: unknown;
    fieldErrors?: unknown;
  };
  const fields = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is string => typeof field === 'string')
    : [];
  const header = error.headers?.get('Retry-After') ?? null;
  const seconds = header !== null && /^\d+$/.test(header.trim()) ? Number(header.trim()) : null;
  return { status: error.status, code: typeof body.code === 'string' ? body.code : null, fields, retryAfter: seconds };
}

const view = (message: Copy, overrides: Partial<Omit<BillErrorView, 'message'>> = {}): BillErrorView => ({
  code: null,
  message,
  field: null,
  reread: false,
  notFound: false,
  ...overrides,
});

/**
 * Classifies a bill decision's refusal by its `ApiError.code` (story item 12,
 * S43, S32d). A 409, a 403 of the tier or creator rule, a 404 and an unknown
 * outcome re-read the bill, the counts and the list; a validation refusal
 * marks its field and keeps the input. An unknown code falls back to the
 * HTTP-status sentence.
 */
export function classifyBillError(error: unknown, context: BillErrorContext): BillErrorView {
  const failure = toFailure(error);
  const code = failure.code;
  const coded = (message: Copy, overrides: Partial<Omit<BillErrorView, 'message' | 'code'>> = {}): BillErrorView =>
    view(message, { ...overrides, code });
  const limit = context.clerkLimit !== null ? { param: 'limit', value: context.clerkLimit, currency: context.currency } : null;
  const named = (field: string): boolean => failure.fields.some(entry => entry === field || entry.startsWith(`${field}.`));
  switch (code) {
    case 'AP_BILL_NOT_APPROVABLE':
    case 'AP_MATCH_CANDIDATE_ALREADY_RESOLVED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.CHANGED'), { reread: true });
    case 'AP_BILL_AWAITING_INVOICE':
      return coded(copy('ACCOUNTING.BILLS.ERROR.AWAITING_INVOICE'), { reread: true });
    case 'AP_BILL_NOT_VOIDABLE':
      return coded(copy('ACCOUNTING.BILLS.ERROR.NOT_VOIDABLE'), { reread: true });
    case 'LOCK_TIMEOUT':
      // Someone else holds the bill: nothing was written; the input is kept and the same request can be sent again.
      return coded(copy('ACCOUNTING.BILLS.ERROR.LOCK_TIMEOUT'));
    case 'AP_APPROVAL_LIMIT_EXCEEDED':
      return coded(
        limit ? copy('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED', { limit: '' }, limit) : copy('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED_NO_LIMIT'),
        { reread: true },
      );
    case 'AP_BILL_SELF_APPROVAL':
      return coded(copy('ACCOUNTING.BILLS.ERROR.SELF_APPROVAL'), { reread: true });
    case 'AP_BILL_UNCLASSIFIED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.UNCLASSIFIED'), { field: 'classification' });
    case 'AP_BILL_TOTALS_UNRECONCILED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.TOTALS_UNRECONCILED'), { field: 'difference' });
    case 'JUSTIFICATION_REQUIRED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', { min: BILL_REASON_MIN }), {
        field: named(OVERRIDE_FIELD) ? 'taxOnResale' : named('difference') ? 'differenceReason' : named('overrideJustification') ? 'override' : 'reason',
      });
    case 'VALIDATION_ERROR':
    case 'ARGUMENT_NOT_VALID':
      if (named(OVERRIDE_FIELD)) return coded(copy('ACCOUNTING.BILLS.ERROR.OVERRIDE_TOO_LONG'), { field: 'taxOnResale' });
      if (named(DUE_DATE_FIELD)) return coded(copy('ACCOUNTING.BILLS.ERROR.DUE_DATE_INVALID'), { field: 'dueDate' });
      if (named('classification')) return coded(copy('ACCOUNTING.BILLS.ERROR.UNCLASSIFIED'), { field: 'classification' });
      if (named('difference.justification')) {
        return coded(copy('ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', { min: BILL_REASON_MIN }), { field: 'differenceReason' });
      }
      if (named('difference')) return coded(copy('ACCOUNTING.BILLS.ERROR.TOTALS_UNRECONCILED'), { field: 'difference' });
      return coded(copy('ACCOUNTING.BILLS.ERROR.VALIDATION'), { field: 'reason' });
    case 'PERIOD_CLOSED':
      return context.canOverride
        ? coded(copy('ACCOUNTING.BILLS.ERROR.PERIOD_CLOSED_OVERRIDE'), { field: 'override' })
        : coded(copy('ACCOUNTING.BILLS.ERROR.PERIOD_CLOSED'));
    case 'PERIOD_HARD_LOCKED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.PERIOD_HARD_LOCKED'));
    case 'GL_MAPPING_NOT_CONFIGURED':
      return coded(copy('ACCOUNTING.BILLS.ERROR.GL_MAPPING_NOT_CONFIGURED'));
    case 'AP_BILL_ZERO_TOTAL':
      return coded(copy('ACCOUNTING.BILLS.ERROR.ZERO_TOTAL'));
    case 'AP_BILL_TAX_SPLIT_MISMATCH':
    case 'AMOUNT_PRECISION_EXCEEDS_CURRENCY':
      return coded(copy('ACCOUNTING.BILLS.ERROR.FIGURES_DONT_ADD_UP'));
    case 'VENDOR_INACTIVE':
      return coded(copy('ACCOUNTING.BILLS.ERROR.VENDOR_INACTIVE'));
    case 'VENDOR_REPLICATION_PENDING':
      // Nothing was written: never "may have landed".
      return coded(
        failure.retryAfter !== null
          ? copy('ACCOUNTING.BILLS.ERROR.VENDOR_REPLICATION_PENDING_AFTER', { seconds: failure.retryAfter })
          : copy('ACCOUNTING.BILLS.ERROR.VENDOR_REPLICATION_PENDING'),
      );
    case 'FORBIDDEN':
      return coded(copy('ACCOUNTING.BILLS.ERROR.FORBIDDEN', { permission: context.permission }), { reread: true });
    case 'VENDOR_BILL_NOT_FOUND':
    case 'AP_MATCH_CANDIDATE_NOT_FOUND':
      return coded(copy('ACCOUNTING.BILLS.ERROR.NOT_FOUND'), { reread: true, notFound: code === 'VENDOR_BILL_NOT_FOUND' });
    case 'AP_BILL_TAX_ON_RESALE_GOODS':
      // The hold applies (perhaps since the bill was read): the panel re-reads, and the field shows from this failure too.
      return coded(copy('ACCOUNTING.BILLS.ERROR.TAX_ON_RESALE_GOODS'), { field: 'taxOnResale', reread: true });
    case 'SERVICE_UNAVAILABLE':
      return coded(
        failure.retryAfter !== null
          ? copy('ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE_AFTER', { seconds: failure.retryAfter })
          : copy('ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE'),
      );
  }
  const taxConfiguration = code ? TAX_CONFIGURATION_KEYS[code] : undefined;
  if (taxConfiguration) return coded(copy(taxConfiguration));
  // Unknown codes: today's HTTP-status fallback.
  if (failure.status === 403) return coded(copy('ACCOUNTING.BILLS.ERROR.FORBIDDEN', { permission: context.permission }), { reread: true });
  if (failure.status === 404) return coded(copy('ACCOUNTING.BILLS.ERROR.NOT_FOUND'), { reread: true, notFound: true });
  if (failure.status === 409) return coded(copy('ACCOUNTING.BILLS.ERROR.CHANGED'), { reread: true });
  if (failure.status === 0 || failure.status >= 500) {
    // The decision may have landed: read what stands now.
    return coded(copy('ACCOUNTING.BILLS.ERROR.UNKNOWN_OUTCOME'), { reread: true });
  }
  return coded(copy('ACCOUNTING.BILLS.ERROR.OTHER'));
}

/** A failed bill read: gone or invisible (404), refused (403) or otherwise unavailable. */
export function billReadFailure(error: unknown): 'NOT_FOUND' | 'FORBIDDEN' | 'FAILED' {
  const failure = toFailure(error);
  if (failure.status === 404 || failure.code === 'VENDOR_BILL_NOT_FOUND') return 'NOT_FOUND';
  if (failure.status === 403) return 'FORBIDDEN';
  return 'FAILED';
}

/** A decision's refusal, handed to the control that asked for it. */
export interface BillDecisionFailure {
  readonly kind: BillDecisionKind;
  readonly view: BillErrorView;
}
