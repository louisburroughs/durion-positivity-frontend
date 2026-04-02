import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { InventoryReceivingService } from './inventory-receiving.service';
import {
  AsnCreateRequest,
  AsnResponse,
  ConfirmReceiptRequest,
  CrossDockReceiveRequest,
  CrossDockReceiveResult,
  ReceiptResult,
  ReceivingDocumentResponse,
  ReceivingSessionFromAsnRequest,
  WorkorderCrossDockRef,
} from '../models/inventory.models';

describe('InventoryReceivingService', () => {
  let service: InventoryReceivingService;

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
        InventoryReceivingService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(InventoryReceivingService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── getReceivingDocument() ─────────────────────────────────────────────

  describe('getReceivingDocument()', () => {
    const mockResponse: ReceivingDocumentResponse = {
      documentId: 'PO-1001',
      documentType: 'PO',
      status: 'OPEN',
      locationId: 'loc-01',
      stagingStorageLocationId: 'sl-staging',
      stagingStorageLocationName: 'Staging Area',
      lines: [
        {
          receivingLineId: 'rl-01',
          productSku: 'SKU-001',
          expectedQty: 100,
          expectedUomId: 'EA',
          state: 'PENDING',
          isReceivable: true,
        },
      ],
    };

    it('calls GET /inventory/v1/receiving/documents/{documentId} with documentType param', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      service.getReceivingDocument('PO-1001', 'PO').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/documents/PO-1001');
      expect((params as HttpParams).get('documentType')).toBe('PO');
    });

    it('passes ASN documentType as query param', () => {
      apiStub.get.mockReturnValueOnce(of({ ...mockResponse, documentType: 'ASN', documentId: 'ASN-2001' }));

      service.getReceivingDocument('ASN-2001', 'ASN').subscribe();

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/documents/ASN-2001');
      expect((params as HttpParams).get('documentType')).toBe('ASN');
    });

    it('URL-encodes the documentId', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      service.getReceivingDocument('PO/1001', 'PO').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/documents/PO%2F1001');
    });

    it('returns the ReceivingDocumentResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      let result: ReceivingDocumentResponse | undefined;
      service.getReceivingDocument('PO-1001', 'PO').subscribe(r => (result = r));

      expect(result).toEqual(mockResponse);
    });
  });

  // ── confirmReceipt() ──────────────────────────────────────────────────

  describe('confirmReceipt()', () => {
    const mockRequest: ConfirmReceiptRequest = {
      documentType: 'PO',
      documentId: 'PO-1001',
      locationId: 'loc-01',
      stagingStorageLocationId: 'sl-staging',
      lines: [{ receivingLineId: 'rl-01', actualQty: 50 }],
    };
    const mockResult: ReceiptResult = {
      receiptCorrelationId: 'rcpt-001',
      receivedByUserId: 'user-01',
      lines: [{ receivingLineId: 'rl-01', state: 'RECEIVED' }],
    };

    it('calls POST /inventory/v1/receiving/receipts with the request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.confirmReceipt(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/receipts');
      expect(body).toEqual(mockRequest);
    });

    it('returns the ReceiptResult emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      let result: ReceiptResult | undefined;
      service.confirmReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });

    it('forwards ASN receipt requests correctly', () => {
      const asnRequest: ConfirmReceiptRequest = {
        ...mockRequest,
        documentType: 'ASN',
        documentId: 'ASN-2001',
      };
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.confirmReceipt(asnRequest).subscribe();

      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/receipts');
      expect((body as ConfirmReceiptRequest).documentType).toBe('ASN');
    });
  });

  // ── createAsn() ───────────────────────────────────────────────────────

  describe('createAsn()', () => {
    const mockRequest: AsnCreateRequest = {
      supplierId: 'supplier-001',
      supplierShipmentRef: 'SHIP-REF-001',
      poId: 'po-001',
      lines: [{ poLineId: 'pol-001', expectedQty: 50 }],
    };

    const mockResponse: AsnResponse = {
      asnId: 'asn-001',
      poId: 'po-001',
      status: 'OPEN',
      lines: [{ asnLineId: 'asnl-001', poLineId: 'pol-001', expectedQty: 50 }],
    };

    it('calls POST /inventory/v1/asns with request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResponse));

      service.createAsn(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/asns');
      expect(body).toEqual(mockRequest);
    });

    it('returns the AsnResponse emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResponse));

      let result: AsnResponse | undefined;
      service.createAsn(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResponse);
    });
  });

  // ── getAsn() ──────────────────────────────────────────────────────────

  describe('getAsn()', () => {
    const mockResponse: AsnResponse = {
      asnId: 'asn-001',
      poId: 'po-001',
      status: 'OPEN',
      lines: [{ asnLineId: 'asnl-001', poLineId: 'pol-001', expectedQty: 50 }],
    };

    it('calls GET /inventory/v1/asns/{asnId}', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      service.getAsn('asn-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/asns/asn-001');
    });

    it('URL-encodes the asnId', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      service.getAsn('asn/001').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/asns/asn%2F001');
    });

    it('returns the AsnResponse emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockResponse));

      let result: AsnResponse | undefined;
      service.getAsn('asn-001').subscribe(r => (result = r));

      expect(result).toEqual(mockResponse);
    });
  });

  // ── createReceivingSessionFromAsn() ───────────────────────────────────

  describe('createReceivingSessionFromAsn()', () => {
    const mockRequest: ReceivingSessionFromAsnRequest = {
      asnId: 'asn-001',
      locationId: 'loc-01',
    };

    const mockDoc: ReceivingDocumentResponse = {
      documentId: 'ASN-001',
      documentType: 'ASN',
      status: 'OPEN',
      locationId: 'loc-01',
      stagingStorageLocationId: 'sl-staging',
      stagingStorageLocationName: 'Staging Area',
      lines: [],
    };

    it('calls POST /inventory/v1/receiving/sessions/from-asn with request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockDoc));

      service.createReceivingSessionFromAsn(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/sessions/from-asn');
      expect(body).toEqual(mockRequest);
    });

    it('returns the ReceivingDocumentResponse emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockDoc));

      let result: ReceivingDocumentResponse | undefined;
      service.createReceivingSessionFromAsn(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockDoc);
    });
  });

  // ── searchWorkordersForCrossDock() ────────────────────────────────────

  describe('searchWorkordersForCrossDock()', () => {
    const mockRefs: WorkorderCrossDockRef[] = [
      { workorderId: 'wo-001', workorderNumber: 'WO-001', status: 'OPEN' },
    ];

    it('calls GET /inventory/v1/receiving/workorders with query param', () => {
      apiStub.get.mockReturnValueOnce(of(mockRefs));

      service.searchWorkordersForCrossDock('WO-001').subscribe();

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/workorders');
      expect((params as HttpParams).get('query')).toBe('WO-001');
    });

    it('returns the WorkorderCrossDockRef array emitted by the API', () => {
      apiStub.get.mockReturnValueOnce(of(mockRefs));

      let result: WorkorderCrossDockRef[] | undefined;
      service.searchWorkordersForCrossDock('WO-001').subscribe(r => (result = r));

      expect(result).toEqual(mockRefs);
    });
  });

  // ── submitCrossDockReceipt() ──────────────────────────────────────────

  describe('submitCrossDockReceipt()', () => {
    const mockRequest: CrossDockReceiveRequest = {
      sessionId: 'sess-001',
      receivingLineId: 'rl-001',
      workorderId: 'wo-001',
      workorderLineId: 'wol-001',
      quantity: 3,
    };

    const mockResult: CrossDockReceiveResult = {
      issueReferenceId: 'issue-001',
      issueMode: 'CROSS_DOCK',
    };

    it('calls POST /inventory/v1/receiving/cross-dock with request body', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      service.submitCrossDockReceipt(mockRequest).subscribe();

      expect(apiStub.post).toHaveBeenCalledOnce();
      const [path, body] = apiStub.post.mock.calls[0];
      expect(path).toBe('/inventory/v1/receiving/cross-dock');
      expect(body).toEqual(mockRequest);
    });

    it('returns the CrossDockReceiveResult emitted by the API', () => {
      apiStub.post.mockReturnValueOnce(of(mockResult));

      let result: CrossDockReceiveResult | undefined;
      service.submitCrossDockReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });
});
