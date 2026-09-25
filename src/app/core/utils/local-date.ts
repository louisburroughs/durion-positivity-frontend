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

/**
 * Renders a UTC instant (ISO-8601, e.g. `2026-06-18T08:00:00Z`) as the local, zoneless
 * `YYYY-MM-DDTHH:mm` a `datetime-local` input requires (ADR-0038 §5).
 *
 * Neither the appointment nor the location SDK contract (`AppointmentResponse`,
 * `LocationResponseDTO`) carries a facility timezone, so there is no facility-local value to
 * render instead — this uses the viewer's own local timezone, the only one a `datetime-local`
 * input can represent. Returns `''` for a missing/unparsable instant rather than "Invalid Date".
 */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${isoDateLocal(date)}T${hours}:${minutes}`;
}

/**
 * Converts a `datetime-local` input's local, zoneless value back into a UTC instant (ISO-8601)
 * for the appointment API (ADR-0038 §5) — the inverse of `toDatetimeLocalValue`, under the same
 * viewer-local-timezone assumption. Returns `''` for a missing/unparsable value.
 */
export function fromDatetimeLocalValue(local: string | null | undefined): string {
  if (!local) return '';
  const [datePart, timePart] = local.split('T');
  if (!datePart || !timePart) return '';
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  if ([year, month, day, hours, minutes].some(n => Number.isNaN(n))) return '';
  return new Date(year, month - 1, day, hours, minutes).toISOString();
}
