/**
 * Supplier admin API error mapping.
 *
 * Pure functions — no Angular, no HTTP. Translates an `HttpErrorResponse` from
 * the supplier admin API into (a) the surface-level `errorKey` a page sets after
 * `state.set('error')` (ADR-0031), (b) per-field inline message keys for
 * save-time validation failures, and (c) the backend's own detail text, kept
 * strictly separate from (b).
 *
 * ── Contract ─────────────────────────────────────────────────────────────────
 * The generated `FieldError` is `{ field: string; message: string }`. **There is
 * no `code` on it** — `code` belongs to the enclosing `ApiError`. Field errors
 * are therefore keyed off `field`, and `message` is treated as backend *data*:
 * it may appear as secondary detail beside a translated label, never as the
 * label itself (ADR-0030). The legacy `code`-carrying shape is still honoured
 * because the PRICAT surface talks to an `ApiBaseService` endpoint that emits it.
 *
 * Status contract:
 *   400/422 → field-mapped validation errors
 *   403     → restricted state, rendered without leaking the response body
 *   409     → conflict; on a YAML-managed profile this is the source-of-truth lock
 *   5xx / 0 → retryable
 */
import { HttpErrorResponse } from '@angular/common/http';
import { SupplierApiErrorBody, SupplierFieldError } from '../models/supplier-profile.models';

export type SupplierErrorKind =
  | 'validation'
  | 'forbidden'
  | 'conflict'
  | 'retryable'
  | 'unknown';

export interface SupplierErrorOutcome {
  kind: SupplierErrorKind;
  /** Translation key for the banner announced via `role="alert"`. */
  errorKey: string;
  /** Payload field path → translation key for the inline field message. */
  fieldErrors: Record<string, string>;
  /**
   * Payload field path → the backend's own detail text.
   *
   * Untranslated server data. Render it only as secondary detail beneath the
   * translated label from `fieldErrors`; it is never a substitute for one.
   */
  fieldDetails: Record<string, string>;
  /** True when re-submitting the same payload is a sensible next action. */
  retryable: boolean;
}

/**
 * Payload field paths this UI renders a specific translated message for.
 *
 * Keyed off `field` because that is what the contract actually delivers. An
 * unlisted field degrades to a generic translated message rather than producing
 * a missing i18n key at runtime.
 */
const FIELD_NAME_KEYS: Readonly<Record<string, string>> = {
  supplierRef: 'POSITIVITY.ERROR.FIELD.SUPPLIER_REF',
  displayName: 'POSITIVITY.ERROR.FIELD.DISPLAY_NAME',
  name: 'POSITIVITY.ERROR.FIELD.AUTH_REF_REQUIRED',
  authRef: 'POSITIVITY.ERROR.FIELD.AUTH_REF_REQUIRED',
  authConfigName: 'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
  type: 'POSITIVITY.ERROR.FIELD.AUTH_TYPE',
  usernameRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  passwordRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  apiKeyRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  tokenUrlRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  clientIdRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  clientSecretRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  bearerTokenRef: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  accountNumber: 'POSITIVITY.ERROR.FIELD.ACCOUNT_NUMBER_REQUIRED',
  deliveryLocationId: 'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
  locationId: 'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
  role: 'POSITIVITY.ERROR.FIELD.ACCOUNT_ROLE',
  capability: 'POSITIVITY.ERROR.FIELD.UNKNOWN_CAPABILITY',
  protocolFamily: 'POSITIVITY.ERROR.FIELD.UNKNOWN_PROTOCOL_FAMILY',
  version: 'POSITIVITY.ERROR.FIELD.PROTOCOL_VERSION',
  protocolVersion: 'POSITIVITY.ERROR.FIELD.PROTOCOL_VERSION',
  baseUrl: 'POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED',
  schedule: 'POSITIVITY.ERROR.FIELD.CRON_MALFORMED',
  cronSchedule: 'POSITIVITY.ERROR.FIELD.CRON_MALFORMED',
  connectTimeoutMillis: 'POSITIVITY.ERROR.FIELD.TIMEOUT_INVALID',
  readTimeoutMillis: 'POSITIVITY.ERROR.FIELD.TIMEOUT_INVALID',
  maxRetries: 'POSITIVITY.ERROR.FIELD.MAX_RETRIES_INVALID',
  sandboxBaseUrlOverride: 'POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED',
};

/**
 * Legacy machine codes, still emitted on the `ApiBaseService` PRICAT path.
 * Consulted before `FIELD_NAME_KEYS` so an explicit code stays authoritative.
 */
const FIELD_CODE_KEYS: Readonly<Record<string, string>> = {
  BINDING_AUTH_REQUIRED: 'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
  CRON_MALFORMED: 'POSITIVITY.ERROR.FIELD.CRON_MALFORMED',
  DUPLICATE_CAPABILITY_BINDING: 'POSITIVITY.ERROR.FIELD.DUPLICATE_CAPABILITY_BINDING',
  LOCATION_UUID_MALFORMED: 'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
  ACCOUNT_NUMBER_REQUIRED: 'POSITIVITY.ERROR.FIELD.ACCOUNT_NUMBER_REQUIRED',
  AUTH_REF_REQUIRED: 'POSITIVITY.ERROR.FIELD.AUTH_REF_REQUIRED',
  AUTH_REF_DUPLICATE: 'POSITIVITY.ERROR.FIELD.AUTH_REF_DUPLICATE',
  CREDENTIAL_REFERENCE_MALFORMED: 'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
  BASE_URL_MALFORMED: 'POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED',
  PROFILE_YAML_MANAGED: 'POSITIVITY.ERROR.FIELD.PROFILE_YAML_MANAGED',
};

const GENERIC_FIELD_KEY = 'POSITIVITY.ERROR.FIELD.INVALID';

function asErrorBody(error: HttpErrorResponse): SupplierApiErrorBody | null {
  const body: unknown = error.error;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  return body as SupplierApiErrorBody;
}

/**
 * Field errors from either envelope shape.
 *
 * The only requirement is a usable `field`: the contract guarantees one and
 * carries no `code`, so demanding a `code` here would silently discard every
 * real field error and make inline validation disappear.
 */
function collectFieldErrors(body: SupplierApiErrorBody | null): SupplierFieldError[] {
  if (!body) {
    return [];
  }
  const raw = body.fieldErrors ?? body.errors ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (item): item is SupplierFieldError =>
      !!item && typeof item === 'object' && typeof item.field === 'string' && item.field !== '',
  );
}

/** Translation key for one field error: explicit legacy code first, then field name. */
export function fieldErrorKey(error: SupplierFieldError): string {
  if (error.code && FIELD_CODE_KEYS[error.code]) {
    return FIELD_CODE_KEYS[error.code];
  }
  return FIELD_NAME_KEYS[error.field] ?? GENERIC_FIELD_KEY;
}

/** Index a field-error list into the translated-key and backend-detail maps. */
function indexFieldErrors(entries: SupplierFieldError[]): {
  fieldErrors: Record<string, string>;
  fieldDetails: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const fieldDetails: Record<string, string> = {};
  for (const item of entries) {
    fieldErrors[item.field] = fieldErrorKey(item);
    if (typeof item.message === 'string' && item.message !== '') {
      fieldDetails[item.field] = item.message;
    }
  }
  return { fieldErrors, fieldDetails };
}

/**
 * Map an API failure to a UI outcome.
 *
 * @param error         the caught error (an `HttpErrorResponse` in practice)
 * @param fallbackKey   surface-specific key used when no better mapping applies
 */
export function mapSupplierError(error: unknown, fallbackKey: string): SupplierErrorOutcome {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      kind: 'unknown',
      errorKey: fallbackKey,
      fieldErrors: {},
      fieldDetails: {},
      retryable: false,
    };
  }

  const body = asErrorBody(error);

  if (error.status === 400 || error.status === 422) {
    const entries = collectFieldErrors(body);
    const { fieldErrors, fieldDetails } = indexFieldErrors(entries);
    return {
      kind: 'validation',
      errorKey: entries.length > 0 ? 'POSITIVITY.ERROR.VALIDATION' : fallbackKey,
      fieldErrors,
      fieldDetails,
      retryable: false,
    };
  }

  if (error.status === 403) {
    return {
      kind: 'forbidden',
      errorKey: 'POSITIVITY.ERROR.FORBIDDEN',
      fieldErrors: {},
      fieldDetails: {},
      retryable: false,
    };
  }

  if (error.status === 409) {
    const entries = collectFieldErrors(body);
    const { fieldErrors, fieldDetails } = indexFieldErrors(entries);
    return {
      kind: 'conflict',
      errorKey: 'POSITIVITY.ERROR.CONFLICT',
      fieldErrors,
      fieldDetails,
      retryable: false,
    };
  }

  if (error.status >= 500 || error.status === 0) {
    return {
      kind: 'retryable',
      errorKey: 'POSITIVITY.ERROR.RETRYABLE',
      fieldErrors: {},
      fieldDetails: {},
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    errorKey: fallbackKey,
    fieldErrors: {},
    fieldDetails: {},
    retryable: false,
  };
}

/** True when the failure is specifically an authorization denial. */
export function isForbidden(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403;
}

/**
 * True when the failure is the source-of-truth lock (ADR-0050 §6).
 *
 * A YAML-managed profile rejects **every** mutation with `409`. The caller knows
 * the profile's source locally, so this needs no guess at a backend error code.
 */
export function isSourceOfTruthConflict(error: unknown, yamlManaged: boolean): boolean {
  return yamlManaged && error instanceof HttpErrorResponse && error.status === 409;
}
