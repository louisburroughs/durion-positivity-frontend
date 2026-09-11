/**
 * Platform tenant-registry API error mapping.
 *
 * Pure functions — no Angular, no HTTP. Turns an `HttpErrorResponse` from
 * pos-tenant into the `errorKey` a page sets right after `state.set('error')`
 * (ADR-0031), plus per-field inline message keys for validation failures and
 * the backend's own detail text, kept apart from the translated label
 * (ADR-0030).
 *
 * Status contract (pos-tenant `PlatformTenantController`):
 *   400/422 → field-mapped validation errors
 *   403     → not a platform-tenant session, or the authority is missing
 *   404     → tenant or account unknown
 *   409     → lifecycle conflict (slug taken, wrong status for the transition)
 *   5xx / 0 → retryable
 */
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformApiErrorBody, PlatformFieldError } from '../models/tenant.models';

export type PlatformErrorKind =
  | 'validation'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'retryable'
  | 'unknown';

export interface PlatformErrorOutcome {
  kind: PlatformErrorKind;
  /** Translation key for the banner announced via `role="alert"`. */
  errorKey: string;
  /** Payload field → translation key for the inline field message. */
  fieldErrors: Record<string, string>;
  /** Payload field → the backend's own detail text (server data, secondary only). */
  fieldDetails: Record<string, string>;
  /** True when re-submitting the same payload is a sensible next action. */
  retryable: boolean;
}

/** Surface-specific keys for the statuses whose meaning depends on the call. */
export interface PlatformErrorKeys {
  /** 409 — e.g. "slug already taken" on create, "not ACTIVE" on suspend. */
  conflictKey?: string;
  /** 404 — e.g. "account not found" on create, "tenant not found" on read. */
  notFoundKey?: string;
}

const FIELD_NAME_KEYS: Readonly<Record<string, string>> = {
  slug: 'PLATFORM.ERROR.FIELD.SLUG',
  displayName: 'PLATFORM.ERROR.FIELD.DISPLAY_NAME',
  accountId: 'PLATFORM.ERROR.FIELD.ACCOUNT_ID',
  cell: 'PLATFORM.ERROR.FIELD.CELL',
  initialAdminEmail: 'PLATFORM.ERROR.FIELD.INITIAL_ADMIN_EMAIL',
};

const GENERIC_FIELD_KEY = 'PLATFORM.ERROR.FIELD.INVALID';

function asErrorBody(error: HttpErrorResponse): PlatformApiErrorBody | null {
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as PlatformApiErrorBody;
}

function collectFieldErrors(body: PlatformApiErrorBody | null): PlatformFieldError[] {
  const raw = body?.fieldErrors;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is PlatformFieldError =>
      !!item && typeof item === 'object' && typeof item.field === 'string' && item.field !== '',
  );
}

function indexFieldErrors(entries: PlatformFieldError[]): {
  fieldErrors: Record<string, string>;
  fieldDetails: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const fieldDetails: Record<string, string> = {};
  for (const item of entries) {
    fieldErrors[item.field] = FIELD_NAME_KEYS[item.field] ?? GENERIC_FIELD_KEY;
    if (typeof item.message === 'string' && item.message !== '') {
      fieldDetails[item.field] = item.message;
    }
  }
  return { fieldErrors, fieldDetails };
}

function outcome(
  kind: PlatformErrorKind,
  errorKey: string,
  retryable = false,
  fields: { fieldErrors: Record<string, string>; fieldDetails: Record<string, string> } = {
    fieldErrors: {},
    fieldDetails: {},
  },
): PlatformErrorOutcome {
  return { kind, errorKey, retryable, ...fields };
}

/**
 * Map an API failure to a UI outcome.
 *
 * @param error        the caught error (an `HttpErrorResponse` in practice)
 * @param fallbackKey  surface-specific key used when no better mapping applies
 * @param keys         surface-specific keys for 404 and 409
 */
export function mapPlatformError(
  error: unknown,
  fallbackKey: string,
  keys: PlatformErrorKeys = {},
): PlatformErrorOutcome {
  if (!(error instanceof HttpErrorResponse)) {
    return outcome('unknown', fallbackKey);
  }

  const body = asErrorBody(error);

  if (error.status === 400 || error.status === 422) {
    const entries = collectFieldErrors(body);
    return outcome(
      'validation',
      entries.length > 0 ? 'PLATFORM.ERROR.VALIDATION' : fallbackKey,
      false,
      indexFieldErrors(entries),
    );
  }

  if (error.status === 403) {
    return outcome('forbidden', 'PLATFORM.ERROR.FORBIDDEN');
  }

  if (error.status === 404) {
    return outcome('notFound', keys.notFoundKey ?? 'PLATFORM.ERROR.NOT_FOUND');
  }

  if (error.status === 409) {
    return outcome('conflict', keys.conflictKey ?? 'PLATFORM.ERROR.CONFLICT');
  }

  if (error.status >= 500 || error.status === 0) {
    return outcome('retryable', 'PLATFORM.ERROR.RETRYABLE', true);
  }

  return outcome('unknown', fallbackKey);
}
