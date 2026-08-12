/**
 * Fleet vehicle/contract lookup panel (issue #194).
 *
 * ADR-0031: error tests assert both `state()` and `errorKey()`.
 * ADR-0032: fixtures typed as their exact domain interfaces.
 * ADR-0033: the load effect cancels in-flight work via `onCleanup`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierFleetLookupPanelComponent } from './supplier-fleet-lookup-panel.component';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import { SupplierFleetVehicleLookup } from '../../models/supplier-fleet.models';

const NOW = Date.parse('2026-08-12T12:00:00Z');
const VIN = 'VF1RFA00567123456';

const found: SupplierFleetVehicleLookup = {
  outcome: 'FOUND',
  vehicleIdentifier: VIN,
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  vehicle: {
    vehicleIdentifier: VIN,
    vin: VIN,
    plate: 'AB-123-CD',
    description: 'Renault Master 2.3 dCi — fleet unit 4471',
  },
  contracts: [
    {
      contractId: 'ct-1',
      contractNumber: 'MFS-2026-0044',
      fleetManagerName: 'Michelin Fleet Services',
      status: 'ACTIVE',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-12-31',
      policies: [
        {
          policyId: 'pol-1',
          description: 'Pneumatiques et géométrie, tous essieux',
          coverageNote: 'Hors rénovation esthétique des jantes.',
        },
      ],
    },
  ],
  notFoundReason: null,
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
};

const notFound: SupplierFleetVehicleLookup = {
  outcome: 'NOT_FOUND',
  vehicleIdentifier: VIN,
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  vehicle: null,
  contracts: [],
  notFoundReason: 'Véhicule non enregistré sous cet identifiant.',
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
};

describe('SupplierFleetLookupPanelComponent', () => {
  let fixture: ComponentFixture<SupplierFleetLookupPanelComponent>;

  const service = {
    lookupVehicle: vi.fn(),
    getWorkorderAuthorization: vi.fn(),
  };

  beforeEach(async () => {
    service.lookupVehicle.mockReturnValue(of(found));

    await TestBed.configureTestingModule({
      imports: [SupplierFleetLookupPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierFleetService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierFleetLookupPanelComponent);
  });

  afterEach(() => vi.clearAllMocks());

  function render(inputs: Record<string, unknown> = {}): HTMLElement {
    fixture.componentRef.setInput('vehicleIdentifier', VIN);
    fixture.componentRef.setInput('nowMs', NOW);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('looks the host-supplied vehicle up and renders FOUND with its contracts', () => {
    const el = render();

    expect(service.lookupVehicle).toHaveBeenCalledWith(VIN, undefined);
    expect(fixture.componentInstance.state()).toBe('found');
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.LOOKUP.OUTCOME.FOUND',
    );
    expect(el.querySelectorAll('.fleet-lookup__contract')).toHaveLength(1);
  });

  it('scopes the lookup to a vendor profile when the host supplies one', () => {
    render({ vendorProfileId: 'vp-fleet-1' });

    expect(service.lookupVehicle).toHaveBeenCalledWith(VIN, 'vp-fleet-1');
  });

  it('asks nothing until an identifier exists', () => {
    fixture.componentRef.setInput('vehicleIdentifier', null);
    fixture.detectChanges();

    expect(service.lookupVehicle).not.toHaveBeenCalled();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('renders the fleet manager policy text verbatim', () => {
    const el = render();

    const policyText = el.querySelector('.fleet-lookup__policy-text')?.textContent?.trim();
    expect(policyText).toBe('Pneumatiques et géométrie, tous essieux');
    expect(el.querySelector('.fleet-lookup__policy-note')?.textContent?.trim()).toBe(
      'Hors rénovation esthétique des jantes.',
    );
  });

  // #194 §4 — NOT_FOUND is a distinct, non-error state at estimate time.
  it('renders NOT_FOUND as a plain answer: no errorKey, no alert, no error styling', () => {
    service.lookupVehicle.mockReturnValue(of(notFound));
    const el = render();

    expect(fixture.componentInstance.state()).toBe('not-found');
    expect(fixture.componentInstance.errorKey()).toBeNull();

    const block = el.querySelector('.fleet-lookup__not-found');
    expect(block).not.toBeNull();
    expect(block?.getAttribute('role')).toBe('status');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('.pos-banner--error')).toBeNull();
    expect(el.querySelector('.fleet-lookup__not-found-title')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.LOOKUP.NOT_FOUND_TITLE',
    );
  });

  it('gives NOT_FOUND a neutral chip, never a danger tone', () => {
    service.lookupVehicle.mockReturnValue(of(notFound));
    const el = render();

    expect(fixture.componentInstance.outcomeTone()).toBe('neutral');
    expect(el.querySelector('.supplier-chip--danger')).toBeNull();
    expect(el.querySelector('.supplier-chip__label')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.LOOKUP.OUTCOME.NOT_FOUND',
    );
  });

  it('shows the fleet manager reason for NOT_FOUND verbatim beside a translated label', () => {
    service.lookupVehicle.mockReturnValue(of(notFound));
    const el = render();

    expect(el.querySelector('.fleet-lookup__vendor-text')?.textContent?.trim()).toBe(
      'Véhicule non enregistré sous cet identifiant.',
    );
    expect(el.querySelector('.fleet-lookup__term')?.textContent?.trim()).toBe(
      'POSITIVITY.FLEET.VENDOR_REASON',
    );
  });

  it('treats a 404 as the same "unknown to the fleet manager" answer', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    render();

    expect(fixture.componentInstance.state()).toBe('not-found');
    expect(fixture.componentInstance.errorKey()).toBeNull();
  });

  it('renders a vendor outage as a degraded, retryable state — not as NOT_FOUND', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('unreachable');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
    expect(el.querySelector('.fleet-lookup__not-found')).toBeNull();
    expect(el.querySelector('.pos-banner--warning button')).not.toBeNull();
  });

  it('renders a 403 as a restricted state (ADR-0031)', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    const el = render();

    expect(fixture.componentInstance.state()).toBe('forbidden');
    expect(fixture.componentInstance.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('re-queries when the operator asks about a different identifier', () => {
    render();
    fixture.componentInstance.lookupForm.controls.vehicleIdentifier.setValue('  AB-123-CD  ');
    fixture.componentInstance.submitLookup();
    fixture.detectChanges();

    expect(service.lookupVehicle).toHaveBeenLastCalledWith('AB-123-CD', undefined);
  });

  it('does nothing when the identifier field is blank', () => {
    fixture.componentRef.setInput('vehicleIdentifier', null);
    fixture.detectChanges();
    fixture.componentInstance.lookupForm.controls.vehicleIdentifier.setValue('   ');
    fixture.componentInstance.submitLookup();

    expect(service.lookupVehicle).not.toHaveBeenCalled();
  });

  // #194 §7, ruled advisory-only in v1: the panel informs, it never blocks.
  it('is advisory only — it exposes no output and no blocking affordance', () => {
    service.lookupVehicle.mockReturnValue(of(notFound));
    const el = render();

    const controlText = Array.from(el.querySelectorAll('button, a, input, select'))
      .map(n => `${n.textContent ?? ''} ${n.className} ${n.getAttribute('type') ?? ''}`)
      .join(' ')
      .toLowerCase();
    expect(controlText).not.toMatch(/block|prevent|authorize|authorise|grant|deny|override/);

    // No disabled control is produced by a NOT_FOUND answer, on this panel or
    // through any output it could hand the host.
    expect(el.querySelectorAll('[disabled]')).toHaveLength(0);
    const outputs = Object.entries(fixture.componentInstance as unknown as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'object' && value !== null && 'emit' in value);
    expect(outputs).toHaveLength(0);
  });

  it('gives the identifier input a real label (ADR-0029)', () => {
    const el = render();

    const input = el.querySelector('#fleet-lookup-identifier');
    expect(input).not.toBeNull();
    expect(el.querySelector('label[for="fleet-lookup-identifier"]')).not.toBeNull();
  });

  it('keeps the vendor as-of time and the platform fetch time as separate facts', () => {
    const el = render();

    const terms = Array.from(el.querySelectorAll('.staleness__term')).map(n =>
      n.textContent?.trim(),
    );
    expect(terms).toEqual(['POSITIVITY.FLEET.AS_OF', 'POSITIVITY.FLEET.FETCHED_AT']);
  });

  it('formats date-only contract dates without shifting them a day (ADR-0038)', () => {
    render();

    expect(fixture.componentInstance.effectiveDateFor('2026-01-01')).toBe('2026-01-01T00:00:00');
    expect(fixture.componentInstance.effectiveDateFor(null)).toBeNull();
  });
});
