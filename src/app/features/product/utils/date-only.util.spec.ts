import { describe, expect, it } from 'vitest';
import { isDateOnly, startOfLocalDayIso } from './date-only.util';

describe('isDateOnly', () => {
  it('recognises a bare YYYY-MM-DD value', () => {
    expect(isDateOnly('2026-08-20')).toBe(true);
  });

  it('rejects a value that already carries a time component', () => {
    expect(isDateOnly('2026-08-20T00:00:00')).toBe(false);
  });

  it('rejects an instant', () => {
    expect(isDateOnly('2026-08-20T03:00:00Z')).toBe(false);
  });

  it('is null/undefined/empty-string safe', () => {
    expect(isDateOnly(null)).toBe(false);
    expect(isDateOnly(undefined)).toBe(false);
    expect(isDateOnly('')).toBe(false);
  });
});

describe('startOfLocalDayIso', () => {
  it('converts a date-only value to local midnight as an ISO instant (ADR-0038)', () => {
    expect(startOfLocalDayIso('2026-08-20')).toBe(new Date(2026, 7, 20).toISOString());
  });

  it('rolls month and year over correctly at the boundary', () => {
    expect(startOfLocalDayIso('2026-12-31')).toBe(new Date(2026, 11, 31).toISOString());
  });

  it('produces a value that reads back on the same calendar day regardless of host timezone', () => {
    const iso = startOfLocalDayIso('2026-08-20');

    expect(iso).not.toBeNull();
    const parsed = new Date(iso!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(20);
  });

  it('returns null for null/undefined/blank input rather than throwing', () => {
    expect(startOfLocalDayIso(null)).toBeNull();
    expect(startOfLocalDayIso(undefined)).toBeNull();
    expect(startOfLocalDayIso('')).toBeNull();
  });

  it('returns null for a value that already carries a time component', () => {
    expect(startOfLocalDayIso('2026-08-20T00:00:00')).toBeNull();
  });
});
