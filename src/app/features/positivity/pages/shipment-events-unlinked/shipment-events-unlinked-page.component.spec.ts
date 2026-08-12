/**
 * Flagged unlinked shipment-event list (issue #193).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShipmentEventsUnlinkedPageComponent } from './shipment-events-unlinked-page.component';
import { SupplierShipmentService } from '../../services/supplier-shipment.service';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierUnlinkedShipmentEventPage } from '../../models/supplier-shipment.models';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const page: SupplierUnlinkedShipmentEventPage = {
  items: [
    {
      shipmentEventId: 'se-9',
      purchaseOrderId: null,
      eventCode: 'IN_TRANSIT',
      eventDescription: null,
      carrierCode: 'DHL',
      trackingReference: 'JD0009',
      vendorOrderNumber: 'MX-ORD-00000',
      packageCount: null,
      occurredAt: '2026-08-11T09:00:00Z',
      receivedAt: '2026-08-11T13:02:00Z',
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      unlinkedReason: 'NO_MATCHING_ORDER',
    },
    {
      shipmentEventId: 'se-10',
      purchaseOrderId: null,
      eventCode: 'DELIVERED',
      eventDescription: null,
      carrierCode: null,
      trackingReference: null,
      vendorOrderNumber: null,
      packageCount: null,
      occurredAt: '2026-08-11T15:00:00Z',
      receivedAt: '2026-08-11T15:01:00Z',
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      unlinkedReason: 'AMBIGUOUS_ORDER_MATCH',
    },
  ],
  totalCount: 2,
  nextPageToken: null,
};

const vendors: VendorProfileSummary[] = [
  {
    vendorProfileId: 'vp-1',
    supplierRef: 'michelin-eu',
    displayName: 'Michelin EU',
    enabled: true,
    sandbox: false,
    sourceOfTruth: 'ADMIN',
  },
];

describe('ShipmentEventsUnlinkedPageComponent', () => {
  let fixture: ComponentFixture<ShipmentEventsUnlinkedPageComponent>;

  const service = { getShipmentTimeline: vi.fn(), listUnlinkedEvents: vi.fn() };
  const profiles = { listProfiles: vi.fn() };

  beforeEach(async () => {
    service.listUnlinkedEvents.mockReturnValue(of(page));
    profiles.listProfiles.mockReturnValue(of(vendors));

    await TestBed.configureTestingModule({
      imports: [ShipmentEventsUnlinkedPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierShipmentService, useValue: service },
        { provide: SupplierProfileService, useValue: profiles },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShipmentEventsUnlinkedPageComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(): HTMLElement {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists every flagged unlinked event', () => {
    const el = render();

    expect(service.listUnlinkedEvents).toHaveBeenCalledWith({});
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('shows the carrier event time and the platform ingest time as separate columns', () => {
    const el = render();

    const times = Array.from(el.querySelectorAll('tbody tr')[0].querySelectorAll('time')).map(t =>
      t.getAttribute('datetime'),
    );
    expect(times).toEqual(['2026-08-11T09:00:00Z', '2026-08-11T13:02:00Z']);
  });

  it('offers no dismiss, ignore or manual-link control', () => {
    const el = render();

    const rowControls = el.querySelectorAll('tbody button, tbody a, tbody input');
    expect(rowControls).toHaveLength(0);

    const text = Array.from(el.querySelectorAll('button'))
      .map(b => b.textContent ?? '')
      .join(' ')
      .toLowerCase();
    expect(text).not.toMatch(/dismiss|ignore|link|resolve|delete/);
  });

  it('renders the vendor reason token as delivered', () => {
    const el = render();

    const reasons = Array.from(el.querySelectorAll('.unlinked-events__reason')).map(n =>
      n.textContent?.trim(),
    );
    expect(reasons).toEqual(['NO_MATCHING_ORDER', 'AMBIGUOUS_ORDER_MATCH']);
  });

  it('forwards the vendor, search and date filters', () => {
    render();
    fixture.componentInstance.filterForm.setValue({
      vendorProfileId: 'vp-1',
      search: '  JD0009 ',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
    fixture.componentInstance.applyFilter();

    expect(service.listUnlinkedEvents).toHaveBeenLastCalledWith({
      vendorProfileId: 'vp-1',
      search: 'JD0009',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-12',
    });
  });

  it('renders an empty list as a clean state, not an error', () => {
    service.listUnlinkedEvents.mockReturnValue(of({ items: [], totalCount: 0, nextPageToken: null }));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(el.querySelector('.unlinked-events__empty')?.textContent?.trim()).toBe(
      'POSITIVITY.SHIPMENT.UNLINKED.EMPTY',
    );
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.listUnlinkedEvents.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('sets state then errorKey on a 5xx and keeps retry available (ADR-0031)', () => {
    service.listUnlinkedEvents.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps the list usable when the vendor roster cannot be read', () => {
    profiles.listProfiles.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.vendorFilterAvailable()).toBe(false);
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(el.querySelector('#unlinked-events-vendor')).toBeNull();
  });
});
