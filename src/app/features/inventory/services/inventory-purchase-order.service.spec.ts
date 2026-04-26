import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PurchaseOrdersService } from '@durion-sdk/inventory';
import { InventoryPurchaseOrderService } from './inventory-purchase-order.service';
import {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetail,
  PurchaseOrderPageResponse,
  RevisePurchaseOrderRequest,
} from '../models/inventory.models';

describe('InventoryPurchaseOrderService', () => {
  let service: InventoryPurchaseOrderService;

  const poSdkStub = {
    listPurchaseOrders: vi.fn(),
    getPurchaseOrder: vi.fn(),
    createPurchaseOrder: vi.fn(),
    revisePurchaseOrder: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryPurchaseOrderService,
        { provide: PurchaseOrdersService, useValue: poSdkStub },
      ],
    });
    service = TestBed.inject(InventoryPurchaseOrderService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── queryPurchaseOrders() ─────────────────────────────────────────────

  describe('queryPurchaseOrders()', () => {
    const mockPage: PurchaseOrderPageResponse = {
      items: [],
      nextPageToken: null,
    };

    it('calls poSdk.listPurchaseOrders with empty filter when no filter provided', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders().subscribe();

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: undefined }),
        {},
      );
    });

    it('passes supplierId in filter when provided', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({ supplierId: 'sup-01' }).subscribe();

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith(
        expect.objectContaining({ vendorId: 'sup-01', supplierId: 'sup-01' }),
        {},
      );
    });

    it('preserves purchase-order filter and pagination fields in the SDK request shape', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({
        supplierId: 'sup-01',
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
        pageToken: 'page-2',
        statuses: ['APPROVED'],
      }).subscribe();

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          vendorId: 'sup-01',
          supplierId: 'sup-01',
          dateFrom: '2026-01-01',
          dateTo: '2026-03-31',
          pageToken: 'page-2',
          statuses: ['APPROVED'],
        }),
        {},
      );
    });

    it('returns the PurchaseOrderPageResponse emitted by the SDK', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      let result: PurchaseOrderPageResponse | undefined;
      service.queryPurchaseOrders().subscribe(r => (result = r));

      expect(result).toEqual(mockPage);
    });

    it('preserves local filtering and nextPageToken when the SDK returns a broader page', () => {
      const broaderPage: PurchaseOrderPageResponse = {
        items: [
          {
            poId: 'po-keep',
            poNumber: 'PO-100',
            status: 'APPROVED',
            supplierId: 'sup-01',
            lineCount: 1,
            openBalance: 10,
            scheduledDeliveryDate: '2026-02-10',
            lines: [],
          },
          {
            poId: 'po-drop',
            poNumber: 'PO-200',
            status: 'DRAFT',
            supplierId: 'sup-02',
            lineCount: 1,
            openBalance: 10,
            scheduledDeliveryDate: '2026-04-10',
            lines: [],
          },
        ],
        nextPageToken: 'page-3',
      };
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(broaderPage));

      let result: PurchaseOrderPageResponse | undefined;
      service.queryPurchaseOrders({
        supplierId: 'sup-01',
        statuses: ['APPROVED'],
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      }).subscribe(r => (result = r));

      expect(result).toEqual({
        items: [broaderPage.items[0]],
        nextPageToken: 'page-3',
      });
    });
  });

  // ── getPurchaseOrder() ────────────────────────────────────────────────

  describe('getPurchaseOrder()', () => {
    const sdkPurchaseOrder = {
      purchaseOrderId: 'po-001',
      poNumber: 'PO-2026-001',
      status: 'APPROVED',
      vendorId: 'sup-01',
      openBalanceMinor: 99900,
      expectedDeliveryDate: '2026-04-15',
      lines: [
        {
          lineId: 'pol-01',
          skuId: 'SKU-001',
          quantityDecimal: 100,
          unitCostMinor: 999,
          lineTotalMinor: 99900,
        },
      ],
    };

    it('calls poSdk.getPurchaseOrder with the poId', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.getPurchaseOrder('po-001').subscribe();

      expect(poSdkStub.getPurchaseOrder).toHaveBeenCalledWith('po-001');
    });

    it('passes the poId as-is to the SDK', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.getPurchaseOrder('po/001').subscribe();

      expect(poSdkStub.getPurchaseOrder).toHaveBeenCalledWith('po/001');
    });

    it('returns the PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      let result: PurchaseOrderDetail | undefined;
      service.getPurchaseOrder('po-001').subscribe(r => (result = r));

      expect(result).toEqual({
        poId: 'po-001',
        poNumber: 'PO-2026-001',
        status: 'APPROVED',
        supplierId: 'sup-01',
        lineCount: 1,
        openBalance: 999,
        scheduledDeliveryDate: '2026-04-15',
        notes: undefined,
        lines: [
          {
            poLineId: 'pol-01',
            productSku: 'SKU-001',
            orderedQty: 100,
            receivedQty: 0,
            unitPrice: 9.99,
            lineTotal: 999,
            status: '',
          },
        ],
        createdAt: undefined,
        updatedAt: undefined,
      });
    });
  });

  // ── createPurchaseOrder() ─────────────────────────────────────────────

  describe('createPurchaseOrder()', () => {
    const mockRequest: CreatePurchaseOrderRequest = {
      supplierId: 'sup-01',
      scheduledDeliveryDate: '2026-04-15',
      lines: [{ productSku: 'SKU-001', orderedQty: 100, unitPrice: 9.99 }],
    };
    const sdkPurchaseOrder = {
      purchaseOrderId: 'po-002',
      poNumber: 'PO-2026-002',
      status: 'DRAFT',
      vendorId: 'sup-01',
      openBalanceMinor: 99900,
      expectedDeliveryDate: '2026-04-15',
      lines: [{ lineId: 'pol-01', skuId: 'SKU-001', quantityDecimal: 100, unitCostMinor: 999, lineTotalMinor: 99900 }],
    };

    it('calls poSdk.createPurchaseOrder with the request', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.createPurchaseOrder(mockRequest).subscribe();

      expect(poSdkStub.createPurchaseOrder).toHaveBeenCalledWith({
        vendorId: 'sup-01',
        poDate: '2026-04-15',
        currency: 'USD',
        expectedDeliveryDate: '2026-04-15',
        comment: undefined,
        lines: [
          {
            lineNumber: 1,
            description: 'SKU-001',
            quantity: 100,
            unitCostMinor: 999,
          },
        ],
      });
    });

    it('does not include server-generated fields in the request', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.createPurchaseOrder(mockRequest).subscribe();

      const [body] = poSdkStub.createPurchaseOrder.mock.calls[0];
      expect((body as Record<string, unknown>)['poId']).toBeUndefined();
      expect((body as Record<string, unknown>)['createdAt']).toBeUndefined();
    });

    it('returns the created PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      let result: PurchaseOrderDetail | undefined;
      service.createPurchaseOrder(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({
        poId: 'po-002',
        poNumber: 'PO-2026-002',
        status: 'DRAFT',
        supplierId: 'sup-01',
        lineCount: 1,
        openBalance: 999,
        scheduledDeliveryDate: '2026-04-15',
        notes: undefined,
        lines: [{ poLineId: 'pol-01', productSku: 'SKU-001', orderedQty: 100, receivedQty: 0, unitPrice: 9.99, lineTotal: 999, status: '' }],
        createdAt: undefined,
        updatedAt: undefined,
      });
    });
  });

  // ── revisePurchaseOrder() ─────────────────────────────────────────────

  describe('revisePurchaseOrder()', () => {
    const mockRevision: RevisePurchaseOrderRequest = {
      scheduledDeliveryDate: '2026-05-01',
      lines: [{ productSku: 'SKU-001', orderedQty: 150, unitPrice: 9.99 }],
    };
    const sdkPurchaseOrder = {
      purchaseOrderId: 'po-001',
      poNumber: 'PO-2026-001',
      status: 'PENDING_APPROVAL',
      vendorId: 'sup-01',
      openBalanceMinor: 149850,
      expectedDeliveryDate: '2026-05-01',
      lines: [{ lineId: 'pol-01', skuId: 'SKU-001', quantityDecimal: 150, unitCostMinor: 999, lineTotalMinor: 149850 }],
    };

    it('calls poSdk.revisePurchaseOrder with the poId and revision body', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.revisePurchaseOrder('po-001', mockRevision).subscribe();

      expect(poSdkStub.revisePurchaseOrder).toHaveBeenCalledWith('po-001', {
        poDate: '2026-05-01',
        expectedDeliveryDate: '2026-05-01',
        comment: undefined,
        revisionReason: '',
        lines: [
          {
            lineNumber: 1,
            description: 'SKU-001',
            quantity: 150,
            unitCostMinor: 999,
          },
        ],
      });
    });

    it('passes the poId as-is to the SDK', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      service.revisePurchaseOrder('po/001', mockRevision).subscribe();

      expect(poSdkStub.revisePurchaseOrder).toHaveBeenCalledWith(
        'po/001',
        expect.objectContaining({ poDate: '2026-05-01' }),
      );
    });

    it('returns the updated PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(sdkPurchaseOrder));

      let result: PurchaseOrderDetail | undefined;
      service.revisePurchaseOrder('po-001', mockRevision).subscribe(r => (result = r));

      expect(result).toEqual({
        poId: 'po-001',
        poNumber: 'PO-2026-001',
        status: 'PENDING_APPROVAL',
        supplierId: 'sup-01',
        lineCount: 1,
        openBalance: 1498.5,
        scheduledDeliveryDate: '2026-05-01',
        notes: undefined,
        lines: [{ poLineId: 'pol-01', productSku: 'SKU-001', orderedQty: 150, receivedQty: 0, unitPrice: 9.99, lineTotal: 1498.5, status: '' }],
        createdAt: undefined,
        updatedAt: undefined,
      });
    });
  });

  // ── cancelPurchaseOrder() ─────────────────────────────────────────────

  describe('cancelPurchaseOrder()', () => {
    it('calls poSdk.cancelPurchaseOrder with the poId', () => {
      poSdkStub.cancelPurchaseOrder.mockReturnValueOnce(of(undefined));

      service.cancelPurchaseOrder('po-001').subscribe();

      expect(poSdkStub.cancelPurchaseOrder).toHaveBeenCalledWith('po-001');
    });

    it('passes the poId as-is to the SDK', () => {
      poSdkStub.cancelPurchaseOrder.mockReturnValueOnce(of(undefined));

      service.cancelPurchaseOrder('po/001').subscribe();

      expect(poSdkStub.cancelPurchaseOrder).toHaveBeenCalledWith('po/001');
    });

    it('emits void on successful cancellation', () => {
      poSdkStub.cancelPurchaseOrder.mockReturnValueOnce(of(undefined));

      let completed = false;
      service.cancelPurchaseOrder('po-001').subscribe({ complete: () => (completed = true) });

      expect(completed).toBe(true);
    });
  });
});
