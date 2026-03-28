import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { StorageLocationsPageComponent } from './storage-locations-page.component';
import { InventoryService } from '../../services/inventory.service';

const STORAGE_LOCATIONS = [
  { storageLocationId: 'SL-1', name: 'Staging Area', code: 'STG', storageType: 'STAGING', status: 'ACTIVE' },
  { storageLocationId: 'SL-2', name: 'Quarantine Bay', code: 'QRN', storageType: 'QUARANTINE', status: 'ACTIVE' },
];

const STORAGE_TYPES = [
  { storageType: 'STAGING', name: 'Staging' },
  { storageType: 'QUARANTINE', name: 'Quarantine' },
];

const stubInventoryService = {
  listStorageLocations: vi.fn(),
  listStorageTypes: vi.fn(),
  createStorageLocation: vi.fn(),
  deactivateStorageLocation: vi.fn(),
};

describe('StorageLocationsPageComponent [CAP-214 #103]', () => {
  let fixture: ComponentFixture<StorageLocationsPageComponent>;
  let component: StorageLocationsPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubInventoryService.listStorageLocations.mockReturnValue(of(STORAGE_LOCATIONS));
    stubInventoryService.listStorageTypes.mockReturnValue(of(STORAGE_TYPES));
    stubInventoryService.createStorageLocation.mockReturnValue(of({ storageLocationId: 'SL-NEW' }));
    stubInventoryService.deactivateStorageLocation.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [StorageLocationsPageComponent],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: stubInventoryService },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ locationId: 'LOC-001' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorageLocationsPageComponent);
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

  it('should render storage locations table with loaded data', async () => {
    await setup();
    const table = fixture.debugElement.query(By.css('[data-testid="storage-locations-table"]'));
    expect(table).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('[data-testid^="storage-location-row-"]'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain('Staging Area');
    expect(rows[1].nativeElement.textContent).toContain('Quarantine Bay');
  });

  it('should show empty state when no storage locations', async () => {
    vi.clearAllMocks();
    stubInventoryService.listStorageLocations.mockReturnValue(of([]));
    stubInventoryService.listStorageTypes.mockReturnValue(of(STORAGE_TYPES));
    stubInventoryService.createStorageLocation.mockReturnValue(of({}));
    stubInventoryService.deactivateStorageLocation.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [StorageLocationsPageComponent],
      providers: [
        provideRouter([]),
        { provide: InventoryService, useValue: stubInventoryService },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ locationId: 'LOC-001' }) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorageLocationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('[data-testid="empty-state"]'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain('No storage locations found.');
  });

  it('should open create form on button click', async () => {
    await setup();
    const btn = fixture.debugElement.query(By.css('[data-testid="open-create-btn"]'));
    btn.nativeElement.click();
    fixture.detectChanges();
    expect(component.showCreateForm()).toBe(true);
    const section = fixture.debugElement.query(By.css('[data-testid="create-form-section"]'));
    expect(section).toBeTruthy();
  });

  it('should cancel create form on cancel', async () => {
    await setup();
    component.openCreateForm();
    fixture.detectChanges();
    const cancelBtn = fixture.debugElement.query(By.css('[data-testid="cancel-create-btn"]'));
    cancelBtn.nativeElement.click();
    fixture.detectChanges();
    expect(component.showCreateForm()).toBe(false);
    const section = fixture.debugElement.query(By.css('[data-testid="create-form-section"]'));
    expect(section).toBeNull();
  });

  it('should call createStorageLocation on form submit and show success', async () => {
    await setup();
    component.openCreateForm();
    component.createForm.patchValue({ code: 'STG-1', name: 'Staging 1', storageType: 'STAGING' });
    fixture.detectChanges();
    component.createStorageLocation();
    fixture.detectChanges();
    expect(stubInventoryService.createStorageLocation).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'STG-1', name: 'Staging 1', storageType: 'STAGING' }),
      expect.any(String),
    );
    expect(component.createSuccess()).toBe(true);
    expect(component.showCreateForm()).toBe(false);
  });

  it('should show deactivate dialog on row deactivate button click', async () => {
    await setup();
    const deactivateBtn = fixture.debugElement.query(By.css('[data-testid="deactivate-btn-0"]'));
    deactivateBtn.nativeElement.click();
    fixture.detectChanges();
    expect(component.showDeactivateDialog()).toBe(true);
    const dialog = fixture.debugElement.query(By.css('[data-testid="deactivate-dialog"]'));
    expect(dialog).toBeTruthy();
  });

  it('should cancel deactivate dialog', async () => {
    await setup();
    component.openDeactivateDialog({ storageLocationId: 'SL-1', name: 'Staging Area', status: 'ACTIVE' });
    fixture.detectChanges();
    expect(component.showDeactivateDialog()).toBe(true);
    component.cancelDeactivate();
    fixture.detectChanges();
    expect(component.showDeactivateDialog()).toBe(false);
    const dialog = fixture.debugElement.query(By.css('[data-testid="deactivate-dialog"]'));
    expect(dialog).toBeNull();
  });

  it('should set requiresDestination when DESTINATION_REQUIRED error returned', async () => {
    await setup();
    stubInventoryService.deactivateStorageLocation.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { code: 'DESTINATION_REQUIRED', message: 'Destination required.' },
          }),
      ),
    );
    component.openDeactivateDialog({ storageLocationId: 'SL-1', name: 'Staging Area', status: 'ACTIVE' });
    fixture.detectChanges();
    component.confirmDeactivate();
    fixture.detectChanges();
    expect(component.requiresDestination()).toBe(true);
    const input = fixture.debugElement.query(By.css('[data-testid="destination-input"]'));
    expect(input).toBeTruthy();
  });
});
