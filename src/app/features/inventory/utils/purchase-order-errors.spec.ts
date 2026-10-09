import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import enUS from '../../../../assets/i18n/en-US.json';
import { PURCHASE_ORDER_FIELD_KEYS, classifyPurchaseOrderError } from './purchase-order-errors';

const BASE = 'INVENTORY.PURCHASE_ORDERS.FORM.ERROR';

function http(status: number, body: unknown = null, headers: Record<string, string> = {}): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers) });
}

/** Resolves a dotted key in the real en-US bundle (ADR-0035 §8). */
function copy(key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], enUS);
}

describe('classifyPurchaseOrderError', () => {
  it('422 VENDOR_INACTIVE marks the vendor and asks for the vendor list again', () => {
    const failure = classifyPurchaseOrderError(http(422, { code: 'VENDOR_INACTIVE' }), 'create');

    expect(failure.code).toBe('VENDOR_INACTIVE');
    expect(failure.key).toBe(`${BASE}.VENDOR_INACTIVE`);
    expect(failure.fieldErrors).toEqual({ vendorId: `${BASE}.FIELD.VENDOR` });
    expect(failure.rereadVendors).toBe(true);
    expect(failure.rereadOrder).toBe(false);
  });

  it('503 VENDOR_REPLICATION_PENDING is a definite refusal that names the Retry-After seconds', () => {
    const failure = classifyPurchaseOrderError(
      http(503, { code: 'VENDOR_REPLICATION_PENDING' }, { 'Retry-After': '30' }),
      'create',
    );

    expect(failure.code).toBe('VENDOR_PENDING');
    expect(failure.key).toBe(`${BASE}.VENDOR_PENDING_AFTER`);
    expect(failure.params).toEqual({ seconds: 30 });
  });

  it('503 VENDOR_REPLICATION_PENDING without a usable Retry-After says "in a moment"', () => {
    const failure = classifyPurchaseOrderError(
      http(503, { code: 'VENDOR_REPLICATION_PENDING' }, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }),
      'revise',
    );

    expect(failure.key).toBe(`${BASE}.VENDOR_PENDING`);
    expect(failure.params).toEqual({});
  });

  it('a 503 without the vendor code is an unknown outcome, never a refusal', () => {
    expect(classifyPurchaseOrderError(http(503), 'create').key).toBe(`${BASE}.UNKNOWN_CREATE`);
    expect(classifyPurchaseOrderError(http(504), 'revise').key).toBe(`${BASE}.UNKNOWN_REVISE`);
    expect(classifyPurchaseOrderError(http(0), 'create').code).toBe('UNKNOWN_OUTCOME');
    expect(classifyPurchaseOrderError(new Error('network'), 'create').code).toBe('UNKNOWN_OUTCOME');
  });

  it('409 PURCHASE_ORDER_INVALID_STATE on a revision: the vendor is locked and the order is read again', () => {
    const failure = classifyPurchaseOrderError(http(409, { code: 'PURCHASE_ORDER_INVALID_STATE' }), 'revise');

    expect(failure.code).toBe('VENDOR_LOCKED');
    expect(failure.key).toBe(`${BASE}.VENDOR_LOCKED`);
    expect(failure.rereadOrder).toBe(true);
  });

  it('400 VALIDATION_ERROR marks only the fields the form renders', () => {
    const failure = classifyPurchaseOrderError(
      http(400, {
        code: 'VALIDATION_ERROR',
        fieldErrors: [{ field: 'revisionReason' }, { field: 'lines[0].quantity' }, { field: 'currency' }],
      }),
      'revise',
    );

    expect(failure.key).toBe(`${BASE}.VALIDATION`);
    expect(failure.fieldErrors).toEqual({
      revisionReason: PURCHASE_ORDER_FIELD_KEYS.revisionReason,
      lines: PURCHASE_ORDER_FIELD_KEYS.lines,
    });
  });

  it('400 with no rendered field gets the unnamed copy, never "check the highlighted fields"', () => {
    const named = classifyPurchaseOrderError(http(400, { code: 'VALIDATION_ERROR', fieldErrors: [{ field: 'currency' }] }), 'create');
    const bare = classifyPurchaseOrderError(http(400, { code: 'VALIDATION_ERROR' }), 'create');
    // A revision's poDate is the order's own, not a field the form shows.
    const poDate = classifyPurchaseOrderError(http(400, { fieldErrors: [{ field: 'poDate' }] }), 'revise');

    for (const failure of [named, bare, poDate]) {
      expect(failure.key).toBe(`${BASE}.VALIDATION_UNNAMED`);
      expect(failure.fieldErrors).toEqual({});
    }
  });

  it('a create sends the delivery date as poDate, so its error marks the delivery date', () => {
    const failure = classifyPurchaseOrderError(http(400, { fieldErrors: [{ field: 'poDate' }] }), 'create');

    expect(failure.fieldErrors).toEqual({ deliveryDate: PURCHASE_ORDER_FIELD_KEYS.deliveryDate });
  });

  it('a refused line (bad request, unit conversion) marks the lines', () => {
    for (const code of ['PURCHASE_ORDER_BAD_REQUEST', 'UOM_CONVERSION_UNDEFINED']) {
      const failure = classifyPurchaseOrderError(http(code === 'UOM_CONVERSION_UNDEFINED' ? 422 : 400, { code }), 'create');
      expect(failure.code).toBe('LINES_REFUSED');
      expect(failure.fieldErrors).toEqual({ lines: PURCHASE_ORDER_FIELD_KEYS.lines });
    }
  });

  it('403 names the permission the command enforces; 404 says the order is gone', () => {
    const forbidden = classifyPurchaseOrderError(http(403, { code: 'PURCHASE_ORDER_FORBIDDEN' }), 'create');
    expect(forbidden.key).toBe(`${BASE}.FORBIDDEN`);
    expect(forbidden.params).toEqual({ permission: 'order:purchase_order:create' });

    expect(classifyPurchaseOrderError(http(404, { code: 'PURCHASE_ORDER_NOT_FOUND' }), 'revise').key).toBe(`${BASE}.NOT_FOUND`);
  });

  it('another 4xx is a refusal with its status', () => {
    const failure = classifyPurchaseOrderError(http(422, { code: 'SOMETHING_NEW' }), 'create');

    expect(failure.code).toBe('REFUSED');
    expect(failure.params).toEqual({ status: 422 });
  });

  it('every key it can return exists in the en-US bundle', () => {
    const keys = [
      'VENDOR_INACTIVE', 'VENDOR_PENDING', 'VENDOR_PENDING_AFTER', 'VENDOR_LOCKED', 'NOT_FOUND', 'VALIDATION',
      'VALIDATION_UNNAMED', 'LINES_REFUSED', 'FORBIDDEN', 'UNKNOWN_CREATE', 'UNKNOWN_REVISE', 'REFUSED',
    ].map(key => `${BASE}.${key}`);
    for (const key of [...keys, ...Object.values(PURCHASE_ORDER_FIELD_KEYS)]) {
      expect(typeof copy(key), key).toBe('string');
    }
  });
});
