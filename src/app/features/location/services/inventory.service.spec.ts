/**
 * InventoryService unit tests
 *
 * Sync + reference-data operations delegate to the generated
 * `@durion-sdk/inventory` services:
 *   listInventoryLocations  → InventoryReferenceDataService.listInventoryLocations
 *   listStorageLocations    → InventoryReferenceDataService.listInventoryStorageLocations
 *   listStorageTypes        → InventoryReferenceDataService.listStorageTypes
 *   listSyncLogs            → LocationSyncService.listSyncLogs
 *   getSyncLog              → LocationSyncService.getSyncLog
 *   triggerLocationSync     → LocationSyncService.triggerLocationSync
 *
 * Issue #371: this service used to also carry getStorageLocation/createStorageLocation/
 * updateStorageLocation/deactivateStorageLocation, hand-built against the wrong module
 * (`/inventory/v1/inventory/storage-locations/...`, a pos-inventory read-only placeholder)
 * and unreachable (404). None had a caller, so they were deleted along with their tests;
 * see location.service.spec.ts for the real, site-scoped storage-location operations.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InventoryReferenceDataService, LocationSyncService } from '@durion-sdk/inventory';
import { InventoryService } from './inventory.service';
import { LocationDto, StorageLocationDto, SyncLogResponse } from '../models/location-sync.models';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const refDataMock = {
  listInventoryLocations: vi.fn(),
  listInventoryStorageLocations: vi.fn(),
  listStorageTypes: vi.fn(),
};

const syncMock = {
  listSyncLogs: vi.fn(),
  getSyncLog: vi.fn(),
  triggerLocationSync: vi.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    refDataMock.listInventoryLocations.mockReturnValue(of({ content: [] }));
    refDataMock.listInventoryStorageLocations.mockReturnValue(of({ content: [] }));
    refDataMock.listStorageTypes.mockReturnValue(of([]));
    syncMock.listSyncLogs.mockReturnValue(of([]));
    syncMock.getSyncLog.mockReturnValue(of({}));
    syncMock.triggerLocationSync.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        { provide: InventoryReferenceDataService, useValue: refDataMock },
        { provide: LocationSyncService, useValue: syncMock },
      ],
    });

    service = TestBed.inject(InventoryService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ── listInventoryLocations() ───────────────────────────────────────────────

  describe('listInventoryLocations()', () => {
    it('delegates to the SDK with a pageable derived from pageIndex/pageSize', () => {
      service.listInventoryLocations({ pageIndex: 2, pageSize: 50 }).subscribe();

      expect(refDataMock.listInventoryLocations).toHaveBeenCalledWith(undefined, 2, 50);
    });

    it('unwraps the Spring Page content into a typed array', () => {
      const rows: LocationDto[] = [{ locationId: 'loc-1', name: 'Main', type: 'WAREHOUSE', active: true }];
      refDataMock.listInventoryLocations.mockReturnValueOnce(of({ content: rows }));

      let result: LocationDto[] | undefined;
      service.listInventoryLocations({ pageSize: 50 }).subscribe(r => (result = r));

      expect(result).toEqual(rows);
    });

    it('returns an empty array when the page has no content', () => {
      refDataMock.listInventoryLocations.mockReturnValueOnce(of({}));

      let result: LocationDto[] | undefined;
      service.listInventoryLocations().subscribe(r => (result = r));

      expect(result).toEqual([]);
    });
  });

  // ── listStorageLocations() ─────────────────────────────────────────────────

  describe('listStorageLocations()', () => {
    it('delegates to the SDK with pageable and locationId', () => {
      service.listStorageLocations('loc-abc', { pageSize: 25 }).subscribe();

      expect(refDataMock.listInventoryStorageLocations).toHaveBeenCalledWith('loc-abc', undefined, 25);
    });

    it('unwraps the Spring Page content into a typed array', () => {
      const rows: StorageLocationDto[] = [{ storageLocationId: 'sl-1', locationId: 'loc-abc', code: 'A1', active: true }];
      refDataMock.listInventoryStorageLocations.mockReturnValueOnce(of({ content: rows }));

      let result: StorageLocationDto[] | undefined;
      service.listStorageLocations('loc-abc').subscribe(r => (result = r));

      expect(result).toEqual(rows);
    });
  });

  // ── listStorageTypes() ────────────────────────────────────────────────────

  describe('listStorageTypes()', () => {
    it('delegates to the SDK', () => {
      service.listStorageTypes().subscribe();

      expect(refDataMock.listStorageTypes).toHaveBeenCalled();
    });

    it('returns the storage types array', () => {
      const types = ['SHELF', 'BIN'];
      refDataMock.listStorageTypes.mockReturnValueOnce(of(types));

      let result: string[] | undefined;
      service.listStorageTypes().subscribe(r => (result = r));

      expect(result).toEqual(types);
    });
  });

  // ── listSyncLogs() ────────────────────────────────────────────────────────

  describe('listSyncLogs()', () => {
    it('delegates to the SDK with outcome and pagination aliases', () => {
      service.listSyncLogs({ outcome: 'FAILED', pageIndex: 1, pageSize: 20 }).subscribe();

      expect(syncMock.listSyncLogs).toHaveBeenCalledWith('FAILED', undefined, undefined, 1, 20);
    });

    it('passes undefined filters when no params are provided', () => {
      service.listSyncLogs().subscribe();

      expect(syncMock.listSyncLogs).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, undefined);
    });

    it('returns the sync logs array', () => {
      const logs: SyncLogResponse[] = [
        { syncLogId: 'log-1', syncRunId: 'run-1', scope: 'RUN', outcome: 'OK', createdAt: '2025-01-01T00:00:00Z' },
      ];
      syncMock.listSyncLogs.mockReturnValueOnce(of(logs));

      let result: SyncLogResponse[] | undefined;
      service.listSyncLogs().subscribe(r => (result = r));

      expect(result).toEqual(logs);
    });
  });

  // ── getSyncLog() ──────────────────────────────────────────────────────────

  describe('getSyncLog()', () => {
    it('delegates to the SDK with the log id', () => {
      service.getSyncLog('log-1').subscribe();

      expect(syncMock.getSyncLog).toHaveBeenCalledWith('log-1');
    });
  });

  // ── triggerLocationSync() ─────────────────────────────────────────────────

  describe('triggerLocationSync()', () => {
    it('delegates to the SDK with the idempotency key', () => {
      service.triggerLocationSync('idem-key-sync').subscribe();

      expect(syncMock.triggerLocationSync).toHaveBeenCalledWith('idem-key-sync');
    });

    it('returns the server response', () => {
      const response = { syncRunId: 'run-1', outcome: 'OK' };
      syncMock.triggerLocationSync.mockReturnValueOnce(of(response));

      let result: unknown;
      service.triggerLocationSync('idem-key-sync').subscribe(r => (result = r));

      expect(result).toEqual(response);
    });
  });
});
