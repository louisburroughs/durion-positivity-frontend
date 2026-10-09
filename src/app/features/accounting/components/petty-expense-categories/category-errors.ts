import { HttpErrorResponse } from '@angular/common/http';

/** The dialog fields a refusal can mark (the commands' field names). */
export type CategoryField = 'code' | 'label' | 'examples' | 'glAccountId' | 'effectiveFrom' | 'justification';

export type CategoryDialogMode = 'CREATE' | 'RELABEL' | 'DEACTIVATE' | 'REMAP';

/** A classified category refusal (ADR-0017 codes, never the status alone). */
export interface CategoryFailure {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** The field the refusal marks; the input is kept. */
  readonly field: CategoryField | null;
  /** The category moved under the dialog: the list and History re-read, the dialog explains. */
  readonly reread: boolean;
  /** The server holds this `requestId` for another body: the next send gets a new one. */
  readonly rotate: boolean;
}

const FIELDS: readonly CategoryField[] = ['code', 'label', 'examples', 'glAccountId', 'effectiveFrom', 'justification'];
const KEY = 'ACCOUNTING.APPROVAL_LIMITS.CATEGORIES.ERROR.';

const failure = (key: string, field: CategoryField | null = null, extra: Partial<CategoryFailure> = {}): CategoryFailure => ({
  key: KEY + key,
  params: {},
  field,
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
        .find((field): field is CategoryField => typeof field === 'string' && (FIELDS as readonly string[]).includes(field)) ?? null
    : null;
  switch (code) {
    case 'VALIDATION_ERROR':
      return failure('VALIDATION', named);
    case 'PETTY_EXPENSE_CATEGORY_EXISTS':
      return failure('EXISTS', 'code');
    case 'PETTY_EXPENSE_CATEGORY_NOT_ALLOWED':
      return failure('NOT_ALLOWED', 'code');
    case 'PETTY_EXPENSE_ACCOUNT_NOT_ELIGIBLE':
      return failure('ACCOUNT_NOT_ELIGIBLE', 'glAccountId');
    case 'PETTY_EXPENSE_ACCOUNT_CHANGE_BACKDATED':
      return failure('BACKDATED', 'effectiveFrom');
    case 'PETTY_EXPENSE_MAPPING_OVERLAP':
      return failure('OVERLAP', 'effectiveFrom');
    case 'PETTY_EXPENSE_CATEGORY_NOT_FOUND':
      return failure('NOT_FOUND', null, { reread: true });
    case 'VERSION_CONFLICT':
      return failure('VERSION_CONFLICT', null, { reread: true });
    case 'PETTY_EXPENSE_CATEGORY_INACTIVE':
      return failure('INACTIVE', null, { reread: true });
    case 'IDEMPOTENCY_CONFLICT':
      return failure('IDEMPOTENCY', null, { rotate: true });
    case 'FORBIDDEN':
      return { ...failure('FORBIDDEN'), params: { permission } };
  }
  if (error.status === 403) return { ...failure('FORBIDDEN'), params: { permission } };
  if (error.status === 404) return failure('NOT_FOUND', null, { reread: true });
  // The command may have landed: pressing again resends the same requestId, which the server never applies twice.
  if (error.status === 0 || error.status >= 500) return failure('UNKNOWN_OUTCOME');
  return failure('OTHER', named);
}
