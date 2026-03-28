/**
 * InventoryService unit tests — CAP-214 Wave H
 *
 * API paths covered:
 *   listInventoryLocations      → GET  /v1/inventory/locations
 *   listStorageLocations        → GET  /v1/inventory/storage-locations?locationId=...
 *   getStorageLocation          → GET  /v1/inventory/storage-locations/{id}
 *   createStorageLocation       → POST /v1/inventory/storage-locations (Idempotency-Key)
 *   updateStorageLocation       → PUT  /v1/inventory/storage-locations/{id} (Idempotency-Key)
 *   deactivateStorageLocation   → POST /v1/inventory/storage-locations/{id}/deactivate
 *   listStorageTypes            → GET  /v1/inventory/meta/storage-types
 *   listSyncLogs                → GET  /v1/inventory/sync-logs
 *   triggerLocationSync         → POST /v1/inventory/locations/sync (Idempotency-Key)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { HttpParams } from '@angular/common/http';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryService } from './inventory.service';

// ---------------------------------------------------------------------------
// Shared mock
// ---------------------------------------------------------------------------

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  deleteWithBody: vi.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('InventoryService [CAP-214]', () => {
  let service: InventoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockReturnValue(of([]));
    apiMock.post.mockReturnValue(of({}));
    apiMock.put.mockReturnValue(of({}));

    TestBed.configureTestingModule({
      providers: [
        InventoryService,
        { provide: ApiBaseService, useValue: apiMock },
      ],
    });

    service = TestBed.inject(InventoryService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // ── listInventoryLocations() ───────────────────────────────────────────────

  describe('listInventoryLocations()', () => {
    it('calls GET /v1/inventory/locations', () => {
      service.listInventoryLocations().subscribe();

      const [path] = apiMock.get.mock.calls[0];
      expect(path).toBe('/v1/inventory/locations');
    });

    it('returns the locations array as an Observable', () => {
      const locations = [{ locationId: 'loc-1' }, { locationId: 'loc-2' }];
      apiMock.get.mockReturnValueOnce(of(locations));

      let result: unknown;
      service.listInventoryLocations().subscribe((r) => (result = r));

      expect(result).toEqual(locations);
    });

    it('passes status param when provided', () => {
      service.listInventoryLocations({ status: 'ACTIVE' }).subscribe();

      const [, params] = apiMock.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('status')).toBe('ACTIVE');
    });
  });

  // ── listStorageLocations() ─────────────────────────────────────────────────

  describe('listStorageLocations()', () => {
    it('calls GET /v1/inventory/storage-locations with locationId param', () => {
      service.listStorageLocations('loc-abc').subscribe();

      const [path, params] = apiMock.get.mock.calls[0] as [string, HttpParams];
      expect(path).toBe('/v1/inventory/storage-locations');
      expect(params.get('locationId')).toBe('loc-abc');
    });

    it('returns the storage locations array as an Observable', () => {
      const storageLocs = [{ storageLocationId: 'sl-1' }];
      apiMock.get.mockReturnValueOnce(of(storageLocs));

      let result: unknown;
      service.listStorageLocations('loc-abc').subscribe((r) => (result = r));

      expect(result).toEqual(storageLocs);
    });

    it('passes optional status param when provided', () => {
      service.listStorageLocations('loc-abc', { status: 'ACTIVE' }).subscribe();

      const [, params] = apiMock.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('status')).toBe('ACTIVE');
      expect(params.get('locationId')).toBe('loc-abc');
    });
  });

  // ── getStorageLocation() ───────────────────────────────────────────────────

  describe('getStorageLocation()', () => {
    it('calls GET /v1/inventory/storage-locations/{id}', () => {
      service.getStorageLocation('sl-999').subscribe();

      const [path] = apiMock.get.mock.calls[0];
      expect(path).toBe('/v1/inventory/storage-locations/sl-999');
    });

    it('returns the storage location object as an Observable', () => {
      const location = { storageLocationId: 'sl-999', name: 'Shelf A' };
      apiMock.get.mockReturnValueOnce(of(location));

      let result: unknown;
      service.getStorageLocation('sl-999').subscribe((r) => (result = r));

      expect(result).toEqual(location);
    });
  });

  // ── createStorageLocation() ────────────────────────────────────────────────

  describe('createStorageLocation()', () => {
    const payload = { name: 'Bin 42', locationId: 'loc-1' };

    it('calls POST /v1/inventory/storage-locations', () => {
      service.createStorageLocation(payload, 'idem-key-1').subscribe();

      const [path] = apiMock.post.mock.calls[0];
      expect(path).toBe('/v1/inventory/storage-locations');
    });

    it('sends the body', () => {
      service.createStorageLocation(payload, 'idem-key-1').subscribe();

      const [, body] = apiMock.post.mock.calls[0];
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

    it('calls PUT /v1/inventory/storage-locations/{id}', () => {
      service.updateStorageLocation('sl-1', updateBody, 'idem-key-update').subscribe();

      const [path] = apiMock.put.mock.calls[0];
      expect(path).toBe('/v1/inventory/storage-locations/sl-1');
    });

    it('sends the body', () => {
      service.updateStorageLocation('sl-1', updateBody, 'idem-key-update').subscribe();

      const [, body] = apiMock.put.mock.calls[0];
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

    it('calls POST /v1/inventory/storage-locations/{id}/deactivate', () => {
      service.deactivateStorageLocation('sl-2', deactivateBody, 'idem-key-deact').subscribe();

      const [path] = apiMock.post.mock.calls[0];
      expect(path).toBe('/v1/inventory/storage-locations/sl-2/deactivate');
    });

    it('sends the body', () => {
      service.deactivateStorageLocation('sl-2', deactivateBody, 'idem-key-deact').subscribe();

      const [, body] = apiMock.post.mock.calls[0];
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
    it('calls GET /v1/inventory/meta/storage-types', () => {
      service.listStorageTypes().subscribe();

      const [path] = apiMock.get.mock.calls[0];
      expect(path).toBe('/v1/inventory/meta/storage-types');
    });

    it('returns the storage types array as an Observable', () => {
      const types = [{ code: 'SHELF' }, { code: 'BIN' }];
      apiMock.get.mockReturnValueOnce(of(types));

      let result: unknown;
      service.listStorageTypes().subscribe((r) => (result = r));

      expect(result).toEqual(types);
    });
  });

  // ── listSyncLogs() ────────────────────────────────────────────────────────

  describe('listSyncLogs()', () => {
    it('calls GET /v1/inventory/sync-logs', () => {
      service.listSyncLogs().subscribe();

      const [path] = apiMock.get.mock.calls[0];
      expect(path).toBe('/v1/inventory/sync-logs');
    });

    it('returns the sync logs array as an Observable', () => {
      const logs = [{ syncLogId: 'log-1', outcome: 'SUCCESS' }];
      apiMock.get.mockReturnValueOnce(of(logs));

      let result: unknown;
      service.listSyncLogs().subscribe((r) => (result = r));

      expect(result).toEqual(logs);
    });

    it('passes outcome param when provided', () => {
      service.listSyncLogs({ outcome: 'FAILURE' }).subscribe();

      const [, params] = apiMock.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('outcome')).toBe('FAILURE');
    });

    it('passes pagination params when provided', () => {
      service.listSyncLogs({ pageIndex: 0, pageSize: 20 }).subscribe();

      const [, params] = apiMock.get.mock.calls[0] as [string, HttpParams];
      expect(params.get('pageIndex')).toBe('0');
      expect(params.get('pageSize')).toBe('20');
    });
  });

  // ── triggerLocationSync() ─────────────────────────────────────────────────

  describe('triggerLocationSync()', () => {
    it('calls POST /v1/inventory/locations/sync', () => {
      service.triggerLocationSync('idem-key-sync').subscribe();

      const [path] = apiMock.post.mock.calls[0];
      expect(path).toBe('/v1/inventory/locations/sync');
    });

    it('sends an empty body', () => {
      service.triggerLocationSync('idem-key-sync').subscribe();

      const [, body] = apiMock.post.mock.calls[0];
      expect(body).toEqual({});
    });

    it('forwards the Idempotency-Key header', () => {
      service.triggerLocationSync('idem-key-sync-xyz').subscribe();

      const [, , options] = apiMock.post.mock.calls[0];
      expect(options?.headers?.['Idempotency-Key']).toBe('idem-key-sync-xyz');
    });

    it('returns the server response as an Observable', () => {
      const response = { syncJobId: 'job-1', status: 'INITIATED' };
      apiMock.post.mockReturnValueOnce(of(response));

      let result: unknown;
      service.triggerLocationSync('idem-key-sync').subscribe((r) => (result = r));

      expect(result).toEqual(response);
    });
  });
});
