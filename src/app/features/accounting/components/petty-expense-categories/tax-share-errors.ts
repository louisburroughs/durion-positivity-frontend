import { HttpErrorResponse } from '@angular/common/http';

/** The Change share fields a refusal can mark (the command's field names). */
export type ShareField = 'taxRecoverable' | 'recoverablePercent' | 'justification';

/** What the section does after a refused Change share. */
export type ShareFollowUp =
  /** Stay in the dialog with the input kept. */
  | 'STAY'
  /** Stay in the dialog; the row moved, so the section re-reads and the dialog takes the new version. */
  | 'REREAD'
  /** Recovery was switched off meanwhile: the dialog closes and the section re-reads (story item 5). */
  | 'CLOSE_AND_REREAD';

/** A classified Change share refusal (ADR-0017 codes, never the status alone). */
export interface ShareFailure {
  readonly key: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly fields: readonly ShareField[];
  readonly followUp: ShareFollowUp;
  /** The server holds this `requestId` for another body: the next send gets a new one. */
  readonly rotate: boolean;
}

const FIELDS: readonly ShareField[] = ['taxRecoverable', 'recoverablePercent', 'justification'];
const KEY = 'ACCOUNTING.APPROVAL_LIMITS.TAX_RECOVERY.SHARE.ERROR.';

const failure = (key: string, extra: Partial<ShareFailure> = {}): ShareFailure => ({
  key: KEY + key,
  params: {},
  fields: [],
  followUp: 'STAY',
  rotate: false,
  ...extra,
});

/**
 * Classifies a refused `setPettyExpenseCategoryTaxRecovery` (S32d item 4; story #470 "Service
 * contracts"):
 * - 400 `VALIDATION_ERROR` marks the fields it names, else says the values weren't accepted
 *   without pointing at a field;
 * - 409 `OPTIMISTIC_LOCK` and 404 re-read the row; 409 `IDEMPOTENCY_CONFLICT` rotates the key;
 * - 422 `INPUT_TAX_RECOVERY_NOT_ENABLED` closes the dialog and re-reads the section;
 * - 503 `SERVICE_UNAVAILABLE` is the server's "nothing was changed" (S32d), a definite answer;
 * - no answer, or any other 5xx, is an unknown outcome: Save again resends the same `requestId`,
 *   which the server never applies twice (§8.2).
 */
export function classifyShareError(error: unknown, permission: string): ShareFailure {
  if (!(error instanceof HttpErrorResponse)) return failure('UNKNOWN_OUTCOME');
  const body = (typeof error.error === 'object' && error.error !== null ? error.error : {}) as { code?: unknown; fieldErrors?: unknown };
  const code = typeof body.code === 'string' ? body.code : null;
  const named = Array.isArray(body.fieldErrors)
    ? body.fieldErrors
        .map(entry => (entry && typeof entry === 'object' ? (entry as { field?: unknown }).field : null))
        .filter((field): field is ShareField => typeof field === 'string' && (FIELDS as readonly string[]).includes(field))
        .filter((field, index, all) => all.indexOf(field) === index)
    : [];
  switch (code) {
    case 'VALIDATION_ERROR':
      return failure(named.length ? 'VALIDATION' : 'VALIDATION_UNNAMED', { fields: named });
    case 'OPTIMISTIC_LOCK':
      return failure('CHANGED', { followUp: 'REREAD' });
    case 'PETTY_EXPENSE_CATEGORY_NOT_FOUND':
      return failure('NOT_FOUND', { followUp: 'REREAD' });
    case 'IDEMPOTENCY_CONFLICT':
      return failure('IDEMPOTENCY', { rotate: true });
    case 'INPUT_TAX_RECOVERY_NOT_ENABLED':
      return failure('NOT_ENABLED', { followUp: 'CLOSE_AND_REREAD' });
    case 'SERVICE_UNAVAILABLE':
      return failure('UNAVAILABLE');
    case 'FORBIDDEN':
      return { ...failure('FORBIDDEN'), params: { permission } };
  }
  if (error.status === 403) return { ...failure('FORBIDDEN'), params: { permission } };
  if (error.status === 404) return failure('NOT_FOUND', { followUp: 'REREAD' });
  if (error.status === 409) return failure('CHANGED', { followUp: 'REREAD' });
  if (error.status === 0 || error.status >= 500) return failure('UNKNOWN_OUTCOME');
  return failure('OTHER', { fields: named });
}
