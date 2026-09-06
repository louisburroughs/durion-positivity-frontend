/**
 * PurchaseOrderTransmissionTimelinePanelComponent tests (#215).
 *
 * The service is mocked at the adapter boundary: the panel's contract is one
 * paged read per purchase order, and the adapter has its own suite.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseOrderTransmissionTimelinePanelComponent } from './purchase-order-transmission-timeline-panel.component';
import { PurchaseOrderTransmissionTimelineService } from '../../services/purchase-order-transmission-timeline.service';
import { PurchaseOrderTransmissionTimelinePage } from '../../models/purchase-order-transmission-timeline.models';

const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const statusChanged: PurchaseOrderTransmissionTimelinePage['items'][number] = {
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
};

const reviewRequired: PurchaseOrderTransmissionTimelinePage['items'][number] = {
  ...statusChanged,
  transmissionEventId: 'evt-2',
  eventType: 'REVIEW_REQUIRED',
  status: null,
  vendorReason: 'Ambiguous acknowledgement',
  observedAt: '2026-08-12T12:10:00Z',
  recordedAt: '2026-08-12T12:12:00Z',
};

const singlePage: PurchaseOrderTransmissionTimelinePage = {
  items: [statusChanged, reviewRequired],
  page: 0,
  size: 25,
  totalCount: 2,
  totalPages: 1,
};

describe('PurchaseOrderTransmissionTimelinePanelComponent', () => {
  let fixture: ComponentFixture<PurchaseOrderTransmissionTimelinePanelComponent>;
  let component: PurchaseOrderTransmissionTimelinePanelComponent;
  let service: { listForPurchaseOrder: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = { listForPurchaseOrder: vi.fn().mockReturnValue(of(singlePage)) };
    await TestBed.configureTestingModule({
      imports: [PurchaseOrderTransmissionTimelinePanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: PurchaseOrderTransmissionTimelineService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(PurchaseOrderTransmissionTimelinePanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(purchaseOrderId: string | null = PO_ID): HTMLElement {
    fixture.componentRef.setInput('purchaseOrderId', purchaseOrderId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('requests nothing until the host supplies a purchase-order id', () => {
    render(null);

    expect(service.listForPurchaseOrder).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('reads the first page for the order and renders every event', () => {
    const el = render();

    expect(service.listForPurchaseOrder).toHaveBeenCalledTimes(1);
    expect(service.listForPurchaseOrder).toHaveBeenCalledWith(PO_ID, 0);
    expect(component.state()).toBe('ready');
    expect(el.querySelectorAll('.timeline__item')).toHaveLength(2);
  });

  it('shows both observedAt and recordedAt for each event, never collapsed into one', () => {
    const el = render();
    const times = Array.from(el.querySelectorAll('.timeline__item')[0].querySelectorAll('time'));

    expect(times).toHaveLength(2);
    expect(times[0].getAttribute('datetime')).toBe('2026-08-12T11:40:00Z');
    expect(times[1].getAttribute('datetime')).toBe('2026-08-12T11:41:05Z');
  });

  it('keeps the server order — never re-sorts client-side', () => {
    const el = render();
    const ids = Array.from(el.querySelectorAll('.timeline__item')).map(li =>
      li.querySelector('time')?.getAttribute('datetime'),
    );

    expect(ids).toEqual(['2026-08-12T11:40:00Z', '2026-08-12T12:10:00Z']);
  });

  it('renders a recognised event type with a translated label', () => {
    const el = render();

    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION_TIMELINE.EVENT_TYPE.STATUS_CHANGED');
  });

  it('shows the vendor reason verbatim for a review-required event', () => {
    const el = render();

    expect(el.textContent).toContain('Ambiguous acknowledgement');
  });

  it('treats an empty page as "no timeline yet", not as an error', () => {
    service.listForPurchaseOrder.mockReturnValue(
      of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
    );
    const el = render();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
    expect(el.textContent).toContain('POSITIVITY.TRANSMISSION_TIMELINE.EMPTY');
  });

  it('treats a 404 as "no timeline yet", not as an error', () => {
    service.listForPurchaseOrder.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    render();

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.listForPurchaseOrder.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(component.state()).toBe('forbidden');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('paginates without re-sorting or merging pages', () => {
    service.listForPurchaseOrder.mockReturnValue(of({ ...singlePage, totalPages: 2 }));
    render();
    service.listForPurchaseOrder.mockReturnValue(
      of({
        items: [reviewRequired],
        page: 1,
        size: 25,
        totalCount: 26,
        totalPages: 2,
      }),
    );
    component.nextPage();
    fixture.detectChanges();

    expect(service.listForPurchaseOrder).toHaveBeenLastCalledWith(PO_ID, 1);
    expect(component.page()).toBe(1);
  });

  it('offers no re-send, retry or re-transmit affordance', () => {
    const el = render();
    const controlText = Array.from(el.querySelectorAll('button, a'))
      .map(n => n.textContent ?? '')
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/resend|re-send|retransmit|re-transmit|send.?again/);
  });

  it('reload() re-reads the current page', () => {
    render();
    component.reload();
    fixture.detectChanges();

    expect(service.listForPurchaseOrder).toHaveBeenCalledTimes(2);
  });

  describe('null timestamp guards', () => {
    const noTimestamps: PurchaseOrderTransmissionTimelinePage['items'][number] = {
      ...statusChanged,
      transmissionEventId: 'evt-3',
      observedAt: null,
      recordedAt: null,
    };

    it('renders the NOT_AVAILABLE label and no <time> element for a row with null observedAt/recordedAt', () => {
      service.listForPurchaseOrder.mockReturnValue(
        of({ items: [noTimestamps], page: 0, size: 25, totalCount: 1, totalPages: 1 }),
      );
      const el = render();
      const item = el.querySelector('.timeline__item')!;

      expect(item.querySelectorAll('time')).toHaveLength(0);
      const facts = Array.from(item.querySelectorAll('.timeline__fact')).map(f => f.textContent ?? '');
      expect(facts.some(f => f.includes('POSITIVITY.TRANSMISSION_TIMELINE.NOT_AVAILABLE'))).toBe(true);
    });

    it('never renders an empty datetime attribute for a row with null timestamps', () => {
      service.listForPurchaseOrder.mockReturnValue(
        of({ items: [noTimestamps], page: 0, size: 25, totalCount: 1, totalPages: 1 }),
      );
      const el = render();
      const item = el.querySelector('.timeline__item')!;

      const emptyDatetimes = Array.from(item.querySelectorAll('[datetime]')).filter(
        node => node.getAttribute('datetime') === '',
      );
      expect(emptyDatetimes).toHaveLength(0);
    });

    it('renders <time datetime="..."> for a row with observedAt/recordedAt values', () => {
      const el = render();
      const item = el.querySelectorAll('.timeline__item')[0];
      const times = Array.from(item.querySelectorAll('time'));

      expect(times).toHaveLength(2);
      expect(times[0].getAttribute('datetime')).toBe(statusChanged.observedAt);
      expect(times[1].getAttribute('datetime')).toBe(statusChanged.recordedAt);
    });
  });
});
