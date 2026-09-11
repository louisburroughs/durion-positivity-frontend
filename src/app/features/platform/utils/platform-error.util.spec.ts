import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { mapPlatformError } from './platform-error.util';

function httpError(status: number, error: unknown = null): HttpErrorResponse {
  return new HttpErrorResponse({ status, statusText: 'x', error });
}

describe('mapPlatformError', () => {
  it('maps 400 with field errors to per-field keys and keeps backend text as detail', () => {
    const outcome = mapPlatformError(
      httpError(400, {
        code: 'VALIDATION_ERROR',
        fieldErrors: [
          { field: 'slug', message: 'must match ^[a-z0-9]...' },
          { field: 'initialAdminEmail', message: 'must be a well-formed email address' },
          { field: 'somethingElse', message: 'nope' },
        ],
      }),
      'PLATFORM.TENANTS.ERROR.CREATE',
    );

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('PLATFORM.ERROR.VALIDATION');
    expect(outcome.fieldErrors).toEqual({
      slug: 'PLATFORM.ERROR.FIELD.SLUG',
      initialAdminEmail: 'PLATFORM.ERROR.FIELD.INITIAL_ADMIN_EMAIL',
      somethingElse: 'PLATFORM.ERROR.FIELD.INVALID',
    });
    expect(outcome.fieldDetails['slug']).toBe('must match ^[a-z0-9]...');
    expect(outcome.retryable).toBe(false);
  });

  it('reads the RFC 9457 problem detail pos-tenant answers @Valid failures with', () => {
    // Exactly what TenantGlobalExceptionHandler (a ResponseEntityExceptionHandler)
    // produces for MethodArgumentNotValidException: no per-field list.
    const outcome = mapPlatformError(
      httpError(400, {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Invalid request content.',
        instance: '/v1/platform/tenants',
        correlationId: '01990000-0000-7000-8000-00000000d001',
      }),
      'PLATFORM.TENANTS.ERROR.CREATE',
    );

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('PLATFORM.ERROR.VALIDATION');
    expect(outcome.detail).toBe('Invalid request content.');
    expect(outcome.fieldErrors).toEqual({});
    expect(outcome.fieldDetails).toEqual({});
  });

  it('falls back to the surface key on a 400 ApiError without field errors, keeping its message as detail', () => {
    const outcome = mapPlatformError(
      httpError(400, { code: 'BAD_REQUEST', message: 'bad' }),
      'PLATFORM.TENANTS.ERROR.CREATE',
    );

    expect(outcome.kind).toBe('validation');
    expect(outcome.errorKey).toBe('PLATFORM.TENANTS.ERROR.CREATE');
    expect(outcome.detail).toBe('bad');
    expect(outcome.fieldErrors).toEqual({});
  });

  it('maps 403 to forbidden without reading the body', () => {
    const outcome = mapPlatformError(httpError(403, { message: 'PLATFORM_TENANT_REQUIRED' }), 'x');

    expect(outcome.kind).toBe('forbidden');
    expect(outcome.errorKey).toBe('PLATFORM.ERROR.FORBIDDEN');
    expect(outcome.detail).toBeNull();
  });

  it('carries the ApiError message of a 409 as detail beneath the translated key', () => {
    const outcome = mapPlatformError(
      httpError(409, { code: 'TENANT_SLUG_TAKEN', message: 'Slug acme-tire is already registered' }),
      'x',
      { conflictKey: 'PLATFORM.TENANTS.ERROR.SLUG_TAKEN' },
    );

    expect(outcome.errorKey).toBe('PLATFORM.TENANTS.ERROR.SLUG_TAKEN');
    expect(outcome.detail).toBe('Slug acme-tire is already registered');
  });

  it('maps 404 and 409 to the surface-specific keys when given, else the generic ones', () => {
    expect(mapPlatformError(httpError(404), 'x').errorKey).toBe('PLATFORM.ERROR.NOT_FOUND');
    expect(mapPlatformError(httpError(409), 'x').errorKey).toBe('PLATFORM.ERROR.CONFLICT');

    const scoped = mapPlatformError(httpError(409), 'x', {
      conflictKey: 'PLATFORM.TENANTS.ERROR.SLUG_TAKEN',
      notFoundKey: 'PLATFORM.TENANTS.ERROR.ACCOUNT_NOT_FOUND',
    });
    expect(scoped.kind).toBe('conflict');
    expect(scoped.errorKey).toBe('PLATFORM.TENANTS.ERROR.SLUG_TAKEN');
    expect(mapPlatformError(httpError(404), 'x', { notFoundKey: 'PLATFORM.TENANTS.ERROR.NOT_FOUND' }).errorKey).toBe(
      'PLATFORM.TENANTS.ERROR.NOT_FOUND',
    );
  });

  it('marks 5xx and network failures retryable', () => {
    for (const status of [0, 500, 502, 503]) {
      const outcome = mapPlatformError(httpError(status), 'x');
      expect(outcome.kind).toBe('retryable');
      expect(outcome.errorKey).toBe('PLATFORM.ERROR.RETRYABLE');
      expect(outcome.retryable).toBe(true);
    }
  });

  it('uses the fallback for non-HTTP errors and unmapped statuses', () => {
    expect(mapPlatformError(new Error('boom'), 'PLATFORM.TENANTS.ERROR.LOAD').errorKey).toBe(
      'PLATFORM.TENANTS.ERROR.LOAD',
    );
    expect(mapPlatformError(httpError(418), 'PLATFORM.TENANTS.ERROR.LOAD').kind).toBe('unknown');
  });
});
