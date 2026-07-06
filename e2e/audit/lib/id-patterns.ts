/**
 * Shared id-shape patterns.
 *
 * These are used BOTH to collapse path segments into `{id}` route patterns
 * (crawler.ts routePattern → AUDIT_MAX_PER_PATTERN sampling) and to accept
 * harvested API field values that become path segments (id-harvest.ts).
 * Keeping them identical is a correctness requirement: a value the harvester
 * accepts but routePattern doesn't collapse would count as its own pattern
 * and silently bypass per-pattern sampling.
 */

export const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMERIC_SEGMENT = /^\d{2,}$/;
export const PREFIXED_ID_SEGMENT = /^[A-Za-z]{1,6}-\d+$/; // WO-123, EMP-42, PO-9
export const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;

export function isIdShaped(value: string): boolean {
  return (
    UUID_SEGMENT.test(value) ||
    NUMERIC_SEGMENT.test(value) ||
    PREFIXED_ID_SEGMENT.test(value) ||
    LONG_HEX_SEGMENT.test(value)
  );
}
