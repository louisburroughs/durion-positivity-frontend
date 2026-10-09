import { describe, expect, it } from 'vitest';
import {
  compactRemitTo,
  displayActor,
  formatPaymentTerms,
  noteValid,
  parsePaymentTerms,
  paymentTermsCopy,
  remitToLines,
  safeVendorReturnTo,
} from './supplier-vendor.util';

describe('safeVendorReturnTo (story item 4, ADR-0037)', () => {
  const draft = '/app/accounting/bills/drafts/0192a4c2-0000-7000-8000-000000000abc';

  it.each([
    ['/app/accounting/bills', '/app/accounting/bills'],
    [draft, draft],
  ])('accepts %s', (raw, expected) => {
    expect(safeVendorReturnTo(raw)).toBe(expected);
  });

  it.each([
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['/app/accounting'],
    ['/app/accounting/bills/'],
    ['/app/accounting/bills?x=1'],
    ['/app/accounting/bills#top'],
    ['/app/accounting/bills/drafts/not-a-uuid'],
    ['/app/accounting/bills/drafts/0192A4C2-0000-7000-8000-000000000ABC'],
    [`${draft}/extra`],
    [' /app/accounting/bills'],
    ['javascript:alert(1)'],
    [''],
    [null],
    [undefined],
  ])('refuses %s', raw => {
    expect(safeVendorReturnTo(raw)).toBeNull();
  });
});

describe('payment terms', () => {
  it.each([
    ['DUE_ON_RECEIPT', { kind: 'DUE_ON_RECEIPT' }],
    ['NET1', { kind: 'NET', days: 1 }],
    ['NET30', { kind: 'NET', days: 30 }],
    ['NET120', { kind: 'NET', days: 120 }],
  ])('parses %s', (terms, expected) => {
    expect(parsePaymentTerms(terms)).toEqual(expected);
  });

  it.each([['NET0'], ['NET121'], ['net30'], ['NET'], ['COD'], [null], [undefined]])('does not parse %s', terms => {
    expect(parsePaymentTerms(terms)).toBeNull();
  });

  it('formats the wire form', () => {
    expect(formatPaymentTerms({ kind: 'DUE_ON_RECEIPT' })).toBe('DUE_ON_RECEIPT');
    expect(formatPaymentTerms({ kind: 'NET', days: 45 })).toBe('NET45');
  });

  it('translates terms, and shows unknown terms as not available', () => {
    expect(paymentTermsCopy('DUE_ON_RECEIPT')).toEqual({ key: 'POSITIVITY.VENDORS.TERMS.DUE_ON_RECEIPT' });
    expect(paymentTermsCopy('NET30')).toEqual({ key: 'POSITIVITY.VENDORS.TERMS.NET', params: { days: 30 } });
    expect(paymentTermsCopy('COD')).toEqual({ key: 'COMMON.NOT_AVAILABLE' });
  });
});

describe('displayActor (P8)', () => {
  it('shows a username and hides blanks and raw identities', () => {
    expect(displayActor('clerk.a')).toBe('clerk.a');
    expect(displayActor('  ')).toBeNull();
    expect(displayActor(null)).toBeNull();
    expect(displayActor('0192a4c2-0000-7000-8000-000000000001')).toBeNull();
  });
});

describe('noteValid', () => {
  it('needs 10 characters once trimmed, and respects a maximum', () => {
    expect(noteValid('  123456789  ')).toBe(false);
    expect(noteValid('1234567890')).toBe(true);
    expect(noteValid('x'.repeat(501), 10, 500)).toBe(false);
  });
});

describe('remit-to helpers', () => {
  it('lists the lines that carry text in postal order', () => {
    expect(
      remitToLines({
        payeeName: 'Acme',
        addressLine1: '1 Main St',
        addressLine2: null,
        city: 'Springfield',
        region: 'IL',
        postalCode: '62701',
        countryCode: 'US',
        remittanceEmail: 'ap@acme.example',
      }),
    ).toEqual(['Acme', '1 Main St', 'Springfield IL 62701', 'US']);
    expect(remitToLines(null)).toEqual([]);
  });

  it('drops blanks, upper-cases the country, and is null when everything is blank', () => {
    const blank = { payeeName: '', addressLine1: '', addressLine2: '', city: '', region: '', postalCode: '', countryCode: '', remittanceEmail: '' };
    expect(compactRemitTo(blank)).toBeNull();
    expect(compactRemitTo({ ...blank, payeeName: ' Acme ', countryCode: 'us' })).toEqual({ payeeName: 'Acme', countryCode: 'US' });
  });
});
