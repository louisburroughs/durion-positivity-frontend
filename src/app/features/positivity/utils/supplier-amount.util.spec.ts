import { describe, expect, it } from 'vitest';
import { amountSign, displayAmount, isNegativeAmount } from './supplier-amount.util';

describe('supplier-amount.util', () => {
  describe('amountSign()', () => {
    it('classifies an ordinary payable as positive', () => {
      expect(amountSign('1240.50')).toBe('positive');
      expect(amountSign('  1240.50  ')).toBe('positive');
    });

    it('classifies a leading-minus credit as negative', () => {
      expect(amountSign('-1240.50')).toBe('negative');
      expect(amountSign(' -0.01 ')).toBe('negative');
    });

    it('treats a signed zero as zero, not as a credit', () => {
      expect(amountSign('-0.00')).toBe('zero');
      expect(amountSign('0.00')).toBe('zero');
    });

    it('treats an absent or blank amount as zero rather than guessing', () => {
      expect(amountSign(null)).toBe('zero');
      expect(amountSign(undefined)).toBe('zero');
      expect(amountSign('   ')).toBe('zero');
    });

    it('recognises a unicode minus sign as negative', () => {
      expect(amountSign('−1240.50')).toBe('negative');
    });
  });

  describe('isNegativeAmount()', () => {
    it('is true only for amounts that reduce what is payable', () => {
      expect(isNegativeAmount('-980.00')).toBe(true);
      expect(isNegativeAmount('980.00')).toBe(false);
      expect(isNegativeAmount('-0.00')).toBe(false);
    });
  });

  describe('displayAmount()', () => {
    it('returns the delivered text unchanged — no rounding, padding or re-scaling', () => {
      expect(displayAmount('1240.5')).toBe('1240.5');
      expect(displayAmount('1240.500')).toBe('1240.500');
      expect(displayAmount('-1240.50')).toBe('-1240.50');
      expect(displayAmount('12345678901234567890.99')).toBe('12345678901234567890.99');
    });

    it('never strips the sign from a credit', () => {
      const delivered = '-1240.50';
      expect(displayAmount(delivered)).toContain('-');
      expect(displayAmount(delivered)).toBe(delivered);
    });

    it('returns null for an absent amount so the caller renders a placeholder', () => {
      expect(displayAmount(null)).toBeNull();
      expect(displayAmount(undefined)).toBeNull();
      expect(displayAmount('  ')).toBeNull();
    });
  });
});
