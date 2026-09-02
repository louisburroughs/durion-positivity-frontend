/**
 * SupplierOrderTransmissionService — generated-client adapter tests (#191, #201).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrderTransmissionStatus,
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
  let api: { listSupplierTransmissionsForPurchaseOrder: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { listSupplierTransmissionsForPurchaseOrder: vi.fn().mockReturnValue(of([dto])) };
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

  it('exposes no write path at all', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(service)).filter(
      name => name !== 'constructor',
    );

    expect(methods).toEqual(['listForPurchaseOrder']);
  });
});
