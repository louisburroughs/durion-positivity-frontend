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

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith({}, {});
    });

    it('passes supplierId in filter when provided', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({ supplierId: 'sup-01' }).subscribe();

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith({ supplierId: 'sup-01' }, {});
    });

    it('passes dateFrom and dateTo when provided', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }).subscribe();

      expect(poSdkStub.listPurchaseOrders).toHaveBeenCalledWith({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }, {});
    });

    it('returns the PurchaseOrderPageResponse emitted by the SDK', () => {
      poSdkStub.listPurchaseOrders.mockReturnValueOnce(of(mockPage));

      let result: PurchaseOrderPageResponse | undefined;
      service.queryPurchaseOrders().subscribe(r => (result = r));

      expect(result).toEqual(mockPage);
    });
  });

  // ── getPurchaseOrder() ────────────────────────────────────────────────

  describe('getPurchaseOrder()', () => {
    const mockPO: PurchaseOrderDetail = {
      poId: 'po-001',
      poNumber: 'PO-2026-001',
      status: 'APPROVED',
      supplierId: 'sup-01',
      lineCount: 1,
      openBalance: 999,
      scheduledDeliveryDate: '2026-04-15',
      lines: [
        {
          poLineId: 'pol-01',
          productSku: 'SKU-001',
          orderedQty: 100,
          receivedQty: 0,
          unitPrice: 9.99,
          status: 'OPEN',
        },
      ],
    };

    it('calls poSdk.getPurchaseOrder with the poId', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.getPurchaseOrder('po-001').subscribe();

      expect(poSdkStub.getPurchaseOrder).toHaveBeenCalledWith('po-001');
    });

    it('passes the poId as-is to the SDK', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.getPurchaseOrder('po/001').subscribe();

      expect(poSdkStub.getPurchaseOrder).toHaveBeenCalledWith('po/001');
    });

    it('returns the PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.getPurchaseOrder.mockReturnValueOnce(of(mockPO));

      let result: PurchaseOrderDetail | undefined;
      service.getPurchaseOrder('po-001').subscribe(r => (result = r));

      expect(result).toEqual(mockPO);
    });
  });

  // ── createPurchaseOrder() ─────────────────────────────────────────────

  describe('createPurchaseOrder()', () => {
    const mockRequest: CreatePurchaseOrderRequest = {
      supplierId: 'sup-01',
      scheduledDeliveryDate: '2026-04-15',
      lines: [{ productSku: 'SKU-001', orderedQty: 100, unitPrice: 9.99 }],
    };
    const mockPO: PurchaseOrderDetail = {
      poId: 'po-002',
      poNumber: 'PO-2026-002',
      status: 'DRAFT',
      supplierId: 'sup-01',
      lineCount: 1,
      openBalance: 999,
      scheduledDeliveryDate: '2026-04-15',
      lines: [{ poLineId: 'pol-01', productSku: 'SKU-001', orderedQty: 100, receivedQty: 0, unitPrice: 9.99, status: 'OPEN' }],
    };

    it('calls poSdk.createPurchaseOrder with the request', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.createPurchaseOrder(mockRequest).subscribe();

      expect(poSdkStub.createPurchaseOrder).toHaveBeenCalledWith(mockRequest);
    });

    it('does not include server-generated fields in the request', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.createPurchaseOrder(mockRequest).subscribe();

      const [body] = poSdkStub.createPurchaseOrder.mock.calls[0];
      expect((body as Record<string, unknown>)['poId']).toBeUndefined();
      expect((body as Record<string, unknown>)['createdAt']).toBeUndefined();
    });

    it('returns the created PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.createPurchaseOrder.mockReturnValueOnce(of(mockPO));

      let result: PurchaseOrderDetail | undefined;
      service.createPurchaseOrder(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockPO);
    });
  });

  // ── revisePurchaseOrder() ─────────────────────────────────────────────

  describe('revisePurchaseOrder()', () => {
    const mockRevision: RevisePurchaseOrderRequest = {
      scheduledDeliveryDate: '2026-05-01',
      lines: [{ productSku: 'SKU-001', orderedQty: 150, unitPrice: 9.99 }],
    };
    const mockPO: PurchaseOrderDetail = {
      poId: 'po-001',
      poNumber: 'PO-2026-001',
      status: 'PENDING_APPROVAL',
      supplierId: 'sup-01',
      lineCount: 1,
      openBalance: 1498.5,
      scheduledDeliveryDate: '2026-05-01',
      lines: [{ poLineId: 'pol-01', productSku: 'SKU-001', orderedQty: 150, receivedQty: 0, unitPrice: 9.99, status: 'OPEN' }],
    };

    it('calls poSdk.revisePurchaseOrder with the poId and revision body', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.revisePurchaseOrder('po-001', mockRevision).subscribe();

      expect(poSdkStub.revisePurchaseOrder).toHaveBeenCalledWith('po-001', mockRevision);
    });

    it('passes the poId as-is to the SDK', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(mockPO));

      service.revisePurchaseOrder('po/001', mockRevision).subscribe();

      expect(poSdkStub.revisePurchaseOrder).toHaveBeenCalledWith('po/001', mockRevision);
    });

    it('returns the updated PurchaseOrderDetail emitted by the SDK', () => {
      poSdkStub.revisePurchaseOrder.mockReturnValueOnce(of(mockPO));

      let result: PurchaseOrderDetail | undefined;
      service.revisePurchaseOrder('po-001', mockRevision).subscribe(r => (result = r));

      expect(result).toEqual(mockPO);
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
