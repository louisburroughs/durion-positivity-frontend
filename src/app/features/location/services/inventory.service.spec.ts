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
 * Storage-location writes (and the single storage-location read) have no SDK
 * operation and remain hand-written paths through ApiBaseService:
 *   getStorageLocation      → GET  /inventory/v1/inventory/storage-locations/{id}
 *   createStorageLocation   → POST /inventory/v1/inventory/storage-locations (Idempotency-Key)
 *   updateStorageLocation   → PUT  /inventory/v1/inventory/storage-locations/{id} (Idempotency-Key)
 *   deactivateStorageLocation → POST /inventory/v1/inventory/storage-locations/{id}/deactivate
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { InventoryReferenceDataService, LocationSyncService } from '@durion-sdk/inventory';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryService } from './inventory.service';
import { LocationDto, StorageLocationDto, SyncLogResponse } from '../models/location-sync.models';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  deleteWithBody: vi.fn(),
};

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
    apiMock.get.mockReturnValue(of({}));
    apiMock.post.mockReturnValue(of({}));
    apiMock.put.mockReturnValue(of({}));
    refDataMock.listInventoryLocations.mockReturnValue(of({ content: [] }));
    refDataMock.listInventoryStorageLocations.mockReturnValue(of({ content: [] }));
    refDataMock.listStorageTypes.mockReturnValue(of([]));
    syncMock.listSyncLogs.mockReturnValue(of([]));
    syncMock.getSyncLog.mockReturnValue(of({}));
    syncMock.triggerLocationSync.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        { provide: ApiBaseService, useValue: apiMock },
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

      expect(refDataMock.listInventoryLocations).toHaveBeenCalledWith({ page: 2, size: 50 });
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

      expect(refDataMock.listInventoryStorageLocations).toHaveBeenCalledWith({ size: 25 }, 'loc-abc');
    });

    it('unwraps the Spring Page content into a typed array', () => {
      const rows: StorageLocationDto[] = [{ storageLocationId: 'sl-1', locationId: 'loc-abc', code: 'A1', active: true }];
      refDataMock.listInventoryStorageLocations.mockReturnValueOnce(of({ content: rows }));

      let result: StorageLocationDto[] | undefined;
      service.listStorageLocations('loc-abc').subscribe(r => (result = r));

      expect(result).toEqual(rows);
    });
  });

  // ── getStorageLocation() ───────────────────────────────────────────────────

  describe('getStorageLocation()', () => {
    it('calls GET /inventory/v1/inventory/storage-locations/{id}', () => {
      service.getStorageLocation('sl-999').subscribe();

      const [path] = apiMock.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/inventory/storage-locations/sl-999');
    });
  });

  // ── createStorageLocation() ────────────────────────────────────────────────

  describe('createStorageLocation()', () => {
    const payload = { name: 'Bin 42', locationId: 'loc-1' };

    it('calls POST /inventory/v1/inventory/storage-locations with the body', () => {
      service.createStorageLocation(payload, 'idem-key-1').subscribe();

      const [path, body] = apiMock.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/inventory/storage-locations');
      expect(body).toEqual(payload);
    });

    it('forwards the Idempotency-Key header', () => {
      service.createStorageLocation(payload, 'idem-key-create').subscribe();

      const [, , options] = apiMock.post.mock.calls[0];
      expect(options?.headers?.['Idempotency-Key']).toBe('idem-key-create');
    });

    it('omits Idempotency-Key header when key is not provided', () => {
      service.createStorageLocation(payload).subscribe();

      const [, , options] = apiMock.post.mock.calls[0];
      expect(options).toBeUndefined();
    });
  });

  // ── updateStorageLocation() ────────────────────────────────────────────────

  describe('updateStorageLocation()', () => {
    const updateBody = { name: 'Bin 43' };

    it('calls PUT /inventory/v1/inventory/storage-locations/{id} with the body', () => {
      service.updateStorageLocation('sl-1', updateBody, 'idem-key-update').subscribe();

      const [path, body] = apiMock.put.mock.calls[0];
      expect(path).toBe('/inventory/v1/inventory/storage-locations/sl-1');
      expect(body).toEqual(updateBody);
    });

    it('forwards the Idempotency-Key header', () => {
      service.updateStorageLocation('sl-1', updateBody, 'idem-key-update').subscribe();

      const [, , options] = apiMock.put.mock.calls[0];
      expect(options?.headers?.['Idempotency-Key']).toBe('idem-key-update');
    });
  });

  // ── deactivateStorageLocation() ───────────────────────────────────────────

  describe('deactivateStorageLocation()', () => {
    const deactivateBody = { reason: 'OBSOLETE' };

    it('calls POST /inventory/v1/inventory/storage-locations/{id}/deactivate with the body', () => {
      service.deactivateStorageLocation('sl-2', deactivateBody, 'idem-key-deact').subscribe();

      const [path, body] = apiMock.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/inventory/storage-locations/sl-2/deactivate');
      expect(body).toEqual(deactivateBody);
    });

    it('forwards the Idempotency-Key header', () => {
      service.deactivateStorageLocation('sl-2', deactivateBody, 'idem-key-deact').subscribe();

      const [, , options] = apiMock.post.mock.calls[0];
      expect(options?.headers?.['Idempotency-Key']).toBe('idem-key-deact');
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
