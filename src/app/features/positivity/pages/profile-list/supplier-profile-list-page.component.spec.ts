import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupplierProfileListPageComponent } from './supplier-profile-list-page.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { VendorProfileSummary } from '../../models/supplier-profile.models';

const adminProfile: VendorProfileSummary = {
  vendorProfileId: 'profile-1',
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const yamlProfile: VendorProfileSummary = {
  vendorProfileId: 'profile-2',
  supplierRef: 'goodyear-sandbox',
  displayName: 'Goodyear Sandbox',
  enabled: false,
  sandbox: true,
  sourceOfTruth: 'YAML',
};

describe('SupplierProfileListPageComponent', () => {
  let fixture: ComponentFixture<SupplierProfileListPageComponent>;
  let component: SupplierProfileListPageComponent;
  let service: {
    listProfiles: ReturnType<typeof vi.fn>;
    createProfile: ReturnType<typeof vi.fn>;
  };

  async function setup(
    profiles: VendorProfileSummary[] | HttpErrorResponse = [adminProfile, yamlProfile],
  ): Promise<void> {
    service = {
      listProfiles: vi
        .fn()
        .mockReturnValue(
          profiles instanceof HttpErrorResponse ? throwError(() => profiles) : of(profiles),
        ),
      createProfile: vi.fn().mockReturnValue(of(adminProfile)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierProfileListPageComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: SupplierProfileService, useValue: service }],
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
      supplierRef: ' michelin-eu ',
      displayName: ' Michelin EU ',
      sandbox: true,
      enabled: false,
    });
    component.create();

    expect(service.createProfile).toHaveBeenCalledWith({
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
    component.createForm.patchValue({ supplierRef: 'dup', displayName: 'Dup' });
    component.create();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    expect(component.fieldError('supplierRef')).toBe('POSITIVITY.ERROR.FIELD.AUTH_REF_DUPLICATE');
  });

  it('reloads the list after a successful create', async () => {
    await setup();
    component.openCreate();
    component.createForm.patchValue({ supplierRef: 'new', displayName: 'New vendor' });
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
});
