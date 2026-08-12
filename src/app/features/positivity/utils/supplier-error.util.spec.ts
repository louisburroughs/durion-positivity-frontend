/**
 * The contract's `FieldError` is `{ field, message }` with **no** `code` — the
 * regression these tests exist to stop is a filter that requires `code` and so
 * silently discards every real field error, making inline validation vanish.
 */
import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import type { FieldError } from '@durion-sdk/supplier';
import {
  fieldErrorKey,
  isForbidden,
  isSourceOfTruthConflict,
  mapSupplierError,
} from './supplier-error.util';
import { SupplierApiErrorBody, SupplierFieldError } from '../models/supplier-profile.models';

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('mapSupplierError — real contract shape (field + message, no code)', () => {
  it('maps a field error keyed off `field` alone', () => {
    // Typed as the generated FieldError to prove the shape is the real one.
    const contractError: FieldError = { field: 'authConfigName', message: 'must not be blank' };
    const body: SupplierApiErrorBody = { fieldErrors: [contractError] };

    const outcome = mapSupplierError(httpError(400, body), 'POSITIVITY.BINDINGS.ERROR.SAVE');

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(outcome.fieldErrors['authConfigName']).toBe(
      'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
    );
    expect(outcome.retryable).toBe(false);
  });

  it('does not drop field errors that carry no `code`', () => {
    const body: SupplierApiErrorBody = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fieldErrors: [
        { field: 'baseUrl', message: 'must be a valid URL' },
        { field: 'schedule', message: 'invalid cron expression' },
      ],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(Object.keys(outcome.fieldErrors)).toEqual(['baseUrl', 'schedule']);
    expect(outcome.fieldErrors['baseUrl']).toBe('POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED');
    expect(outcome.fieldErrors['schedule']).toBe('POSITIVITY.ERROR.FIELD.CRON_MALFORMED');
  });

  it('keeps the backend message as separate detail, never as the field label', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'accountNumber', message: 'Account number must not be blank' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    // The rendered label is a translation key…
    expect(outcome.fieldErrors['accountNumber']).toBe(
      'POSITIVITY.ERROR.FIELD.ACCOUNT_NUMBER_REQUIRED',
    );
    // …and the untranslated server text is kept apart from it.
    expect(outcome.fieldDetails['accountNumber']).toBe('Account number must not be blank');
    expect(Object.values(outcome.fieldErrors)).not.toContain('Account number must not be blank');
  });

  it('degrades an unrecognised field name to a generic translated message', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'somethingNewFromTheBackend', message: 'nope' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(outcome.fieldErrors['somethingNewFromTheBackend']).toBe(
      'POSITIVITY.ERROR.FIELD.INVALID',
    );
  });

  it('omits a detail entry when the backend sent no message', () => {
    const body: SupplierApiErrorBody = { fieldErrors: [{ field: 'baseUrl' }] };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(outcome.fieldErrors['baseUrl']).toBe('POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED');
    expect(outcome.fieldDetails['baseUrl']).toBeUndefined();
  });

  it('maps the delivery location field the contract actually names', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'deliveryLocationId', message: 'not a UUID' }],
    };

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors['deliveryLocationId'])
      .toBe('POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED');
  });

  it('ignores entries with no usable field', () => {
    const body = { fieldErrors: [{ message: 'orphan' }, null, { field: '' }] } as SupplierApiErrorBody;

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors).toEqual({});
  });

  it('tolerates a non-array fieldErrors value', () => {
    const body = { fieldErrors: 'nope' } as unknown as SupplierApiErrorBody;

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors).toEqual({});
  });
});

describe('mapSupplierError — legacy code-bearing shape (ApiBaseService PRICAT path)', () => {
  it('still honours an explicit machine code', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'authRef', code: 'BINDING_AUTH_REQUIRED' }],
    };

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors['authRef']).toBe(
      'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
    );
  });

  it('reads the legacy `errors` alias as well as `fieldErrors`', () => {
    const body: SupplierApiErrorBody = {
      errors: [{ field: 'locationId', code: 'LOCATION_UUID_MALFORMED' }],
    };

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors['locationId']).toBe(
      'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
    );
  });

  it('prefers an explicit code over the field-name mapping', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'baseUrl', code: 'CREDENTIAL_REFERENCE_MALFORMED' }],
    };

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors['baseUrl']).toBe(
      'POSITIVITY.ERROR.FIELD.CREDENTIAL_REFERENCE_MALFORMED',
    );
  });

  it('falls back by field name when the code is unknown', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'baseUrl', code: 'SOMETHING_NEW' }],
    };

    expect(mapSupplierError(httpError(400, body), 'FALLBACK').fieldErrors['baseUrl']).toBe(
      'POSITIVITY.ERROR.FIELD.BASE_URL_MALFORMED',
    );
  });
});

describe('mapSupplierError — status handling', () => {
  it('falls back to the caller key when a 400 carries no field errors', () => {
    const outcome = mapSupplierError(httpError(400, { message: 'bad' }), 'FALLBACK');

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('FALLBACK');
    expect(outcome.fieldErrors).toEqual({});
  });

  it('treats 422 like 400', () => {
    const body: SupplierApiErrorBody = { fieldErrors: [{ field: 'maxRetries', message: 'x' }] };

    expect(mapSupplierError(httpError(422, body), 'FALLBACK').kind).toBe('validation');
  });

  it('maps 403 to the forbidden kind without leaking the response body', () => {
    const outcome = mapSupplierError(
      httpError(403, { message: 'principal lacks supplier:audit:payload:read' }),
      'FALLBACK',
    );

    expect(outcome.kind).toBe('forbidden');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(outcome.fieldErrors).toEqual({});
    expect(outcome.fieldDetails).toEqual({});
  });

  it('maps 409 to its own conflict kind, distinct from a generic failure', () => {
    const outcome = mapSupplierError(httpError(409), 'FALLBACK');

    expect(outcome.kind).toBe('conflict');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(outcome.errorKey).not.toBe('FALLBACK');
    expect(outcome.retryable).toBe(false);
  });

  it('surfaces field errors carried on a 409', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'capability', message: 'already bound' }],
    };

    const outcome = mapSupplierError(httpError(409, body), 'FALLBACK');

    expect(outcome.fieldErrors['capability']).toBe(
      'POSITIVITY.ERROR.FIELD.UNKNOWN_CAPABILITY',
    );
    expect(outcome.fieldDetails['capability']).toBe('already bound');
  });

  it('marks 5xx as retryable', () => {
    const outcome = mapSupplierError(httpError(503), 'FALLBACK');

    expect(outcome.kind).toBe('retryable');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(outcome.retryable).toBe(true);
  });

  it('marks a transport failure (status 0) as retryable', () => {
    expect(mapSupplierError(httpError(0), 'FALLBACK').retryable).toBe(true);
  });

  it('falls back for a non-HTTP error', () => {
    const outcome = mapSupplierError(new Error('boom'), 'FALLBACK');

    expect(outcome.kind).toBe('unknown');
    expect(outcome.errorKey).toBe('FALLBACK');
  });

  it('ignores a non-object error body', () => {
    const error = new HttpErrorResponse({ status: 400, error: 'plain text' });

    expect(mapSupplierError(error, 'FALLBACK').fieldErrors).toEqual({});
  });
});

describe('fieldErrorKey', () => {
  it('keys off the field name for the contract shape', () => {
    const error: SupplierFieldError = { field: 'schedule', message: 'bad cron' };

    expect(fieldErrorKey(error)).toBe('POSITIVITY.ERROR.FIELD.CRON_MALFORMED');
  });

  it('returns the generic key for an unknown field with no code', () => {
    expect(fieldErrorKey({ field: 'nope' })).toBe('POSITIVITY.ERROR.FIELD.INVALID');
  });
});

describe('isForbidden', () => {
  it('is true only for a 403 HttpErrorResponse', () => {
    expect(isForbidden(httpError(403))).toBe(true);
    expect(isForbidden(httpError(500))).toBe(false);
    expect(isForbidden(new Error('x'))).toBe(false);
  });
});

describe('isSourceOfTruthConflict', () => {
  it('is true for a 409 on a YAML-managed profile', () => {
    expect(isSourceOfTruthConflict(httpError(409), true)).toBe(true);
  });

  it('is false for a 409 on an admin-managed profile — that is an ordinary conflict', () => {
    expect(isSourceOfTruthConflict(httpError(409), false)).toBe(false);
  });

  it('is false for any other status', () => {
    expect(isSourceOfTruthConflict(httpError(400), true)).toBe(false);
  });
});
