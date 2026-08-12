import { describe, expect, it } from 'vitest';
import {
  UNMATCHED_CSV_COLUMNS,
  buildUnmatchedLinesCsv,
  toCsvCell,
  unmatchedLinesFileName,
} from './pricat-csv.util';
import { PricatUnmatchedLine } from '../models/supplier-pricat.models';

const lineFixture: PricatUnmatchedLine = {
  unmatchedLineId: 'ul-1',
  vendorProfileId: 'profile-1',
  ean: '3528700123456',
  gtin: null,
  manufacturerPartNumber: 'MX-2255',
  description: 'Pilot Sport 4 225/55R17',
  reason: 'NO_EAN_MATCH',
  firstSeenAt: '2026-08-01T03:04:00Z',
  lastSeenAt: '2026-08-12T03:04:00Z',
  occurrences: 12,
};

const headers = [
  'EAN',
  'GTIN',
  'Manufacturer part number',
  'Description',
  'Reason',
  'First seen',
  'Last seen',
  'Occurrences',
];

describe('toCsvCell', () => {
  it('quotes every cell', () => {
    expect(toCsvCell('abc')).toBe('"abc"');
  });

  it('escapes embedded quotes by doubling them', () => {
    expect(toCsvCell('a"b')).toBe('"a""b"');
  });

  it('emits an empty quoted cell for null and undefined', () => {
    expect(toCsvCell(null)).toBe('""');
    expect(toCsvCell(undefined)).toBe('""');
  });

  it('neutralises spreadsheet formula injection from vendor text', () => {
    expect(toCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(toCsvCell('-cmd')).toBe('"\'-cmd"');
    expect(toCsvCell('@ref')).toBe('"\'@ref"');
  });

  it('serialises numbers', () => {
    expect(toCsvCell(12)).toBe('"12"');
  });
});

describe('buildUnmatchedLinesCsv', () => {
  it('emits the header row followed by one row per line', () => {
    const csv = buildUnmatchedLinesCsv([lineFixture], headers);
    const rows = csv.trimEnd().split('\r\n');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toBe(headers.map(h => `"${h}"`).join(','));
    expect(rows[1]).toContain('"3528700123456"');
    expect(rows[1]).toContain('"MX-2255"');
    expect(rows[1]).toContain('"NO_EAN_MATCH"');
    expect(rows[1]).toContain('"12"');
  });

  it('writes columns in the declared order including first/last seen', () => {
    const csv = buildUnmatchedLinesCsv([lineFixture], headers);
    const cells = csv.trimEnd().split('\r\n')[1].split(',');

    expect(UNMATCHED_CSV_COLUMNS).toHaveLength(cells.length);
    expect(cells[5]).toBe('"2026-08-01T03:04:00Z"');
    expect(cells[6]).toBe('"2026-08-12T03:04:00Z"');
  });

  it('emits a header-only document for an empty worklist', () => {
    const csv = buildUnmatchedLinesCsv([], headers);

    expect(csv.trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('unmatchedLinesFileName', () => {
  it('builds a filesystem-safe name from the profile id and instant', () => {
    expect(unmatchedLinesFileName('profile-1', '2026-08-12T03:04:05.678Z')).toBe(
      'pricat-unmatched-profile-1-2026-08-12T03-04-05-678Z.csv',
    );
  });
});
