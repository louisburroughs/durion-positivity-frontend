import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, Validators } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { SupplierCurrentVendor, SupplierVendorPickerComponent } from './supplier-vendor-picker.component';
import {
  ACME,
  AuthStub,
  BOLT,
  RETIRED,
  VendorServiceStub,
  roster,
  vendorPickerProviders,
  vendorServiceStub,
} from './supplier-vendor-picker.spec-helper';
import { SupplierVendorRoster } from '../../models/supplier-profile.models';

@Component({
  standalone: true,
  imports: [SupplierVendorPickerComponent],
  template: `
    <app-supplier-vendor-picker
      inputId="vendor"
      [control]="control"
      [currentVendor]="current()"
      [errorKey]="errorKey()"
      [errorDetail]="errorDetail()"
    />
  `,
})
class HostComponent {
  readonly control = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly current = signal<SupplierCurrentVendor | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly errorDetail = signal<string | null>(null);
}

const asCurrent = (vendor: typeof ACME): SupplierCurrentVendor => ({
  vendorId: vendor.vendorId,
  vendorNumber: vendor.vendorNumber,
  displayName: vendor.displayName,
});

describe('SupplierVendorPickerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let service: VendorServiceStub;
  let auth: AuthStub;

  function setup(options: {
    service?: VendorServiceStub;
    auth?: AuthStub;
    current?: SupplierCurrentVendor | null;
  } = {}): void {
    service = options.service ?? vendorServiceStub();
    auth = options.auth ?? new AuthStub();
    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: vendorPickerProviders(service, auth),
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    if (options.current) {
      host.current.set(options.current);
      host.control.setValue(options.current.vendorId);
    }
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const query = (testId: string): HTMLElement | null => el().querySelector(`[data-testid="${testId}"]`);
  const select = (): HTMLSelectElement => query('vendor-select') as HTMLSelectElement;
  const optionValues = (): string[] => Array.from(select().options).map(option => option.value);
  const optionTexts = (): string[] => Array.from(select().options).map(option => option.textContent?.trim() ?? '');

  afterEach(() => TestBed.resetTestingModule());

  it('create: lists only the active roster behind a "choose" placeholder, nothing pre-selected', () => {
    setup();

    expect(service.listActiveVendors).toHaveBeenCalledTimes(1);
    expect(optionValues()).toEqual(['', ACME.vendorId, BOLT.vendorId]);
    expect(select().value).toBe('');
    expect(service.getVendor).not.toHaveBeenCalled();
  });

  it('labels the select (ADR-0029) and marks it required', () => {
    setup();

    expect(el().querySelector('label[for="vendor"]')).not.toBeNull();
    expect(select().required).toBe(true);
  });

  it('binds the chosen vendor to the form control', () => {
    setup();
    select().value = BOLT.vendorId;
    select().dispatchEvent(new Event('change'));

    expect(host.control.value).toBe(BOLT.vendorId);
  });

  it('shows "choose a vendor" once the empty control is touched', () => {
    setup();
    expect(query('vendor-required')).toBeNull();

    host.control.markAsTouched();
    fixture.detectChanges();

    expect(query('vendor-required')?.textContent).toContain('POSITIVITY.ERROR.FIELD.VENDOR_REQUIRED');
    expect(select().getAttribute('aria-invalid')).toBe('true');
    expect(select().getAttribute('aria-describedby')).toContain('vendor-error');
  });

  it('edit: pre-selects the profile’s active vendor without an extra read', () => {
    setup({ current: asCurrent(ACME) });

    expect(select().value).toBe(ACME.vendorId);
    expect(service.getVendor).not.toHaveBeenCalled();
    expect(query('vendor-inactive')).toBeNull();
  });

  it('edit: keeps an INACTIVE current vendor selectable and labels it as inactive', () => {
    setup({ current: asCurrent(RETIRED) });

    expect(service.getVendor).toHaveBeenCalledWith(RETIRED.vendorId);
    expect(optionValues()).toEqual(['', RETIRED.vendorId, ACME.vendorId, BOLT.vendorId]);
    expect(select().value).toBe(RETIRED.vendorId);
    expect(optionTexts()[1]).toBe('POSITIVITY.PROFILES.VENDOR.OPTION_INACTIVE');
    expect(query('vendor-inactive')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.CURRENT_INACTIVE');
    expect(select().getAttribute('aria-describedby')).toContain('vendor-inactive');
  });

  it('edit: an unreadable current vendor is offered without claiming a status', () => {
    const stub = vendorServiceStub();
    stub.getVendor.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    setup({ service: stub, current: asCurrent(RETIRED) });

    expect(select().value).toBe(RETIRED.vendorId);
    expect(optionTexts()[1]).toBe('POSITIVITY.PROFILES.VENDOR.OPTION');
    expect(query('vendor-inactive')).toBeNull();
  });

  it('create without supplier:vendor:read explains it instead of rendering an empty list (AC4)', () => {
    const noAccess = new AuthStub();
    noAccess.permissions.set(new Set(['supplier:profile:read']));
    setup({ auth: noAccess });

    expect(service.listActiveVendors).not.toHaveBeenCalled();
    expect(query('vendor-select')).toBeNull();
    expect(query('vendor-forbidden')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.FORBIDDEN_CREATE');
    expect(query('vendor-load-error')).toBeNull();
  });

  it('a 403 from the vendor read is the permission message, not a connectivity error', () => {
    const stub = vendorServiceStub();
    stub.listActiveVendors.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    setup({ service: stub });

    expect(query('vendor-forbidden')).not.toBeNull();
    expect(query('vendor-load-error')).toBeNull();
  });

  it('edit without vendor access shows the current vendor read-only and keeps it in the control', () => {
    const noAccess = new AuthStub();
    noAccess.permissions.set(new Set());
    setup({ auth: noAccess, current: asCurrent(ACME) });

    expect(query('vendor-current')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.OPTION');
    expect(query('vendor-forbidden')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.FORBIDDEN_EDIT');
    expect(host.control.value).toBe(ACME.vendorId);
  });

  it('reads vendors when the token carries no perm_bits (permissions unknown)', () => {
    const legacy = new AuthStub();
    legacy.permissions.set(null);
    setup({ auth: legacy });

    expect(service.listActiveVendors).toHaveBeenCalledTimes(1);
    expect(select()).not.toBeNull();
  });

  it('a failed read offers Retry, and focus lands on the select after it succeeds — never on <body>', async () => {
    const stub = vendorServiceStub();
    stub.listActiveVendors.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503 })));
    setup({ service: stub });
    document.body.appendChild(el());

    expect(query('vendor-load-error')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.LOAD_ERROR');
    query('vendor-retry')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(stub.listActiveVendors).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(select());
    el().remove();
  });

  it('a retry that fails again keeps focus on the Retry button', async () => {
    const stub = vendorServiceStub();
    stub.listActiveVendors.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    setup({ service: stub });
    document.body.appendChild(el());

    query('vendor-retry')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(query('vendor-retry'));
    el().remove();
  });

  it('says when there are no active vendors to choose', () => {
    setup({ service: vendorServiceStub(roster()) });

    expect(query('vendor-select')).toBeNull();
    expect(query('vendor-empty')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.EMPTY');
  });

  it('says when the roster was cut at the page bound', () => {
    setup({ service: vendorServiceStub({ vendors: [ACME], truncated: true }) });

    expect(query('vendor-truncated')?.textContent).toContain('POSITIVITY.PROFILES.VENDOR.TRUNCATED');
  });

  it('renders a server vendorId error on the picker with its detail', () => {
    setup();
    host.errorKey.set('POSITIVITY.ERROR.FIELD.VENDOR_INACTIVE');
    host.errorDetail.set('Vendor V-000009 is inactive');
    fixture.detectChanges();

    const error = query('vendor-error');
    expect(error?.textContent).toContain('POSITIVITY.ERROR.FIELD.VENDOR_INACTIVE');
    expect(error?.textContent).toContain('Vendor V-000009 is inactive');
    expect(query('vendor-required')).toBeNull();
    expect(select().getAttribute('aria-invalid')).toBe('true');
  });

  it('drops a roster that arrives after the signed-in identity changed (ADR-0063)', () => {
    const first = new Subject<SupplierVendorRoster>();
    const stub = vendorServiceStub();
    stub.listActiveVendors.mockReturnValueOnce(first.asObservable()).mockReturnValue(of(roster(BOLT)));
    setup({ service: stub });

    auth.claims.set({ sub: 'clerk.b' });
    auth.tenant.set('tenant-2');
    fixture.detectChanges();
    first.next(roster(ACME));
    first.complete();
    fixture.detectChanges();

    expect(stub.listActiveVendors).toHaveBeenCalledTimes(2);
    expect(optionValues()).toEqual(['', BOLT.vendorId]);
  });
});
