/**
 * PurchaseOrderTransmissionTimelineService — generated-client adapter tests (#215).
 */
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PagePurchaseOrderTransmissionEvent,
  PurchaseOrderTransmissionEvent as SdkPurchaseOrderTransmissionEvent,
  PurchaseOrdersService,
} from '@durion-sdk/order';
import { PurchaseOrderTransmissionTimelineService } from './purchase-order-transmission-timeline.service';
import { PurchaseOrderTransmissionTimelinePage } from '../models/purchase-order-transmission-timeline.models';

const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const eventDto: SdkPurchaseOrderTransmissionEvent = {
  transmissionEventId: 'evt-1',
  transmissionIntentId: 'ti-1',
  eventType: 'STATUS_CHANGED',
  status: 'DISPATCHING',
  vendorDocumentId: 'DOC-4411',
  supplierOrderNumber: 'MX-ORD-99182',
  vendorReason: undefined,
  despatchDate: '2026-08-15',
  estimatedDeliveryDate: '2026-08-20',
  observedAt: '2026-08-12T11:40:00Z',
  recordedAt: '2026-08-12T11:41:05Z',
};

const pageDto: PagePurchaseOrderTransmissionEvent = {
  content: [eventDto],
  number: 0,
  size: 25,
  totalElements: 1,
  totalPages: 1,
  first: true,
  last: true,
  empty: false,
};

describe('PurchaseOrderTransmissionTimelineService', () => {
  let service: PurchaseOrderTransmissionTimelineService;
  let api: { listPurchaseOrderTransmissionEvents: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { listPurchaseOrderTransmissionEvents: vi.fn().mockReturnValue(of(pageDto)) };
    TestBed.configureTestingModule({
      providers: [
        PurchaseOrderTransmissionTimelineService,
        { provide: PurchaseOrdersService, useValue: api },
      ],
    });
    service = TestBed.inject(PurchaseOrderTransmissionTimelineService);
  });

  it('calls the generated operation with the PO id, page and size — no sort parameter', () => {
    service.listForPurchaseOrder(PO_ID, 1, 10).subscribe();

    expect(api.listPurchaseOrderTransmissionEvents).toHaveBeenCalledWith(PO_ID, 1, 10);
  });

  it('maps every DTO field, keeping observedAt and recordedAt as separate fields', () => {
    let result: PurchaseOrderTransmissionTimelinePage | undefined;
    service.listForPurchaseOrder(PO_ID).subscribe(value => (result = value));

    expect(result).toEqual({
      items: [
        {
          transmissionEventId: 'evt-1',
          transmissionIntentId: 'ti-1',
          eventType: 'STATUS_CHANGED',
          status: 'DISPATCHING',
          vendorDocumentId: 'DOC-4411',
          supplierOrderNumber: 'MX-ORD-99182',
          vendorReason: null,
          despatchDate: '2026-08-15',
          estimatedDeliveryDate: '2026-08-20',
          observedAt: '2026-08-12T11:40:00Z',
          recordedAt: '2026-08-12T11:41:05Z',
        },
      ],
      page: 0,
      size: 25,
      totalCount: 1,
      totalPages: 1,
    });
  });

  it('never re-sorts — the items array is exactly the server order', () => {
    const reversedDto: PagePurchaseOrderTransmissionEvent = {
      ...pageDto,
      content: [
        { ...eventDto, transmissionEventId: 'evt-2', observedAt: '2026-08-12T09:00:00Z' },
        eventDto,
      ],
    };
    api.listPurchaseOrderTransmissionEvents.mockReturnValue(of(reversedDto));

    let result: PurchaseOrderTransmissionTimelinePage | undefined;
    service.listForPurchaseOrder(PO_ID).subscribe(value => (result = value));

    expect(result?.items.map(i => i.transmissionEventId)).toEqual(['evt-2', 'evt-1']);
  });
});
