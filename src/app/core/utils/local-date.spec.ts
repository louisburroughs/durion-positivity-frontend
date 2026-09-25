import { describe, it, expect } from 'vitest';
import { fromDatetimeLocalValue, isoDateLocal, parseIsoDateLocal, toDatetimeLocalValue } from './local-date';

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

describe('datetime-local helpers (ADR-0038 §5)', () => {
  it('formats a UTC instant as a zoneless YYYY-MM-DDTHH:mm value', () => {
    const value = toDatetimeLocalValue('2026-06-18T08:00:00Z');
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('returns an empty string for a missing or unparsable instant', () => {
    expect(toDatetimeLocalValue(undefined)).toBe('');
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('')).toBe('');
    expect(toDatetimeLocalValue('not-a-date')).toBe('');
  });

  it('converts a local datetime-local value back into a valid UTC instant', () => {
    const iso = fromDatetimeLocalValue('2026-06-18T08:00');
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false);
  });

  it('returns an empty string for a missing or malformed local value', () => {
    expect(fromDatetimeLocalValue(undefined)).toBe('');
    expect(fromDatetimeLocalValue(null)).toBe('');
    expect(fromDatetimeLocalValue('')).toBe('');
    expect(fromDatetimeLocalValue('not-a-date')).toBe('');
  });

  it('round-trips regardless of the runner\'s own timezone', () => {
    // Both directions apply the same (viewer-local) zone, so composing them cancels it out —
    // this holds in any timezone, unlike a hard-coded UTC literal would (ADR-0038 §7).
    const original = '2026-06-18T08:00:00.000Z';
    const roundTripped = fromDatetimeLocalValue(toDatetimeLocalValue(original));
    expect(new Date(roundTripped).getTime()).toBe(new Date(original).getTime());
  });
});
