import { describe, expect, it } from 'vitest';
import { payment } from '../pages/customer-payments/customer-payments-page.spec-helper';
import {
  canKeepCredit,
  formatAmountInput,
  fromMinor,
  isPossibleDuplicate,
  parseTypedAmount,
  paymentMethodKey,
  paymentReasonKey,
  toMinor,
} from './payment-match';

describe('payment-match helpers (CAP:550 S6, P7)', () => {
  it('brings served amounts to cent scale HALF_UP, like the backend', () => {
    expect(toMinor(4615)).toBe(461500);
    expect(toMinor(0.1)).toBe(10);
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(1.004)).toBe(100);
    expect(toMinor(-2.5)).toBe(-250);
    expect(toMinor(null)).toBeNull();
    expect(toMinor(Number.NaN)).toBeNull();
  });

  it('adds typed cents without float drift (0.1 + 0.2)', () => {
    const sum = (parseTypedAmount('0.1').minor ?? 0) + (parseTypedAmount('0.2').minor ?? 0);
    expect(sum).toBe(30);
    expect(fromMinor(sum)).toBe(0.3);
  });

  it('reads a comma decimal and grouping spaces (fr-CA "1,5", "1 234,56")', () => {
    expect(parseTypedAmount('1,5')).toEqual({ minor: 150, error: null });
    expect(parseTypedAmount('1 234,56')).toEqual({ minor: 123456, error: null });
    expect(parseTypedAmount('250.00')).toEqual({ minor: 25000, error: null });
  });

  it('refuses text, three decimals, negatives and zero with a reason', () => {
    expect(parseTypedAmount('abc').error).toBe('INVALID');
    expect(parseTypedAmount('').error).toBe('INVALID');
    expect(parseTypedAmount('-5').error).toBe('INVALID');
    expect(parseTypedAmount('10.005').error).toBe('PRECISION');
    expect(parseTypedAmount('0').error).toBe('MINIMUM');
    expect(parseTypedAmount('0.00').error).toBe('MINIMUM');
  });

  it('pre-fills two decimals with the locale’s decimal sign and no grouping', () => {
    expect(formatAmountInput(461500, 'en-US')).toBe('4615.00');
    expect(formatAmountInput(461500, 'fr-CA')).toBe('4615,00');
    expect(formatAmountInput(5, 'es-MX')).toBe('0.05');
  });

  it('never lets a walk-in (null left-over) payment keep a credit', () => {
    expect(canKeepCredit(payment())).toBe(true);
    expect(canKeepCredit(payment({ leftOver: null }))).toBe(false);
  });

  it('flags a possible duplicate only when the named invoice was not suggested (case g)', () => {
    expect(isPossibleDuplicate(payment())).toBe(false);
    expect(isPossibleDuplicate(payment({ sourceInvoiceNumber: 'INV-1', reasons: ['SAME_CUSTOMER'] }))).toBe(true);
    expect(
      isPossibleDuplicate(payment({ sourceInvoiceId: 'inv-1', reasons: ['REMITTANCE_REFERENCE', 'SAME_CUSTOMER'] })),
    ).toBe(false);
  });

  it('maps served codes to keys, anything else to Unknown', () => {
    expect(paymentReasonKey('EXACT_TOTAL')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.REASON.EXACT_TOTAL');
    expect(paymentReasonKey('NEW')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.REASON.UNKNOWN');
    expect(paymentMethodKey('CASH')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.CASH');
    expect(paymentMethodKey('WIRE')).toBe('ACCOUNTING.CUSTOMER_PAYMENTS.METHOD.UNKNOWN');
    expect(paymentMethodKey(null)).toBeNull();
  });
});
