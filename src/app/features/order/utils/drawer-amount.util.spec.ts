import { describe, expect, it } from 'vitest';
import { parseAmount } from './drawer-amount.util';

describe('parseAmount (ADR-0067 PC-14 F-4)', () => {
  it('reads a plain positive amount with a point or a decimal comma', () => {
    expect(parseAmount('12.50', 'CAD')).toBe(12.5);
    expect(parseAmount(' 12,5 ', 'CAD')).toBe(12.5);
    expect(parseAmount('300', 'CAD')).toBe(300);
  });

  it('takes the allowed decimals from the currency, never a fixed two', () => {
    expect(parseAmount('12.505', 'CAD')).toBeNull();
    expect(parseAmount('1200', 'JPY')).toBe(1200);
    expect(parseAmount('12.5', 'JPY')).toBeNull();
    expect(parseAmount('1.234', 'BHD')).toBe(1.234);
  });

  it('refuses blank, zero, negative and malformed text', () => {
    for (const typed of ['', '0', '0.00', '-5', '1e3', '12.', '.5', '1,000.00', 'abc']) {
      expect(parseAmount(typed, 'CAD')).toBeNull();
    }
  });
});
