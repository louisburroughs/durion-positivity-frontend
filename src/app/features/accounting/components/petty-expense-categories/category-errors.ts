import { HttpErrorResponse } from '@angular/common/http';

/** The dialog fields a refusal can mark (the commands' field names). */
export type CategoryField = 'code' | 'label' | 'examples' | 'glAccountId' | 'effectiveFrom' | 'justification';

export type CategoryDialogMode = 'CREATE' | 'RELABEL' | 'DEACTIVATE' | 'REMAP';

/** A classified category refusal (ADR-0017 codes, never the status alone). */
export interface CategoryFailure {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** The fields the refusal marks; the input is kept. */
  readonly fields: readonly CategoryField[];
  /** The category moved under the dialog: the list and History re-read, the dialog explains. */
  readonly reread: boolean;
  /** The server holds this `requestId` for another body: the next send gets a new one. */
  readonly rotate: boolean;
}

const FIELDS: readonly CategoryField[] = ['code', 'label', 'examples', 'glAccountId', 'effectiveFrom', 'justification'];
const KEY = 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.';

const failure = (key: string, fields: readonly CategoryField[] = [], extra: Partial<CategoryFailure> = {}): CategoryFailure => ({
  key: KEY + key,
  params: {},
  fields,
  reread: false,
  rotate: false,
  ...extra,
});

/**
 * Classifies a refused category command (S15 codes; story #466 "Service
 * contracts"). A 404, a version conflict or an already-inactive category
 * re-reads; a field refusal marks the field and keeps the input; an unknown
 * outcome keeps the `requestId`, so pressing again is never applied twice (§8.2).
 */
export function classifyCategoryError(error: unknown, permission: string): CategoryFailure {
  if (!(error instanceof HttpErrorResponse)) return failure('UNKNOWN_OUTCOME');
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as { code?: unknown; fieldErrors?: unknown };
  const code = typeof body.code === 'string' ? body.code : null;
  const named = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is CategoryField => typeof field === 'string' && (FIELDS as readonly string[]).includes(field))
        .filter((field, index, all) => all.indexOf(field) === index)
    : [];
  switch (code) {
    case 'VALIDATION_ERROR':
      // "Check the highlighted fields" only when the refusal names one (ADR-0017 fieldErrors).
      return failure(named.length ? 'VALIDATION' : 'VALIDATION_UNNAMED', named);
    case 'PETTY_EXPENSE_CATEGORY_EXISTS':
      return failure('EXISTS', ['code']);
    case 'PETTY_EXPENSE_CATEGORY_NOT_ALLOWED':
      return failure('NOT_ALLOWED', ['code']);
    case 'PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE':
      return failure('ACCOUNT_NOT_ELIGIBLE', ['glAccountId']);
    case 'PETTY_EXPENSE_ACCOUNT_CHANGE_BACKDATED':
      return failure('BACKDATED', ['effectiveFrom']);
    case 'PETTY_EXPENSE_MAPPING_OVERLAP':
      return failure('OVERLAP', ['effectiveFrom']);
    case 'PETTY_EXPENSE_CATEGORY_NOT_FOUND':
      return failure('NOT_FOUND', [], { reread: true });
    case 'VERSION_CONFLICT':
      return failure('VERSION_CONFLICT', [], { reread: true });
    case 'PETTY_EXPENSE_CATEGORY_INACTIVE':
      return failure('INACTIVE', [], { reread: true });
    case 'IDEMPOTENCY_CONFLICT':
      return failure('IDEMPOTENCY', [], { rotate: true });
    case 'FORBIDDEN':
      return { ...failure('FORBIDDEN'), params: { permission } };
  }
  if (error.status === 403) return { ...failure('FORBIDDEN'), params: { permission } };
  if (error.status === 404) return failure('NOT_FOUND', [], { reread: true });
  // The command may have landed: pressing again resends the same requestId, which the server never applies twice.
  if (error.status === 0 || error.status >= 500) return failure('UNKNOWN_OUTCOME');
  return failure('OTHER', named);
}
