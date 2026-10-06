import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierProfileListPageComponent } from './supplier-profile-list-page.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { VendorProfileSummary } from '../../models/supplier-profile.models';
import {
  ACME,
  AuthStub,
  VendorServiceStub,
  vendorPickerProviders,
  vendorServiceStub,
} from '../../components/supplier-vendor-picker/supplier-vendor-picker.spec-helper';

const adminProfile: VendorProfileSummary = {
  vendorProfileId: 'profile-1',
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
  vendorId: ACME.vendorId,
  vendorNumber: 'V-000001',
  vendorDisplayName: 'Acme Tire',
};

const yamlProfile: VendorProfileSummary = {
  vendorProfileId: 'profile-2',
  supplierRef: 'goodyear-sandbox',
  displayName: 'Goodyear Sandbox',
  enabled: false,
  sandbox: true,
  sourceOfTruth: 'YAML',
  vendorId: 'ffc9a4c2-0000-7000-8000-00000000v003',
  vendorNumber: '',
  vendorDisplayName: '',
};

describe('SupplierProfileListPageComponent', () => {
  let fixture: ComponentFixture<SupplierProfileListPageComponent>;
  let component: SupplierProfileListPageComponent;
  let service: {
    listProfiles: ReturnType<typeof vi.fn>;
    createProfile: ReturnType<typeof vi.fn>;
  };
  let vendors: VendorServiceStub;

  async function setup(
    profiles: VendorProfileSummary[] | HttpErrorResponse = [adminProfile, yamlProfile],
    auth: AuthStub = new AuthStub(),
  ): Promise<void> {
    service = {
      listProfiles: vi
        .fn()
        .mockReturnValue(
          profiles instanceof HttpErrorResponse ? throwError(() => profiles) : of(profiles),
        ),
      createProfile: vi.fn().mockReturnValue(of(adminProfile)),
    };

    vendors = vendorServiceStub();
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierProfileListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: SupplierProfileService, useValue: service },
        ...vendorPickerProviders(vendors, auth),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupplierProfileListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the profile list on creation', async () => {
    await setup();

    expect(service.listProfiles).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('ready');
    expect(component.profiles()).toHaveLength(2);
  });

  it('reports empty when no profiles are configured', async () => {
    await setup([]);

    expect(component.state()).toBe('empty');
  });

  it('sets both state and errorKey when the list fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without profile data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).querySelector('.pos-table')).toBeNull();
  });

  it('shows state and environment as text chips, not colour alone', async () => {
    await setup();
    const chips = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.supplier-chip__label'),
    ).map(n => n.textContent?.trim());

    expect(chips).toContain('POSITIVITY.PROFILES.STATE.ENABLED');
    expect(chips).toContain('POSITIVITY.PROFILES.STATE.DISABLED');
    expect(chips).toContain('POSITIVITY.PROFILES.ENVIRONMENT.SANDBOX');
    expect(chips).toContain('POSITIVITY.PROFILES.ENVIRONMENT.PRODUCTION');
  });

  it('names the configuration source so YAML-managed profiles are recognisable', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.PROFILES.SOURCE.YAML');
    expect(text).toContain('POSITIVITY.PROFILES.SOURCE.ADMIN');
  });

  it('links to each profile with routerLink, not a bare href (ADR-0037)', async () => {
    await setup();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.profiles-page__link'),
    );

    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/app/positivity/profiles/profile-1');
  });

  it('links to the exchange audit viewer', async () => {
    await setup();
    const audit = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
    ).find(a => a.getAttribute('href') === '/app/positivity/exchanges');

    expect(audit).toBeTruthy();
  });

  it('creates a profile without server-generated fields in the payload', async () => {
    await setup();
    component.openCreate();
    component.createForm.patchValue({
      vendorId: ACME.vendorId,
      supplierRef: ' michelin-eu ',
      displayName: ' Michelin EU ',
      sandbox: true,
      enabled: false,
    });
    component.create();

    expect(service.createProfile).toHaveBeenCalledWith({
      vendorId: ACME.vendorId,
      supplierRef: 'michelin-eu',
      displayName: 'Michelin EU',
      sandbox: true,
      enabled: false,
    });
    const payload = service.createProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('vendorProfileId');
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('does not submit an incomplete create form', async () => {
    await setup();
    component.openCreate();
    component.create();

    expect(service.createProfile).not.toHaveBeenCalled();
  });

  it('maps a create 400 to the offending field with both state and errorKey set', async () => {
    await setup();
    service.createProfile.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'x',
            error: { fieldErrors: [{ field: 'supplierRef', code: 'AUTH_REF_DUPLICATE' }] },
          }),
      ),
    );
    component.openCreate();
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'dup', displayName: 'Dup' });
    component.create();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('supplierRef')).toBe('POSITIVITY.ERROR.FIELD.AUTH_REF_DUPLICATE');
  });

  it('reloads the list after a successful create', async () => {
    await setup();
    component.openCreate();
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'new', displayName: 'New vendor' });
    component.create();

    expect(service.listProfiles).toHaveBeenCalledTimes(2);
    expect(component.createOpen()).toBe(false);
  });

  it('labels every create-form control (ADR-0029)', async () => {
    await setup();
    component.openCreate();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    for (const control of Array.from(host.querySelectorAll('form input, form select'))) {
      const id = control.getAttribute('id');
      expect(id).toBeTruthy();
      expect(host.querySelector(`label[for="${id}"]`), `no label for #${id}`).not.toBeNull();
    }
  });

  // ── Vendor (#484) ──────────────────────────────────────────────────────────

  it('blocks a create without a vendor client-side and says why (AC1)', async () => {
    await setup();
    component.openCreate();
    fixture.detectChanges();
    component.createForm.patchValue({ supplierRef: 'new', displayName: 'New vendor' });
    component.create();
    fixture.detectChanges();

    expect(service.createProfile).not.toHaveBeenCalled();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="vendor-required"]')?.textContent).toContain(
      'POSITIVITY.ERROR.FIELD.VENDOR_REQUIRED',
    );
  });

  it('creates with the vendor chosen in the picker (AC1)', async () => {
    await setup();
    component.openCreate();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector('[data-testid="vendor-select"]') as HTMLSelectElement;
    select.value = ACME.vendorId;
    select.dispatchEvent(new Event('change'));
    component.createForm.patchValue({ supplierRef: 'new', displayName: 'New vendor' });
    component.create();

    expect(service.createProfile).toHaveBeenCalledWith(expect.objectContaining({ vendorId: ACME.vendorId }));
    expect(vendors.listActiveVendors).toHaveBeenCalled();
  });

  it.each([
    ['SUPPLIER_VENDOR_NOT_FOUND', 'POSITIVITY.ERROR.FIELD.VENDOR_NOT_FOUND'],
    ['SUPPLIER_VENDOR_INACTIVE', 'POSITIVITY.ERROR.FIELD.VENDOR_INACTIVE'],
  ])('renders a 422 %s on the vendor picker (AC3)', async (code, key) => {
    await setup();
    service.createProfile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, statusText: 'x', error: { code, message: 'nope' } })),
    );
    component.openCreate();
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'new', displayName: 'New' });
    component.create();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="vendor-error"]')?.textContent).toContain(key);
    expect(host.querySelector('#profile-vendor')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows each profile’s vendor number and name, and says when the view omits it', async () => {
    await setup();
    const cells = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="profile-vendor"]')).map(
      cell => cell.textContent?.trim(),
    );

    expect(cells).toEqual(['POSITIVITY.PROFILES.VENDOR.OPTION', 'POSITIVITY.PROFILES.VENDOR.NOT_REPORTED']);
  });

  // ── supplier:profile:write gate (ADR-0040 §6a) ─────────────────────────────

  const readOnlySession = (): AuthStub => {
    const auth = new AuthStub();
    auth.permissions.set(new Set(['supplier:profile:read', 'supplier:vendor:read']));
    return auth;
  };
  const createButton = (): HTMLButtonElement =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="profile-create"]') as HTMLButtonElement;

  it('write granted: the create control is enabled and create() sends', async () => {
    await setup();

    expect(createButton().disabled).toBe(false);
    component.openCreate();
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'new', displayName: 'New' });
    component.create();
    expect(service.createProfile).toHaveBeenCalled();
  });

  it('read-only session: the create control is disabled with the reason, and the methods refuse', async () => {
    await setup(undefined, readOnlySession());
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(createButton().disabled).toBe(true);
    expect(createButton().getAttribute('aria-describedby')).toBe('profiles-write-reason');
    expect(host.querySelector('#profiles-write-reason')?.textContent).toContain('POSITIVITY.PROFILES.WRITE_FORBIDDEN');

    component.openCreate();
    expect(component.createOpen()).toBe(false);
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'new', displayName: 'New' });
    component.create();
    expect(service.createProfile).not.toHaveBeenCalled();
  });

  it('unknown perm_bits: the create control stays enabled (legacy-token fallback)', async () => {
    const legacy = new AuthStub();
    legacy.permissions.set(null);
    await setup(undefined, legacy);

    expect(createButton().disabled).toBe(false);
    component.openCreate();
    component.createForm.patchValue({ vendorId: ACME.vendorId, supplierRef: 'new', displayName: 'New' });
    component.create();
    expect(service.createProfile).toHaveBeenCalled();
  });
});
