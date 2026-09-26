import {
  isCountryCode,
  parseBufferValue,
  parsePostalCodes,
  policyDraft,
  samePostalCodes,
} from './setup-lists.models';

describe('setup list rules', () => {
  describe('parsePostalCodes', () => {
    it('splits on lines, commas and semicolons, keeping spaces inside a code', () => {
      const parsed = parsePostalCodes('78701, 78702\nK1A  0B1;78703\n\n', 'us', []);
      expect(parsed.added).toEqual([
        { postalCode: '78701', countryCode: 'US' },
        { postalCode: '78702', countryCode: 'US' },
        { postalCode: 'K1A 0B1', countryCode: 'US' },
        { postalCode: '78703', countryCode: 'US' },
      ]);
      expect(parsed.duplicates).toBe(0);
    });

    it('drops codes already listed or repeated in the paste, and counts them', () => {
      const parsed = parsePostalCodes('78701,78702,78702', 'US', [{ postalCode: '78701', countryCode: 'us' }]);
      expect(parsed.added.map(entry => entry.postalCode)).toEqual(['78702']);
      expect(parsed.duplicates).toBe(2);
    });

    it('treats the same code in another country as a different entry', () => {
      const parsed = parsePostalCodes('78701', 'MX', [{ postalCode: '78701', countryCode: 'US' }]);
      expect(parsed.added).toEqual([{ postalCode: '78701', countryCode: 'MX' }]);
    });

    it('leaves out codes too long to store', () => {
      const parsed = parsePostalCodes('ABCDEFGHIJKLMNOPQRSTU, 78701', 'US', []);
      expect(parsed.tooLong).toEqual(['ABCDEFGHIJKLMNOPQRSTU']);
      expect(parsed.added.map(entry => entry.postalCode)).toEqual(['78701']);
    });
  });

  it('compares postal-code sets without regard to order or country case', () => {
    const a = [
      { postalCode: '1', countryCode: 'US' },
      { postalCode: '2', countryCode: 'US' },
    ];
    expect(samePostalCodes(a, [a[1], { postalCode: '1', countryCode: 'us' }])).toBe(true);
    expect(samePostalCodes(a, [a[0]])).toBe(false);
    expect(samePostalCodes(a, [a[0], { postalCode: '3', countryCode: 'US' }])).toBe(false);
  });

  it('accepts only two-letter country codes', () => {
    expect(isCountryCode(' ca ')).toBe(true);
    expect(isCountryCode('USA')).toBe(false);
    expect(isCountryCode('1A')).toBe(false);
  });

  it('reads a buffer value as a number, blank as none, anything else as invalid', () => {
    expect(parseBufferValue('15')).toBe(15);
    expect(parseBufferValue(' 1.25 ')).toBe(1.25);
    expect(parseBufferValue('')).toBeNull();
    expect(parseBufferValue('-1')).toBeUndefined();
    expect(parseBufferValue('1.234')).toBeUndefined();
    expect(parseBufferValue('ten')).toBeUndefined();
  });

  it('starts a new policy as flat minutes, and leaves an invalid stored type empty', () => {
    expect(policyDraft(null)).toEqual({ name: '', bufferType: 'FLAT_MINUTES', bufferValue: '', notes: '' });
    expect(policyDraft({ id: 'p', name: 'Seeded', bufferType: 'MINUTES', bufferValue: 10 })).toEqual({
      name: 'Seeded',
      bufferType: '',
      bufferValue: '10',
      notes: '',
    });
  });
});
