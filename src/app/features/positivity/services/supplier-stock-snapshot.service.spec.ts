/**
 * SupplierStockSnapshotService — generated-client adapter tests (#217).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PagedResponse,
  StockSnapshotSummary as SdkStockSnapshotSummary,
  SupplierStockSnapshotsService as SupplierStockSnapshotsApi,
} from '@durion-sdk/supplier';
import { SupplierStockSnapshotService } from './supplier-stock-snapshot.service';
import { StockSnapshotLinePage, StockSnapshotSummary } from '../models/supplier-stock-snapshot.models';

const VENDOR_ID = 'vp-0000-0001';
const SNAPSHOT_ID = 'snap-0000-0001';

const summaryDto: SdkStockSnapshotSummary = {
  snapshotId: SNAPSHOT_ID,
  vendorProfileId: VENDOR_ID,
  supplierRef: 'michelin-eu',
  buyerAccountNumber: 'ACC-1',
  countryCode: 'FR',
  documentId: 'DOC-1',
  issuedOn: '2026-08-11',
  snapshotAsOf: '2026-08-12T06:00:00Z',
  fetchedAt: '2026-08-12T07:15:00Z',
  completedAt: '2026-08-12T07:15:30Z',
  status: 'COMPLETED' as SdkStockSnapshotSummary['status'],
  protocolVersion: 'S2S_V1',
  linesReported: 250,
  linesRejected: 0,
};

const zeroQuantityLine = {
  lineId: 'line-1',
  vendorLineId: '417',
  articleEan: '3528709999083',
  supplierArticleCode: '999908',
  buyersArticleId: 'TY-4471',
  description: 'MICHELIN PILOT SPORT 5 225/45R17',
  availableQuantity: 0,
};

const unstatedQuantityLine = {
  ...zeroQuantityLine,
  lineId: 'line-2',
  availableQuantity: undefined,
};

describe('SupplierStockSnapshotService', () => {
  let service: SupplierStockSnapshotService;
  let api: {
    getLatestSupplierStockSnapshot: ReturnType<typeof vi.fn>;
    listSupplierStockSnapshotLines: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getLatestSupplierStockSnapshot: vi.fn().mockReturnValue(of(summaryDto)),
      listSupplierStockSnapshotLines: vi.fn().mockReturnValue(
        of({
          items: [zeroQuantityLine, unstatedQuantityLine],
          page: 0,
          size: 25,
          totalElements: 2,
          totalPages: 1,
        } as PagedResponse),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        SupplierStockSnapshotService,
        { provide: SupplierStockSnapshotsApi, useValue: api },
      ],
    });
    service = TestBed.inject(SupplierStockSnapshotService);
  });

  it('getLatestSnapshot() — calls the generated operation with the vendor profile id', () => {
    service.getLatestSnapshot(VENDOR_ID).subscribe();

    expect(api.getLatestSupplierStockSnapshot).toHaveBeenCalledWith(VENDOR_ID);
  });

  it('getLatestSnapshot() — keeps snapshotAsOf and fetchedAt as distinct fields', () => {
    let result: StockSnapshotSummary | undefined;
    service.getLatestSnapshot(VENDOR_ID).subscribe(value => (result = value));

    expect(result?.snapshotAsOf).toBe('2026-08-12T06:00:00Z');
    expect(result?.fetchedAt).toBe('2026-08-12T07:15:00Z');
    expect(result?.snapshotAsOf).not.toBe(result?.fetchedAt);
    expect(result?.snapshotId).toBe(SNAPSHOT_ID);
  });

  it('listLines() — pages by the given immutable snapshotId, never a re-derived one', () => {
    service.listLines(VENDOR_ID, SNAPSHOT_ID, 'pilot', 1, 10).subscribe();

    expect(api.listSupplierStockSnapshotLines).toHaveBeenCalledWith(
      VENDOR_ID,
      SNAPSHOT_ID,
      'pilot',
      1,
      10,
    );
  });

  it('listLines() — omits a blank search term rather than sending an empty string', () => {
    service.listLines(VENDOR_ID, SNAPSHOT_ID).subscribe();

    expect(api.listSupplierStockSnapshotLines).toHaveBeenCalledWith(
      VENDOR_ID,
      SNAPSHOT_ID,
      undefined,
      0,
      25,
    );
  });

  it('listLines() — keeps a zero quantity distinct from an unstated one', () => {
    let result: StockSnapshotLinePage | undefined;
    service.listLines(VENDOR_ID, SNAPSHOT_ID).subscribe(value => (result = value));

    expect(result?.items[0].availableQuantity).toBe(0);
    expect(result?.items[1].availableQuantity).toBeNull();
  });

  it('listLines() — maps every line field', () => {
    let result: StockSnapshotLinePage | undefined;
    service.listLines(VENDOR_ID, SNAPSHOT_ID).subscribe(value => (result = value));

    expect(result?.items[0]).toEqual({
      lineId: 'line-1',
      vendorLineId: '417',
      articleEan: '3528709999083',
      supplierArticleCode: '999908',
      buyersArticleId: 'TY-4471',
      description: 'MICHELIN PILOT SPORT 5 225/45R17',
      availableQuantity: 0,
    });
  });
});
