/**
 * On-demand per-line availability check (issue #190, open question ruled
 * "on demand only").
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierAvailabilityCheckComponent } from './supplier-availability-check.component';
import { SupplierAvailabilityService } from '../../services/supplier-availability.service';
import { SupplierDeliveryLocationService } from '../../services/supplier-delivery-location.service';
import { SupplierAvailability } from '../../models/supplier-availability.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const LOCATION_A = 'ffc9a4c2-0000-7000-8000-0000000000aa';
const SKU = 'MX-2255';

const result: SupplierAvailability = {
  sku: SKU,
  deliveryLocationId: LOCATION_A,
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
  vendors: [
    {
      vendorProfileId: 'vp-1',
      vendorDisplayName: 'Michelin EU',
      status: 'OK',
      availableQuantity: 40,
      unitOfMeasure: 'EA',
      asOf: '2026-08-12T11:45:00Z',
    },
  ],
};

describe('SupplierAvailabilityCheckComponent', () => {
  let fixture: ComponentFixture<SupplierAvailabilityCheckComponent>;

  const availabilityService = { getAvailabilityBySku: vi.fn(), getAvailabilityByProductId: vi.fn() };
  const selectedLocationId = signal<string | null>(null);
  const locationService = {
    listActiveLocations: vi.fn(),
    select: vi.fn(),
    selectedLocationId,
  };

  beforeEach(async () => {
    selectedLocationId.set(LOCATION_A);
    availabilityService.getAvailabilityBySku.mockReturnValue(of(result));

    await TestBed.configureTestingModule({
      imports: [SupplierAvailabilityCheckComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SupplierAvailabilityService, useValue: availabilityService },
        { provide: SupplierDeliveryLocationService, useValue: locationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAvailabilityCheckComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('sku', SKU);
    fixture.componentRef.setInput('quantity', 4);
    fixture.componentRef.setInput('nowMs', NOW);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('fires no request on render — availability is never checked automatically', () => {
    render();

    expect(availabilityService.getAvailabilityBySku).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('fires no request when the line SKU or quantity changes', () => {
    render();
    fixture.componentRef.setInput('sku', 'OTHER-SKU');
    fixture.componentRef.setInput('quantity', 12);
    fixture.detectChanges();

    expect(availabilityService.getAvailabilityBySku).not.toHaveBeenCalled();
  });

  it('checks by SKU with the ordered quantity when the user asks', () => {
    const el = render();
    el.querySelector<HTMLButtonElement>('.avail-check__trigger')?.click();
    fixture.detectChanges();

    expect(availabilityService.getAvailabilityBySku).toHaveBeenCalledWith(SKU, LOCATION_A, 4);
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('labels the result with the time it was obtained', () => {
    const el = render();
    el.querySelector<HTMLButtonElement>('.avail-check__trigger')?.click();
    fixture.detectChanges();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());
    expect(terms).toContain('POSITIVITY.AVAILABILITY.CHECKED_AT');
    expect(fixture.componentInstance.fetchedAt()).toBe('2026-08-12T11:59:00Z');
  });

  it('prefers an explicit deliveryLocationId input over the session selection', () => {
    const explicitLocation = 'ffc9a4c2-0000-7000-8000-0000000000bb';
    render({ deliveryLocationId: explicitLocation });
    fixture.componentInstance.check();

    expect(availabilityService.getAvailabilityBySku).toHaveBeenCalledWith(
      SKU,
      explicitLocation,
      4,
    );
  });

  it('cannot be checked without a delivery location, and says why', () => {
    selectedLocationId.set(null);
    const el = render();

    expect(fixture.componentInstance.canCheck()).toBe(false);
    expect(el.querySelector<HTMLButtonElement>('.avail-check__trigger')?.disabled).toBe(true);
    expect(el.querySelector('.avail-check__hint')?.textContent?.trim()).toBe(
      'POSITIVITY.AVAILABILITY.CHECK.NEEDS_LOCATION',
    );

    fixture.componentInstance.check();
    expect(availabilityService.getAvailabilityBySku).not.toHaveBeenCalled();
  });

  it('cannot be checked on a line with no SKU yet', () => {
    render({ sku: '   ' });

    expect(fixture.componentInstance.canCheck()).toBe(false);
    fixture.componentInstance.check();
    expect(availabilityService.getAvailabilityBySku).not.toHaveBeenCalled();
  });

  it('discards the result when the line changes — a quantity for another SKU is wrong data', () => {
    render();
    fixture.componentInstance.check();
    fixture.detectChanges();
    expect(fixture.componentInstance.showsResult()).toBe(true);

    fixture.componentRef.setInput('sku', 'OTHER-SKU');
    fixture.detectChanges();

    expect(fixture.componentInstance.showsResult()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.avail-row')).toBeNull();
  });

  it('discards the result when only the ordered quantity changes', () => {
    render();
    fixture.componentInstance.check();
    fixture.detectChanges();

    fixture.componentRef.setInput('quantity', 40);
    fixture.detectChanges();

    expect(fixture.componentInstance.showsResult()).toBe(false);
  });

  it('renders a non-OK vendor answer as a status with no invented numbers', () => {
    availabilityService.getAvailabilityBySku.mockReturnValue(
      of({
        ...result,
        vendors: [
          {
            vendorProfileId: 'vp-1',
            vendorDisplayName: 'Michelin EU',
            status: 'SUPPLIER_UNAVAILABLE' as const,
            availableQuantity: null,
            unitOfMeasure: null,
            asOf: null,
          },
        ],
      }),
    );
    const el = render();
    fixture.componentInstance.check();
    fixture.detectChanges();

    expect(el.querySelector('.avail-row__value--quantity')).toBeNull();
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.AVAILABILITY.STATUS.SUPPLIER_UNAVAILABLE',
    );
  });

  it('sets state then errorKey on failure and keeps a retry available (ADR-0031)', () => {
    availabilityService.getAvailabilityBySku.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 504, statusText: 'Gateway Timeout' })),
    );
    const el = render();
    fixture.componentInstance.check();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders a 403 as a restricted state', () => {
    availabilityService.getAvailabilityBySku.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render();
    fixture.componentInstance.check();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
  });

  it('shows a loading state immediately and blocks a second concurrent check', () => {
    const pending = new Subject<SupplierAvailability>();
    availabilityService.getAvailabilityBySku.mockReturnValue(pending.asObservable());
    render();
    fixture.componentInstance.check();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('loading');
    expect(fixture.componentInstance.canCheck()).toBe(false);

    pending.next(result);
    pending.complete();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('omits the quantity hint when the line has none', () => {
    render({ quantity: null });
    fixture.componentInstance.check();

    expect(availabilityService.getAvailabilityBySku).toHaveBeenCalledWith(SKU, LOCATION_A, undefined);
  });
});
