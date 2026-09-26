import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ASNService, ReceivingService } from '@durion-sdk/inventory';
import type { CrossDockWorkorderSearchResultDto } from '@durion-sdk/inventory';
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

  const asnSdkStub = { createAsn: vi.fn(), getAsn: vi.fn() };
  const receivingSdkStub = {
    getReceivingSession: vi.fn(),
    receiveItemsIntoStaging: vi.fn(),
    createReceivingSession: vi.fn(),
    crossDockReceivingLine: vi.fn(),
    searchCrossDockWorkorders: vi.fn(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InventoryReceivingService,
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
    const sdkSession = {
      sessionId: 'PO-1001',
      sourceDocumentType: 'PO',
      status: 'OPEN',
      lines: [{ lineId: 'rl-01', productId: 'SKU-001', expectedQuantity: 100, status: 'PENDING' }],
    };

    it('calls receivingSdk.getReceivingSession with documentId', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(sdkSession));

      service.getReceivingDocument('PO-1001', 'PO').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('PO-1001');
    });

    it('calls receivingSdk.getReceivingSession for ASN document type', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of({ ...sdkSession, sourceDocumentType: 'ASN', sessionId: 'ASN-2001' }));

      service.getReceivingDocument('ASN-2001', 'ASN').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('ASN-2001');
    });

    it('passes the documentId as-is to the SDK', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(sdkSession));

      service.getReceivingDocument('PO/1001', 'PO').subscribe();

      expect(receivingSdkStub.getReceivingSession).toHaveBeenCalledWith('PO/1001');
    });

    it('returns the ReceivingDocumentResponse emitted by the SDK', () => {
      receivingSdkStub.getReceivingSession.mockReturnValueOnce(of(sdkSession));

      let result: ReceivingDocumentResponse | undefined;
      service.getReceivingDocument('PO-1001', 'PO').subscribe(r => (result = r));

      expect(result).toEqual({
        documentId: 'PO-1001',
        documentType: 'PO',
        status: 'OPEN',
        locationId: '',
        stagingStorageLocationId: '',
        stagingStorageLocationName: '',
        lines: [{ receivingLineId: 'rl-01', productSku: 'SKU-001', expectedQty: 100, expectedUomId: '', state: 'PENDING', isReceivable: true }],
      });
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
    const sdkResponse = { sessionId: 'rcpt-001', linesProcessed: 1 };
    const expectedSdkArgs = { lines: [{ lineId: 'rl-01', receivedQuantity: 50 }] };

    it('calls receivingSdk.receiveItemsIntoStaging with documentId and request body', () => {
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(sdkResponse));

      service.confirmReceipt(mockRequest).subscribe();

      expect(receivingSdkStub.receiveItemsIntoStaging).toHaveBeenCalledWith('PO-1001', expectedSdkArgs);
    });

    it('returns the ReceiptResult emitted by the SDK', () => {
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(sdkResponse));

      let result: ReceiptResult | undefined;
      service.confirmReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({ receiptCorrelationId: 'rcpt-001', receivedByUserId: '', lines: [], ledgerEntryCount: 1 });
    });

    it('forwards ASN receipt requests with ASN documentId', () => {
      const asnRequest: ConfirmReceiptRequest = {
        ...mockRequest,
        documentType: 'ASN',
        documentId: 'ASN-2001',
      };
      receivingSdkStub.receiveItemsIntoStaging.mockReturnValueOnce(of(sdkResponse));

      service.confirmReceipt(asnRequest).subscribe();

      expect(receivingSdkStub.receiveItemsIntoStaging).toHaveBeenCalledWith('ASN-2001', expectedSdkArgs);
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
    const sdkResponse = {
      asnId: 'asn-001',
      status: 'OPEN',
      lineItems: [{ asnLineId: 'asnl-001', poId: 'pol-001', quantityShipped: 50 }],
    };
    const expectedSdkRequest = {
      vendorId: 'supplier-001',
      asnReferenceNumber: 'SHIP-REF-001',
      relatedPoIds: ['po-001'],
      lineItems: [{ poId: 'po-001', poLineId: 'pol-001', sku: '', quantityShipped: 50 }],
    };

    it('calls asnSdk.createAsn with the request', () => {
      asnSdkStub.createAsn.mockReturnValueOnce(of(sdkResponse));

      service.createAsn(mockRequest).subscribe();

      expect(asnSdkStub.createAsn).toHaveBeenCalledWith(expectedSdkRequest);
    });

    it('returns the AsnResponse emitted by the SDK', () => {
      asnSdkStub.createAsn.mockReturnValueOnce(of(sdkResponse));

      let result: AsnResponse | undefined;
      service.createAsn(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({
        asnId: 'asn-001',
        poId: '',
        status: 'OPEN',
        lines: [{ asnLineId: 'asnl-001', poLineId: 'pol-001', expectedQty: 50 }],
      });
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
      asnSdkStub.getAsn.mockReturnValueOnce(of({
        asnId: 'asn-001',
        status: 'OPEN',
        lineItems: [{ asnLineId: 'asnl-001', poId: 'pol-001', quantityShipped: 50 }],
      }));

      let result: AsnResponse | undefined;
      service.getAsn('asn-001').subscribe(r => (result = r));

      expect(result).toEqual({
        asnId: 'asn-001',
        poId: '',
        status: 'OPEN',
        lines: [{ asnLineId: 'asnl-001', poLineId: 'pol-001', expectedQty: 50 }],
      });
    });
  });

  // ── createReceivingSessionFromAsn() ───────────────────────────────────

  describe('createReceivingSessionFromAsn()', () => {
    const mockRequest: ReceivingSessionFromAsnRequest = {
      asnId: 'asn-001',
      locationId: 'loc-01',
    };
    const sdkSession = { sessionId: 'ASN-001', sourceDocumentType: 'ASN', status: 'OPEN', lines: [] };

    it('calls receivingSdk.createReceivingSession with the request', () => {
      receivingSdkStub.createReceivingSession.mockReturnValueOnce(of(sdkSession));

      service.createReceivingSessionFromAsn(mockRequest).subscribe();

      expect(receivingSdkStub.createReceivingSession).toHaveBeenCalledWith({ sourceDocumentId: 'asn-001' });
    });

    it('returns the ReceivingDocumentResponse emitted by the SDK', () => {
      receivingSdkStub.createReceivingSession.mockReturnValueOnce(of(sdkSession));

      let result: ReceivingDocumentResponse | undefined;
      service.createReceivingSessionFromAsn(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({
        documentId: 'ASN-001',
        documentType: 'ASN',
        status: 'OPEN',
        locationId: '',
        stagingStorageLocationId: '',
        stagingStorageLocationName: '',
        lines: [],
      });
    });
  });

  // ── searchWorkordersForCrossDock() ────────────────────────────────────

  describe('searchWorkordersForCrossDock()', () => {
    const sdkResults: CrossDockWorkorderSearchResultDto[] = [
      { workorderId: 'wo-001', workorderNumber: 'WO-001', status: 'OPEN', partLineCount: 2, updatedAt: '2026-09-20T00:00:00Z' },
    ];

    it('calls receivingSdk.searchCrossDockWorkorders with the query', () => {
      receivingSdkStub.searchCrossDockWorkorders.mockReturnValueOnce(of(sdkResults));

      service.searchWorkordersForCrossDock('WO-001').subscribe();

      expect(receivingSdkStub.searchCrossDockWorkorders).toHaveBeenCalledWith('WO-001');
    });

    it('maps CrossDockWorkorderSearchResultDto to WorkorderCrossDockRef, including partLineCount/updatedAt', () => {
      receivingSdkStub.searchCrossDockWorkorders.mockReturnValueOnce(of(sdkResults));

      let result: WorkorderCrossDockRef[] | undefined;
      service.searchWorkordersForCrossDock('WO-001').subscribe(r => (result = r));

      expect(result).toEqual([
        { workorderId: 'wo-001', workorderNumber: 'WO-001', status: 'OPEN', partLineCount: 2, updatedAt: '2026-09-20T00:00:00Z' },
      ]);
    });

    it('defaults workorderNumber/status to empty string when the SDK omits them', () => {
      const sparse: CrossDockWorkorderSearchResultDto[] = [{ workorderId: 'wo-002', partLineCount: 1 }];
      receivingSdkStub.searchCrossDockWorkorders.mockReturnValueOnce(of(sparse));

      let result: WorkorderCrossDockRef[] | undefined;
      service.searchWorkordersForCrossDock('').subscribe(r => (result = r));

      expect(result).toEqual([
        { workorderId: 'wo-002', workorderNumber: '', status: '', partLineCount: 1, updatedAt: undefined },
      ]);
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
    const sdkResponse = { lineId: 'issue-001' };
    const expectedSdkRequest = {
      workorderId: 'wo-001',
      workorderLineId: 'wol-001',
      quantity: 3,
      notes: undefined,
    };

    it('calls receivingSdk.crossDockLineToWorkorder with sessionId, receivingLineId, and request', () => {
      receivingSdkStub.crossDockReceivingLine.mockReturnValueOnce(of(sdkResponse));

      service.submitCrossDockReceipt(mockRequest).subscribe();

      expect(receivingSdkStub.crossDockReceivingLine).toHaveBeenCalledWith('sess-001', 'rl-001', expectedSdkRequest);
    });

    it('returns the CrossDockReceiveResult emitted by the SDK', () => {
      receivingSdkStub.crossDockReceivingLine.mockReturnValueOnce(of(sdkResponse));

      let result: CrossDockReceiveResult | undefined;
      service.submitCrossDockReceipt(mockRequest).subscribe(r => (result = r));

      expect(result).toEqual({ issueReferenceId: 'issue-001', issueMode: '' });
    });
  });
});
