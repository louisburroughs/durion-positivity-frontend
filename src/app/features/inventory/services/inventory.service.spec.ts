import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryDomainService } from './inventory.service';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  LocationZone,
  PutawayCompleteRequest,
  PutawayResult,
  PutawayTask,
  ReplenishmentTask,
  ReturnReasonCode,
  ReturnToStockRequest,
  ReturnToStockResult,
  ReturnableItem,
  ShortageOption,
  ShortageResolutionRequest,
  ShortageResolutionResult,
  StorageLocation,
} from '../models/inventory.models';

describe('InventoryDomainService', () => {
  let service: InventoryDomainService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryDomainService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(InventoryDomainService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── queryAvailability() ────────────────────────────────────────────────

  describe('queryAvailability()', () => {
    const mockView: AvailabilityView = {
      productSku: 'SKU-001',
      locationId: 'loc-01',
      onHandQuantity: 10,
      allocatedQuantity: 2,
      availableToPromiseQuantity: 8,
      unitOfMeasure: 'EA',
    };

    it('calls GET /inventory/v1/availability with sku param', () => {
      apiStub.get.mockReturnValueOnce(of([mockView]));

      service.queryAvailability('SKU-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/availability');
      expect((params as HttpParams).get('sku')).toBe('SKU-001');
    });

    it('includes locationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of([mockView]));

      service.queryAvailability('SKU-001', 'loc-01').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('locationId')).toBe('loc-01');
    });

    it('includes storageLocationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of([{ ...mockView, storageLocationId: 'sl-02' }]));

      service.queryAvailability('SKU-001', 'loc-01', 'sl-02').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('storageLocationId')).toBe('sl-02');
    });

    it('does NOT include locationId param when omitted', () => {
      apiStub.get.mockReturnValueOnce(of([mockView]));

      service.queryAvailability('SKU-001').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('locationId')).toBe(false);
    });

    it('returns the AvailabilityView array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of([mockView]));

      let result: AvailabilityView[] | undefined;
      service.queryAvailability('SKU-001').subscribe(r => (result = r));

      expect(result).toEqual([mockView]);
    });
  });

  // ── getLocations() ─────────────────────────────────────────────────────

  describe('getLocations()', () => {
    const mockLocations: LocationRef[] = [
      { locationId: 'loc-01', name: 'Main Warehouse', status: 'ACTIVE' },
      { locationId: 'loc-02', name: 'Secondary Warehouse', status: 'ACTIVE' },
    ];

    it('calls GET /inventory/v1/locations with no query params', () => {
      apiStub.get.mockReturnValueOnce(of(mockLocations));

      service.getLocations().subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations');
    });

    it('returns the LocationRef array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockLocations));

      let result: LocationRef[] | undefined;
      service.getLocations().subscribe(r => (result = r));

      expect(result).toEqual(mockLocations);
    });
  });

  // ── getStorageLocations() ──────────────────────────────────────────────

  describe('getStorageLocations()', () => {
    const mockStorageLocations: StorageLocation[] = [
      { storageLocationId: 'sl-01', name: 'Rack A', locationId: 'loc-01', status: 'ACTIVE' },
    ];

    it('calls GET /inventory/v1/locations/{locationId}/storage-locations', () => {
      apiStub.get.mockReturnValueOnce(of(mockStorageLocations));

      service.getStorageLocations('loc-01').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations/loc-01/storage-locations');
    });

    it('URL-encodes the locationId', () => {
      apiStub.get.mockReturnValueOnce(of(mockStorageLocations));

      service.getStorageLocations('loc/01').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations/loc%2F01/storage-locations');
    });

    it('returns the StorageLocation array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockStorageLocations));

      let result: StorageLocation[] | undefined;
      service.getStorageLocations('loc-01').subscribe(r => (result = r));

      expect(result).toEqual(mockStorageLocations);
    });
  });

  // ── queryLedger() ──────────────────────────────────────────────────────

  describe('queryLedger()', () => {
    const mockEntry: InventoryLedgerEntry = {
      ledgerEntryId: 'entry-001',
      timestamp: '2026-01-15T10:00:00Z',
      movementType: 'RECEIPT',
      productSku: 'SKU-001',
      quantityChange: 50,
      uom: 'EA',
    };
    const mockPage: LedgerPageResponse = {
      items: [mockEntry],
      nextPageToken: null,
    };

    it('calls GET /inventory/v1/ledger with filter params', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      const filter: LedgerFilter = { locationId: 'loc-01', productSku: 'SKU-001' };
      service.queryLedger(filter).subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/ledger');
      expect((params as HttpParams).get('locationId')).toBe('loc-01');
      expect((params as HttpParams).get('productSku')).toBe('SKU-001');
    });

    it('includes dateFrom and dateTo params when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryLedger({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('dateFrom')).toBe('2026-01-01');
      expect((params as HttpParams).get('dateTo')).toBe('2026-03-31');
    });

    it('omits filter params that are not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryLedger({}).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).has('locationId')).toBe(false);
      expect((params as HttpParams).has('productSku')).toBe(false);
    });

    it('returns the LedgerPageResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      let result: LedgerPageResponse | undefined;
      service.queryLedger({}).subscribe(r => (result = r));

      expect(result).toEqual(mockPage);
    });
  });

  // ── getLedgerEntry() ──────────────────────────────────────────────────

  describe('getLedgerEntry()', () => {
    const mockEntry: InventoryLedgerEntry = {
      ledgerEntryId: 'entry-001',
      timestamp: '2026-01-15T10:00:00Z',
      movementType: 'RECEIPT',
      productSku: 'SKU-001',
      quantityChange: 50,
      uom: 'EA',
    };

    it('calls GET /inventory/v1/ledger/{ledgerEntryId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockEntry));

      service.getLedgerEntry('entry-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/ledger/entry-001');
    });

    it('URL-encodes the ledgerEntryId', () => {
      apiStub.get.mockReturnValueOnce(of(mockEntry));

      service.getLedgerEntry('entry/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/ledger/entry%2F001');
    });

    it('returns the InventoryLedgerEntry emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockEntry));

      let result: InventoryLedgerEntry | undefined;
      service.getLedgerEntry('entry-001').subscribe(r => (result = r));

      expect(result).toEqual(mockEntry);
    });
  });

  // ── getPutawayTasks() ──────────────────────────────────────────────────

  describe('getPutawayTasks()', () => {
    const mockTasks: PutawayTask[] = [
      {
        putawayTaskId: 'task-001',
        locationId: 'loc-01',
        stagingStorageLocationId: 'sl-staging',
        productSku: 'SKU-001',
        quantity: 10,
        uom: 'EA',
        status: 'PENDING',
      },
    ];

    it('calls GET /inventory/v1/putaway/tasks without locationId param when not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      service.getPutawayTasks().subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/putaway/tasks');
      expect((params as HttpParams).has('locationId')).toBe(false);
    });

    it('includes locationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      service.getPutawayTasks('loc-01').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('locationId')).toBe('loc-01');
    });

    it('returns the PutawayTask array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      let result: PutawayTask[] | undefined;
      service.getPutawayTasks().subscribe(r => (result = r));

      expect(result).toEqual(mockTasks);
    });
  });

  // ── completePutawayTask() ──────────────────────────────────────────────

  describe('completePutawayTask()', () => {
    const mockBody: PutawayCompleteRequest = {
      putawayTaskId: 'task-001',
      targetStorageLocationId: 'sl-target',
    };
    const mockResult: PutawayResult = {
      putawayTaskId: 'task-001',
      status: 'COMPLETED',
      ledgerEntryId: 'le-001',
    };

    it('calls POST /inventory/v1/putaway/tasks/{taskId}/complete', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.completePutawayTask('task-001', mockBody).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/putaway/tasks/task-001/complete');
      expect(body).toEqual(mockBody);
    });

    it('URL-encodes the taskId', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.completePutawayTask('task/001', mockBody).subscribe();

      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/putaway/tasks/task%2F001/complete');
    });

    it('returns the PutawayResult emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      let result: PutawayResult | undefined;
      service.completePutawayTask('task-001', mockBody).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });

  // ── getReplenishmentTasks() ────────────────────────────────────────────

  describe('getReplenishmentTasks()', () => {
    const mockTasks: ReplenishmentTask[] = [
      {
        replenishmentTaskId: 'rt-001',
        locationId: 'loc-01',
        fromStorageLocationId: 'sl-from',
        toStorageLocationId: 'sl-to',
        productSku: 'SKU-001',
        requestedQty: 20,
        uom: 'EA',
        status: 'PENDING',
      },
    ];

    it('calls GET /inventory/v1/replenishment/tasks without locationId param when not provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      service.getReplenishmentTasks().subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/replenishment/tasks');
      expect((params as HttpParams).has('locationId')).toBe(false);
    });

    it('includes locationId param when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      service.getReplenishmentTasks('loc-01').subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('locationId')).toBe('loc-01');
    });

    it('returns the ReplenishmentTask array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockTasks));

      let result: ReplenishmentTask[] | undefined;
      service.getReplenishmentTasks().subscribe(r => (result = r));

      expect(result).toEqual(mockTasks);
    });
  });

  // ── getLocationZones() ────────────────────────────────────────────────

  describe('getLocationZones()', () => {
    const mockZones: LocationZone[] = [
      { zoneId: 'zone-01', zoneName: 'Zone A', locationId: 'loc-01' },
      { zoneId: 'zone-02', zoneName: 'Zone B', locationId: 'loc-01' },
    ];

    it('calls GET /inventory/v1/locations/{locationId}/zones', () => {
      apiStub.get.mockReturnValueOnce(of(mockZones));

      service.getLocationZones('loc-01').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations/loc-01/zones');
    });

    it('URL-encodes the locationId', () => {
      apiStub.get.mockReturnValueOnce(of(mockZones));

      service.getLocationZones('loc/01').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/locations/loc%2F01/zones');
    });

    it('returns the LocationZone array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockZones));

      let result: LocationZone[] | undefined;
      service.getLocationZones('loc-01').subscribe(r => (result = r));

      expect(result).toEqual(mockZones);
    });
  });

  // ── getReturnableItems() ──────────────────────────────────────────────

  describe('getReturnableItems()', () => {
    const mockItems: ReturnableItem[] = [
      {
        workorderLineId: 'line-001',
        productSku: 'SKU-001',
        maxReturnableQty: 5,
        uom: 'EA',
      },
    ];

    it('calls GET /inventory/v1/workorders/{workorderId}/returnable-items', () => {
      apiStub.get.mockReturnValueOnce(of(mockItems));

      service.getReturnableItems('wo-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/workorders/wo-001/returnable-items');
    });

    it('URL-encodes the workorderId', () => {
      apiStub.get.mockReturnValueOnce(of(mockItems));

      service.getReturnableItems('wo/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/workorders/wo%2F001/returnable-items');
    });

    it('returns the ReturnableItem array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockItems));

      let result: ReturnableItem[] | undefined;
      service.getReturnableItems('wo-001').subscribe(r => (result = r));

      expect(result).toEqual(mockItems);
    });
  });

  // ── getReasonCodes() ──────────────────────────────────────────────────

  describe('getReasonCodes()', () => {
    const mockCodes: ReturnReasonCode[] = [
      { code: 'DAMAGED', label: 'Damaged part' },
      { code: 'UNUSED', label: 'Unused part' },
    ];

    it('calls GET /inventory/v1/reasons with type param', () => {
      apiStub.get.mockReturnValueOnce(of(mockCodes));

      service.getReasonCodes('RETURN').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/reasons');
      expect((params as HttpParams).get('type')).toBe('RETURN');
    });

    it('returns the ReturnReasonCode array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockCodes));

      let result: ReturnReasonCode[] | undefined;
      service.getReasonCodes('RETURN').subscribe(r => (result = r));

      expect(result).toEqual(mockCodes);
    });
  });

  // ── submitReturnToStock() ──────────────────────────────────────────────

  describe('submitReturnToStock()', () => {
    const mockRequest: ReturnToStockRequest = {
      workorderId: 'wo-001',
      locationId: 'loc-01',
      reasonCode: 'UNUSED',
      lines: [{ workorderLineId: 'line-001', quantityToReturn: 2 }],
    };

    const mockResult: ReturnToStockResult = {
      returnId: 'ret-001',
      workorderId: 'wo-001',
      totalItemsReturned: 2,
    };

    it('calls POST /inventory/v1/movements/return-to-stock with request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.submitReturnToStock(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/movements/return-to-stock');
      expect(body).toEqual(mockRequest);
    });

    it('returns the ReturnToStockResult emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      let result: ReturnToStockResult | undefined;
      service.submitReturnToStock(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });

  // ── getShortageOptions() ──────────────────────────────────────────────

  describe('getShortageOptions()', () => {
    const mockOptions: ShortageOption[] = [
      { optionId: 'opt-01', decisionType: 'SUBSTITUTE', label: 'Use substitute part' },
      { optionId: 'opt-02', decisionType: 'BACKORDER', label: 'Backorder part', leadTimeDays: 3 },
    ];

    it('calls GET /inventory/v1/workorders/{workorderId}/allocations/{allocationLineId}/shortage-options', () => {
      apiStub.get.mockReturnValueOnce(of(mockOptions));

      service.getShortageOptions('wo-001', 'alloc-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe(
        '/inventory/v1/workorders/wo-001/allocations/alloc-001/shortage-options',
      );
    });

    it('URL-encodes workorderId and allocationLineId', () => {
      apiStub.get.mockReturnValueOnce(of(mockOptions));

      service.getShortageOptions('wo/001', 'alloc/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toContain('wo%2F001/allocations/alloc%2F001');
    });

    it('returns the ShortageOption array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockOptions));

      let result: ShortageOption[] | undefined;
      service.getShortageOptions('wo-001', 'alloc-001').subscribe(r => (result = r));

      expect(result).toEqual(mockOptions);
    });
  });

  // ── resolveShortage() ──────────────────────────────────────────────────

  describe('resolveShortage()', () => {
    const mockRequest: ShortageResolutionRequest = {
      workorderId: 'wo-001',
      allocationLineId: 'alloc-001',
      optionId: 'opt-01',
      decisionType: 'SUBSTITUTE',
      clientRequestId: 'req-uuid-001',
    };

    const mockResult: ShortageResolutionResult = {
      allocationLineId: 'alloc-001',
      resolvedDecisionType: 'SUBSTITUTE',
    };

    it('calls POST /inventory/v1/workorders/{workorderId}/allocations/{allocationLineId}/resolve-shortage', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.resolveShortage(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path] = apiStub.post.mock.calls[0];
      expect(path).toBe(
        '/inventory/v1/workorders/wo-001/allocations/alloc-001/resolve-shortage',
      );
    });

    it('posts the full ShortageResolutionRequest as body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.resolveShortage(mockRequest).subscribe();

      const [, body] = apiStub.post.mock.calls[0];
      expect(body).toEqual(mockRequest);
    });

    it('returns the ShortageResolutionResult emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      let result: ShortageResolutionResult | undefined;
      service.resolveShortage(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });
});
