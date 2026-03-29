import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryPurchaseOrderService } from './inventory-purchase-order.service';
import {
  CreatePurchaseOrderRequest,
  PurchaseOrderDetail,
  PurchaseOrderFilter,
  PurchaseOrderPageResponse,
  RevisePurchaseOrderRequest,
} from '../models/inventory.models';

describe('InventoryPurchaseOrderService', () => {
  let service: InventoryPurchaseOrderService;

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
        InventoryPurchaseOrderService,
        { provide: ApiBaseService, useValue: apiStub },
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

    it('calls GET /inventory/v1/purchase-orders with no params when filter is empty', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders().subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders');
    });

    it('includes supplierId param when provided in filter', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({ supplierId: 'sup-01' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('supplierId')).toBe('sup-01');
    });

    it('includes dateFrom and dateTo params when provided', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

      service.queryPurchaseOrders({ dateFrom: '2026-01-01', dateTo: '2026-03-31' }).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect((params as HttpParams).get('dateFrom')).toBe('2026-01-01');
      expect((params as HttpParams).get('dateTo')).toBe('2026-03-31');
    });

    it('returns the PurchaseOrderPageResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPage));

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
      openBalance: 999.0,
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

    it('calls GET /inventory/v1/purchase-orders/{poId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockPO));

      service.getPurchaseOrder('po-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po-001');
    });

    it('URL-encodes the poId', () => {
      apiStub.get.mockReturnValueOnce(of(mockPO));

      service.getPurchaseOrder('po/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po%2F001');
    });

    it('returns the PurchaseOrderDetail emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockPO));

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
      openBalance: 999.0,
      scheduledDeliveryDate: '2026-04-15',
      lines: [{ poLineId: 'pol-01', productSku: 'SKU-001', orderedQty: 100, receivedQty: 0, unitPrice: 9.99, status: 'OPEN' }],
    };

    it('calls POST /inventory/v1/purchase-orders with the request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockPO));

      service.createPurchaseOrder(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders');
      expect(body).toEqual(mockRequest);
    });

    it('does not include server-generated fields in the request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockPO));

      service.createPurchaseOrder(mockRequest).subscribe();

      const [, body] = apiStub.post.mock.calls[0];
      expect((body as Record<string, unknown>)['poId']).toBeUndefined();
      expect((body as Record<string, unknown>)['createdAt']).toBeUndefined();
    });

    it('returns the created PurchaseOrderDetail emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockPO));

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

    it('calls PUT /inventory/v1/purchase-orders/{poId} with the revision body', () => {
      apiStub.put.mockReturnValueOnce(of(mockPO));

      service.revisePurchaseOrder('po-001', mockRevision).subscribe();

      expect(apiStub.put).toHaveBeenCalledOnce();
      const [path, body] = apiStub.put.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po-001');
      expect(body).toEqual(mockRevision);
    });

    it('URL-encodes the poId', () => {
      apiStub.put.mockReturnValueOnce(of(mockPO));

      service.revisePurchaseOrder('po/001', mockRevision).subscribe();

      const [path] = apiStub.put.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po%2F001');
    });

    it('returns the updated PurchaseOrderDetail emitted by the API', () => {
      apiStub.put.mockReturnValueOnce(of(mockPO));

      let result: PurchaseOrderDetail | undefined;
      service.revisePurchaseOrder('po-001', mockRevision).subscribe(r => (result = r));

      expect(result).toEqual(mockPO);
    });
  });

  // ── cancelPurchaseOrder() ─────────────────────────────────────────────

  describe('cancelPurchaseOrder()', () => {
    it('calls DELETE /inventory/v1/purchase-orders/{poId}', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      service.cancelPurchaseOrder('po-001').subscribe();

      expect(apiStub.delete).toHaveBeenCalledOnce();
      const [path] = apiStub.delete.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po-001');
    });

    it('URL-encodes the poId', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      service.cancelPurchaseOrder('po/001').subscribe();

      const [path] = apiStub.delete.mock.calls[0];
      expect(path).toBe('/inventory/v1/purchase-orders/po%2F001');
    });

    it('emits void on successful cancellation', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      let completed = false;
      service.cancelPurchaseOrder('po-001').subscribe({ complete: () => (completed = true) });

      expect(completed).toBe(true);
    });
  });
});
