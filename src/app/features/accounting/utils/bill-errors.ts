import { HttpErrorResponse } from '@angular/common/http';
import { BILL_REASON_MIN, BillDecisionKind } from '../models/payables.models';
import { Copy, copy } from './bill-display';

/** The field a refusal marks, inside the form that sent it. */
export type BillErrorField = 'reason' | 'taxOnResale' | 'dueDate' | null;

/** A classified refusal of a bill decision (story item 12; ADR-0017 codes, never the status alone). */
export interface BillErrorView {
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
  const limit = context.clerkLimit !== null ? { param: 'limit', value: context.clerkLimit, currency: context.currency } : null;
  switch (failure.code) {
    case 'AP_BILL_NOT_APPROVABLE':
    case 'AP_MATCH_CANDIDATE_ALREADY_RESOLVED':
    case 'AP_BILL_AWAITING_INVOICE':
      return view(copy('ACCOUNTING.BILLS.ERROR.CHANGED'), { reread: true });
    case 'AP_APPROVAL_LIMIT_EXCEEDED':
      return view(
        limit ? copy('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED', { limit: '' }, limit) : copy('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED_NO_LIMIT'),
        { reread: true },
      );
    case 'AP_BILL_SELF_APPROVAL':
      return view(copy('ACCOUNTING.BILLS.ERROR.SELF_APPROVAL'), { reread: true });
    case 'JUSTIFICATION_REQUIRED':
      return view(copy('ACCOUNTING.BILLS.ERROR.JUSTIFICATION_REQUIRED', { min: BILL_REASON_MIN }), {
        field: failure.fields.includes(OVERRIDE_FIELD) ? 'taxOnResale' : 'reason',
      });
    case 'VALIDATION_ERROR':
    case 'ARGUMENT_NOT_VALID':
      if (failure.fields.includes(OVERRIDE_FIELD)) {
        return view(copy('ACCOUNTING.BILLS.ERROR.OVERRIDE_TOO_LONG'), { field: 'taxOnResale' });
      }
      if (failure.fields.includes(DUE_DATE_FIELD)) {
        return view(copy('ACCOUNTING.BILLS.ERROR.DUE_DATE_INVALID'), { field: 'dueDate' });
      }
      return view(copy('ACCOUNTING.BILLS.ERROR.VALIDATION'), { field: 'reason' });
    case 'FORBIDDEN':
      return view(copy('ACCOUNTING.BILLS.ERROR.FORBIDDEN', { permission: context.permission }), { reread: true });
    case 'VENDOR_BILL_NOT_FOUND':
    case 'AP_MATCH_CANDIDATE_NOT_FOUND':
      return view(copy('ACCOUNTING.BILLS.ERROR.NOT_FOUND'), { reread: true, notFound: failure.code === 'VENDOR_BILL_NOT_FOUND' });
    case 'AP_BILL_TAX_ON_RESALE_GOODS':
      // The hold applies (perhaps since the bill was read): the panel re-reads so its field shows.
      return view(copy('ACCOUNTING.BILLS.ERROR.TAX_ON_RESALE_GOODS'), { field: 'taxOnResale', reread: true });
    case 'SERVICE_UNAVAILABLE':
      return view(
        failure.retryAfter !== null
          ? copy('ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE_AFTER', { seconds: failure.retryAfter })
          : copy('ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE'),
      );
  }
  const taxConfiguration = failure.code ? TAX_CONFIGURATION_KEYS[failure.code] : undefined;
  if (taxConfiguration) return view(copy(taxConfiguration));
  // Unknown codes: today's HTTP-status fallback.
  if (failure.status === 403) return view(copy('ACCOUNTING.BILLS.ERROR.FORBIDDEN', { permission: context.permission }), { reread: true });
  if (failure.status === 404) return view(copy('ACCOUNTING.BILLS.ERROR.NOT_FOUND'), { reread: true, notFound: true });
  if (failure.status === 409) return view(copy('ACCOUNTING.BILLS.ERROR.CHANGED'), { reread: true });
  if (failure.status === 0 || failure.status >= 500) {
    // The decision may have landed: read what stands now.
    return view(copy('ACCOUNTING.BILLS.ERROR.UNKNOWN_OUTCOME'), { reread: true });
  }
  return view(copy('ACCOUNTING.BILLS.ERROR.OTHER'));
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
