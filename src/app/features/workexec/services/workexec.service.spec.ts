/**
 * WorkexecService unit tests — RED phase
 *
 * These tests verify the primary contract bindings for CAP-002 and CAP-003.
 * They are intentionally minimal (service wiring only) to establish RED
 * before component-level specs are added per story.
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
});
