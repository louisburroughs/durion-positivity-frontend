import { describe, expect, it } from 'vitest';
import {
  ageMs,
  isDateOnly,
  isStale,
  parseDateOnlyLocal,
  toDatePipeInput,
} from './supplier-freshness.util';

describe('isDateOnly', () => {
  it('recognises a bare YYYY-MM-DD value', () => {
    expect(isDateOnly('2026-08-10')).toBe(true);
  });

  it('rejects an instant and empty values', () => {
    expect(isDateOnly('2026-08-10T03:00:00Z')).toBe(false);
    expect(isDateOnly(null)).toBe(false);
    expect(isDateOnly(undefined)).toBe(false);
  });
});

describe('parseDateOnlyLocal', () => {
  it('parses YYYY-MM-DD as local midnight, not UTC (ADR-0038)', () => {
    const parsed = parseDateOnlyLocal('2026-08-10');

    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(7);
    expect(parsed!.getDate()).toBe(10);
    expect(parsed!.getHours()).toBe(0);
  });

  it('returns null for an instant', () => {
    expect(parseDateOnlyLocal('2026-08-10T03:00:00Z')).toBeNull();
  });
});

describe('toDatePipeInput', () => {
  it('appends T00:00:00 to a date-only string so DatePipe stays in local time', () => {
    expect(toDatePipeInput('2026-08-10')).toBe('2026-08-10T00:00:00');
  });

  it('passes an instant through untouched', () => {
    expect(toDatePipeInput('2026-08-10T03:00:00Z')).toBe('2026-08-10T03:00:00Z');
  });

  it('returns null for empty input', () => {
    expect(toDatePipeInput(null)).toBeNull();
    expect(toDatePipeInput('')).toBeNull();
  });
});

describe('ageMs', () => {
  it('measures the age of an instant', () => {
    const now = Date.parse('2026-08-12T12:00:00Z');

    expect(ageMs('2026-08-12T11:00:00Z', now)).toBe(3_600_000);
  });

  it('measures the age of a date-only value from local midnight', () => {
    const now = new Date(2026, 7, 10, 6, 0, 0).getTime();

    expect(ageMs('2026-08-10', now)).toBe(6 * 3_600_000);
  });

  it('returns null for a missing or unparseable value', () => {
    expect(ageMs(null, Date.now())).toBeNull();
    expect(ageMs('not-a-date', Date.now())).toBeNull();
  });
});

describe('isStale', () => {
  it('is true once the vendor as-of value is older than the backend threshold', () => {
    const now = Date.parse('2026-08-12T12:00:00Z');

    expect(isStale('2026-08-12T09:00:00Z', 120, now)).toBe(true);
  });

  it('is false while the as-of value is inside the threshold', () => {
    const now = Date.parse('2026-08-12T12:00:00Z');

    expect(isStale('2026-08-12T11:00:00Z', 120, now)).toBe(false);
  });

  it('is false when the as-of value is missing — unknown is not stale', () => {
    expect(isStale(null, 120, Date.now())).toBe(false);
  });

  it('is false when the backend threshold disables the check', () => {
    const now = Date.parse('2026-08-12T12:00:00Z');

    expect(isStale('2020-01-01T00:00:00Z', 0, now)).toBe(false);
    expect(isStale('2020-01-01T00:00:00Z', Number.NaN, now)).toBe(false);
  });
});
