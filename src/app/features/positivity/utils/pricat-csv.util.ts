/**
 * CSV serialization for the PRICAT unmatched-lines worklist (issue #189).
 *
 * Pure functions — no DOM, no Angular — so the shape is unit-testable without a
 * browser. The caller owns the download mechanics.
 *
 * The export is a report of what the backend currently reports as unmatched; it
 * is not a dismissal mechanism. Rows persist server-side until matched.
 */
import { PricatUnmatchedLine } from '../models/supplier-pricat.models';

/** Column order of the exported file. Header row is emitted from the caller's translated labels. */
export const UNMATCHED_CSV_COLUMNS = [
  'ean',
  'gtin',
  'manufacturerPartNumber',
  'description',
  'reason',
  'firstSeenAt',
  'lastSeenAt',
  'occurrences',
] as const;

/**
 * Quote a single CSV cell.
 *
 * Always quotes, and prefixes a value starting with `=`, `+`, `-` or `@` with a
 * single quote so spreadsheet software does not evaluate vendor-supplied text as
 * a formula.
 */
export function toCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let text = String(value);
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * Build the CSV body for the given lines.
 *
 * @param lines   rows exactly as delivered by the backend, in display order
 * @param headers translated column headers, in `UNMATCHED_CSV_COLUMNS` order
 */
export function buildUnmatchedLinesCsv(
  lines: readonly PricatUnmatchedLine[],
  headers: readonly string[],
): string {
  const rows: string[] = [headers.map(toCsvCell).join(',')];

  for (const line of lines) {
    rows.push(
      [
        toCsvCell(line.ean),
        toCsvCell(line.gtin),
        toCsvCell(line.manufacturerPartNumber),
        toCsvCell(line.description),
        toCsvCell(line.reason),
        toCsvCell(line.firstSeenAt),
        toCsvCell(line.lastSeenAt),
        toCsvCell(line.occurrences),
      ].join(','),
    );
  }

  return `${rows.join('\r\n')}\r\n`;
}

/** Stable, filesystem-safe file name for an export of one profile's worklist. */
export function unmatchedLinesFileName(vendorProfileId: string, isoInstant: string): string {
  const stamp = isoInstant.replace(/[:.]/g, '-');
  return `pricat-unmatched-${vendorProfileId}-${stamp}.csv`;
}
