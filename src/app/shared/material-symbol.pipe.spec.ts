import { MaterialSymbolPipe } from './material-symbol.pipe';

describe('MaterialSymbolPipe', () => {
  const pipe = new MaterialSymbolPipe();

  it('maps a known icon name to its codepoint character', () => {
    expect(pipe.transform('forum').codePointAt(0)).toBe(0xe0bf);
    expect(pipe.transform('space_dashboard').codePointAt(0)).toBe(0xe66b);
    expect(pipe.transform('close').codePointAt(0)).toBe(0xe14c);
  });

  it('returns a single-character glyph, not the ligature name', () => {
    const glyph = pipe.transform('inventory_2');
    expect(glyph.length).toBe(1);
    expect(glyph).not.toContain('inventory');
  });

  it('returns an empty string for unknown names (no stray letters)', () => {
    expect(pipe.transform('not_a_real_icon')).toBe('');
    expect(pipe.transform('D')).toBe('');
  });

  it('handles null / undefined / empty input', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
