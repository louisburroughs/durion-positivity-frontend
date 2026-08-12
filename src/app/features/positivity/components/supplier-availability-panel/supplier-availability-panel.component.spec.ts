/**
 * Supplier availability section for Product Detail (issue #190).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 * ADR-0033: the in-flight-cancellation test covers the effect's `onCleanup`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierAvailabilityPanelComponent } from './supplier-availability-panel.component';
import { SupplierAvailabilityService } from '../../services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import {
  SupplierAvailability,
  SupplierDeliveryLocation,
} from '../../models/supplier-availability.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const PRODUCT_ID = 'ffc9a4c2-0000-7000-8000-000000000010';
const LOCATION_A = 'ffc9a4c2-0000-7000-8000-0000000000aa';

const roster: SupplierDeliveryLocation[] = [
  { locationId: LOCATION_A, name: 'Downtown Service Center' },
];

const twoVendors: SupplierAvailability = {
  productId: PRODUCT_ID,
  deliveryLocationId: LOCATION_A,
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
  vendors: [
    {
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      status: 'OK',
      availableQuantity: 24,
      unitOfMeasure: 'EA',
      deliveryEstimate: { earliestDeliveryDate: '2026-08-14', leadTimeDays: 2 },
      asOf: '2026-08-12T11:45:00Z',
    },
    {
      vendorProfileId: 'vp-2',
      vendorDisplayName: 'Continental DE',
      status: 'NOT_LISTED',
      availableQuantity: null,
      unitOfMeasure: null,
      asOf: '2026-08-12T11:50:00Z',
    },
  ],
};

describe('SupplierAvailabilityPanelComponent', () => {
  let fixture: ComponentFixture<SupplierAvailabilityPanelComponent>;

  const availabilityService = { getAvailabilityByProductId: vi.fn(), getAvailabilityBySku: vi.fn() };
  const selectedLocationId = signal<string | null>(null);
  const locationService = {
    listActiveLocations: vi.fn(),
    select: vi.fn((id: string | null) => selectedLocationId.set(id)),
    selectedLocationId,
  };

  beforeEach(async () => {
    selectedLocationId.set(null);
    locationService.listActiveLocations.mockReturnValue(of(roster));
    availabilityService.getAvailabilityByProductId.mockReturnValue(of(twoVendors));

    await TestBed.configureTestingModule({
      imports: [SupplierAvailabilityPanelComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SupplierAvailabilityService, useValue: availabilityService },
        { provide: SupplierDeliveryLocationService, useValue: locationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAvailabilityPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(productId: string | null = PRODUCT_ID): HTMLElement {
    fixture.componentRef.setInput('productId', productId);
    fixture.componentRef.setInput('nowMs', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('prompts for a delivery location and fires no request until one is chosen', () => {
    const el = render();

    expect(fixture.componentInstance.state()).toBe('prompt');
    expect(availabilityService.getAvailabilityByProductId).not.toHaveBeenCalled();
    expect(el.querySelector('.avail-panel__prompt')?.textContent?.trim()).toBe(
      'POSITIVITY.AVAILABILITY.PROMPT_LOCATION',
    );
  });

  it('stays idle and silent while the host page has no product id yet', () => {
    selectedLocationId.set(LOCATION_A);
    render(null);

    expect(fixture.componentInstance.state()).toBe('idle');
    expect(availabilityService.getAvailabilityByProductId).not.toHaveBeenCalled();
  });

  it('loads availability for the product at the chosen location', () => {
    selectedLocationId.set(LOCATION_A);
    render();

    expect(availabilityService.getAvailabilityByProductId).toHaveBeenCalledWith(
      PRODUCT_ID,
      LOCATION_A,
    );
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('re-queries when the user changes the delivery location', () => {
    render();
    selectedLocationId.set(LOCATION_A);
    fixture.detectChanges();

    expect(availabilityService.getAvailabilityByProductId).toHaveBeenCalledTimes(1);

    selectedLocationId.set('ffc9a4c2-0000-7000-8000-0000000000bb');
    fixture.detectChanges();

    expect(availabilityService.getAvailabilityByProductId).toHaveBeenCalledTimes(2);
  });

  it('renders one labelled row per vendor with no aggregation or reordering', () => {
    selectedLocationId.set(LOCATION_A);
    const el = render();

    const rows = el.querySelectorAll('.avail-panel__item');
    expect(rows).toHaveLength(2);

    const names = Array.from(el.querySelectorAll('.avail-row__vendor')).map(n =>
      n.textContent?.trim(),
    );
    expect(names).toEqual(['Michelin EU', 'Continental DE']);
  });

  it('renders a mixed result set without letting one vendor status leak into another', () => {
    selectedLocationId.set(LOCATION_A);
    const el = render();
    const rows = el.querySelectorAll('.avail-row');

    expect(rows[0].getAttribute('data-status')).toBe('OK');
    expect(rows[1].getAttribute('data-status')).toBe('NOT_LISTED');
    expect(rows[0].querySelector('.avail-row__value--quantity')?.textContent).toContain('24');
    expect(rows[1].querySelector('.avail-row__value--quantity')).toBeNull();
  });

  it('forwards the backend staleness threshold and the platform fetch time to each row', () => {
    selectedLocationId.set(LOCATION_A);
    render();

    expect(fixture.componentInstance.thresholdMinutes()).toBe(60);
    expect(fixture.componentInstance.fetchedAt()).toBe('2026-08-12T11:59:00Z');
  });

  it('shows a loading state immediately so a slow vendor never reads as a frozen screen', () => {
    const pending = new Subject<SupplierAvailability>();
    availabilityService.getAvailabilityByProductId.mockReturnValue(pending.asObservable());
    selectedLocationId.set(LOCATION_A);
    const el = render();

    expect(fixture.componentInstance.state()).toBe('loading');
    expect(el.querySelector('[role="status"]')).not.toBeNull();

    pending.next(twoVendors);
    pending.complete();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('sets state then errorKey on a vendor failure and offers a retry (ADR-0031)', () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout' })),
    );
    selectedLocationId.set(LOCATION_A);
    const el = render();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.componentInstance.retryable()).toBe(true);
  });

  it('renders a 403 as a restricted state rather than a retry loop', () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    selectedLocationId.set(LOCATION_A);
    render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(fixture.componentInstance.retryable()).toBe(false);
  });

  it('drops any previous vendor data on failure — stale numbers never survive an error', () => {
    selectedLocationId.set(LOCATION_A);
    render();
    expect(fixture.componentInstance.vendors()).toHaveLength(2);

    availabilityService.getAvailabilityByProductId.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(fixture.componentInstance.vendors()).toEqual([]);
  });

  it('retries after a failure and recovers', () => {
    availabilityService.getAvailabilityByProductId.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Server Error' })),
    );
    selectedLocationId.set(LOCATION_A);
    render();
    expect(fixture.componentInstance.state()).toBe('error');

    availabilityService.getAvailabilityByProductId.mockReturnValue(of(twoVendors));
    fixture.componentInstance.reload();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('reports a configured-but-empty vendor set distinctly from an error', () => {
    availabilityService.getAvailabilityByProductId.mockReturnValue(
      of({ ...twoVendors, vendors: [] }),
    );
    selectedLocationId.set(LOCATION_A);
    const el = render();

    expect(fixture.componentInstance.state()).toBe('empty');
    expect(fixture.componentInstance.errorKey()).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels an in-flight lookup when the location changes (ADR-0033)', () => {
    const pending = new Subject<SupplierAvailability>();
    availabilityService.getAvailabilityByProductId.mockReturnValueOnce(pending.asObservable());
    selectedLocationId.set(LOCATION_A);
    render();
    expect(pending.observed).toBe(true);

    availabilityService.getAvailabilityByProductId.mockReturnValue(of(twoVendors));
    selectedLocationId.set('ffc9a4c2-0000-7000-8000-0000000000bb');
    fixture.detectChanges();

    expect(pending.observed).toBe(false);
  });

  it('owns its own state — it exposes no output that could reach the host page', () => {
    const instance = fixture.componentInstance as unknown as Record<string, unknown>;
    const outputs = Object.keys(instance).filter(key => /error|failure/i.test(key));

    expect(outputs).toEqual(['errorKey']);
  });
});
