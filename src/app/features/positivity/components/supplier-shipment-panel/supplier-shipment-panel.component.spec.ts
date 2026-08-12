/**
 * Shipment-event timeline panel (issue #193).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierShipmentPanelComponent } from './supplier-shipment-panel.component';
import { SupplierShipmentService } from '../../services/supplier-shipment.service';
import { SupplierShipmentTimeline } from '../../models/supplier-shipment.models';

const PO_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

/** Deliberately out of order, and one code the frontend does not know. */
const timeline: SupplierShipmentTimeline = {
  purchaseOrderId: PO_ID,
  events: [
    {
      shipmentEventId: 'se-2',
      purchaseOrderId: PO_ID,
      eventCode: 'IN_TRANSIT',
      eventDescription: 'Departed Lyon hub',
      carrierCode: 'DHL',
      trackingReference: 'JD0002',
      vendorOrderNumber: 'MX-ORD-99182',
      packageCount: 2,
      occurredAt: '2026-08-11T18:00:00Z',
      receivedAt: '2026-08-11T18:04:00Z',
    },
    {
      shipmentEventId: 'se-1',
      purchaseOrderId: PO_ID,
      eventCode: 'SHIPPED',
      eventDescription: null,
      carrierCode: 'DHL',
      trackingReference: 'JD0002',
      vendorOrderNumber: 'MX-ORD-99182',
      packageCount: 2,
      occurredAt: '2026-08-11T08:00:00Z',
      receivedAt: '2026-08-11T08:05:00Z',
    },
    {
      shipmentEventId: 'se-3',
      purchaseOrderId: PO_ID,
      eventCode: 'CUSTOMS_HOLD_FR',
      eventDescription: null,
      carrierCode: 'DHL',
      trackingReference: null,
      vendorOrderNumber: null,
      packageCount: null,
      occurredAt: '2026-08-12T06:00:00Z',
      receivedAt: '2026-08-12T06:10:00Z',
    },
  ],
  fetchedAt: '2026-08-12T12:00:00Z',
};

describe('SupplierShipmentPanelComponent', () => {
  let fixture: ComponentFixture<SupplierShipmentPanelComponent>;

  const service = { getShipmentTimeline: vi.fn(), listUnlinkedEvents: vi.fn() };

  beforeEach(async () => {
    service.getShipmentTimeline.mockReturnValue(of(timeline));

    await TestBed.configureTestingModule({
      imports: [SupplierShipmentPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierShipmentService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierShipmentPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('purchaseOrderId', PO_ID);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('loads the timeline for the order', () => {
    render();

    expect(service.getShipmentTimeline).toHaveBeenCalledWith(PO_ID);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('requests nothing until the host supplies a purchase-order id', () => {
    fixture.componentRef.setInput('purchaseOrderId', null);
    fixture.detectChanges();

    expect(service.getShipmentTimeline).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('renders events oldest-first by carrier occurredAt, without mutating the source', () => {
    const before = timeline.events.map(e => e.shipmentEventId);
    render();

    expect(fixture.componentInstance.timelineEntries().map(e => e.id)).toEqual([
      'se-1',
      'se-2',
      'se-3',
    ]);
    expect(timeline.events.map(e => e.shipmentEventId)).toEqual(before);
  });

  it('renders list semantics with real time elements and no mutation control', () => {
    const el = render();

    expect(el.querySelectorAll('ol.pos-timeline li')).toHaveLength(3);
    expect(el.querySelector('ol.pos-timeline time')?.getAttribute('datetime')).toBe(
      '2026-08-11T08:00:00Z',
    );
    expect(el.querySelectorAll('ol.pos-timeline button')).toHaveLength(0);
    expect(el.querySelectorAll('ol.pos-timeline input')).toHaveLength(0);
  });

  it('keeps the carrier event time and the platform ingest time as separate facts', () => {
    render();

    const first = fixture.componentInstance.timelineEntries()[0];
    expect(first.occurredAt).toBe('2026-08-11T08:00:00Z');
    expect(first.details).toContainEqual({
      termKey: 'POSITIVITY.SHIPMENT.RECEIVED_AT',
      value: '2026-08-11T08:05:00Z',
      datetime: '2026-08-11T08:05:00Z',
    });
  });

  it('shows an unrecognised carrier event code verbatim rather than dropping the event', () => {
    const el = render();

    const labels = Array.from(el.querySelectorAll('.pos-timeline__label')).map(n =>
      n.textContent?.trim(),
    );
    expect(labels).toEqual([
      'POSITIVITY.SHIPMENT.EVENT.SHIPPED',
      'POSITIVITY.SHIPMENT.EVENT.IN_TRANSIT',
      'CUSTOMS_HOLD_FR',
    ]);
  });

  it('renders an empty state when the vendor has reported no events', () => {
    service.getShipmentTimeline.mockReturnValue(of({ ...timeline, events: [] }));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(el.querySelector('.shipment__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.SHIPMENT.EMPTY',
    );
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.getShipmentTimeline.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('sets state then errorKey on a 5xx and keeps retry available (ADR-0031)', () => {
    service.getShipmentTimeline.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('exposes no method that could edit, dismiss or link an event', () => {
    render();
    const methodNames = Object.getOwnPropertyNames(
      Object.getPrototypeOf(fixture.componentInstance),
    );
    expect(
      methodNames.some(name => /dismiss|hide|delete|edit|link|acknowledge/i.test(name)),
    ).toBe(false);
  });
});
