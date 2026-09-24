import { describe, expect, it } from 'vitest';
import {
  displayActor,
  isPeriodCode,
  periodCodeOf,
  periodHasStarted,
  periodMonthStart,
  previousPeriodCode,
} from './period-close.models';

/**
 * Every helper takes "today" as an argument, so these specs pass a fixed local
 * date rather than reading the clock: they cannot expire (ADR-0038 §7).
 */
describe('period-close models', () => {
  const midJanuary = new Date(2026, 0, 15);
  const lastMomentOfJuly = new Date(2026, 6, 31, 23, 59, 59);

  it('accepts only YYYY-MM codes with a real month', () => {
    expect(isPeriodCode('2026-07')).toBe(true);
    expect(isPeriodCode('2026-13')).toBe(false);
    expect(isPeriodCode('2026-00')).toBe(false);
    expect(isPeriodCode('2026-7')).toBe(false);
    expect(isPeriodCode('')).toBe(false);
    expect(isPeriodCode(null)).toBe(false);
  });

  it('derives the period code from the local calendar, not UTC', () => {
    // toISOString() would already say August in any UTC-negative zone.
    expect(periodCodeOf(lastMomentOfJuly)).toBe('2026-07');
  });

  it('defaults the close target to the previous month, across a year boundary', () => {
    expect(previousPeriodCode(midJanuary)).toBe('2025-12');
    expect(previousPeriodCode(lastMomentOfJuly)).toBe('2026-06');
  });

  it('treats the current and earlier months as started and a later month as not', () => {
    expect(periodHasStarted('2026-01', midJanuary)).toBe(true);
    expect(periodHasStarted('2025-12', midJanuary)).toBe(true);
    expect(periodHasStarted('2026-02', midJanuary)).toBe(false);
    expect(periodHasStarted('not-a-code', midJanuary)).toBe(false);
  });

  it('builds the month start as local midnight on the first', () => {
    const start = periodMonthStart('2026-07');
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 6, 1, 0]);
  });

  it('keeps a username but never renders an opaque id as a name', () => {
    expect(displayActor('controller.jane')).toBe('controller.jane');
    expect(displayActor('  controller.jane ')).toBe('controller.jane');
    expect(displayActor('0190B3A4-7C2E-7D1F-9A3B-5E6F7A8B9C0D')).toBeNull();
    expect(displayActor('')).toBeNull();
    expect(displayActor(undefined)).toBeNull();
  });
});
