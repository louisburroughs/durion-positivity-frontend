import { describe, expect, it } from 'vitest';
import { supplierIdentityKey } from './supplier-identity.util';

describe('supplierIdentityKey', () => {
  it('keeps tid=a|b/sub=c and tid=a/sub=b|c apart (ADR-0065 §4/§5)', () => {
    expect(supplierIdentityKey('a|b', 'c')).not.toBe(supplierIdentityKey('a', 'b|c'));
  });

  it('encodes each half and joins them with the delimiter', () => {
    expect(supplierIdentityKey('tenant 1', 'clerk|a')).toBe('tenant%201|clerk%7Ca');
  });

  it('encodes missing claims as empty halves', () => {
    expect(supplierIdentityKey(null, undefined)).toBe('|');
  });
});
