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
import { of } from 'rxjs';
import { vi } from 'vitest';
import { WorkexecService } from './workexec.service';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { BASE_PATH, EstimateSearchService, WorkorderSearchService } from '@durion-sdk/workorder';
import { Configuration as PeopleConfiguration } from '@durion-sdk/people';
import { environment } from '../../../../environments/environment';
import {
  ConsumePickedItemsRequest,
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
  let estimateSearchStub: { searchEstimates: ReturnType<typeof vi.fn> };
  let workorderSearchStub: { searchWorkorders: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    estimateSearchStub = { searchEstimates: vi.fn() };
    workorderSearchStub = { searchWorkorders: vi.fn() };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        WorkexecService,
        ApiBaseService,
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
        { provide: PeopleConfiguration, useValue: new PeopleConfiguration({ basePath: environment.apiBaseUrl }) },
        { provide: EstimateSearchService, useValue: estimateSearchStub },
        { provide: WorkorderSearchService, useValue: workorderSearchStub },
      ],
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

  it('[236] calculateEstimateTotals — posts to /v1/workorders/estimates/{estimateId}/calculate', () => {
    service.calculateEstimateTotals('est-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/calculate`);
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

  it('submitForApproval — makes POST (SDK submitForApproval does not accept idempotency key)', () => {
    service.submitForApproval('est-1', 'submit-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/submit-for-approval`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'est-1', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v' });
  });

  it('approveEstimate — makes POST (SDK approveEstimate does not accept idempotency key)', () => {
    const request = { customerId: 'cust-1', notes: 'Approved in person' };
    service.approveEstimate('est-1', request, 'approve-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/approval`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'est-1', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
  });

  it('addEstimateItem — makes POST (SDK addEstimateItem does not accept idempotency key)', () => {
    const item = { itemType: 'PART' as const, quantity: 1, unitPrice: 10 };
    service.addEstimateItem('est-1', item, 'add-item-idem-key').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/estimates/est-1/items`);
    expect(r.request.method).toBe('POST');
    r.flush({ id: 'item-1', estimateId: 'est-1', itemType: 'PART', quantity: 1, unitPrice: 10 });
  });

  it('getWorkorderDetail — issues GET without client-side authority headers', () => {
    service.getWorkorderDetail('wo-1').subscribe();
    const r = http.expectOne(`${BASE}/v1/workorders/wo-1/detail`);
    expect(r.request.method).toBe('GET');
    expect(r.request.headers.has('X-Authorities')).toBeFalsy();
    r.flush({ id: 'wo-1' });
  });

  // ── CAP-248: Stories 259, 260, 261 ───────────────────────────────────────

  describe('CAP-248 service methods', () => {
    it('listEstimatesForCustomer — maps API rows (id/total/currencyUomId) to the card model', () => {
      // API shape: id / total / currencyUomId (not estimateId / totalAmount / currency).
      const apiRows = [
        {
          id: 'est-259-1',
          workorderId: 'wo-259-1',
          customerId: 'cust-259-1',
          vehicleId: 'veh-259-1',
          status: 'OPEN',
          total: 250.45,
          currencyUomId: 'USD',
          createdAt: '2026-03-29T12:00:00Z',
          notes: 'cap-248',
        },
      ];

      service.listEstimatesForCustomer('cust-259-1').subscribe(result => {
        expect(result).toEqual([
          {
            estimateId: 'est-259-1',
            workorderId: 'wo-259-1',
            customerId: 'cust-259-1',
            vehicleId: 'veh-259-1',
            status: 'OPEN',
            totalAmount: 250.45,
            currency: 'USD',
            lastUpdatedAt: undefined,
            createdAt: '2026-03-29T12:00:00Z',
            notes: 'cap-248',
          },
        ] as EstimateListItem[]);
      });

      const req = http.expectOne(`${BASE}/v1/workorders/estimates/customer/cust-259-1`);
      expect(req.request.method).toBe('GET');
      req.flush(apiRows);
    });

    it('listEstimatesForVehicle — maps API rows and defaults missing total to 0', () => {
      const apiRows = [
        { id: 'est-259-2', customerId: 'cust-259-2', vehicleId: 'veh-259-2', status: 'APPROVED', currencyUomId: 'USD' },
      ];

      service.listEstimatesForVehicle('veh-259-2').subscribe(result => {
        expect(result[0].estimateId).toBe('est-259-2');
        expect(result[0].totalAmount).toBe(0);
        expect(result[0].currency).toBe('USD');
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/v1/workorders/estimates` && r.params.get('vehicleId') === 'veh-259-2',
      );
      expect(req.request.method).toBe('GET');
      req.flush(apiRows);
    });

    it('listActiveWorkorders — gets /v1/workexec/wip with locationId query', () => {
      const expected: WorkorderWipView[] = [
        {
          workorderId: 'wo-260-1',
          status: 'WORK_IN_PROGRESS',
          assignedTechnicianId: 'tech-260-1',
          locationId: 'loc-260',
          estimatedCompletionTime: '2026-03-30T16:00:00Z',
          customerName: 'Jamie Customer',
          vehicleInfo: '2022 Sedan',
          lastUpdatedAt: '2026-03-30T12:10:00Z',
        },
      ];

      service.listActiveWorkorders('loc-260').subscribe(result => {
        expect(result).toEqual(expected);
      });

      const req = http.expectOne(r =>
        r.url === `${BASE}/v1/workexec/wip` && r.params.get('locationId') === 'loc-260',
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('multiLocation')).toBe('false');
      req.flush({ content: expected, totalElements: 1 });
    });

    it('getWorkorderWipStatus — gets /v1/workexec/wip/{workorderId}', () => {
      const fixture: WorkorderWipView = {
        workorderId: 'wo-260-2',
        status: 'AWAITING_PARTS',
        locationId: 'loc-260',
      };

      service.getWorkorderWipStatus('wo-260-2').subscribe(result => {
        expect(result).toEqual(fixture);
      });

      const req = http.expectOne(`${BASE}/v1/workexec/wip/wo-260-2`);
      expect(req.request.method).toBe('GET');
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

    it('getWorkorderPickList — GET /v1/workorders/{workorderId}/pick-list', () => {
      service.getWorkorderPickList('wo-001').subscribe(result => {
        expect(result).toEqual(pickListFixture);
      });

      const req = http.expectOne(`${BASE}/v1/workorders/wo-001/pick-list`);
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

      const req = http.expectOne(`${BASE}/v1/workorders/wo-001/picked-items`);
      expect(req.request.method).toBe('GET');
      req.flush(pickedFixture);
    });

    it('consumePickedItems — POST /workexec/v1/workorders/{workorderId}/picked-items/consume', () => {
      const consumeReq: ConsumePickedItemsRequest = { lines: [{ pickedItemId: 'pi-001', quantity: 3 }] };
      const consumeResult: ConsumptionResult = {
        referenceId: 'ref-001',
        consumedLineCount: 1,
      };

      service.consumePickedItems('wo-001', consumeReq).subscribe(result => {
        expect(result).toEqual(consumeResult);
      });

      const req = http.expectOne(
        `${BASE}/v1/workorders/wo-001/picked-items:consume`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body['items']).toHaveLength(1);
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

  // ── Finders: typeahead search ────────────────────────────────────────────

  describe('Finders search methods', () => {
    it('searchEstimates — maps page content to SearchResultItem[]', () => {
      estimateSearchStub.searchEstimates.mockReturnValue(
        of({ content: [{ id: 'e1', estimateNumber: 'EST-1', customerName: 'Acme', status: 'DRAFT' }] }),
      );

      let result: unknown;
      service.searchEstimates('acme').subscribe(r => (result = r));

      expect(estimateSearchStub.searchEstimates).toHaveBeenCalledWith({ page: 0, size: 10 }, 'acme');
      expect(result).toEqual([{ id: 'e1', primary: 'Acme', secondary: 'EST-1 · DRAFT' }]);
    });

    it('searchEstimates — yields [] for empty page content', () => {
      estimateSearchStub.searchEstimates.mockReturnValue(of({ content: [] }));

      let result: unknown;
      service.searchEstimates('zzz').subscribe(r => (result = r));

      expect(result).toEqual([]);
    });

    it('searchWorkorders — maps page content to SearchResultItem[] with short id', () => {
      workorderSearchStub.searchWorkorders.mockReturnValue(
        of({ content: [{ workorderId: 'w1234567', status: 'OPEN', customerName: 'Acme' }] }),
      );

      let result: unknown;
      service.searchWorkorders('acme').subscribe(r => (result = r));

      expect(workorderSearchStub.searchWorkorders).toHaveBeenCalledWith({ page: 0, size: 10 }, 'acme');
      expect(result).toEqual([{ id: 'w1234567', primary: 'Acme', secondary: 'w1234567 · OPEN' }]);
    });

    it('searchEstimates — includes vehicle label + truncated VIN as tertiary', () => {
      estimateSearchStub.searchEstimates.mockReturnValue(
        of({
          content: [
            {
              id: 'e1',
              estimateNumber: 'EST-2026-1001',
              customerName: 'Acme',
              status: 'DRAFT',
              vehicleLabel: '2019 Ford F-150',
              vin: '1FTFW1E50KFA12345',
            },
          ],
        }),
      );

      let result: unknown;
      service.searchEstimates('acme').subscribe(r => (result = r));

      expect(result).toEqual([
        {
          id: 'e1',
          primary: 'Acme',
          secondary: 'EST-2026-1001 · DRAFT',
          tertiary: '2019 Ford F-150 · VIN …KFA12345',
        },
      ]);
    });

    it('searchWorkorders — uses workorderNumber and vehicle tertiary when present', () => {
      workorderSearchStub.searchWorkorders.mockReturnValue(
        of({
          content: [
            {
              workorderId: 'w-uuid',
              workorderNumber: 'WO-2026-1001',
              status: 'OPEN',
              customerName: 'Acme',
              vehicleLabel: '2019 Ford F-150',
              vin: '1FTFW1E50KFA12345',
            },
          ],
        }),
      );

      let result: unknown;
      service.searchWorkorders('acme').subscribe(r => (result = r));

      expect(result).toEqual([
        {
          id: 'w-uuid',
          primary: 'Acme',
          secondary: 'WO-2026-1001 · OPEN',
          tertiary: '2019 Ford F-150 · VIN …KFA12345',
        },
      ]);
    });
  });

  describe('Per-item completion (#736)', () => {
    it('completeWorkorderItem — LABOR posts to services/{id}/complete', () => {
      service
        .completeWorkorderItem('wo-1', { id: 'svc-1', workorderId: 'wo-1', itemType: 'LABOR' })
        .subscribe();
      const r = http.expectOne(`${BASE}/v1/workorders/wo-1/services/svc-1/complete`);
      expect(r.request.method).toBe('POST');
      r.flush({ workorderId: 'wo-1', itemId: 'svc-1', itemType: 'SERVICE', status: 'COMPLETED' });
    });

    it('completeWorkorderItem — PART posts to parts/{id}/complete and returns status', () => {
      let status: string | undefined;
      service
        .completeWorkorderItem('wo-1', { id: 'part-1', workorderId: 'wo-1', itemType: 'PART' })
        .subscribe(s => (status = s));
      const r = http.expectOne(`${BASE}/v1/workorders/wo-1/parts/part-1/complete`);
      expect(r.request.method).toBe('POST');
      r.flush({ workorderId: 'wo-1', itemId: 'part-1', itemType: 'PART', status: 'COMPLETED' });
      expect(status).toBe('COMPLETED');
    });
  });

  describe('getTechnicianProfile', () => {
    it('gets /v1/people/employees/{id} and returns the name and employee number', () => {
      let result: { name: string | null; employeeNumber: string | null } | undefined;
      service.getTechnicianProfile('tech-1').subscribe(p => (result = p));
      const r = http.expectOne(`${BASE}/v1/people/employees/tech-1`);
      expect(r.request.method).toBe('GET');
      r.flush({ id: 'tech-1', firstName: 'Jane', lastName: 'Smith', employeeNumber: 'EMP-007', status: 'ACTIVE', hireDate: '2024-01-01' });
      expect(result).toEqual({ name: 'Jane Smith', employeeNumber: 'EMP-007' });
    });

    it('prefers the preferred name over the structured name', () => {
      let result: { name: string | null; employeeNumber: string | null } | undefined;
      service.getTechnicianProfile('tech-1').subscribe(p => (result = p));
      http
        .expectOne(`${BASE}/v1/people/employees/tech-1`)
        .flush({ id: 'tech-1', firstName: 'Jane', lastName: 'Smith', preferredName: 'Janie', employeeNumber: 'EMP-007', status: 'ACTIVE', hireDate: '2024-01-01' });
      expect(result?.name).toBe('Janie');
    });

    it('resolves to null fields when the employee lookup fails', () => {
      let result: { name: string | null; employeeNumber: string | null } | undefined;
      service.getTechnicianProfile('tech-1').subscribe(p => (result = p));
      http
        .expectOne(`${BASE}/v1/people/employees/tech-1`)
        .flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
      expect(result).toEqual({ name: null, employeeNumber: null });
    });
  });
});
