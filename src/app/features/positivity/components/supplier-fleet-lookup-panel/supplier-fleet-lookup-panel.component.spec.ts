/**
 * SupplierFleetLookupPanelComponent tests (#194, #201).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierFleetLookupPanelComponent } from './supplier-fleet-lookup-panel.component';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import { SupplierFleetVehicleLookup } from '../../models/supplier-fleet.models';

const SUPPLIER_REF = 'michelin-fleet';
const VIN = 'VF1RFA00567123456';

const found: SupplierFleetVehicleLookup = {
  outcome: 'FOUND',
  supplierRef: SUPPLIER_REF,
  vehicleIdentifier: VIN,
  vehicle: {
    vin: VIN,
    plate: 'AB-123-CD',
    brand: 'Renault',
    model: 'Master 2.3 dCi',
    modelYear: 2024,
    fleetNumber: '4471',
    vendorVehicleId: 'MFS-V-9981',
    odometer: '81234',
    identifiable: true,
  },
};

const notFound: SupplierFleetVehicleLookup = {
  outcome: 'NOT_FOUND',
  supplierRef: SUPPLIER_REF,
  vehicleIdentifier: 'UNKNOWN-PLATE-9',
  vehicle: null,
};

describe('SupplierFleetLookupPanelComponent', () => {
  let fixture: ComponentFixture<SupplierFleetLookupPanelComponent>;
  let component: SupplierFleetLookupPanelComponent;
  let service: { lookupVehicle: ReturnType<typeof vi.fn>; getWorkorderAuthorization: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      lookupVehicle: vi.fn().mockReturnValue(of(found)),
      getWorkorderAuthorization: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [SupplierFleetLookupPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierFleetService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierFleetLookupPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(supplierRef: string | null, vehicleIdentifier: string | null = VIN): HTMLElement {
    fixture.componentRef.setInput('supplierRef', supplierRef);
    fixture.componentRef.setInput('vehicleIdentifier', vehicleIdentifier);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('makes no SDK call and stays idle when the supplier reference is empty', () => {
    const el = render('');

    expect(service.lookupVehicle).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
    expect(el.textContent).toContain('POSITIVITY.FLEET.LOOKUP.NO_SUPPLIER_REF');
    expect(el.querySelector('form')).toBeNull();
  });

  it('makes no SDK call when the supplier reference is null', () => {
    render(null);

    expect(service.lookupVehicle).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('makes no SDK call from a manual submit without a supplier reference', () => {
    render(null, null);
    component.lookupForm.controls.vehicleIdentifier.setValue('ANY-PLATE');
    component.submitLookup();
    fixture.detectChanges();

    expect(service.lookupVehicle).not.toHaveBeenCalled();
  });

  it('asks the named fleet manager about the host-supplied identifier, supplierRef first', () => {
    render(SUPPLIER_REF);

    expect(service.lookupVehicle).toHaveBeenCalledTimes(1);
    expect(service.lookupVehicle).toHaveBeenCalledWith(SUPPLIER_REF, VIN);
    expect(component.state()).toBe('found');
  });

  it('renders the vehicle as the fleet manager describes it', () => {
    const el = render(SUPPLIER_REF);

    expect(el.textContent).toContain('Renault');
    expect(el.textContent).toContain('Master 2.3 dCi');
    expect(el.textContent).toContain('2024');
    expect(el.textContent).toContain('AB-123-CD');
    expect(el.textContent).toContain('4471');
    expect(el.textContent).toContain('MFS-V-9981');
    expect(el.textContent).toContain('POSITIVITY.FLEET.LOOKUP.OUTCOME.FOUND');
  });

  it('renders NOT_FOUND as an answer: status, no alert, no errorKey', () => {
    service.lookupVehicle.mockReturnValue(of(notFound));
    const el = render(SUPPLIER_REF, 'UNKNOWN-PLATE-9');

    expect(component.state()).toBe('not-found');
    expect(component.errorKey()).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('.fleet-lookup__not-found')?.getAttribute('role')).toBe('status');
  });

  it('renders a 404 as NOT_FOUND too', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    render(SUPPLIER_REF);

    expect(component.state()).toBe('not-found');
    expect(component.errorKey()).toBeNull();
  });

  it('renders a vendor outage as unreachable with a retry', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    const el = render(SUPPLIER_REF);

    expect(component.state()).toBe('unreachable');
    expect(el.querySelector('.pos-banner--warning button')).not.toBeNull();
  });

  it('renders a 422 (vendor did not answer) as unreachable with a retry and the LOAD key', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable Entity' })),
    );
    const el = render(SUPPLIER_REF);

    expect(component.state()).toBe('unreachable');
    expect(component.errorKey()).toBe('POSITIVITY.FLEET.LOOKUP.ERROR.LOAD');
    expect(el.querySelector('.pos-banner--warning button')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a 403 as a restricted state', () => {
    service.lookupVehicle.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render(SUPPLIER_REF);

    expect(component.state()).toBe('forbidden');
  });

  it('associates the identifier input with its hint via aria-describedby', () => {
    const el = render(SUPPLIER_REF);
    const input = el.querySelector('input[aria-describedby="fleet-lookup-identifier-hint"]');
    const hint = el.querySelector('#fleet-lookup-identifier-hint');

    expect(input).not.toBeNull();
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('POSITIVITY.FLEET.LOOKUP.IDENTIFIER_HINT');
  });

  it('re-queries the same fleet manager for an operator-entered identifier', () => {
    render(SUPPLIER_REF);
    component.lookupForm.controls.vehicleIdentifier.setValue('AB-123-CD');
    component.submitLookup();
    fixture.detectChanges();

    expect(service.lookupVehicle).toHaveBeenLastCalledWith(SUPPLIER_REF, 'AB-123-CD');
  });

  it('exposes no control that requests, grants or advances an authorization', () => {
    const el = render(SUPPLIER_REF);
    const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/authorize|authorise|grant|deny|override|escalate|request.?auth/);
  });
});
