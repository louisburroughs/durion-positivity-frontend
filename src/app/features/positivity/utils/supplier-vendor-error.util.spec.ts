import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { REMIT_FIELD_PATH, VENDOR_FIELD_PATH, classifyVendorError } from './supplier-vendor-error.util';

const err = (status: number, body: unknown = null) => new HttpErrorResponse({ status, error: body });
const FALLBACK = 'POSITIVITY.VENDORS.ERROR.SAVE';

describe('classifyVendorError (story "Codes classified")', () => {
  it.each([
    [404, 'SUPPLIER_VENDOR_NOT_FOUND', 'NOT_FOUND', false],
    [422, 'SUPPLIER_VENDOR_NOT_FOUND', 'NOT_FOUND', false],
    [409, 'CONFLICT', 'STALE', true],
    [409, 'SUPPLIER_VENDOR_REMIT_CHANGE_PENDING', 'REMIT_PENDING', true],
    [409, 'SUPPLIER_VENDOR_REMIT_CHANGE_NOT_PENDING', 'REMIT_NOT_PENDING', true],
    [403, 'SUPPLIER_VENDOR_REMIT_SELF_APPROVAL', 'SELF_APPROVAL', false],
    [422, 'SUPPLIER_VENDOR_INACTIVE', 'INACTIVE', true],
    [404, 'SUPPLIER_VENDOR_TAX_REGISTRATION_NOT_FOUND', 'TAX_REGISTRATION_NOT_FOUND', true],
    [500, 'SUPPLIER_VENDOR_TAX_ID_UNREADABLE', 'TAX_ID_UNREADABLE', false],
  ])('%i %s → %s (re-read: %s)', (status, code, expected, reread) => {
    const failure = classifyVendorError(err(status, { code }), FALLBACK);
    expect(failure.code).toBe(expected);
    expect(failure.reread).toBe(reread);
  });

  it('puts SUPPLIER_VENDOR_NUMBER_TAKEN on the number field', () => {
    const failure = classifyVendorError(err(409, { code: 'SUPPLIER_VENDOR_NUMBER_TAKEN' }), FALLBACK);
    expect(failure.code).toBe('NUMBER_TAKEN');
    expect(failure.fieldErrors).toEqual({ vendorNumber: 'POSITIVITY.VENDORS.ERROR.NUMBER_TAKEN' });
  });

  it('puts JUSTIFICATION_REQUIRED on the reason', () => {
    const failure = classifyVendorError(err(400, { code: 'JUSTIFICATION_REQUIRED' }), FALLBACK);
    expect(failure.fieldErrors).toEqual({ reason: 'POSITIVITY.VENDORS.ERROR.FIELD.NOTE' });
  });

  it('maps VALIDATION_ERROR fieldErrors per field, including tax-registration paths, without the server text', () => {
    const failure = classifyVendorError(
      err(400, {
        code: 'VALIDATION_ERROR',
        fieldErrors: [
          { field: 'legalName', message: 'must not be blank' },
          { field: 'taxRegistrations[1].number', message: 'echo 12-3456789' },
          { field: 'remitTo.city', message: 'too long' },
          { field: 'mystery', message: 'x' },
        ],
      }),
      FALLBACK,
    );
    expect(failure.code).toBe('VALIDATION');
    expect(failure.message.key).toBe('POSITIVITY.VENDORS.ERROR.VALIDATION');
    expect(failure.fieldErrors).toEqual({
      legalName: 'POSITIVITY.VENDORS.ERROR.FIELD.LEGAL_NAME',
      'taxRegistrations[1].number': 'POSITIVITY.VENDORS.ERROR.FIELD.TAX_NUMBER',
      'remitTo.city': 'POSITIVITY.VENDORS.ERROR.FIELD.REMIT_TO',
      mystery: 'POSITIVITY.VENDORS.ERROR.FIELD.INVALID',
    });
    expect(JSON.stringify(failure)).not.toContain('12-3456789');
  });

  it('a 403 names the write permission when given one', () => {
    expect(classifyVendorError(err(403), FALLBACK, { writePermission: 'supplier:vendor:write' }).message).toEqual({
      key: 'POSITIVITY.VENDORS.ERROR.FORBIDDEN_WRITE',
      params: { permission: 'supplier:vendor:write' },
    });
    expect(classifyVendorError(err(403), FALLBACK).message.key).toBe('POSITIVITY.VENDORS.ERROR.FORBIDDEN');
  });

  it('a timeout or 5xx re-reads before a retry is offered', () => {
    expect(classifyVendorError(err(0), FALLBACK)).toMatchObject({ code: 'RETRYABLE', reread: true });
    expect(classifyVendorError(err(504), FALLBACK)).toMatchObject({ code: 'RETRYABLE', reread: true });
  });

  it('a read’s timeout uses its own message, never the write "couldn’t confirm" copy (review A3)', () => {
    expect(classifyVendorError(err(503), 'POSITIVITY.VENDORS.ERROR.LOAD_LIST').message).toEqual({ key: 'POSITIVITY.VENDORS.ERROR.LOAD_LIST' });
    expect(classifyVendorError(err(503), FALLBACK, { retryableKey: 'POSITIVITY.VENDORS.ERROR.RETRYABLE' }).message).toEqual({
      key: 'POSITIVITY.VENDORS.ERROR.RETRYABLE',
    });
  });

  it('a surface can name its own stale message (status dialog, review B10)', () => {
    expect(
      classifyVendorError(err(409, { code: 'CONFLICT' }), FALLBACK, { staleKey: 'POSITIVITY.VENDORS.ERROR.STALE_STATUS' }).message,
    ).toEqual({ key: 'POSITIVITY.VENDORS.ERROR.STALE_STATUS' });
  });

  describe('only paths the surface renders count (review B1)', () => {
    const dialog = { renders: (field: string) => field === 'reason' };

    it('VALIDATION_ERROR on reason marks the reason', () => {
      const failure = classifyVendorError(err(400, { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'reason', message: 'x' }] }), FALLBACK, dialog);
      expect(failure.message.key).toBe('POSITIVITY.VENDORS.ERROR.VALIDATION');
      expect(failure.fieldErrors).toEqual({ reason: 'POSITIVITY.VENDORS.ERROR.FIELD.NOTE' });
    });

    it('JUSTIFICATION_REQUIRED marks the reason, with a surface override', () => {
      const failure = classifyVendorError(err(400, { code: 'JUSTIFICATION_REQUIRED' }), FALLBACK, {
        ...dialog,
        fieldKeys: { reason: 'POSITIVITY.VENDORS.ERROR.FIELD.REVEAL_REASON' },
      });
      expect(failure.fieldErrors).toEqual({ reason: 'POSITIVITY.VENDORS.ERROR.FIELD.REVEAL_REASON' });
    });

    it('taxRegistrations[0].registrationId counts where the vendor fields render it', () => {
      const failure = classifyVendorError(
        err(400, { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'taxRegistrations[0].registrationId', message: 'x' }] }),
        FALLBACK,
        { renders: field => VENDOR_FIELD_PATH.test(field) },
      );
      expect(failure.fieldErrors).toEqual({ 'taxRegistrations[0].registrationId': 'POSITIVITY.VENDORS.ERROR.FIELD.TAX_REGISTRATION' });
    });

    it('an unrendered or unknown path falls back to the surface’s own message, with nothing marked', () => {
      const failure = classifyVendorError(
        err(400, { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'mystery', message: 'x' }, { field: 'legalName', message: 'x' }] }),
        FALLBACK,
        { renders: field => field === 'reason' || REMIT_FIELD_PATH.test(field) },
      );
      expect(failure.message).toEqual({ key: FALLBACK });
      expect(failure.fieldErrors).toEqual({});
    });
  });

  it('an unknown code falls back to the HTTP status', () => {
    expect(classifyVendorError(err(418, { code: 'TEAPOT' }), FALLBACK).message).toEqual({
      key: 'POSITIVITY.VENDORS.ERROR.STATUS',
      params: { status: 418 },
    });
    expect(classifyVendorError(new Error('boom'), FALLBACK).message).toEqual({ key: FALLBACK });
  });
});
