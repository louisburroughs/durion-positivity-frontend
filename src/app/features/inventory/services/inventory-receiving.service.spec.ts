import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { ASNService, ReceivingService } from '@durion-sdk/inventory';
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

  const asnSdkStub = { createAsn: vi.fn(), getAsn: vi.fn() };
  const receivingSdkStub = {
    getReceivingSession: vi.fn(),
    receiveItemsIntoStaging: vi.fn(),
    createReceivingSession: vi.fn(),
    crossDockLineToWorkorder: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryReceivingService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: ASNService, useValue: asnSdkStub },
        { provide: ReceivingService, useValue: receivingSdkStub },
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

    it('calls receivingSdk.getReceivingSession with documentId', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(mockResponse));

      service.getReceivingDocument('PO-1001', 'PO').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('PO-1001');
    });

    it('calls receivingSdk.getReceivingSession for ASN document type', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of({ ...mockResponse, documentType: 'ASN', documentId: 'ASN-2001' }));

      service.getReceivingDocument('ASN-2001', 'ASN').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('ASN-2001');
    });

    it('passes the documentId as-is to the SDK', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(mockResponse));

      service.getReceivingDocument('PO/1001', 'PO').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('PO/1001');
    });

    it('returns the ReceivingDocumentResponse emitted by the SDK', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(mockResponse));

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

    it('calls receivingSdk.receiveItemsIntoStaging with documentId and request body', () => {
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(mockResult));

      service.confirmReceipt(mockRequest).subscribe();

      expect(receivingSdkStub.receiveItemsIntoStaging).toHaveBeenCalledWith('PO-1001', mockRequest);
    });

    it('returns the ReceiptResult emitted by the SDK', () => {
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(mockResult));

      let result: ReceiptResult | undefined;
      service.confirmReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });

    it('forwards ASN receipt requests with ASN documentId', () => {
      const asnRequest: ConfirmReceiptRequest = {
        ...mockRequest,
        documentType: 'ASN',
        documentId: 'ASN-2001',
      };
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(mockResult));

      service.confirmReceipt(asnRequest).subscribe();

      expect(receivingSdkStub.receiveItemsIntoStaging).toHaveBeenCalledWith('ASN-2001', asnRequest);
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

    it('calls asnSdk.createAsn with the request', () => {
      asnSdkStub.createAsn.mockReturnValueOnce(of(mockResponse));

      service.createAsn(mockRequest).subscribe();

      expect(asnSdkStub.createAsn).toHaveBeenCalledWith(mockRequest);
    });

    it('returns the AsnResponse emitted by the SDK', () => {
      asnSdkStub.createAsn.mockReturnValueOnce(of(mockResponse));

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

    it('calls asnSdk.getAsn with the asnId', () => {
      asnSdkStub.getAsn.mockReturnValueOnce(of(mockResponse));

      service.getAsn('asn-001').subscribe();

      expect(asnSdkStub.getAsn).toHaveBeenCalledWith('asn-001');
    });

    it('passes the asnId as-is to the SDK', () => {
      asnSdkStub.getAsn.mockReturnValueOnce(of(mockResponse));

      service.getAsn('asn/001').subscribe();

      expect(asnSdkStub.getAsn).toHaveBeenCalledWith('asn/001');
    });

    it('returns the AsnResponse emitted by the SDK', () => {
      asnSdkStub.getAsn.mockReturnValueOnce(of(mockResponse));

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

    it('calls receivingSdk.createReceivingSession with the request', () => {
      receivingSdkStub.createReceivingSession.mockReturnValueOnce(of(mockDoc));

      service.createReceivingSessionFromAsn(mockRequest).subscribe();

      expect(receivingSdkStub.createReceivingSession).toHaveBeenCalledWith(mockRequest);
    });

    it('returns the ReceivingDocumentResponse emitted by the SDK', () => {
      receivingSdkStub.createReceivingSession.mockReturnValueOnce(of(mockDoc));

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

    it('calls receivingSdk.crossDockLineToWorkorder with sessionId, receivingLineId, and request', () => {
      receivingSdkStub.crossDockLineToWorkorder.mockReturnValueOnce(of(mockResult));

      service.submitCrossDockReceipt(mockRequest).subscribe();

      expect(receivingSdkStub.crossDockLineToWorkorder).toHaveBeenCalledWith('sess-001', 'rl-001', mockRequest);
    });

    it('returns the CrossDockReceiveResult emitted by the SDK', () => {
      receivingSdkStub.crossDockLineToWorkorder.mockReturnValueOnce(of(mockResult));

      let result: CrossDockReceiveResult | undefined;
      service.submitCrossDockReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual(mockResult);
    });
  });
});
