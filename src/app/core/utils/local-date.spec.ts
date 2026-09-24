import { describe, it, expect } from 'vitest';
import { isoDateLocal, parseIsoDateLocal } from './local-date';

describe('date helpers', () => {
  it('formats the local calendar date, not the UTC one (ADR-0038)', () => {
    // 11 PM local on the 15th is the 16th in UTC for any UTC-N zone; the
    // calendar must still say the 15th.
    const late = new Date(2026, 8, 15, 23, 30);
    expect(isoDateLocal(late)).toBe('2026-09-15');
  });

  it('parses an ISO date as local midnight', () => {
    const parsed = parseIsoDateLocal('2026-09-15');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(15);
    expect(parsed.getHours()).toBe(0);
  });

  it('round-trips', () => {
    expect(isoDateLocal(parseIsoDateLocal('2026-02-29'.replace('29', '28')))).toBe('2026-02-28');
  });
});
