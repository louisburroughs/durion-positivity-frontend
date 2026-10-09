import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../assets/i18n/en-US.json';
import { apiError } from '../pages/bills/bills-page.spec-helper';
import { BillErrorContext, billReadFailure, classifyBillError } from './bill-errors';

function en(key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enUS);
  return typeof value === 'string' ? value : undefined;
}

const context: BillErrorContext = { clerkLimit: 2500, currency: 'USD', permission: 'accounting:ap:approve' };

/** The story's classification table (item 12) plus S43 and the HTTP-status fallback. */
describe('classifyBillError', () => {
  it.each([
    ['AP_BILL_NOT_APPROVABLE', 409, 'This bill changed — showing its current state.'],
    ['AP_MATCH_CANDIDATE_ALREADY_RESOLVED', 409, 'This bill changed — showing its current state.'],
  ])('%s shows "this bill changed" and re-reads', (code, status, text) => {
    const view = classifyBillError(apiError(status, code), context);
    expect(en(view.message.key)).toBe(text);
    expect(view.reread).toBe(true);
  });

  it('AP_APPROVAL_LIMIT_EXCEEDED names the served limit and re-reads (AC 3)', () => {
    const view = classifyBillError(apiError(403, 'AP_APPROVAL_LIMIT_EXCEEDED'), context);
    expect(en(view.message.key)).toContain('{{limit}} clerk limit');
    expect(view.message.money).toEqual({ param: 'limit', value: 2500, currency: 'USD' });
    expect(view.reread).toBe(true);
  });

  it('AP_BILL_SELF_APPROVAL shows the self-approval sentence', () => {
    expect(en(classifyBillError(apiError(403, 'AP_BILL_SELF_APPROVAL'), context).message.key)).toBe('You can’t approve a bill you created.');
  });

  it('JUSTIFICATION_REQUIRED marks the reason field, or the override field when named', () => {
    expect(classifyBillError(apiError(400, 'JUSTIFICATION_REQUIRED'), context).field).toBe('reason');
    expect(
      classifyBillError(apiError(400, 'JUSTIFICATION_REQUIRED', [{ field: 'taxOnResaleOverrideJustification', message: 'x' }]), context).field,
    ).toBe('taxOnResale');
  });

  it('VALIDATION_ERROR over 1000 characters marks the override field (S43)', () => {
    const view = classifyBillError(apiError(400, 'VALIDATION_ERROR', [{ field: 'taxOnResaleOverrideJustification', message: 'too long' }]), context);
    expect(view.field).toBe('taxOnResale');
    expect(view.reread).toBe(false);
  });

  it('FORBIDDEN names the write permission', () => {
    const view = classifyBillError(apiError(403, 'FORBIDDEN'), context);
    expect(view.message.params).toEqual({ permission: 'accounting:ap:approve' });
    expect(en(view.message.key)).toContain('{{permission}}');
  });

  it('VENDOR_BILL_NOT_FOUND says the bill no longer exists', () => {
    const view = classifyBillError(apiError(404, 'VENDOR_BILL_NOT_FOUND'), context);
    expect(en(view.message.key)).toBe('This bill no longer exists.');
    expect(view.notFound).toBe(true);
  });

  it('AP_BILL_TAX_ON_RESALE_GOODS marks the override field and re-reads so it shows', () => {
    const view = classifyBillError(apiError(422, 'AP_BILL_TAX_ON_RESALE_GOODS'), context);
    expect(view.field).toBe('taxOnResale');
    expect(view.reread).toBe(true);
  });

  it.each(['TAX_JURISDICTION_NOT_CONFIGURED', 'CURRENCY_NOT_SUPPORTED', 'TAX_CAPABILITY_UNSUPPORTED'])(
    '%s is a configuration to fix: its own sentence, says retrying won’t help, no re-read',
    code => {
      const view = classifyBillError(apiError(422, code), context);
      expect(view.message.key).toBe(`ACCOUNTING.BILLS.ERROR.${code}`);
      expect(en(view.message.key)).toContain('trying again won’t help');
      expect(view.reread).toBe(false);
    },
  );

  it('SERVICE_UNAVAILABLE reads Retry-After when served', () => {
    const after = classifyBillError(apiError(503, 'SERVICE_UNAVAILABLE', [], { 'Retry-After': '30' }), context);
    expect(after.message).toMatchObject({ key: 'ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE_AFTER', params: { seconds: 30 } });
    const plain = classifyBillError(apiError(503, 'SERVICE_UNAVAILABLE'), context);
    expect(plain.message.key).toBe('ACCOUNTING.BILLS.ERROR.SERVICE_UNAVAILABLE');
  });

  it('falls back on the HTTP status for an unknown code', () => {
    expect(classifyBillError(apiError(409, 'SOMETHING_NEW'), context).reread).toBe(true);
    expect(classifyBillError(apiError(500, 'SOMETHING_NEW'), context).message.key).toBe('ACCOUNTING.BILLS.ERROR.UNKNOWN_OUTCOME');
    expect(classifyBillError(new HttpErrorResponse({ status: 0 }), context).reread).toBe(true);
    expect(classifyBillError(apiError(422, 'SOMETHING_NEW'), context).message.key).toBe('ACCOUNTING.BILLS.ERROR.OTHER');
  });

  it('never classifies by status alone where a code is known: 403 FORBIDDEN vs the tier rule', () => {
    expect(classifyBillError(apiError(403, 'FORBIDDEN'), context).message.key).toBe('ACCOUNTING.BILLS.ERROR.FORBIDDEN');
    expect(classifyBillError(apiError(403, 'AP_APPROVAL_LIMIT_EXCEEDED'), context).message.key).toBe('ACCOUNTING.BILLS.ERROR.LIMIT_EXCEEDED');
  });
});

describe('billReadFailure', () => {
  it('splits a gone bill, a refusal and anything else', () => {
    expect(billReadFailure(apiError(404, 'VENDOR_BILL_NOT_FOUND'))).toBe('NOT_FOUND');
    expect(billReadFailure(apiError(403, 'FORBIDDEN'))).toBe('FORBIDDEN');
    expect(billReadFailure(apiError(500, 'INTERNAL'))).toBe('FAILED');
  });
});
