/**
 * Supplier admin API error mapping.
 *
 * Pure functions — no Angular, no HTTP. Translates an `HttpErrorResponse` from
 * the supplier admin API into (a) the surface-level `errorKey` a page sets after
 * `state.set('error')` (ADR-0031) and (b) per-field inline message keys for
 * save-time validation failures.
 *
 * Status contract coded against (issue #188 §6):
 *   400 → field-mapped validation errors
 *   403 → restricted state, rendered without leaking data
 *   409 → duplicate capability binding
 *   5xx / 0 → retryable
 *
 * Backend field codes are matched against an explicit allowlist so an unknown
 * code degrades to a generic translated message instead of producing a missing
 * i18n key at runtime.
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
  /** True when re-submitting the same payload is a sensible next action. */
  retryable: boolean;
}

/** Backend field codes this UI renders a specific message for. */
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

function collectFieldErrors(body: SupplierApiErrorBody | null): SupplierFieldError[] {
  if (!body) {
    return [];
  }
  const raw = body.fieldErrors ?? body.errors ?? [];
  return raw.filter(
    (item): item is SupplierFieldError =>
      !!item && typeof item.field === 'string' && typeof item.code === 'string',
  );
}

/** Translation key for a single backend field code. */
export function fieldErrorKey(code: string): string {
  return FIELD_CODE_KEYS[code] ?? GENERIC_FIELD_KEY;
}

/**
 * Map an API failure to a UI outcome.
 *
 * @param error         the caught error (an `HttpErrorResponse` in practice)
 * @param fallbackKey   surface-specific key used when no better mapping applies
 */
export function mapSupplierError(error: unknown, fallbackKey: string): SupplierErrorOutcome {
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'unknown', errorKey: fallbackKey, fieldErrors: {}, retryable: false };
  }

  const body = asErrorBody(error);

  if (error.status === 400 || error.status === 422) {
    const entries = collectFieldErrors(body);
    const fieldErrors: Record<string, string> = {};
    for (const item of entries) {
      fieldErrors[item.field] = fieldErrorKey(item.code);
    }
    return {
      kind: 'validation',
      errorKey:
        entries.length > 0
          ? 'POSITIVITY.ERROR.VALIDATION'
          : fallbackKey,
      fieldErrors,
      retryable: false,
    };
  }

  if (error.status === 403) {
    return {
      kind: 'forbidden',
      errorKey: 'POSITIVITY.ERROR.FORBIDDEN',
      fieldErrors: {},
      retryable: false,
    };
  }

  if (error.status === 409) {
    const entries = collectFieldErrors(body);
    const fieldErrors: Record<string, string> = {};
    for (const item of entries) {
      fieldErrors[item.field] = fieldErrorKey(item.code);
    }
    if (entries.length === 0) {
      fieldErrors['capability'] = FIELD_CODE_KEYS['DUPLICATE_CAPABILITY_BINDING'];
    }
    return {
      kind: 'conflict',
      errorKey: 'POSITIVITY.ERROR.CONFLICT',
      fieldErrors,
      retryable: false,
    };
  }

  if (error.status >= 500 || error.status === 0) {
    return {
      kind: 'retryable',
      errorKey: 'POSITIVITY.ERROR.RETRYABLE',
      fieldErrors: {},
      retryable: true,
    };
  }

  return { kind: 'unknown', errorKey: fallbackKey, fieldErrors: {}, retryable: false };
}

/** True when the failure is specifically an authorization denial. */
export function isForbidden(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403;
}
