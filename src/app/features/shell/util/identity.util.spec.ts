import { encodeIdentityPart, identityKey } from './identity.util';

describe('identityKey', () => {
  it('does not let an unescaped delimiter collide two different tenant/subject pairs (F17)', () => {
    // Concatenating raw claims would let `tid:'a:b'`/`sub:'c'` and
    // `tid:'a'`/`sub:'b:c'` resolve to the same key. Percent-encoding each half
    // first is what keeps them apart.
    const first = identityKey({ tid: 'a:b', sub: 'c' });
    const second = identityKey({ tid: 'a', sub: 'b:c' });
    expect(first).not.toBe(second);
  });

  it('does not let a claim containing the join delimiter itself forge another identity (F17)', () => {
    // `|` is the delimiter identityKey joins the two encoded halves with; a raw
    // `|` inside a claim value must not be able to shift which half it lands in.
    const first = identityKey({ tid: 'a|b', sub: 'c' });
    const second = identityKey({ tid: 'a', sub: 'b|c' });
    expect(first).not.toBe(second);
  });

  it('treats missing claims as an empty half rather than throwing', () => {
    expect(identityKey({})).toBe('|');
    expect(identityKey(null)).toBe('|');
    expect(identityKey(undefined)).toBe('|');
  });

  it('is stable for the same claims', () => {
    expect(identityKey({ tid: 'tenant-one', sub: 'admin.alpha' })).toBe(
      identityKey({ tid: 'tenant-one', sub: 'admin.alpha' }),
    );
  });
});

describe('encodeIdentityPart', () => {
  it('percent-encodes delimiter characters used by identityKey and the storage key', () => {
    expect(encodeIdentityPart('a:b')).toBe('a%3Ab');
    expect(encodeIdentityPart('a|b')).toBe('a%7Cb');
  });

  it('trims and empties a missing value', () => {
    expect(encodeIdentityPart('  spaced  ')).toBe('spaced');
    expect(encodeIdentityPart(undefined)).toBe('');
    expect(encodeIdentityPart(null)).toBe('');
  });
});
