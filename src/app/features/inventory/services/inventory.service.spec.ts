import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  InventoryAvailabilityService,
  InventoryLedgerService,
  InventoryReferenceDataService,
  PutawayExecutionService,
  PutawayService,
  ReplenishmentService,
  ReturnsService,
  ShortageResolutionService,
} from '@durion-sdk/inventory';
import { InventoryDomainService } from './inventory.service';
import {
  AvailabilityView,
  InventoryLedgerEntry,
  LedgerFilter,
  LedgerPageResponse,
  LocationRef,
  LocationZone,
  PutawayExecuteRequest,
  PutawayExecutionResult,
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

  const availabilityStub = {
    listAvailabilityBySku: vi.fn(),
  };
  const refDataStub = {
    listInventoryLocations: vi.fn(),
    listInventoryStorageLocations: vi.fn(),
    listInventoryLocationZones: vi.fn(),
  };
  const returnsStub = {
    listReturnReasonCodes: vi.fn(),
    listReturnableItems: vi.fn(),
    submitReturnToStock: vi.fn(),
  };
  const putawayExecutionStub = {
    executePutaway: vi.fn(),
  };
  const ledgerStub = {
    listInventoryLedger: vi.fn(),
    getInventoryLedgerEntry: vi.fn(),
  };
  const putawayStub = {
    listPutawayTasks: vi.fn(),
  };
  const replenishmentStub = {
    listReplenishmentTasks: vi.fn(),
  };
  const shortageStub = {
    listShortageOptions: vi.fn(),
    resolveShortage: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryDomainService,
        { provide: InventoryAvailabilityService, useValue: availabilityStub },
        { provide: InventoryReferenceDataService, useValue: refDataStub },
        { provide: ReturnsService, useValue: returnsStub },
        { provide: PutawayExecutionService, useValue: putawayExecutionStub },
        { provide: InventoryLedgerService, useValue: ledgerStub },
        { provide: PutawayService, useValue: putawayStub },
        { provide: ReplenishmentService, useValue: replenishmentStub },
        { provide: ShortageResolutionService, useValue: shortageStub },
      ],
    });
    service = TestBed.inject(InventoryDomainService);
  });

  afterEach(() => {
    // resetAllMocks (not clearAllMocks) also drains queued mockReturnValueOnce
    // values, so a stub left un-consumed by one test can't leak into the next.
    vi.resetAllMocks();
  });

  // ── queryAvailability() ────────────────────────────────────────────────

  describe('queryAvailability()', () => {
    const sdkView = {
      productSku: 'SKU-001',
      locationId: 'loc-01',
      onHandQuantity: 10,
      allocatedQuantity: 2,
      availableToPromiseQuantity: 8,
      unitOfMeasure: 'EA',
    };

    it('passes sku/locationId/storageLocationId to the availability SDK', () => {
      availabilityStub.listAvailabilityBySku.mockReturnValueOnce(of(sdkView));

      service.queryAvailability('SKU-001', 'loc-01', 'sl-02').subscribe();

      expect(availabilityStub.listAvailabilityBySku).toHaveBeenCalledWith('SKU-001', 'loc-01', 'sl-02');
    });

    it('passes undefined location filters when omitted', () => {
      availabilityStub.listAvailabilityBySku.mockReturnValueOnce(of(sdkView));

      service.queryAvailability('SKU-001').subscribe();

      expect(availabilityStub.listAvailabilityBySku).toHaveBeenCalledWith('SKU-001', undefined, undefined);
    });

    it('wraps the single availability view into an array', () => {
      availabilityStub.listAvailabilityBySku.mockReturnValueOnce(of(sdkView));

      let result: AvailabilityView[] | undefined;
      service.queryAvailability('SKU-001').subscribe(r => (result = r));

      expect(result).toEqual([sdkView]);
    });

    it('returns an empty array when the SDK yields no view', () => {
      availabilityStub.listAvailabilityBySku.mockReturnValueOnce(of(undefined));

      let result: AvailabilityView[] | undefined;
      service.queryAvailability('SKU-001').subscribe(r => (result = r));

      expect(result).toEqual([]);
    });
  });

  // ── getLocations() ─────────────────────────────────────────────────────

  describe('getLocations()', () => {
    it('requests a large page from the reference-data SDK', () => {
      refDataStub.listInventoryLocations.mockReturnValueOnce(of({ content: [] }));

      service.getLocations().subscribe();

      expect(refDataStub.listInventoryLocations).toHaveBeenCalledWith(undefined, undefined, 200);
    });

    it('maps SDK location DTOs to LocationRef (active -> ACTIVE)', () => {
      refDataStub.listInventoryLocations.mockReturnValueOnce(of({
        content: [
          { locationId: 'loc-01', name: 'Main Warehouse', active: true },
          { locationId: 'loc-02', name: 'Closed Depot', active: false },
        ],
      }));

      let result: LocationRef[] | undefined;
      service.getLocations().subscribe(r => (result = r));

      expect(result).toEqual([
        { locationId: 'loc-01', name: 'Main Warehouse', status: 'ACTIVE' },
        { locationId: 'loc-02', name: 'Closed Depot', status: 'INACTIVE' },
      ]);
    });
  });

  // ── getStorageLocations() ──────────────────────────────────────────────

  describe('getStorageLocations()', () => {
    it('requests storage locations for the site from the SDK', () => {
      refDataStub.listInventoryStorageLocations.mockReturnValueOnce(of({ content: [] }));

      service.getStorageLocations('loc-01').subscribe();

      expect(refDataStub.listInventoryStorageLocations).toHaveBeenCalledWith('loc-01', undefined, 500);
    });

    it('maps SDK storage DTOs to StorageLocation', () => {
      refDataStub.listInventoryStorageLocations.mockReturnValueOnce(of({
        content: [{ storageLocationId: 'sl-01', locationId: 'loc-01', code: 'Rack A', active: true }],
      }));

      let result: StorageLocation[] | undefined;
      service.getStorageLocations('loc-01').subscribe(r => (result = r));

      expect(result).toEqual([
        { storageLocationId: 'sl-01', locationId: 'loc-01', name: 'Rack A', barcode: undefined, status: 'ACTIVE' },
      ]);
    });
  });

  // ── queryLedger() ──────────────────────────────────────────────────────

  describe('queryLedger()', () => {
    const sdkEntry = {
      ledgerEntryId: 'entry-001',
      timestamp: '2026-01-15T10:00:00Z',
      eventType: 'GOODS_RECEIPT',
      stockItemId: 'SKU-001',
      changeInQuantity: 50,
      quantityAfter: 50,
      unitOfMeasure: 'EA',
      fromLocationId: 'loc-01',
      toLocationId: 'loc-02',
      transactionUserId: 'user-1',
      reasonCode: 'DAMAGE',
      sourceTransactionId: 'txn-1',
      workorderId: 'wo-1',
      workorderLineId: 'wol-1',
    };
    const mockPage = { entries: [sdkEntry], nextPageToken: null };

    it('calls InventoryLedgerService.listInventoryLedger with every filter field, in order', () => {
      ledgerStub.listInventoryLedger.mockReturnValueOnce(of(mockPage));

      const filter: LedgerFilter = {
        productSku: 'SKU-001',
        locationId: 'loc-01',
        storageLocationId: 'sl-01',
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
        sourceTransactionId: 'txn-1',
        workorderId: 'wo-1',
        workorderLineId: 'wol-1',
        movementTypes: ['GOODS_RECEIPT', 'TRANSFER_OUT'],
        pageToken: 'tok-1',
        pageSize: 25,
      };
      service.queryLedger(filter).subscribe();

      expect(ledgerStub.listInventoryLedger).toHaveBeenCalledWith(
        'SKU-001', 'loc-01', 'sl-01', '2026-01-01', '2026-03-31', 'txn-1', 'wo-1', 'wol-1',
        ['GOODS_RECEIPT', 'TRANSFER_OUT'], 'tok-1', 25,
      );
    });

    it('passes undefined for every omitted filter field', () => {
      ledgerStub.listInventoryLedger.mockReturnValueOnce(of(mockPage));

      service.queryLedger({}).subscribe();

      expect(ledgerStub.listInventoryLedger).toHaveBeenCalledWith(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined,
      );
    });

    it('maps entries (eventType/stockItemId/changeInQuantity/unitOfMeasure/transactionUserId) and drops from/toStorageLocationId', () => {
      ledgerStub.listInventoryLedger.mockReturnValueOnce(of(mockPage));

      let result: LedgerPageResponse | undefined;
      service.queryLedger({}).subscribe(r => (result = r));

      expect(result).toEqual({
        items: [{
          ledgerEntryId: 'entry-001',
          timestamp: '2026-01-15T10:00:00Z',
          movementType: 'GOODS_RECEIPT',
          productSku: 'SKU-001',
          quantityChange: 50,
          uom: 'EA',
          fromLocationId: 'loc-01',
          toLocationId: 'loc-02',
          actorId: 'user-1',
          reasonCode: 'DAMAGE',
          sourceTransactionId: 'txn-1',
          workorderId: 'wo-1',
          workorderLineId: 'wol-1',
        }],
        nextPageToken: null,
      });
    });

    it('defends against a non-array entries field (LedgerPage.entries is Array<any> in the SDK)', () => {
      ledgerStub.listInventoryLedger.mockReturnValueOnce(of({ entries: null, nextPageToken: null }));

      let result: LedgerPageResponse | undefined;
      service.queryLedger({}).subscribe(r => (result = r));

      expect(result).toEqual({ items: [], nextPageToken: null });
    });

    it('defaults nextPageToken to null when the SDK omits it', () => {
      ledgerStub.listInventoryLedger.mockReturnValueOnce(of({ entries: [] }));

      let result: LedgerPageResponse | undefined;
      service.queryLedger({}).subscribe(r => (result = r));

      expect(result?.nextPageToken).toBeNull();
    });
  });

  // ── getLedgerEntry() ──────────────────────────────────────────────────

  describe('getLedgerEntry()', () => {
    const sdkEntry = {
      ledgerEntryId: 'entry-001',
      timestamp: '2026-01-15T10:00:00Z',
      eventType: 'WORKORDER_CONSUMPTION',
      stockItemId: 'SKU-001',
      changeInQuantity: -2,
      quantityAfter: 8,
      unitOfMeasure: 'EA',
      workorderId: 'wo-1',
      workorderLineId: 'wol-1',
    };

    it('calls InventoryLedgerService.getInventoryLedgerEntry with the entry id', () => {
      ledgerStub.getInventoryLedgerEntry.mockReturnValueOnce(of(sdkEntry));

      service.getLedgerEntry('entry-001').subscribe();

      expect(ledgerStub.getInventoryLedgerEntry).toHaveBeenCalledWith('entry-001');
    });

    it('maps the returned InventoryLedgerEntryDto, including workorder fields', () => {
      ledgerStub.getInventoryLedgerEntry.mockReturnValueOnce(of(sdkEntry));

      let result: InventoryLedgerEntry | undefined;
      service.getLedgerEntry('entry-001').subscribe(r => (result = r));

      expect(result).toEqual({
        ledgerEntryId: 'entry-001',
        timestamp: '2026-01-15T10:00:00Z',
        movementType: 'WORKORDER_CONSUMPTION',
        productSku: 'SKU-001',
        quantityChange: -2,
        uom: 'EA',
        fromLocationId: undefined,
        toLocationId: undefined,
        actorId: undefined,
        reasonCode: undefined,
        sourceTransactionId: undefined,
        workorderId: 'wo-1',
        workorderLineId: 'wol-1',
      });
    });
  });

  // ── getPutawayTasks() ──────────────────────────────────────────────────

  describe('getPutawayTasks()', () => {
    const sdkTasks = [
      {
        taskId: 'task-001',
        sourceReceiptId: 'receipt-01',
        productId: 'sku-001',
        quantity: 10,
        sourceLocationId: 'sl-staging',
        status: 'PENDING',
        locationId: 'loc-01',
        uom: 'EA',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    ];

    it('calls PutawayService.listPutawayTasks without a locationId when not provided', () => {
      putawayStub.listPutawayTasks.mockReturnValueOnce(of(sdkTasks));

      service.getPutawayTasks().subscribe();

      expect(putawayStub.listPutawayTasks).toHaveBeenCalledWith(undefined);
    });

    it('passes locationId through when provided', () => {
      putawayStub.listPutawayTasks.mockReturnValueOnce(of(sdkTasks));

      service.getPutawayTasks('loc-01').subscribe();

      expect(putawayStub.listPutawayTasks).toHaveBeenCalledWith('loc-01');
    });

    it('maps PutawayTaskResponse to PutawayTask, including the new locationId/uom fields', () => {
      putawayStub.listPutawayTasks.mockReturnValueOnce(of(sdkTasks));

      let result: PutawayTask[] | undefined;
      service.getPutawayTasks().subscribe(r => (result = r));

      expect(result).toEqual([{
        taskId: 'task-001',
        sourceReceiptId: 'receipt-01',
        productId: 'sku-001',
        quantity: 10,
        sourceLocationId: 'sl-staging',
        suggestedDestinationLocationId: undefined,
        actualDestinationLocationId: undefined,
        status: 'PENDING',
        assigneeId: undefined,
        locationId: 'loc-01',
        uom: 'EA',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      }]);
    });
  });

  // ── executePutawayTask() (issue #377) ──────────────────────────────────

  describe('executePutawayTask()', () => {
    const mockRequest: PutawayExecuteRequest = {
      skuId: 'sku-001',
      sourceLocationId: 'sl-staging',
      destinationLocationId: 'sl-target',
      quantity: 10,
    };
    const mockSdkResponse = {
      ledgerEntryId: 'le-001',
      taskId: 'task-001',
      skuId: 'sku-001',
      sourceLocationId: 'sl-staging',
      destinationLocationId: 'sl-target',
      quantityMoved: 10,
      transactionType: 'PUT_AWAY',
      status: 'COMPLETED',
      executedAt: '2026-09-25T00:00:00Z',
      actorId: 'user-001',
    };
    const mockResult: PutawayExecutionResult = { ...mockSdkResponse };

    it('calls PutawayExecutionService.executePutaway with skuId/sourceLocationId/destinationLocationId/quantity', () => {
      putawayExecutionStub.executePutaway.mockReturnValueOnce(of(mockSdkResponse));

      service.executePutawayTask('task-001', mockRequest).subscribe();

      expect(putawayExecutionStub.executePutaway).toHaveBeenCalledWith('task-001', {
        skuId: 'sku-001',
        sourceLocationId: 'sl-staging',
        destinationLocationId: 'sl-target',
        quantity: 10,
      });
    });

    it('returns the mapped PutawayExecutionResult emitted by the SDK', () => {
      putawayExecutionStub.executePutaway.mockReturnValueOnce(of(mockSdkResponse));

      let result: PutawayExecutionResult | undefined;
      service.executePutawayTask('task-001', mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });

  // ── getReplenishmentTasks() ────────────────────────────────────────────

  describe('getReplenishmentTasks()', () => {
    const sdkTasks = [
      {
        taskId: 'rt-001',
        itemSKU: 'SKU-001',
        sourceLocationId: 'sl-from',
        destinationLocationId: 'sl-to',
        quantity: 20,
        uom: 'EA',
        status: 'PENDING',
        locationId: 'loc-01',
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        taskId: 'rt-002',
        itemSKU: 'SKU-002',
        sourceLocationId: 'sl-from-2',
        destinationLocationId: 'sl-to-2',
        quantity: 5,
        status: 'PENDING',
        locationId: 'loc-02',
        createdAt: '2026-09-01T00:00:00Z',
      },
    ];

    it('calls ReplenishmentService.listReplenishmentTasks with no arguments (no locationId param on the SDK op)', () => {
      replenishmentStub.listReplenishmentTasks.mockReturnValueOnce(of(sdkTasks));

      service.getReplenishmentTasks('loc-01').subscribe();

      expect(replenishmentStub.listReplenishmentTasks).toHaveBeenCalledWith();
    });

    it('filters client-side to the requested locationId', () => {
      replenishmentStub.listReplenishmentTasks.mockReturnValueOnce(of(sdkTasks));

      let result: ReplenishmentTask[] | undefined;
      service.getReplenishmentTasks('loc-01').subscribe(r => (result = r));

      expect(result).toEqual([{
        replenishmentTaskId: 'rt-001',
        locationId: 'loc-01',
        fromStorageLocationId: 'sl-from',
        toStorageLocationId: 'sl-to',
        productSku: 'SKU-001',
        requestedQty: 20,
        uom: 'EA',
        status: 'PENDING',
      }]);
    });

    it('returns every task, mapping a missing uom to an empty string, when no locationId filter is given', () => {
      replenishmentStub.listReplenishmentTasks.mockReturnValueOnce(of(sdkTasks));

      let result: ReplenishmentTask[] | undefined;
      service.getReplenishmentTasks().subscribe(r => (result = r));

      expect(result).toHaveLength(2);
      expect(result?.[1].uom).toBe('');
    });
  });

  // ── getLocationZones() ────────────────────────────────────────────────

  describe('getLocationZones()', () => {
    it('requests zones for the site from the SDK', () => {
      refDataStub.listInventoryLocationZones.mockReturnValueOnce(of({ content: [] }));

      service.getLocationZones('loc-01').subscribe();

      expect(refDataStub.listInventoryLocationZones).toHaveBeenCalledWith('loc-01', undefined, 500);
    });

    it('maps SDK zone DTOs to LocationZone', () => {
      refDataStub.listInventoryLocationZones.mockReturnValueOnce(of({
        content: [
          { zoneId: 'zone-01', zoneName: 'Zone A', locationId: 'loc-01' },
          { zoneId: 'zone-02', zoneName: 'Zone B', locationId: 'loc-01' },
        ],
      }));

      let result: LocationZone[] | undefined;
      service.getLocationZones('loc-01').subscribe(r => (result = r));

      expect(result).toEqual([
        { zoneId: 'zone-01', zoneName: 'Zone A', locationId: 'loc-01' },
        { zoneId: 'zone-02', zoneName: 'Zone B', locationId: 'loc-01' },
      ]);
    });
  });

  // ── getReturnableItems() ──────────────────────────────────────────────

  describe('getReturnableItems()', () => {
    const sdkItems = [
      {
        itemId: 'line-001',
        workorderLineId: 'line-001',
        sku: 'SKU-001',
        description: 'Brake pad',
        quantityReturnable: 5,
        uom: 'EA',
        workorderId: 'wo-001',
      },
    ];

    it('calls ReturnsService.listReturnableItems with the workorderId', () => {
      returnsStub.listReturnableItems.mockReturnValueOnce(of(sdkItems));

      service.getReturnableItems('wo-001').subscribe();

      expect(returnsStub.listReturnableItems).toHaveBeenCalledWith('wo-001');
    });

    it('maps ReturnableItemDto (sku -> productSku, quantityReturnable -> maxReturnableQty)', () => {
      returnsStub.listReturnableItems.mockReturnValueOnce(of(sdkItems));

      let result: ReturnableItem[] | undefined;
      service.getReturnableItems('wo-001').subscribe(r => (result = r));

      expect(result).toEqual([
        { workorderLineId: 'line-001', productSku: 'SKU-001', description: 'Brake pad', maxReturnableQty: 5, uom: 'EA' },
      ]);
    });

    it('defaults uom to an empty string when the SDK cannot resolve it', () => {
      returnsStub.listReturnableItems.mockReturnValueOnce(of([{ ...sdkItems[0], uom: undefined }]));

      let result: ReturnableItem[] | undefined;
      service.getReturnableItems('wo-001').subscribe(r => (result = r));

      expect(result?.[0].uom).toBe('');
    });
  });

  // ── getReasonCodes() ──────────────────────────────────────────────────

  describe('getReasonCodes()', () => {
    const sdkCodes = [
      { code: 'DAMAGED', description: 'Damaged part', category: 'PHYSICAL' },
      { code: 'UNUSED', description: 'Unused part', category: 'EXCESS' },
    ];

    it('calls listReturnReasonCodes with no arguments', () => {
      returnsStub.listReturnReasonCodes.mockReturnValueOnce(of(sdkCodes));

      service.getReasonCodes('RETURN').subscribe();

      expect(returnsStub.listReturnReasonCodes).toHaveBeenCalledWith();
    });

    it('maps SDK reason-code DTOs to ReturnReasonCode (description -> label)', () => {
      returnsStub.listReturnReasonCodes.mockReturnValueOnce(of(sdkCodes));

      let result: ReturnReasonCode[] | undefined;
      service.getReasonCodes('RETURN').subscribe(r => (result = r));

      expect(result).toEqual([
        { code: 'DAMAGED', label: 'Damaged part' },
        { code: 'UNUSED', label: 'Unused part' },
      ]);
    });
  });

  // ── submitReturnToStock() ──────────────────────────────────────────────

  describe('submitReturnToStock()', () => {
    const mockRequest: ReturnToStockRequest = {
      workorderId: 'wo-001',
      locationId: 'loc-01',
      storageLocationId: 'sl-01',
      reasonCode: 'UNUSED',
      lines: [{ workorderLineId: 'line-001', quantityToReturn: 2 }],
    };

    const sdkResult = {
      returnId: 'ret-001',
      workorderId: 'wo-001',
      status: 'SUBMITTED',
      processedLines: 1,
      processedAt: '2026-09-25T00:00:00Z',
    };

    it('calls ReturnsService.submitReturnToStock with itemId = workorderLineId and the header fields copied onto every line', () => {
      returnsStub.submitReturnToStock.mockReturnValueOnce(of(sdkResult));

      service.submitReturnToStock(mockRequest).subscribe();

      expect(returnsStub.submitReturnToStock).toHaveBeenCalledWith({
        workorderId: 'wo-001',
        lines: [{
          itemId: 'line-001',
          quantity: 2,
          reasonCode: 'UNUSED',
          locationId: 'loc-01',
          storageLocationId: 'sl-01',
        }],
      });
    });

    it('copies the header fields onto every line of a multi-line request', () => {
      returnsStub.submitReturnToStock.mockReturnValueOnce(of(sdkResult));

      service.submitReturnToStock({
        ...mockRequest,
        lines: [
          { workorderLineId: 'line-001', quantityToReturn: 2 },
          { workorderLineId: 'line-002', quantityToReturn: 1 },
        ],
      }).subscribe();

      const [body] = returnsStub.submitReturnToStock.mock.calls[0];
      expect(body.lines).toHaveLength(2);
      expect(body.lines[1]).toEqual({
        itemId: 'line-002',
        quantity: 1,
        reasonCode: 'UNUSED',
        locationId: 'loc-01',
        storageLocationId: 'sl-01',
      });
    });

    it('maps ReturnSubmissionResultDto (processedLines -> totalItemsReturned, processedAt -> createdAt)', () => {
      returnsStub.submitReturnToStock.mockReturnValueOnce(of(sdkResult));

      let result: ReturnToStockResult | undefined;
      service.submitReturnToStock(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({
        returnId: 'ret-001',
        workorderId: 'wo-001',
        totalItemsReturned: 1,
        status: 'SUBMITTED',
        createdAt: '2026-09-25T00:00:00Z',
      });
    });
  });

  // ── getShortageOptions() ──────────────────────────────────────────────

  describe('getShortageOptions()', () => {
    const sdkOptions = [
      { allocationId: 'alloc-001', optionType: 'SUBSTITUTE', description: 'Use substitute part', substituteSku: 'sku-sub' },
      { allocationId: 'alloc-001', optionType: 'BACKORDER', description: 'Backorder part', expectedResolutionDate: '2026-10-01' },
    ];

    it('calls ShortageResolutionService.listShortageOptions with allocationId and the optional filters', () => {
      shortageStub.listShortageOptions.mockReturnValueOnce(of(sdkOptions));

      service.getShortageOptions('alloc-001', 'sku-001', 3, 'wol-001', 'loc-01').subscribe();

      expect(shortageStub.listShortageOptions).toHaveBeenCalledWith('alloc-001', 'sku-001', 3, 'wol-001', 'loc-01');
    });

    it('passes undefined for every omitted optional filter', () => {
      shortageStub.listShortageOptions.mockReturnValueOnce(of(sdkOptions));

      service.getShortageOptions('alloc-001').subscribe();

      expect(shortageStub.listShortageOptions).toHaveBeenCalledWith('alloc-001', undefined, undefined, undefined, undefined);
    });

    it('maps ShortageOptionDto to the local ShortageOption shape', () => {
      shortageStub.listShortageOptions.mockReturnValueOnce(of(sdkOptions));

      let result: ShortageOption[] | undefined;
      service.getShortageOptions('alloc-001').subscribe(r => (result = r));

      expect(result).toEqual([
        {
          allocationId: 'alloc-001', optionType: 'SUBSTITUTE', description: 'Use substitute part',
          availableQuantity: undefined, costDelta: undefined, expectedResolutionDate: undefined,
          sourceLocationId: undefined, substituteSku: 'sku-sub',
        },
        {
          allocationId: 'alloc-001', optionType: 'BACKORDER', description: 'Backorder part',
          availableQuantity: undefined, costDelta: undefined, expectedResolutionDate: '2026-10-01',
          sourceLocationId: undefined, substituteSku: undefined,
        },
      ]);
    });
  });

  // ── resolveShortage() ──────────────────────────────────────────────────

  describe('resolveShortage()', () => {
    const mockRequest: ShortageResolutionRequest = {
      allocationId: 'alloc-001',
      optionType: 'SUBSTITUTE',
      substituteSku: 'sku-sub',
      locationId: 'loc-01',
    };

    const sdkResult = {
      allocationId: 'alloc-001',
      artifactId: 'art-001',
      artifactType: 'RESERVATION',
      idempotencyKey: 'alloc-001:SUBSTITUTE',
      optionType: 'SUBSTITUTE',
      resolvedAt: '2026-09-25T00:00:00Z',
      status: 'RESOLVED',
    };

    it('calls ShortageResolutionService.resolveShortage with the mapped ShortageResolveRequest', () => {
      shortageStub.resolveShortage.mockReturnValueOnce(of(sdkResult));

      service.resolveShortage(mockRequest).subscribe();

      expect(shortageStub.resolveShortage).toHaveBeenCalledWith({
        allocationId: 'alloc-001',
        optionType: 'SUBSTITUTE',
        sku: undefined,
        shortQuantity: undefined,
        workorderLineId: undefined,
        locationId: 'loc-01',
        sourceLocationId: undefined,
        substituteSku: 'sku-sub',
        notes: undefined,
        idempotencyKey: undefined,
      });
    });

    it('returns the mapped ShortageResolutionResult emitted by the SDK', () => {
      shortageStub.resolveShortage.mockReturnValueOnce(of(sdkResult));

      let result: ShortageResolutionResult | undefined;
      service.resolveShortage(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({
        allocationId: 'alloc-001',
        optionType: 'SUBSTITUTE',
        artifactId: 'art-001',
        artifactType: 'RESERVATION',
        idempotencyKey: 'alloc-001:SUBSTITUTE',
        status: 'RESOLVED',
        resolvedAt: '2026-09-25T00:00:00Z',
      });
    });
  });
});
