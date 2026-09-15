import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { LocationDefaultsPageComponent } from './location-defaults-page.component';
import { LocationService } from '../../services/location.service';

const STAGING_ID = '01960011-0000-7000-8000-0000000000a1';
const QUARANTINE_ID = '01960011-0000-7000-8000-0000000000a2';

const DEFAULTS = {
  defaultStagingLocationId: STAGING_ID,
  defaultQuarantineLocationId: QUARANTINE_ID,
  version: 1,
};

// `id` is the field StorageLocationResponse actually exposes; the earlier
// `storageLocationId` here matched no real payload field.
const STORAGE_LOCATIONS = [
  { id: STAGING_ID, name: 'Staging Area', code: 'STG', storageType: 'STAGING', status: 'ACTIVE' },
  { id: QUARANTINE_ID, name: 'Quarantine Bay', code: 'QRN', storageType: 'QUARANTINE', status: 'ACTIVE' },
];

const stubLocationService = {
  getLocationById: vi.fn(),
  getLocationDefaults: vi.fn(),
  listStorageLocations: vi.fn(),
  configureLocationDefaults: vi.fn(),
};

describe('LocationDefaultsPageComponent [CAP-214 #102]', () => {
  let fixture: ComponentFixture<LocationDefaultsPageComponent>;
  let component: LocationDefaultsPageComponent;

  type SetupOptions = {
    defaultsResult?: Observable<unknown>;
    storageLocationsResult?: Observable<unknown>;
  };

  const setup = async (options: SetupOptions = {}) => {
    vi.clearAllMocks();
    stubLocationService.getLocationById.mockReturnValue(
      of({ id: 'LOC-001', name: 'Charlotte Hub', code: 'CLT-01' }),
    );
    stubLocationService.getLocationDefaults.mockReturnValue(
      options.defaultsResult ?? of(DEFAULTS),
    );
    stubLocationService.listStorageLocations.mockReturnValue(
      options.storageLocationsResult ?? of(STORAGE_LOCATIONS),
    );
    stubLocationService.configureLocationDefaults.mockReturnValue(of({ ...DEFAULTS, version: 2 }));

    await TestBed.configureTestingModule({
      imports: [LocationDefaultsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubLocationService },
        { provide: ActivatedRoute, useValue: { params: of({ locationId: 'LOC-001' }) } },
      ],
    }).compileComponents();

    TestBed.inject(TranslateService).use('en-US');

    fixture = TestBed.createComponent(LocationDefaultsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('resolves the location from the route param and shows a human-readable label', async () => {
    await setup();
    expect(component.locationId()).toBe('LOC-001');
    expect(stubLocationService.getLocationById).toHaveBeenCalledWith('LOC-001');
    const el = fixture.debugElement.query(By.css('[data-testid="location-label"]'));
    expect(el.nativeElement.textContent.trim()).toBe('Charlotte Hub · CLT-01');
    // The raw location UUID must not be published on screen (UI rule).
    expect(fixture.nativeElement.textContent).not.toContain('LOC-001');
  });

  it('should load defaults and storage locations on init', async () => {
    await setup();
    expect(stubLocationService.getLocationDefaults).toHaveBeenCalledWith('LOC-001');
    expect(stubLocationService.listStorageLocations).toHaveBeenCalledWith(
      'LOC-001',
      { status: 'ACTIVE', pageIndex: 0, pageSize: 100 },
    );
  });

  it('displays the configured defaults by name, never as raw ids', async () => {
    await setup();
    const stagingEl = fixture.debugElement.query(By.css('[data-testid="current-staging"]'));
    expect(stagingEl.nativeElement.textContent.trim()).toBe('Staging Area');
    const quarantineEl = fixture.debugElement.query(By.css('[data-testid="current-quarantine"]'));
    expect(quarantineEl.nativeElement.textContent.trim()).toBe('Quarantine Bay');
    expect(fixture.nativeElement.textContent).not.toContain(STAGING_ID);
    expect(fixture.nativeElement.textContent).not.toContain(QUARANTINE_ID);
  });

  // Mirrors the site audit's own rule so a regression fails here first.
  it('publishes no UUID anywhere in visible text', async () => {
    await setup();
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}/i;
    expect(fixture.nativeElement.textContent).not.toMatch(uuid);
  });

  it('shows the unknown-location string when a default resolves to nothing', async () => {
    // A dangling reference must not fall back to printing the id.
    await setup({ storageLocationsResult: of([]) });
    const stagingEl = fixture.debugElement.query(By.css('[data-testid="current-staging"]'));
    expect(stagingEl.nativeElement.textContent.trim()).toBe('LOCATION.DEFAULTS.UNKNOWN_LOCATION');
    expect(fixture.nativeElement.textContent).not.toContain(STAGING_ID);
  });

  it('shows the not-configured string when no default is set', async () => {
    await setup({ defaultsResult: of({ version: 1 }) });
    const stagingEl = fixture.debugElement.query(By.css('[data-testid="current-staging"]'));
    expect(stagingEl.nativeElement.textContent.trim()).toBe('LOCATION.DEFAULTS.NOT_CONFIGURED');
  });

  it('keys the storage-location options on the id the API returns', async () => {
    await setup();
    const options: HTMLOptionElement[] = fixture.debugElement
      .queryAll(By.css('[data-testid="default-staging-select"] option'))
      .map(el => el.nativeElement);
    // Option values stay UUIDs (wiring, not visible text); labels stay names.
    expect(options.map(o => o.value)).toEqual(['', STAGING_ID, QUARANTINE_ID]);
    expect(options.map(o => o.textContent?.trim())).toEqual([
      'LOCATION.DEFAULTS.SELECT_PLACEHOLDER',
      'Staging Area',
      'Quarantine Bay',
    ]);
  });

  it('should show loading indicator while loading', async () => {
    await setup();
    component.loading.set(true);
    fixture.detectChanges();
    const indicator = fixture.debugElement.query(By.css('[data-testid="loading-indicator"]'));
    expect(indicator).toBeTruthy();
  });

  it('should show load error on service load failure', async () => {
    // loadStorageLocations() always resets loadError before subscribing, so the final
    // visible error comes from whichever service fails last. Fail both services so
    // loadError is non-null after both subscriptions resolve.
    await setup({
      defaultsResult: throwError(
        () => new HttpErrorResponse({ status: 500, error: { message: 'Load failed' } }),
      ),
      storageLocationsResult: throwError(
        () => new HttpErrorResponse({ status: 500, error: { message: 'Load failed' } }),
      ),
    });
    const errorEl = fixture.debugElement.query(By.css('[data-testid="load-error"]'));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain('Load failed');
  });

  it('should disable save button when form fields are empty', async () => {
    await setup();
    component.defaultsForm.reset({ defaultStagingLocationId: '', defaultQuarantineLocationId: '' });
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('[data-testid="save-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  it('should block save when same location selected for staging and quarantine', async () => {
    await setup();
    component.defaultsForm.patchValue({
      defaultStagingLocationId: STAGING_ID,
      defaultQuarantineLocationId: STAGING_ID,
    });
    fixture.detectChanges();
    expect(component.isSameLocation()).toBe(true);
    expect(component.canSave()).toBe(false);
    const btn = fixture.debugElement.query(By.css('[data-testid="save-btn"]'));
    expect(btn.nativeElement.disabled).toBe(true);
  });

  it('should call configureLocationDefaults on save and show success', async () => {
    await setup();
    component.saveDefaults();
    fixture.detectChanges();
    expect(stubLocationService.configureLocationDefaults).toHaveBeenCalledWith(
      'LOC-001',
      expect.objectContaining({
        defaultStagingLocationId: STAGING_ID,
        defaultQuarantineLocationId: QUARANTINE_ID,
      }),
      expect.any(String),
    );
    expect(component.saveSuccess()).toBe(true);
  });
});
