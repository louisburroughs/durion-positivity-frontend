import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_TABS,
  SupplierProfileDetailPageComponent,
} from './supplier-profile-detail-page.component';
import { SupplierProfileService } from '../../services/supplier-profile.service';
import { SupplierPriceCatalogService } from '../../services/supplier-price-catalog.service';
import { VendorProfile } from '../../models/supplier-profile.models';

const PROFILE_ID = 'profile-1';

const adminProfile: VendorProfile = {
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const yamlProfile: VendorProfile = { ...adminProfile, sourceOfTruth: 'YAML' };

describe('SupplierProfileDetailPageComponent', () => {
  let fixture: ComponentFixture<SupplierProfileDetailPageComponent>;
  let component: SupplierProfileDetailPageComponent;
  let service: {
    getProfile: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
    deleteProfile: ReturnType<typeof vi.fn>;
    listAuthConfigs: ReturnType<typeof vi.fn>;
    getAccounts: ReturnType<typeof vi.fn>;
    listBindings: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };

  async function setup(profile: VendorProfile | HttpErrorResponse = adminProfile): Promise<void> {
    service = {
      getProfile: vi
        .fn()
        .mockReturnValue(
          profile instanceof HttpErrorResponse ? throwError(() => profile) : of(profile),
        ),
      updateProfile: vi.fn().mockReturnValue(of(adminProfile)),
      deleteProfile: vi.fn().mockReturnValue(of(undefined)),
      listAuthConfigs: vi.fn().mockReturnValue(of([])),
      getAccounts: vi
        .fn()
        .mockReturnValue(of({ billing: null, delivery: [], activeLocations: [] })),
      listBindings: vi.fn().mockReturnValue(of([])),
    };
    const priceCatalogService = {
      getFreshness: vi.fn().mockReturnValue(
        of({
          vendorProfileId: PROFILE_ID,
          latestEffectiveDate: null,
          lastFetchedAt: null,
          lastCompletedAt: null,
          unresolvedUnmatchedCount: 0,
          stalenessThreshold: null,
          stale: true,
          bindings: [],
        }),
      ),
      listImports: vi.fn().mockReturnValue(
        of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
      ),
      listUnmatchedLines: vi.fn().mockReturnValue(
        of({ items: [], page: 0, size: 25, totalCount: 0, totalPages: 0 }),
      ),
    };
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [SupplierProfileDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SupplierProfileService, useValue: service },
        { provide: SupplierPriceCatalogService, useValue: priceCatalogService },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: new BehaviorSubject(convertToParamMap({ vendorProfileId: PROFILE_ID })),
          },
        },
      ],
    }).compileComponents();

    router = { navigate: vi.fn().mockResolvedValue(true) };
    vi.spyOn(TestBed.inject(Router), 'navigate').mockImplementation(
      router.navigate as unknown as Router['navigate'],
    );

    fixture = TestBed.createComponent(SupplierProfileDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the profile named by the route parameter', async () => {
    await setup();

    expect(service.getProfile).toHaveBeenCalledWith(PROFILE_ID);
    expect(component.state()).toBe('ready');
    expect(component.vendorProfileId()).toBe(PROFILE_ID);
  });

  it('sets both state and errorKey when the profile fails to load', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.RETRYABLE');
  });

  it('renders a forbidden state without profile data on 403', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.FORBIDDEN');
    expect(component.profile()).toBeNull();
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  it('exposes the Auth, Accounts, Bindings, Health and PRICAT tabs in order', async () => {
    await setup();

    expect([...PROFILE_TABS]).toEqual(['auth', 'accounts', 'bindings', 'health', 'pricat']);
    const tabs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]'),
    );
    expect(tabs).toHaveLength(5);
  });

  it('starts on the Auth tab and renders only that panel', async () => {
    await setup();

    expect(component.activeTab()).toBe('auth');
    const panels = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tabpanel"]');
    expect(panels).toHaveLength(1);
    expect(panels[0].getAttribute('aria-labelledby')).toBe('supplier-tab-auth');
  });

  it('switches panels when a tab is selected', async () => {
    await setup();
    component.selectTab('bindings');
    fixture.detectChanges();

    const panel = (fixture.nativeElement as HTMLElement).querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('id')).toBe('supplier-panel-bindings');
  });

  it('wires aria-selected, aria-controls and roving tabindex on the tablist', async () => {
    await setup();
    const tabs = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[role="tab"]'),
    );

    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-controls')).toBe('supplier-panel-auth');
    expect(tabs[0].getAttribute('tabindex')).toBe('0');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('tabindex')).toBe('-1');
  });

  it('moves between tabs with the arrow keys and wraps around', async () => {
    await setup();

    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }), 'auth');
    expect(component.activeTab()).toBe('accounts');

    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), 'accounts');
    expect(component.activeTab()).toBe('auth');

    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), 'auth');
    expect(component.activeTab()).toBe('pricat');
  });

  it('jumps to the first and last tab with Home and End', async () => {
    await setup();

    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'End' }), 'auth');
    expect(component.activeTab()).toBe('pricat');

    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'Home' }), 'pricat');
    expect(component.activeTab()).toBe('auth');
  });

  it('ignores unrelated keys', async () => {
    await setup();
    component.onTabKeydown(new KeyboardEvent('keydown', { key: 'a' }), 'auth');

    expect(component.activeTab()).toBe('auth');
  });

  // ── YAML read-only ─────────────────────────────────────────────────────────

  it('shows a YAML-managed profile’s write controls disabled, with the reason', async () => {
    await setup(yamlProfile);

    expect(component.readOnly()).toBe(true);
    const host = fixture.nativeElement as HTMLElement;

    // Visible but inert: a hidden control tells the operator nothing about why
    // the system will not accept a change (ADR-0050 §6).
    const danger = host.querySelector<HTMLButtonElement>('.pos-btn--danger');
    expect(danger, 'the delete control must remain visible').not.toBeNull();
    expect(danger!.disabled).toBe(true);
    expect(danger!.getAttribute('aria-describedby')).toBe('profile-readonly-reason');

    expect(host.querySelector('#profile-readonly-reason')?.textContent).toContain(
      'POSITIVITY.COMMON.YAML_MANAGED_READONLY',
    );
  });

  it('reports a 409 on a YAML profile as the source-of-truth lock, not a generic failure', async () => {
    await setup(yamlProfile);
    component['handleMutationError'](
      new HttpErrorResponse({ status: 409, statusText: 'x' }),
      'POSITIVITY.PROFILES.ERROR.SAVE',
    );
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT_YAML');
    expect(component.conflict()).toBe(true);
    // Retrying would fail identically, so no retry is offered.
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.pos-banner--error')?.textContent,
    ).not.toContain('POSITIVITY.COMMON.RETRY');
  });

  it('surfaces the profile’s real timeout, retry and sandbox settings', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('POSITIVITY.PROFILES.FIELD.CONNECT_TIMEOUT');
    expect(text).toContain('POSITIVITY.PROFILES.FIELD.READ_TIMEOUT');
    expect(text).toContain('POSITIVITY.PROFILES.FIELD.MAX_RETRIES');
    expect(text).toContain('POSITIVITY.PROFILES.FIELD.RETRY_BACKOFF');
  });

  it('blocks profile mutations for a YAML-managed profile', async () => {
    await setup(yamlProfile);
    component.saveProfile();
    component.deleteProfile();

    expect(service.updateProfile).not.toHaveBeenCalled();
    expect(service.deleteProfile).not.toHaveBeenCalled();
  });

  // ── Profile mutations ──────────────────────────────────────────────────────

  it('updates the profile without server-generated fields in the payload', async () => {
    await setup();
    component.openEdit();
    component.editForm.patchValue({ displayName: ' Michelin EMEA ' });
    component.saveProfile();

    expect(service.updateProfile).toHaveBeenCalledWith(PROFILE_ID, {
      supplierRef: 'michelin-eu',
      displayName: 'Michelin EMEA',
      sandbox: false,
      enabled: true,
    });
    const payload = service.updateProfile.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('vendorProfileId');
    expect(payload).not.toHaveProperty('updatedAt');
  });

  it('maps a save 400 to the offending field with both state and errorKey set', async () => {
    await setup();
    service.updateProfile.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'x',
            error: {
              fieldErrors: [{ field: 'displayName', message: 'must not be blank' }],
            },
          }),
      ),
    );
    component.openEdit();
    component.saveProfile();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.VALIDATION');
    // Keyed off `field` — the contract's FieldError carries no `code`.
    expect(component.fieldError('displayName')).toBe('POSITIVITY.ERROR.FIELD.DISPLAY_NAME');
    // Backend text is kept as secondary detail, never as the label.
    expect(component.fieldDetail('displayName')).toBe('must not be blank');
  });

  it('degrades a field name it does not recognise to a generic translated message', async () => {
    await setup();
    service.updateProfile.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'x',
            error: { fieldErrors: [{ field: 'somethingNew', message: 'nope' }] },
          }),
      ),
    );
    component.openEdit();
    component.saveProfile();

    expect(component.fieldError('somethingNew')).toBe('POSITIVITY.ERROR.FIELD.INVALID');
  });

  it('returns to the profile list after a delete', async () => {
    await setup();
    component.deleteProfile();

    expect(service.deleteProfile).toHaveBeenCalledWith(PROFILE_ID);
    expect(router.navigate).toHaveBeenCalledWith(['/app', 'positivity']);
  });

  it('sets both state and errorKey when a delete fails', async () => {
    await setup();
    service.deleteProfile.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'x' })),
    );
    component.deleteProfile();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('POSITIVITY.ERROR.CONFLICT');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates back to the profile list with routerLink (ADR-0037)', async () => {
    await setup();
    const crumb = (fixture.nativeElement as HTMLElement).querySelector(
      '.profile-detail__breadcrumb a',
    );

    expect(crumb?.getAttribute('href')).toBe('/app/positivity');
  });
});
