/**
 * SupplierFleetAuthorizationPanelComponent tests (#194, #201).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierFleetAuthorizationPanelComponent } from './supplier-fleet-authorization-panel.component';
import { SupplierFleetService } from '../../services/supplier-fleet.service';
import { SupplierFleetAuthorization } from '../../models/supplier-fleet.models';

const SUPPLIER_REF = 'michelin-fleet';
const WORKORDER_ID = 'cc33dd44-0000-7000-8000-000000000001';

const granted: SupplierFleetAuthorization = {
  workorderId: WORKORDER_ID,
  supplierRef: SUPPLIER_REF,
  state: 'GRANTED',
  vendorAuthorizationId: 'AUTH-88421',
  contractReference: 'MFS-2026-0044',
  vendorReason: null,
  vendorReasonCode: null,
  reviewReason: null,
  authorizedAmount: 840,
  currency: 'EUR',
  requestedAt: '2026-08-12T09:00:00Z',
  decidedAt: '2026-08-12T09:04:00Z',
  completionApproval: 'NOT_REQUESTED',
};

describe('SupplierFleetAuthorizationPanelComponent', () => {
  let fixture: ComponentFixture<SupplierFleetAuthorizationPanelComponent>;
  let component: SupplierFleetAuthorizationPanelComponent;
  let service: { lookupVehicle: ReturnType<typeof vi.fn>; getWorkorderAuthorization: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    service = {
      lookupVehicle: vi.fn(),
      getWorkorderAuthorization: vi.fn().mockReturnValue(of(granted)),
    };
    await TestBed.configureTestingModule({
      imports: [SupplierFleetAuthorizationPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SupplierFleetService, useValue: service }],
    }).compileComponents();
    fixture = TestBed.createComponent(SupplierFleetAuthorizationPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  function render(supplierRef: string | null, workorderId: string | null = WORKORDER_ID): HTMLElement {
    fixture.componentRef.setInput('supplierRef', supplierRef);
    fixture.componentRef.setInput('workorderId', workorderId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('makes no SDK call and stays idle when the supplier reference is empty', () => {
    const el = render('');

    expect(service.getWorkorderAuthorization).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
    expect(el.textContent).toContain('POSITIVITY.FLEET.AUTHORIZATION.NO_SUPPLIER_REF');
  });

  it('makes no SDK call when the supplier reference is null', () => {
    render(null);

    expect(service.getWorkorderAuthorization).not.toHaveBeenCalled();
    expect(component.state()).toBe('idle');
  });

  it('makes no SDK call without a workorder id', () => {
    render(SUPPLIER_REF, null);

    expect(service.getWorkorderAuthorization).not.toHaveBeenCalled();
  });

  it('reads the authorization with supplierRef first, then the workorder id', () => {
    render(SUPPLIER_REF);

    expect(service.getWorkorderAuthorization).toHaveBeenCalledTimes(1);
    expect(service.getWorkorderAuthorization).toHaveBeenCalledWith(SUPPLIER_REF, WORKORDER_ID);
    expect(component.state()).toBe('ready');
  });

  it('renders the granted authorization with the vendor reference as an attribute', () => {
    const el = render(SUPPLIER_REF);

    expect(el.textContent).toContain('POSITIVITY.FLEET.AUTHORIZATION.STATE.GRANTED');
    expect(el.querySelector('.fleet-auth__ref')?.textContent).toBe('AUTH-88421');
    expect(el.textContent).toContain('MFS-2026-0044');
    expect(el.textContent).toContain('840');
    expect(el.textContent).toContain('EUR');
    expect(el.querySelector('.fleet-auth__completion')).toBeNull();
  });

  it('renders DENIED with the fleet manager\'s own words verbatim', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      of({ ...granted, state: 'DENIED', vendorReason: 'Vehicle no longer covered.', vendorReasonCode: 'NOT_COVERED' }),
    );
    const el = render(SUPPLIER_REF);

    expect(el.querySelector('.fleet-auth__vendor-text')?.textContent?.trim()).toBe('Vehicle no longer covered.');
    expect(el.textContent).toContain('NOT_COVERED');
    expect(el.querySelector('.fleet-auth__denied')?.getAttribute('role')).toBe('status');
  });

  it('renders PENDING with a refresh that re-reads and never re-asks', () => {
    service.getWorkorderAuthorization.mockReturnValue(of({ ...granted, state: 'PENDING', decidedAt: null }));
    const el = render(SUPPLIER_REF);
    (el.querySelector('.fleet-auth__pending button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(service.getWorkorderAuthorization).toHaveBeenCalledTimes(2);
    expect(service.getWorkorderAuthorization).toHaveBeenLastCalledWith(SUPPLIER_REF, WORKORDER_ID);
  });

  it('renders a MANUAL_REVIEW completion approval with the review reason', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      of({ ...granted, completionApproval: 'MANUAL_REVIEW', reviewReason: 'Approval endpoint rejected the payload.' }),
    );
    const el = render(SUPPLIER_REF);

    expect(el.querySelector('.fleet-auth__completion')).not.toBeNull();
    expect(el.querySelector('.fleet-auth__completion-reason')?.textContent?.trim()).toBe(
      'Approval endpoint rejected the payload.',
    );
  });

  it('treats NOT_FOUND as "not a fleet workorder": empty, no alert, no errorKey', () => {
    service.getWorkorderAuthorization.mockReturnValue(of({ ...granted, state: 'NOT_FOUND' }));
    const el = render(SUPPLIER_REF);

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain('POSITIVITY.FLEET.AUTHORIZATION.NOT_FLEET');
  });

  it('treats a 404 the same way', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' })),
    );
    render(SUPPLIER_REF);

    expect(component.state()).toBe('empty');
    expect(component.errorKey()).toBeNull();
  });

  it('renders a 422 (vendor did not answer) as unreachable with a refresh and the LOAD key', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'Unprocessable Entity' })),
    );
    const el = render(SUPPLIER_REF);

    expect(component.state()).toBe('unreachable');
    expect(component.errorKey()).toBe('POSITIVITY.FLEET.AUTHORIZATION.ERROR.LOAD');
    expect(el.querySelector('.pos-banner--warning button')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a 403 as a restricted state and a 503 as unreachable', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    render(SUPPLIER_REF);
    expect(component.state()).toBe('forbidden');

    service.getWorkorderAuthorization.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, statusText: 'Unavailable' })),
    );
    component.refresh();
    fixture.detectChanges();
    expect(component.state()).toBe('unreachable');
  });

  it('exposes no control that requests, grants, denies or advances an authorization (#194 §6)', () => {
    service.getWorkorderAuthorization.mockReturnValue(
      of({ ...granted, state: 'DENIED', vendorReason: 'Vehicle no longer covered.' }),
    );
    const el = render(SUPPLIER_REF);
    const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
      .map(n => `${n.textContent ?? ''} ${n.className}`)
      .join(' ')
      .toLowerCase();

    expect(controlText).not.toMatch(/authorize|authorise|grant|deny|decline|override|escalate|request.?auth/);
    expect(el.querySelector('form')).toBeNull();
  });
});
