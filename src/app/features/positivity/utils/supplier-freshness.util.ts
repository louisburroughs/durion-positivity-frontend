/**
 * Freshness / staleness helpers for supplier data displays.
 *
 * Pure functions.
 *
 * Two time facts are deliberately kept apart everywhere they are used:
 *   - **as-of** — the vendor's own effective/observation time for the data.
 *   - **fetched-at** — when the platform last pulled it.
 * Staleness is always computed against the *as-of* value, because that is what
 * makes the data old; the fetch time only tells you when we last looked.
 *
 * Date-only values (`YYYY-MM-DD`) are converted with local-time constructors,
 * never `new Date('YYYY-MM-DD')`, per ADR-0038.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a bare `YYYY-MM-DD` date-only value. */
export function isDateOnly(value: string | null | undefined): boolean {
  return !!value && DATE_ONLY.test(value);
}

/**
 * Parse a date-only `YYYY-MM-DD` string as local midnight (ADR-0038).
 * Returns null for anything that is not a date-only string.
 */
export function parseDateOnlyLocal(value: string | null | undefined): Date | null {
  if (!isDateOnly(value)) {
    return null;
  }
  const [year, month, day] = (value as string).split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Render a value for Angular's `DatePipe`.
 *
 * A date-only string gets `T00:00:00` appended so the pipe formats it in local
 * time instead of shifting it a day (ADR-0038). Instants pass through.
 */
export function toDatePipeInput(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return isDateOnly(value) ? `${value}T00:00:00` : value;
}

/** Milliseconds since the given as-of value, or null when it is absent/unparseable. */
export function ageMs(asOf: string | null | undefined, now: number): number | null {
  if (!asOf) {
    return null;
  }
  const dateOnly = parseDateOnlyLocal(asOf);
  const ms = dateOnly ? dateOnly.getTime() : new Date(asOf).getTime();
  return Number.isNaN(ms) ? null : now - ms;
}

/**
 * True when the as-of value is older than the backend-delivered threshold.
 *
 * A missing as-of value is *not* reported as stale — it is reported as unknown
 * by the caller, because "we have no vendor timestamp" and "the vendor
 * timestamp is old" are different problems.
 *
 * @param thresholdMinutes backend-delivered threshold; `<= 0` disables the check
 */
export function isStale(
  asOf: string | null | undefined,
  thresholdMinutes: number,
  now: number,
): boolean {
  if (!Number.isFinite(thresholdMinutes) || thresholdMinutes <= 0) {
    return false;
  }
  const age = ageMs(asOf, now);
  if (age === null) {
    return false;
  }
  return age > thresholdMinutes * 60_000;
}
