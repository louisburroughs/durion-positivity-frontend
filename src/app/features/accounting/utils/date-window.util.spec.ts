/**
 * `addCalendarDays`/`toIsoDate` regression tests (#212/#214).
 *
 * `addCalendarDays` must add/subtract whole *calendar* days, not a fixed
 * 24h-per-day millisecond offset, so a window spanning a DST transition is
 * not silently narrowed or widened by an hour. Each date below is built at
 * local noon specifically so a wrong (millisecond-based) implementation
 * would still land on the correct calendar day most of the year but drift
 * on the two US DST-transition dates asserted here — the local *hour*
 * staying exactly noon is the signal a millisecond-based implementation
 * would fail on the transition day itself. Because the assertions are
 * expressed in terms of the same `Date` local getters `addCalendarDays`
 * uses, they hold regardless of the host's own timezone (including a UTC
 * test runner, which never observes a DST transition at all).
 */
import { addCalendarDays, toIsoDate } from './date-window.util';

describe('addCalendarDays', () => {
  it('advances the calendar day by exactly 1 across the US spring-forward boundary (2026-03-08), local hour unchanged', () => {
    const start = new Date(2026, 2, 7, 12, 0, 0); // 2026-03-07, local noon

    const result = addCalendarDays(start, 1);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(8);
    expect(result.getHours()).toBe(12);
  });

  it('advances the calendar day by exactly 1 across the US fall-back boundary (2026-11-01), local hour unchanged', () => {
    const start = new Date(2026, 9, 31, 12, 0, 0); // 2026-10-31, local noon

    const result = addCalendarDays(start, 1);

    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(10); // November
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(12);
  });

  it('subtracts whole calendar days for a negative n', () => {
    const start = new Date(2026, 2, 1, 12, 0, 0); // 2026-03-01, local noon

    const result = addCalendarDays(start, -30);

    expect(toIsoDate(result)).toBe('2026-01-30');
    expect(result.getHours()).toBe(12);
  });

  it('rolls across a month/year boundary for a large positive n', () => {
    const start = new Date(2025, 11, 15, 12, 0, 0); // 2025-12-15, local noon

    const result = addCalendarDays(start, 60);

    expect(toIsoDate(result)).toBe('2026-02-13');
  });

  it('is a no-op for n = 0', () => {
    const start = new Date(2026, 5, 15, 12, 0, 0);

    const result = addCalendarDays(start, 0);

    expect(toIsoDate(result)).toBe(toIsoDate(start));
    expect(result.getHours()).toBe(start.getHours());
  });

  it('does not mutate the input date', () => {
    const start = new Date(2026, 5, 15, 12, 0, 0);
    const originalTime = start.getTime();

    addCalendarDays(start, 10);

    expect(start.getTime()).toBe(originalTime);
  });
});

describe('toIsoDate', () => {
  it('zero-pads a single-digit month and day', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });

  it('does not pad a two-digit month and day', () => {
    expect(toIsoDate(new Date(2026, 10, 25, 12, 0, 0))).toBe('2026-11-25');
  });

  /**
   * ADR-0038 rejects `toISOString().slice(0, 10)`: it reads the UTC date,
   * which disagrees with the local calendar date for the evening hours in
   * any UTC-N zone. A Date-like whose local getters and `toISOString()`
   * deliberately disagree makes the distinction observable regardless of
   * the machine's own TZ.
   */
  it('reads the local calendar date, not the UTC date, for 23:30 local in a UTC-7 zone', () => {
    const lateEveningLocal = {
      getFullYear: () => 2026,
      getMonth: () => 8, // September (0-indexed)
      getDate: () => 5,
      toISOString: () => '2026-09-06T06:30:00.000Z', // 23:30 local Sep 5 == 06:30 UTC Sep 6
    } as unknown as Date;

    expect(toIsoDate(lateEveningLocal)).toBe('2026-09-05');
  });
});
