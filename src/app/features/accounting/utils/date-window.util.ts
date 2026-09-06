/**
 * Calendar-day date-window helpers for default due-date filters (#212/#214).
 *
 * `Date.now() ± n * 24 * 60 * 60 * 1000` drifts across a DST transition: the
 * day a browser's local zone changes clocks is only 23 or 25 hours long, so a
 * fixed-millisecond offset silently narrows or widens the resulting window by
 * an hour and can push the computed date onto the wrong calendar day.
 * `Date.prototype.setDate` performs calendar-day arithmetic instead — it
 * always adds/subtracts whole calendar days and lets the runtime resolve the
 * resulting wall-clock time — so a window built from it spans exactly the
 * intended number of calendar days regardless of DST.
 *
 * Shared here (rather than duplicated per page) because both
 * `vendor-invoices-list-page` and `vendor-invoices-exceptions-page` build
 * their default due-date window the same way.
 */

/** Add (or, for a negative `days`, subtract) whole calendar days to a local `Date`. */
export function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Local-calendar `YYYY-MM-DD`, built from local getters rather than
 * `toISOString().slice(0, 10)` (ADR-0038 rejects that pattern by name):
 * `toISOString()` is UTC, so in a UTC-N zone it rolls into tomorrow's date
 * for the evening hours of today, which would silently shift this due-date
 * filter's window for operators west of UTC.
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
