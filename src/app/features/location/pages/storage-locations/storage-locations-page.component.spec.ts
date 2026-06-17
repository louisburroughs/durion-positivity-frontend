import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { StorageLocationsPageComponent } from './storage-locations-page.component';
import { LocationService } from '../../services/location.service';

// Location-service storage model: Spring page wrapper, `type`/`barcode`, no `code`.
const STORAGE_PAGE = {
  content: [
    { id: 'SL-1', name: 'Staging Area', type: 'FLOOR', barcode: 'BC-1', status: 'ACTIVE' },
    { id: 'SL-2', name: 'Quarantine Bay', type: 'CAGE', barcode: 'BC-2', status: 'ACTIVE' },
  ],
  totalElements: 2,
};

const locationServiceStub = {
  getAllLocations: vi.fn(),
  listStorageLocations: vi.fn(),
  createStorageLocation: vi.fn(),
  deactivateStorageLocation: vi.fn(),
};

function resetLocationStub() {
  locationServiceStub.getAllLocations.mockReturnValue(of([
    { id: 'loc-1', name: 'Depot' },
    { id: 'LOC-001', name: 'Main Warehouse' },
  ]));
  locationServiceStub.listStorageLocations.mockReturnValue(of({ content: [{ id: 's-1' }], totalElements: 1 }));
  locationServiceStub.createStorageLocation.mockReturnValue(of({ id: 'SL-NEW' }));
  locationServiceStub.deactivateStorageLocation.mockReturnValue(of({}));
}

describe('StorageLocationsPageComponent', () => {
  let fixture: ComponentFixture<StorageLocationsPageComponent>;
  let component: StorageLocationsPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetLocationStub();

    await TestBed.configureTestingModule({
      imports: [StorageLocationsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StorageLocationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not load storage locations before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(locationServiceStub.listStorageLocations).not.toHaveBeenCalled();
  });

  it('loads and writes the query param on selection', () => {
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.locationId()).toBe('loc-1');
    expect(locationServiceStub.listStorageLocations).toHaveBeenCalledWith('loc-1', { pageIndex: 0, pageSize: 20 });
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('populates storage types from the client-side enum constant', () => {
    component.onLocationSelected('loc-1');
    expect(component.storageTypes()).toEqual([
      { value: 'FLOOR', label: 'Floor' },
      { value: 'SHELF', label: 'Shelf' },
      { value: 'BIN', label: 'Bin' },
      { value: 'CAGE', label: 'Cage' },
      { value: 'TRUCK', label: 'Truck' },
    ]);
  });

  it('resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.storageLocations()).toEqual([]);
    expect(component.storageTypes()).toEqual([]);
    expect(component.createForm.controls.locationId.value).toBe('');
  });

  it('fetches storage locations exactly once on selection', () => {
    component.onLocationSelected('loc-1');
    expect(locationServiceStub.listStorageLocations).toHaveBeenCalledTimes(1);
  });

  it('resets to the prompt state when the picker selection is cleared', () => {
    component.onLocationSelected('loc-1');
    locationServiceStub.listStorageLocations.mockClear();

    component.onLocationSelected('');

    expect(component.storageLocations()).toEqual([]);
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(false);
    expect(component.createForm.controls.locationId.value).toBe('');
    expect(locationServiceStub.listStorageLocations).not.toHaveBeenCalledWith('', expect.anything());
  });
});

describe('StorageLocationsPageComponent [CAP-214 #103] (location selected)', () => {
  let fixture: ComponentFixture<StorageLocationsPageComponent>;
  let component: StorageLocationsPageComponent;

  const setup = async (listResponse: unknown = STORAGE_PAGE) => {
    vi.clearAllMocks();
    resetLocationStub();
    locationServiceStub.listStorageLocations.mockReturnValue(of(listResponse));

    await TestBed.configureTestingModule({
      imports: [StorageLocationsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
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

  it('should render storage locations table from the page content wrapper', async () => {
    await setup();
    const table = fixture.debugElement.query(By.css('[data-testid="storage-locations-table"]'));
    expect(table).toBeTruthy();
    const rows = fixture.debugElement.queryAll(By.css('[data-testid^="storage-location-row-"]'));
    expect(rows.length).toBe(2);
    expect(rows[0].nativeElement.textContent).toContain('Staging Area');
    expect(rows[0].nativeElement.textContent).toContain('FLOOR');
    expect(rows[1].nativeElement.textContent).toContain('Quarantine Bay');
  });

  it('should show empty state when no storage locations', async () => {
    await setup({ content: [], totalElements: 0 });
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

  it('maps the form to the location storage request (siteId + type, no code) and shows success', async () => {
    await setup();
    component.openCreateForm();
    component.createForm.patchValue({ name: 'Staging 1', storageType: 'BIN', barcode: 'BC-9' });
    fixture.detectChanges();
    component.createStorageLocation();
    fixture.detectChanges();
    expect(locationServiceStub.createStorageLocation).toHaveBeenCalledWith(
      'LOC-001',
      expect.objectContaining({ name: 'Staging 1', type: 'BIN', barcode: 'BC-9' }),
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

  it('deactivates via the location service with the site id', async () => {
    await setup();
    component.openDeactivateDialog({ id: 'SL-1', name: 'Staging Area', status: 'ACTIVE' });
    fixture.detectChanges();
    component.confirmDeactivate();
    fixture.detectChanges();
    expect(locationServiceStub.deactivateStorageLocation).toHaveBeenCalledWith(
      'LOC-001',
      'SL-1',
      expect.any(Object),
      expect.any(String),
    );
  });

  it('should cancel deactivate dialog', async () => {
    await setup();
    component.openDeactivateDialog({ id: 'SL-1', name: 'Staging Area', status: 'ACTIVE' });
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
    // Location service surfaces an RFC 9457 ProblemDetail (422, marker in `detail`),
    // not the legacy inventory `{ status: 409, error: { code } }` envelope.
    locationServiceStub.deactivateStorageLocation.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: {
              type: 'about:blank',
              title: 'Unprocessable Content',
              status: 422,
              detail: 'DESTINATION_REQUIRED',
            },
          }),
      ),
    );
    component.openDeactivateDialog({ id: 'SL-1', name: 'Staging Area', status: 'ACTIVE' });
    fixture.detectChanges();
    component.confirmDeactivate();
    fixture.detectChanges();
    expect(component.requiresDestination()).toBe(true);
    const input = fixture.debugElement.query(By.css('[data-testid="destination-input"]'));
    expect(input).toBeTruthy();
  });

  it('hides pagination when there is a single page', async () => {
    await setup({ content: [{ id: 'SL-1', name: 'A', type: 'BIN', status: 'ACTIVE' }], totalPages: 1, totalElements: 1 });
    expect(fixture.debugElement.query(By.css('[data-testid="storage-pagination"]'))).toBeNull();
  });

  it('renders pagination and reflects page metadata for a multi-page result', async () => {
    await setup({ content: [{ id: 'SL-1', name: 'A', type: 'BIN', status: 'ACTIVE' }], number: 0, totalPages: 3, totalElements: 45 });
    expect(component.totalPages()).toBe(3);
    expect(component.canPrevPage()).toBe(false);
    expect(component.canNextPage()).toBe(true);
    const status = fixture.debugElement.query(By.css('[data-testid="page-status"]'));
    expect(status.nativeElement.textContent).toContain('Page 1 of 3');
    expect(status.nativeElement.textContent).toContain('45 total');
  });

  it('advances to the next page and requests it from the service', async () => {
    await setup({ content: [{ id: 'SL-1', name: 'A', type: 'BIN', status: 'ACTIVE' }], number: 0, totalPages: 3, totalElements: 45 });
    locationServiceStub.listStorageLocations.mockClear();

    component.nextPage();

    expect(component.pageIndex()).toBe(1);
    expect(locationServiceStub.listStorageLocations).toHaveBeenCalledWith('LOC-001', { pageIndex: 1, pageSize: 20 });
  });

  it('does not page before the first page', async () => {
    await setup({ content: [{ id: 'SL-1', name: 'A', type: 'BIN', status: 'ACTIVE' }], number: 0, totalPages: 3, totalElements: 45 });
    locationServiceStub.listStorageLocations.mockClear();

    component.prevPage();

    expect(component.pageIndex()).toBe(0);
    expect(locationServiceStub.listStorageLocations).not.toHaveBeenCalled();
  });
});
