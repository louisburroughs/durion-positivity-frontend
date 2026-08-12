import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { fieldErrorKey, isForbidden, mapSupplierError } from './supplier-error.util';
import { SupplierApiErrorBody } from '../models/supplier-profile.models';

function httpError(status: number, body?: SupplierApiErrorBody): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error: body ?? null });
}

describe('mapSupplierError', () => {
  it('maps a 400 field error to the offending field with its translated key', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'authRef', code: 'BINDING_AUTH_REQUIRED' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'POSITIVITY.BINDINGS.ERROR.SAVE');

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(outcome.fieldErrors['authRef']).toBe(
      'POSITIVITY.ERROR.FIELD.BINDING_AUTH_REQUIRED',
    );
    expect(outcome.retryable).toBe(false);
  });

  it('maps a malformed cron 400 to the cronSchedule field', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'cronSchedule', code: 'CRON_MALFORMED' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(outcome.fieldErrors['cronSchedule']).toBe('POSITIVITY.ERROR.FIELD.CRON_MALFORMED');
  });

  it('maps a malformed location UUID 400 to the delivery locationId field', () => {
    const body: SupplierApiErrorBody = {
      errors: [{ field: 'locationId', code: 'LOCATION_UUID_MALFORMED' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(outcome.fieldErrors['locationId']).toBe(
      'POSITIVITY.ERROR.FIELD.LOCATION_UUID_MALFORMED',
    );
  });

  it('falls back to the caller key when a 400 carries no field errors', () => {
    const outcome = mapSupplierError(httpError(400, { message: 'bad' }), 'FALLBACK');

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('FALLBACK');
    expect(outcome.fieldErrors).toEqual({});
  });

  it('degrades an unknown backend field code to a generic translated message', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'baseUrl', code: 'SOMETHING_NEW_FROM_THE_BACKEND' }],
    };

    const outcome = mapSupplierError(httpError(400, body), 'FALLBACK');

    expect(outcome.fieldErrors['baseUrl']).toBe('POSITIVITY.ERROR.FIELD.INVALID');
  });

  it('maps 403 to the forbidden kind without leaking the response body', () => {
    const outcome = mapSupplierError(
      httpError(403, { message: 'principal lacks supplier:profile:write' }),
      'FALLBACK',
    );

    expect(outcome.kind).toBe('forbidden');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(outcome.fieldErrors).toEqual({});
  });

  it('maps a bare 409 to a duplicate capability binding on the capability field', () => {
    const outcome = mapSupplierError(httpError(409), 'FALLBACK');

    expect(outcome.kind).toBe('conflict');
    expect(outcome.errorKey).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(outcome.fieldErrors['capability']).toBe(
      'POSITIVITY.ERROR.FIELD.DUPLICATE_CAPABILITY_BINDING',
    );
  });

  it('honours explicit field errors on a 409', () => {
    const body: SupplierApiErrorBody = {
      fieldErrors: [{ field: 'authRef', code: 'AUTH_REF_DUPLICATE' }],
    };

    const outcome = mapSupplierError(httpError(409, body), 'FALLBACK');

    expect(outcome.fieldErrors['authRef']).toBe('POSITIVITY.ERROR.FIELD.AUTH_REF_DUPLICATE');
    expect(outcome.fieldErrors['capability']).toBeUndefined();
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
  it('returns the specific key for a known code', () => {
    expect(fieldErrorKey('DUPLICATE_CAPABILITY_BINDING')).toBe(
      'POSITIVITY.ERROR.FIELD.DUPLICATE_CAPABILITY_BINDING',
    );
  });

  it('returns the generic key for an unknown code', () => {
    expect(fieldErrorKey('NOPE')).toBe('POSITIVITY.ERROR.FIELD.INVALID');
  });
});

describe('isForbidden', () => {
  it('is true only for a 403 HttpErrorResponse', () => {
    expect(isForbidden(httpError(403))).toBe(true);
    expect(isForbidden(httpError(500))).toBe(false);
    expect(isForbidden(new Error('x'))).toBe(false);
  });
});
