import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { LocationDefaultsPageComponent } from './location-defaults-page.component';
import { LocationService } from '../../services/location.service';

const DEFAULTS = {
  defaultStagingLocationId: 'SL-1',
  defaultQuarantineLocationId: 'SL-2',
  version: 1,
};

const STORAGE_LOCATIONS = [
  { storageLocationId: 'SL-1', name: 'Staging Area', code: 'STG', storageType: 'STAGING', status: 'ACTIVE' },
  { storageLocationId: 'SL-2', name: 'Quarantine Bay', code: 'QRN', storageType: 'QUARANTINE', status: 'ACTIVE' },
];

const stubLocationService = {
  getLocationDefaults: vi.fn(),
  listStorageLocations: vi.fn(),
  configureLocationDefaults: vi.fn(),
};

describe('LocationDefaultsPageComponent [CAP-214 #102]', () => {
  let fixture: ComponentFixture<LocationDefaultsPageComponent>;
  let component: LocationDefaultsPageComponent;

  type SetupOptions = {
    defaultsResult?: ReturnType<typeof of> | ReturnType<typeof throwError>;
    storageLocationsResult?: ReturnType<typeof of> | ReturnType<typeof throwError>;
  };

  const setup = async (options: SetupOptions = {}) => {
    vi.clearAllMocks();
    stubLocationService.getLocationDefaults.mockReturnValue(
      options.defaultsResult ?? of(DEFAULTS),
    );
    stubLocationService.listStorageLocations.mockReturnValue(
      options.storageLocationsResult ?? of(STORAGE_LOCATIONS),
    );
    stubLocationService.configureLocationDefaults.mockReturnValue(of({ ...DEFAULTS, version: 2 }));

    await TestBed.configureTestingModule({
      imports: [LocationDefaultsPageComponent],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubLocationService },
        { provide: ActivatedRoute, useValue: { params: of({ locationId: 'LOC-001' }) } },
      ],
    }).compileComponents();

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

  it('should display location ID from route param', async () => {
    await setup();
    expect(component.locationId()).toBe('LOC-001');
    const el = fixture.debugElement.query(By.css('[data-testid="location-id"]'));
    expect(el.nativeElement.textContent.trim()).toBe('LOC-001');
  });

  it('should load defaults and storage locations on init', async () => {
    await setup();
    expect(stubLocationService.getLocationDefaults).toHaveBeenCalledWith('LOC-001');
    expect(stubLocationService.listStorageLocations).toHaveBeenCalledWith(
      'LOC-001',
      { status: 'ACTIVE', pageIndex: 0, pageSize: 100 },
    );
  });

  it('should display current defaults after load', async () => {
    await setup();
    const stagingEl = fixture.debugElement.query(By.css('[data-testid="current-staging"]'));
    expect(stagingEl.nativeElement.textContent).toContain('SL-1');
    const quarantineEl = fixture.debugElement.query(By.css('[data-testid="current-quarantine"]'));
    expect(quarantineEl.nativeElement.textContent).toContain('SL-2');
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
      defaultStagingLocationId: 'SL-1',
      defaultQuarantineLocationId: 'SL-1',
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
        defaultStagingLocationId: 'SL-1',
        defaultQuarantineLocationId: 'SL-2',
      }),
      expect.any(String),
    );
    expect(component.saveSuccess()).toBe(true);
  });
});
