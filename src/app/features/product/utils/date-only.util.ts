/**
 * Date-only input handling for the tread-design review DEFER action's
 * optional "come back on" date (#218 phase 2, backend #1645, ADR-0038).
 *
 * `resolveTreadDesign`'s `deferUntil` is `format: date-time` (an Instant) on
 * the generated contract, but the review page collects it from a plain
 * `<input type="date">`, which always yields a bare `YYYY-MM-DD` value.
 * ADR-0038 forbids `new Date('YYYY-MM-DD')` for local-calendar semantics — it
 * parses as UTC midnight, the previous day locally for every negative-offset
 * deployment — so the local calendar day the operator picked is rebuilt from
 * its parts and converted to an instant only at this server-submission
 * boundary (ADR-0038 §5's exception), exactly the pattern
 * `positivity/services/supplier-exchange-audit.service.ts`'s
 * `startOfLocalDayIso` uses for its date-window filter.
 *
 * Deliberately not imported from that positivity helper, nor from
 * accounting's `date-only.util.ts` — ADR-0010 keeps feature domains from
 * importing each other's internals; this is the same tiny helper copied into
 * product.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** True when the string is a bare `YYYY-MM-DD` date-only value. */
export function isDateOnly(value: string | null | undefined): value is string {
  return !!value && DATE_ONLY.test(value);
}

/**
 * Local midnight for a `YYYY-MM-DD` value, as an ISO instant.
 *
 * Built from local-time parts on purpose: `new Date('2026-08-12')` parses as
 * UTC midnight, which is the previous calendar day locally west of UTC.
 * Returns `null` for anything that isn't a bare date-only string — including
 * `null`, `undefined`, and blank — so a caller need not validate twice.
 */
export function startOfLocalDayIso(dateOnly: string | null | undefined): string | null {
  if (!isDateOnly(dateOnly)) {
    return null;
  }
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
}
