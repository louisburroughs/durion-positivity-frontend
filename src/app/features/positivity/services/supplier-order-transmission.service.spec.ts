/**
 * SupplierOrderTransmissionService — generated-client adapter tests (#191, #201).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrderTransmissionStatus,
  PagedResponse,
  SupplierOrderTransmissionService as SupplierOrderTransmissionApi,
} from '@durion-sdk/supplier';
import { SupplierOrderTransmissionService } from './supplier-order-transmission.service';
import { SupplierOrderTransmission } from '../models/supplier-order-transmission.models';

const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const dto: OrderTransmissionStatus = {
  transmissionIntentId: 'ti-1',
  purchaseOrderId: PO_ID,
  purchaseOrderNumber: 'PO-1042',
  supplierRef: 'michelin-eu',
  state: 'MANUAL_REVIEW' as OrderTransmissionStatus['state'],
  supplierOrderNumber: 'MX-ORD-99182',
  documentId: 'DOC-4411',
  latestScheduledDeliveryDate: '2026-08-20',
  vendorReason: 'Rupture partielle — 2 pièces semaine 34',
  vendorErrorCode: 'PARTIAL_STOCK',
  failureDetail: undefined,
  lastStatusAt: '2026-08-12T11:40:00Z',
  lastTransitionAt: '2026-08-12T11:41:00Z',
  dispatchAttempts: 2,
  resolutionAction: undefined,
  resolvedAt: undefined,
  resolvedBy: undefined,
};

describe('SupplierOrderTransmissionService', () => {
  let service: SupplierOrderTransmissionService;
  let api: {
    listSupplierTransmissionsForPurchaseOrder: ReturnType<typeof vi.fn>;
    getSupplierTransmission: ReturnType<typeof vi.fn>;
    searchSupplierTransmissions: ReturnType<typeof vi.fn>;
    resolveSupplierTransmission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      listSupplierTransmissionsForPurchaseOrder: vi.fn().mockReturnValue(of([dto])),
      getSupplierTransmission: vi.fn().mockReturnValue(of(dto)),
      searchSupplierTransmissions: vi.fn().mockReturnValue(
        of({ items: [dto], page: 0, size: 25, totalElements: 1, totalPages: 1 } as PagedResponse),
      ),
      resolveSupplierTransmission: vi.fn().mockReturnValue(of(dto)),
    };
    TestBed.configureTestingModule({
      providers: [
        SupplierOrderTransmissionService,
        { provide: SupplierOrderTransmissionApi, useValue: api },
      ],
    });
    service = TestBed.inject(SupplierOrderTransmissionService);
  });

  it('listForPurchaseOrder() — calls the generated list operation exactly once with the PO id', () => {
    service.listForPurchaseOrder(PO_ID).subscribe();

    expect(api.listSupplierTransmissionsForPurchaseOrder).toHaveBeenCalledTimes(1);
    expect(api.listSupplierTransmissionsForPurchaseOrder).toHaveBeenCalledWith(PO_ID);
  });

  it('listForPurchaseOrder() — maps every DTO field into the panel view model', () => {
    let result: SupplierOrderTransmission[] | undefined;
    service.listForPurchaseOrder(PO_ID).subscribe(value => (result = value));

    expect(result).toEqual([
      {
        transmissionIntentId: 'ti-1',
        purchaseOrderId: PO_ID,
        purchaseOrderNumber: 'PO-1042',
        supplierRef: 'michelin-eu',
        state: 'MANUAL_REVIEW',
        supplierOrderNumber: 'MX-ORD-99182',
        documentId: 'DOC-4411',
        latestScheduledDeliveryDate: '2026-08-20',
        vendorReason: 'Rupture partielle — 2 pièces semaine 34',
        vendorErrorCode: 'PARTIAL_STOCK',
        failureDetail: null,
        lastStatusAt: '2026-08-12T11:40:00Z',
        lastTransitionAt: '2026-08-12T11:41:00Z',
        dispatchAttempts: 2,
        resolutionAction: null,
        resolvedAt: null,
        resolvedBy: null,
      },
    ]);
  });

  it('listForPurchaseOrder() — an unknown state token maps to null rather than a guessed state', () => {
    api.listSupplierTransmissionsForPurchaseOrder.mockReturnValue(
      of([{ ...dto, state: 'SOMETHING_NEW' as OrderTransmissionStatus['state'] }]),
    );
    let result: SupplierOrderTransmission[] | undefined;
    service.listForPurchaseOrder(PO_ID).subscribe(value => (result = value));

    expect(result?.[0].state).toBeNull();
  });

  it('exposes no re-send / retry / re-transmit operation — the absence is the safety property', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).join(' ').toLowerCase();

    expect(methods).not.toMatch(/resend|retry|retransmit|transmit(?!ission)/);
  });

  it('exposes exactly the read/resolve surface — no hidden extra method', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor' && !name.startsWith('__') && name !== 'toSearchPage',
    );

    expect(new Set(methods)).toEqual(
      new Set(['listForPurchaseOrder', 'getTransmission', 'searchManualReview', 'resolveTransmission']),
    );
  });

  it('getTransmission() — calls the generated get operation with the intent id', () => {
    let result: SupplierOrderTransmission | undefined;
    service.getTransmission('ti-1').subscribe(value => (result = value));

    expect(api.getSupplierTransmission).toHaveBeenCalledWith('ti-1');
    expect(result?.transmissionIntentId).toBe('ti-1');
  });

  it('searchManualReview() — always fixes attemptState to MANUAL_REVIEW', () => {
    service.searchManualReview({ vendorProfileId: 'vp-1', search: 'PO-1' }, 2, 10).subscribe();

    expect(api.searchSupplierTransmissions).toHaveBeenCalledWith(
      'MANUAL_REVIEW',
      'vp-1',
      'PO-1',
      undefined,
      undefined,
      2,
      10,
    );
  });

  it('searchManualReview() — converts a date-only window to a half-open instant window', () => {
    service.searchManualReview({ dateFrom: '2026-08-01', dateTo: '2026-08-07' }).subscribe();

    const call = api.searchSupplierTransmissions.mock.calls[0];
    expect(call[3]).toBe(new Date(2026, 7, 1).toISOString());
    expect(call[4]).toBe(new Date(2026, 7, 8).toISOString());
  });

  it('searchManualReview() — maps the paged response into the UI page shape', () => {
    let result: ReturnType<typeof Array> | undefined;
    service.searchManualReview().subscribe(value => (result = value as unknown as typeof result));

    expect(result).toEqual({
      items: [
        {
          transmissionIntentId: 'ti-1',
          purchaseOrderId: PO_ID,
          purchaseOrderNumber: 'PO-1042',
          supplierRef: 'michelin-eu',
          state: 'MANUAL_REVIEW',
          supplierOrderNumber: 'MX-ORD-99182',
          documentId: 'DOC-4411',
          latestScheduledDeliveryDate: '2026-08-20',
          vendorReason: 'Rupture partielle — 2 pièces semaine 34',
          vendorErrorCode: 'PARTIAL_STOCK',
          failureDetail: null,
          lastStatusAt: '2026-08-12T11:40:00Z',
          lastTransitionAt: '2026-08-12T11:41:00Z',
          dispatchAttempts: 2,
          resolutionAction: null,
          resolvedAt: null,
          resolvedBy: null,
        },
      ],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
  });

  it('resolveTransmission() — sends the action, evidence and vendor reference verbatim', () => {
    service
      .resolveTransmission('ti-1', {
        action: 'CONFIRM_WITH_VENDOR_REFERENCE',
        evidence: 'Vendor confirmed by phone 2026-08-12',
        supplierOrderNumber: 'MX-ORD-99182',
      })
      .subscribe();

    expect(api.resolveSupplierTransmission).toHaveBeenCalledWith('ti-1', {
      action: 'CONFIRM_WITH_VENDOR_REFERENCE',
      evidence: 'Vendor confirmed by phone 2026-08-12',
      supplierOrderNumber: 'MX-ORD-99182',
    });
  });
});
