/**
 * Local-calendar date helpers (ADR-0038 §1). Shared by every feature that turns a `Date` into a
 * `YYYY-MM-DD` wire value or back, so none of them reach for the UTC `toISOString()`.
 */

/**
 * Local-calendar `YYYY-MM-DD`.
 *
 * ADR-0038 rejects `toISOString().slice(0, 10)` by name: it is UTC, so in any
 * UTC-N zone it returns tomorrow's date during the last hours of the local day
 * — which here would ask for the wrong day's board.
 */
export function isoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` as local midnight, not the UTC instant `new Date(s)` gives. */
export function parseIsoDateLocal(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}
