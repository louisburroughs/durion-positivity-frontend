/**
 * WorkexecService unit tests
 *
 * These tests verify the primary contract bindings for CAP-002 and CAP-003,
 * including Idempotency-Key header forwarding for mutating operations.
 *
 * Stories covered:
 *   239 — createEstimate, getEstimateById
 *   238 — addEstimateItem, calculateEstimateTotals, updateEstimateItem
 *   237 — addEstimateItem (LABOR type)
 *   236 — calculateEstimateTotals
 *   235 — createEstimate (revision), patchEstimateStatus, reopenEstimate
 *   234 — createEstimateSnapshot, getEstimateSummary
 *   233 — submitForApproval
 *   271 — approveEstimate (digital signature)
 *   270 — approveEstimate (in-person)
 *   269 — approveEstimate (partial line items)
 *   268 — approveEstimate (expiration error handling)
 */
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { WorkexecService } from './workexec.service';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import {
  ConsumptionResult,
  EstimateListItem,
  FinalizeInvoiceResponse,
  PickConfirmRequest,
  PickExecuteLine,
  PickListView,
  PickTaskLine,
  PickedItemLine,
  ScanResolveRequest,
  WorkorderInvoiceView,
  WorkorderWipView,
} from '../models/workexec.models';

const BASE = environment.apiBaseUrl;

describe('WorkexecService', () => {
  let service: WorkexecService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [WorkexecService, ApiBaseService],
    });
    service = TestBed.inject(WorkexecService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Story 239 ─────────────────────────────────────────────────────────────

  it('[239] createEstimate — posts to /v1/workorders/estimates', () => {
    const req = {
      customerId: 'cust-1',
      vehicleId: 'veh-1',
      crmPartyId: 'party-1',
      crmVehicleId: 'cveh-1',
      crmContactIds: [],
    };
    service.createEstimate(req).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'cust-1', vehicleId: 'veh-1' });
  });

  it('[239] getEstimateById — gets /v1/workorders/estimates/{estimateId}', () => {
    service.getEstimateById('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1`);
    expect(r.request.method).toBe('GET');
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 238 ─────────────────────────────────────────────────────────────

  it('[238] addEstimateItem — posts PART item to /v1/workorders/estimates/{estimateId}/items', () => {
    const item = { itemType: 'PART' as const, quantity: 2, unitPrice: 49.99 };
    service.addEstimateItem('est-1', item).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/items`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body['itemType']).toBe('PART');
    r.flush({ id: 'item-1', estimateId: 'est-1', itemType: 'PART', quantity: 2, unitPrice: 49.99 });
  });

  it('[238] updateEstimateItem — patches /v1/workorders/estimates/{estimateId}/items/{itemId}', () => {
    service.updateEstimateItem('est-1', 'item-1', { quantity: 3 }).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/items/item-1`);
    expect(r.request.method).toBe('PATCH');
    r.flush({ id: 'item-1', estimateId: 'est-1', itemType: 'PART', quantity: 3, unitPrice: 49.99 });
  });

  // ── Story 237 ─────────────────────────────────────────────────────────────

  it('[237] addEstimateItem — posts LABOR item with serviceId', () => {
    const item = {
      itemType: 'LABOR' as const,
      quantity: 1,
      unitPrice: 129.99,
      serviceId: 'svc-brake',
      description: 'Brake inspection',
    };
    service.addEstimateItem('est-1', item).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/items`);
    expect(r.request.body['itemType']).toBe('LABOR');
    expect(r.request.body['serviceId']).toBe('svc-brake');
    r.flush({ id: 'item-2', estimateId: 'est-1', itemType: 'LABOR', quantity: 1, unitPrice: 129.99 });
  });

  // ── Story 236 ─────────────────────────────────────────────────────────────

  it('[236] calculateEstimateTotals — posts to /v1/workorders/estimates/{estimateId}/calculate-totals', () => {
    service.calculateEstimateTotals('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/calculate-totals`);
    expect(r.request.method).toBe('POST');
    r.flush({ subtotal: 100, taxAmount: 8.5, total: 108.5 });
  });

  // ── Story 235 ─────────────────────────────────────────────────────────────

  it('[235] patchEstimateStatus — patches /v1/workorders/estimates/{estimateId}', () => {
    service.patchEstimateStatus('est-1', { status: 'DRAFT' }).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1`);
    expect(r.request.method).toBe('PATCH');
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });

  it('[235] reopenEstimate — posts to /v1/workorders/estimates/{estimateId}/reopen', () => {
    service.reopenEstimate('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/reopen`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 234 ─────────────────────────────────────────────────────────────

  it('[234] createEstimateSnapshot — posts to /v1/workorders/estimates/{estimateId}/snapshots', () => {
    service.createEstimateSnapshot('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/snapshots`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'snap-1', estimateId: 'est-1' });
  });

  it('[234] getEstimateSummary — gets /v1/workorders/estimates/{estimateId}/summary', () => {
    service.getEstimateSummary('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/summary`);
    expect(r.request.method).toBe('GET');
    r.flush({ id: 'est-1', status: 'DRAFT' });
  });

  // ── Story 233 ─────────────────────────────────────────────────────────────

  it('[233] submitForApproval — posts to /v1/workorders/estimates/{estimateId}/submit-for-approval', () => {
    service.submitForApproval('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/submit-for-approval`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'est-1', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 271 — Digital Approval ──────────────────────────────────────────

  it('[271] approveEstimate — posts digital signature to /v1/workorders/estimates/{estimateId}/approval', () => {
    const request = {
      customerId: 'cust-1',
      signatureData: 'data:image/png;base64,abc123',
      signatureMimeType: 'image/png',
      signerName: 'Jane Customer',
    };
    service.approveEstimate('est-1', request).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/approval`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body['signatureData']).toBeTruthy();
    r.flush({ id: 'est-1', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 270 — In-Person Approval ───────────────────────────────────────

  it('[270] approveEstimate — posts in-person (no signature) to approval endpoint', () => {
    const request = {
      customerId: 'cust-1',
      notes: 'Approved in person',
    };
    service.approveEstimate('est-1', request).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/approval`);
    expect(r.request.method).toBe('POST');
    expect(r.request.body['customerId']).toBe('cust-1');
    r.flush({ id: 'est-1', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 269 — Partial Approval ─────────────────────────────────────────

  it('[269] approveEstimate — posts partial line item approvals to approval endpoint', () => {
    const request = {
      customerId: 'cust-1',
      lineItemApprovals: [
        { lineItemId: 'item-1', approved: true },
        { lineItemId: 'item-2', approved: false, rejectionReason: 'Too expensive' },
      ],
    };
    service.approveEstimate('est-1', request).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/approval`);
    expect(r.request.body['lineItemApprovals']).toHaveLength(2);
    r.flush({ id: 'est-1', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
  });

  // ── Story 268 — Approval Expiration ──────────────────────────────────────

  it('[268] getEstimateById — returns expiresAt for expiration detection', () => {
    let result: any;
    service.getEstimateById('est-expired').subscribe(r => (result = r));
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-expired`);
    r.flush({
      id: 'est-expired',
      status: 'EXPIRED',
      expiresAt: '2024-01-01T00:00:00Z',
      customerId: 'c',
      vehicleId: 'v',
    });
    expect(result.status).toBe('EXPIRED');
    expect(result.expiresAt).toBeTruthy();
  });

  // ── Idempotency-Key header forwarding ─────────────────────────────────────

  it('createEstimate — forwards Idempotency-Key header when provided', () => {
    const req = { customerId: 'c', vehicleId: 'v', crmPartyId: 'p', crmVehicleId: 'cv', crmContactIds: [] };
    service.createEstimate(req, 'test-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates`);
    expect(r.request.headers.get('Idempotency-Key')).toBe('test-idem-key');
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });

  it('createEstimate — does not set Idempotency-Key header when omitted', () => {
    const req = { customerId: 'c', vehicleId: 'v', crmPartyId: 'p', crmVehicleId: 'cv', crmContactIds: [] };
    service.createEstimate(req).subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates`);
    expect(r.request.headers.has('Idempotency-Key')).toBeFalsy();
    r.flush({ id: 'est-1', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });

  it('submitForApproval — forwards Idempotency-Key header when provided', () => {
    service.submitForApproval('est-1', 'submit-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/submit-for-approval`);
    expect(r.request.headers.get('Idempotency-Key')).toBe('submit-idem-key');
    r.flush({ id: 'est-1', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v' });
  });

  it('approveEstimate — forwards Idempotency-Key header when provided', () => {
    const request = { customerId: 'cust-1', notes: 'Approved in person' };
    service.approveEstimate('est-1', request, 'approve-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/approval`);
    expect(r.request.headers.get('Idempotency-Key')).toBe('approve-idem-key');
    r.flush({ id: 'est-1', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
  });

  it('addEstimateItem — forwards Idempotency-Key header when provided', () => {
    const item = { itemType: 'PART' as const, quantity: 1, unitPrice: 10 };
    service.addEstimateItem('est-1', item, 'add-item-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/items`);
    expect(r.request.headers.get('Idempotency-Key')).toBe('add-item-idem-key');
    r.flush({ id: 'item-1', estimateId: 'est-1', itemType: 'PART', quantity: 1, unitPrice: 10 });
  });

  it('getWorkorderDetail — forwards X-Authorities header when authorities provided', () => {
    service.getWorkorderDetail('wo-1', 'ROLE_MANAGER').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/wo-1/detail`);
    expect(r.request.method).toBe('GET');
    expect(r.request.headers.get('X-Authorities')).toBe('ROLE_MANAGER');
    r.flush({ id: 'wo-1' });
  });

  it('getWorkorderDetail — does not set X-Authorities header when authorities omitted', () => {
    service.getWorkorderDetail('wo-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/wo-1/detail`);
    expect(r.request.method).toBe('GET');
    expect(r.request.headers.has('X-Authorities')).toBeFalsy();
    r.flush({ id: 'wo-1' });
  });

  // ── CAP-248: Stories 259, 260, 261 ───────────────────────────────────────

  describe('CAP-248 service methods', () => {
    it('listEstimatesForCustomer — gets /v1/workorders/estimates with customerId query', () => {
      const fixture: EstimateListItem[] = [
        {
          estimateId: 'est-259-1',
          workorderId: 'wo-259-1',
          customerId: 'cust-259-1',
          vehicleId: 'veh-259-1',
          status: 'OPEN',
          totalAmount: 250.45,
          currency: 'USD',
          lastUpdatedAt: '2026-03-30T12:00:00Z',
          createdAt: '2026-03-29T12:00:00Z',
          notes: 'cap-248',
        },
      ];

      service.listEstimatesForCustomer('cust-259-1').subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/v1/workorders/estimates` && r.params.get('customerId') === 'cust-259-1',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/v1/workorders/estimates');
      req.flush(fixture);
    });

    it('listEstimatesForVehicle — gets /v1/workorders/estimates with vehicleId query', () => {
      const fixture: EstimateListItem[] = [
        {
          estimateId: 'est-259-2',
          customerId: 'cust-259-2',
          vehicleId: 'veh-259-2',
          status: 'APPROVED',
          totalAmount: 399,
          currency: 'USD',
        },
      ];

      service.listEstimatesForVehicle('veh-259-2').subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/v1/workorders/estimates` && r.params.get('vehicleId') === 'veh-259-2',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/v1/workorders/estimates');
      req.flush(fixture);
    });

    it('listActiveWorkorders — gets /v1/workorders/wip with wipStatus query', () => {
      const fixture: WorkorderWipView[] = [
        {
          workorderId: 'wo-260-1',
          workorderNumber: 'WO-260-1',
          wipStatus: 'IN_PROGRESS',
          assignedTechnicianName: 'Alex Tech',
          bayLocation: 'Bay-1',
          customerId: 'cust-260-1',
          vehicleDescription: 'Sedan',
          statusUpdatedAt: '2026-03-30T12:10:00Z',
        },
      ];

      service.listActiveWorkorders({ wipStatus: ['IN_PROGRESS', 'READY'] }).subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/v1/workorders/wip` && r.params.get('wipStatus') === 'IN_PROGRESS,READY',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/v1/workorders/wip');
      req.flush(fixture);
    });

    it('getWorkorderWipStatus — gets /v1/workorders/{workorderId}/wip-status', () => {
      const fixture: WorkorderWipView = {
        workorderId: 'wo-260-2',
        workorderNumber: 'WO-260-2',
        wipStatus: 'WAITING',
      };

      service.getWorkorderWipStatus('wo-260-2').subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(`${BASE}/v1/workorders/wo-260-2/wip-status`);
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/v1/workorders/wo-260-2/wip-status');
      req.flush(fixture);
    });

    it('getWorkorderInvoiceView — gets /v1/workorders/{workorderId}/invoice-view', () => {
      const fixture: WorkorderInvoiceView = {
        workorderId: 'wo-261-1',
        invoiceId: 'inv-261-1',
        lineItems: [
          {
            lineItemId: 'line-1',
            description: 'Labor',
            quantity: 1,
            unitPrice: 150,
            lineTotal: 150,
            itemType: 'LABOR',
          },
        ],
        subtotal: 150,
        taxAmount: 12,
        total: 162,
        currency: 'USD',
        invoiceStatus: 'DRAFT',
      };

      service.getWorkorderInvoiceView('wo-261-1').subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(`${BASE}/v1/workorders/wo-261-1/invoice-view`);
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain('/v1/workorders/wo-261-1/invoice-view');
      req.flush(fixture);
    });

    it('requestInvoiceFinalization — posts /v1/workorders/{workorderId}/invoice/finalize', () => {
      const responseFixture: FinalizeInvoiceResponse = {
        workorderId: 'wo-261-2',
        invoiceId: 'inv-261-2',
        status: 'FINALIZED',
        finalizedAt: '2026-03-30T12:20:00Z',
      };

      service
        .requestInvoiceFinalization('wo-261-2', { reason: 'Approved by manager' })
        .subscribe(result => {
          expect(result).toEqual(responseFixture);
        });

      const req = http.expectOne(`${BASE}/v1/workorders/wo-261-2/invoice/finalize`);
      expect(req.request.method).toBe('POST');
      expect(req.request.url).toContain('/v1/workorders/wo-261-2/invoice/finalize');
      req.flush(responseFixture);
    });
  });

  // ── CAP-218: Pick List & Picking Stories 92, 243, 244 ────────────────────

  describe('CAP-218 pick service methods', () => {
    const pickTaskLine: PickTaskLine = {
      pickTaskId: 'task-001',
      productSku: 'SKU-001',
      requestedQty: 5,
      pickedQty: 0,
      uom: 'EA',
      status: 'PENDING',
    };

    const pickListFixture: PickListView = {
      workorderId: 'wo-001',
      pickListId: 'pl-001',
      status: 'OPEN',
      tasks: [pickTaskLine],
    };

    it('getWorkorderPickList — GET /workexec/v1/workorders/{workorderId}/pick-list', () => {
      service.getWorkorderPickList('wo-001').subscribe(result => {
        expect(result).toEqual(pickListFixture);
      });

      const req = http.expectOne(`${BASE}/workexec/v1/workorders/wo-001/pick-list`);
      expect(req.request.method).toBe('GET');
      req.flush(pickListFixture);
    });

    it('getPickedItems — GET /workexec/v1/workorders/{workorderId}/picked-items', () => {
      const pickedFixture: PickedItemLine[] = [
        {
          pickedItemId: 'pi-001',
          productSku: 'SKU-001',
          qtyPicked: 5,
          qtyConsumed: 0,
          status: 'PICKED',
        },
      ];

      service.getPickedItems('wo-001').subscribe(result => {
        expect(result).toEqual(pickedFixture);
      });

      const req = http.expectOne(`${BASE}/workexec/v1/workorders/wo-001/picked-items`);
      expect(req.request.method).toBe('GET');
      req.flush(pickedFixture);
    });

    it('consumePickedItems — POST /workexec/v1/workorders/{workorderId}/picked-items/consume', () => {
      const consumeReq = { lines: [{ pickedItemId: 'pi-001', quantity: 3 }] };
      const consumeResult: ConsumptionResult = {
        referenceId: 'ref-001',
        consumedLineCount: 1,
      };

      service.consumePickedItems('wo-001', consumeReq).subscribe(result => {
        expect(result).toEqual(consumeResult);
      });

      const req = http.expectOne(
        `${BASE}/workexec/v1/workorders/wo-001/picked-items/consume`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body['lines']).toHaveLength(1);
      req.flush(consumeResult);
    });

    it('resolvePickScan — POST /workexec/v1/workorders/{workorderId}/picks/resolve-scan', () => {
      const scanReq: ScanResolveRequest = { scanValue: 'BARCODE-123' };
      const executeLine: PickExecuteLine = {
        pickLineId: 'pline-001',
        pickTaskId: 'task-001',
        productSku: 'SKU-001',
        requestedQty: 5,
        confirmedQty: 0,
        status: 'PENDING',
      };

      service.resolvePickScan('wo-001', scanReq).subscribe(result => {
        expect(result).toEqual([executeLine]);
      });

      const req = http.expectOne(
        `${BASE}/workexec/v1/workorders/wo-001/picks/resolve-scan`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body['scanValue']).toBe('BARCODE-123');
      req.flush([executeLine]);
    });

    it('confirmPickLine — POST /workexec/v1/workorders/{workorderId}/picks/confirm', () => {
      const confirmReq: PickConfirmRequest = { pickLineId: 'pline-001', quantity: 5 };
      const confirmedLine: PickExecuteLine = {
        pickLineId: 'pline-001',
        pickTaskId: 'task-001',
        productSku: 'SKU-001',
        requestedQty: 5,
        confirmedQty: 5,
        status: 'CONFIRMED',
      };

      service.confirmPickLine('wo-001', confirmReq).subscribe(result => {
        expect(result).toEqual(confirmedLine);
      });

      const req = http.expectOne(
        `${BASE}/workexec/v1/workorders/wo-001/picks/confirm`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body['pickLineId']).toBe('pline-001');
      req.flush(confirmedLine);
    });

    it('completePickList — POST /workexec/v1/workorders/{workorderId}/picks/complete', () => {
      service.completePickList('wo-001').subscribe(result => {
        expect(result.status).toBe('COMPLETE');
      });

      const req = http.expectOne(
        `${BASE}/workexec/v1/workorders/wo-001/picks/complete`,
      );
      expect(req.request.method).toBe('POST');
      req.flush({ status: 'COMPLETE' });
    });
  });
});
