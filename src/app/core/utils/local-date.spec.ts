import { describe, it, expect } from 'vitest';
import { isoDateLocal, parseIsoDateLocal } from './local-date';

describe('date helpers', () => {
  it('formats the local calendar date, not the UTC one (ADR-0038)', () => {
    // 11:30 PM local on the 15th, seen from a UTC-4 zone: the local getters say
    // the 15th while the UTC instant is already the 16th. A Date-shaped fixture
    // pins that split regardless of the test runner's own zone (CI runs in UTC,
    // where a real Date can't tell local getters from toISOString()).
    const lateEvening = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 15,
      toISOString: () => '2026-09-16T03:30:00.000Z',
    } as unknown as Date;

    expect(isoDateLocal(lateEvening)).toBe('2026-09-15');
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-09-16');
  });

  it('formats a real late-evening Date as that local day', () => {
    expect(isoDateLocal(new Date(2026, 8, 15, 23, 30))).toBe('2026-09-15');
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
