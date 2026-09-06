import { describe, expect, it } from 'vitest';
import { isDateOnly, toDatePipeInput } from './date-only.util';

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

describe('toDatePipeInput', () => {
  it('appends T00:00:00 to a bare date-only string so DatePipe renders local midnight, not UTC (ADR-0038)', () => {
    expect(toDatePipeInput('2026-08-20')).toBe('2026-08-20T00:00:00');
  });

  it('passes a value that already has a T00:00:00 time component through unchanged', () => {
    expect(toDatePipeInput('2026-01-15T00:00:00')).toBe('2026-01-15T00:00:00');
  });

  it('passes an instant (Z suffix) through untouched', () => {
    expect(toDatePipeInput('2026-08-20T03:00:00Z')).toBe('2026-08-20T03:00:00Z');
  });

  it('is null/undefined/empty-string safe, returning null', () => {
    expect(toDatePipeInput(null)).toBeNull();
    expect(toDatePipeInput(undefined)).toBeNull();
    expect(toDatePipeInput('')).toBeNull();
  });

  it('produces a value that DatePipe/Date will read back on the same calendar day regardless of host timezone', () => {
    const prepared = toDatePipeInput('2026-08-20');

    expect(prepared).not.toBeNull();
    const parsed = new Date(prepared!);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(20);
  });
});
