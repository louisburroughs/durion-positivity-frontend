/**
 * Date-only string handling for Angular's `DatePipe` (ADR-0038).
 *
 * A bare `YYYY-MM-DD` string parses as **UTC midnight** per the ECMAScript
 * `Date` spec, so piping it straight through `DatePipe` (which calls
 * `new Date(value)` internally) shifts the displayed day for every user west
 * of UTC. Appending `T00:00:00` (no zone designator) makes the same string
 * parse as *local* midnight instead, which is the correct semantics for a
 * calendar date such as a bill/due date.
 *
 * Values that already carry a time component (e.g. the accounting service's
 * `billDate`/`dueDate`, which the backend serializes as a zoneless
 * `LocalDateTime` such as `2026-01-15T00:00:00`) are passed through
 * unchanged — they are not bare date-only strings, so this helper is a no-op
 * for them and they render exactly as they do today.
 *
 * Deliberately not imported from the positivity feature's equivalent
 * (`supplier-freshness.util.ts`) — ADR-0010 keeps feature domains from
 * importing each other's internals; this is the same tiny helper copied
 * into accounting.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a bare `YYYY-MM-DD` date-only value. */
export function isDateOnly(value: string | null | undefined): boolean {
  return !!value && DATE_ONLY.test(value);
}

/**
 * Render a value for Angular's `DatePipe`.
 *
 * A date-only string gets `T00:00:00` appended so the pipe formats it in
 * local time instead of shifting it a day (ADR-0038). Anything else
 * (instants, zoneless date-times that already carry a time component, or
 * null/undefined) passes through unchanged.
 */
export function toDatePipeInput(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return isDateOnly(value) ? `${value}T00:00:00` : value;
}
