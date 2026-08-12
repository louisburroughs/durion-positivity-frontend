/**
 * One vendor availability row (issue #190).
 *
 * The rule under test throughout: when a vendor did not answer `OK`, the row
 * shows the *status*, and no number of any kind appears where a quantity would.
 *
 * ADR-0032: fixtures typed as their exact domain interfaces.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { SupplierAvailabilityRowComponent } from './supplier-availability-row.component';
import {
  SupplierAvailabilityStatus,
  SupplierAvailabilityVendorResult,
} from '../../models/supplier-availability.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const FETCHED_AT = '2026-08-12T11:59:00Z';

const okResult: SupplierAvailabilityVendorResult = {
  vendorProfileId: 'vp-1',
  vendorDisplayName: 'Michelin EU',
  warehouseName: 'Lyon DC',
  status: 'OK',
  availableQuantity: 24,
  unitOfMeasure: 'EA',
  deliveryEstimate: { earliestDeliveryDate: '2026-08-14', leadTimeDays: 2, cutoffAt: null },
  asOf: '2026-08-12T11:45:00Z',
};

function degraded(status: SupplierAvailabilityStatus): SupplierAvailabilityVendorResult {
  return {
    vendorProfileId: 'vp-2',
    vendorDisplayName: 'Continental DE',
    status,
    availableQuantity: null,
    unitOfMeasure: null,
    asOf: null,
  };
}

describe('SupplierAvailabilityRowComponent', () => {
  let fixture: ComponentFixture<SupplierAvailabilityRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierAvailabilityRowComponent, TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierAvailabilityRowComponent);
  });

  function render(result: SupplierAvailabilityVendorResult, threshold = 60): HTMLElement {
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('fetchedAt', FETCHED_AT);
    fixture.componentRef.setInput('thresholdMinutes', threshold);
    fixture.componentRef.setInput('nowMs', NOW);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders quantity, unit, delivery estimate and lead time for an OK result', () => {
    const el = render(okResult);

    expect(el.querySelector('.avail-row__value--quantity')?.textContent).toContain('24');
    expect(el.querySelector('.avail-row__uom')?.textContent?.trim()).toBe('EA');
    expect(fixture.componentInstance.showsQuantity()).toBe(true);
    expect(fixture.componentInstance.leadTimeDays()).toBe(2);
    expect(el.querySelectorAll('.avail-row__fact').length).toBeGreaterThanOrEqual(3);
  });

  it('names the vendor and its warehouse — results are labelled, never merged', () => {
    const el = render(okResult);

    expect(el.querySelector('.avail-row__vendor')?.textContent?.trim()).toBe('Michelin EU');
    expect(el.querySelector('.avail-row__warehouse')?.textContent).toContain('Lyon DC');
  });

  it('formats a vendor date-only delivery date without shifting a day (ADR-0038)', () => {
    render(okResult);

    expect(fixture.componentInstance.earliestDeliveryDisplay()).toBe('2026-08-14T00:00:00');
  });

  it.each<[SupplierAvailabilityStatus, string]>([
    ['SUPPLIER_UNAVAILABLE', 'warning'],
    ['NOT_LISTED', 'info'],
    ['CAPABILITY_NOT_CONFIGURED', 'neutral'],
  ])('renders %s with its own status text and no numbers at all', (status, tone) => {
    const el = render(degraded(status));

    expect(fixture.componentInstance.showsQuantity()).toBe(false);
    expect(fixture.componentInstance.tone()).toBe(tone);
    expect(fixture.componentInstance.statusLabelKey()).toBe(
      `POSITIVITY.AVAILABILITY.STATUS.${status}`,
    );
    expect(el.querySelector('.avail-row__value--quantity')).toBeNull();
    expect(el.querySelector('.avail-row__facts')).toBeNull();
    expect(el.querySelector('.avail-row__status-detail')?.textContent?.trim()).toBe(
      `POSITIVITY.AVAILABILITY.STATUS_DETAIL.${status}`,
    );
  });

  it.each<SupplierAvailabilityStatus>([
    'SUPPLIER_UNAVAILABLE',
    'NOT_LISTED',
    'CAPABILITY_NOT_CONFIGURED',
  ])('never prints a zero or a dash in place of a quantity for %s', status => {
    const el = render(degraded(status));
    const body = el.textContent ?? '';

    expect(body).not.toMatch(/\b0\b/);
    expect(body).not.toContain('—');
    expect(fixture.componentInstance.quantity()).toBeNull();
    expect(fixture.componentInstance.unitOfMeasure()).toBeNull();
  });

  it('treats an OK answer with a null quantity as unrenderable, not as zero', () => {
    const contradictory: SupplierAvailabilityVendorResult = {
      ...okResult,
      status: 'OK',
      availableQuantity: null,
      unitOfMeasure: null,
      deliveryEstimate: null,
    };

    const el = render(contradictory);

    expect(fixture.componentInstance.showsQuantity()).toBe(false);
    expect(el.querySelector('.avail-row__value--quantity')).toBeNull();
  });

  it('renders CAPABILITY_NOT_CONFIGURED as a visible "not enabled" state, not a hidden row', () => {
    const el = render(degraded('CAPABILITY_NOT_CONFIGURED'));

    expect(el.querySelector('.avail-row')).not.toBeNull();
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.AVAILABILITY.STATUS.CAPABILITY_NOT_CONFIGURED',
    );
  });

  it('carries status as text plus a glyph, not colour alone (ADR-0029 / ADR-0039)', () => {
    const el = render(degraded('SUPPLIER_UNAVAILABLE'));

    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.AVAILABILITY.STATUS.SUPPLIER_UNAVAILABLE',
    );
    expect(el.querySelector('.supplier-chip__icon')).not.toBeNull();
  });

  it('shows a vendor failure code only as secondary detail beside the translated status', () => {
    const el = render({ ...degraded('SUPPLIER_UNAVAILABLE'), errorCode: 'VENDOR_TIMEOUT' });

    expect(el.querySelector('.avail-row__error-code code')?.textContent?.trim()).toBe(
      'VENDOR_TIMEOUT',
    );
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).not.toBe(
      'VENDOR_TIMEOUT',
    );
  });

  it('suppresses a vendor failure code on statuses where it has no meaning', () => {
    render({ ...degraded('NOT_LISTED'), errorCode: 'VENDOR_TIMEOUT' });

    expect(fixture.componentInstance.errorCode()).toBeNull();
  });

  it('shows the vendor as-of time and the check time as two separately labelled facts', () => {
    const el = render(okResult);
    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n => n.textContent?.trim());

    expect(terms).toEqual([
      'POSITIVITY.AVAILABILITY.AS_OF',
      'POSITIVITY.AVAILABILITY.CHECKED_AT',
    ]);
  });

  it('marks the row stale when the vendor as-of value is past the backend threshold', () => {
    const el = render({ ...okResult, asOf: '2026-08-12T09:00:00Z' }, 60);

    expect(el.querySelector('.staleness__note')).not.toBeNull();
  });

  it('does not mark a fresh vendor value stale', () => {
    const el = render(okResult, 60);

    expect(el.querySelector('.staleness__note')).toBeNull();
  });

  it('reports unknown freshness — not fresh — when the vendor sent no as-of value', () => {
    const el = render(degraded('SUPPLIER_UNAVAILABLE'), 60);

    expect(el.querySelector('.staleness__value')?.textContent?.trim()).toBe(
      'POSITIVITY.FRESHNESS.NO_VENDOR_TIMESTAMP',
    );
  });
});
