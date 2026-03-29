import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError, NEVER } from 'rxjs';

import { LocationEditPageComponent } from './location-edit-page.component';
import { LocationService } from '../../services/location.service';

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockLocation = {
  locationId: 'loc-001',
  name: 'Downtown Store',
  code: 'DOWNTOWN',
  timezone: 'America/New_York',
  type: 'STORE',
  status: 'ACTIVE',
  parentLocationId: '',
};

// ── Stubs ─────────────────────────────────────────────────────────────────

const stubLocationService = {
  getLocationById: vi.fn(),
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
};

const NEW_ROUTE = {
  snapshot: { paramMap: { get: () => null } },
};

const EDIT_ROUTE = {
  snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'loc-001' : null) } },
};

// ── Setup Helpers ─────────────────────────────────────────────────────────

async function setupNew(): Promise<ComponentFixture<LocationEditPageComponent>> {
  await TestBed.configureTestingModule({
    imports: [LocationEditPageComponent],
    providers: [
      provideRouter([]),
      { provide: LocationService, useValue: stubLocationService },
      { provide: ActivatedRoute, useValue: NEW_ROUTE },
    ],
  }).compileComponents();

  return TestBed.createComponent(LocationEditPageComponent);
}

async function setupEdit(): Promise<ComponentFixture<LocationEditPageComponent>> {
  await TestBed.configureTestingModule({
    imports: [LocationEditPageComponent],
    providers: [
      provideRouter([]),
      { provide: LocationService, useValue: stubLocationService },
      { provide: ActivatedRoute, useValue: EDIT_ROUTE },
    ],
  }).compileComponents();

  return TestBed.createComponent(LocationEditPageComponent);
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('LocationEditPageComponent [CAP-214 #103]', () => {
  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // T1 ─────────────────────────────────────────────────────────────────────

  it('T1: new mode – form is empty and code input is not disabled', async () => {
    const fixture = await setupNew();
    fixture.detectChanges();

    const codeInput = fixture.debugElement.query(By.css('[data-testid="location-code-input"]'));
    expect(codeInput).not.toBeNull();
    expect(codeInput.nativeElement.disabled).toBe(false);
  });

  // T2 ─────────────────────────────────────────────────────────────────────

  it('T2: edit mode – calls getLocationById and populates the name input', async () => {
    stubLocationService.getLocationById.mockReturnValue(of(mockLocation));

    const fixture = await setupEdit();
    fixture.detectChanges();

    expect(stubLocationService.getLocationById).toHaveBeenCalledWith('loc-001');

    const nameInput = fixture.debugElement.query(By.css('[data-testid="location-name-input"]'));
    expect(nameInput.nativeElement.value).toBe('Downtown Store');
  });

  // T3 ─────────────────────────────────────────────────────────────────────

  it('T3: edit mode – code FormControl is disabled after load', async () => {
    stubLocationService.getLocationById.mockReturnValue(of(mockLocation));

    const fixture = await setupEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.code.disabled).toBe(true);
  });

  // T4 ─────────────────────────────────────────────────────────────────────

  it('T4: edit mode – shows loading-indicator while getLocationById is pending', async () => {
    stubLocationService.getLocationById.mockReturnValue(NEVER);

    const fixture = await setupEdit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="loading-indicator"]'));
    expect(el).not.toBeNull();
  });

  // T5 ─────────────────────────────────────────────────────────────────────

  it('T5: new mode – save() does not call createLocation when form is invalid', async () => {
    const fixture = await setupNew();
    fixture.detectChanges();

    fixture.componentInstance.save();

    expect(stubLocationService.createLocation).not.toHaveBeenCalled();
  });

  // T6 ─────────────────────────────────────────────────────────────────────

  it('T6: new mode – createLocation is called when all required fields are filled', async () => {
    stubLocationService.createLocation.mockReturnValue(of({}));

    const fixture = await setupNew();
    fixture.detectChanges();

    fixture.componentInstance.form.setValue({
      name: 'Airport Branch',
      code: 'AIRPORT',
      timezone: 'America/Chicago',
      type: 'STORE',
      status: 'ACTIVE',
      parentLocationId: '',
    });
    fixture.componentInstance.save();

    expect(stubLocationService.createLocation).toHaveBeenCalled();
  });

  // T7 ─────────────────────────────────────────────────────────────────────

  it('T7: edit mode – updateLocation is called with locationId and form values on save', async () => {
    stubLocationService.getLocationById.mockReturnValue(of(mockLocation));
    stubLocationService.updateLocation.mockReturnValue(of(mockLocation));

    const fixture = await setupEdit();
    fixture.detectChanges();

    fixture.componentInstance.save();

    expect(stubLocationService.updateLocation).toHaveBeenCalledWith('loc-001', expect.any(Object));
  });

  // T8 ─────────────────────────────────────────────────────────────────────

  it('T8: shows conflict-error when createLocation returns 409', async () => {
    stubLocationService.createLocation.mockReturnValue(
      throwError(() => ({ status: 409, error: { message: 'Duplicate code' } })),
    );

    const fixture = await setupNew();
    fixture.detectChanges();

    fixture.componentInstance.form.setValue({
      name: 'Airport Branch',
      code: 'AIRPORT',
      timezone: 'America/Chicago',
      type: 'STORE',
      status: 'ACTIVE',
      parentLocationId: '',
    });
    fixture.componentInstance.save();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="conflict-error"]'));
    expect(el).not.toBeNull();
  });

  // T9 ─────────────────────────────────────────────────────────────────────

  it('T9: shows save-success banner after updateLocation succeeds', async () => {
    stubLocationService.getLocationById.mockReturnValue(of(mockLocation));
    stubLocationService.updateLocation.mockReturnValue(of(mockLocation));

    const fixture = await setupEdit();
    fixture.detectChanges();

    fixture.componentInstance.save();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="save-success"]'));
    expect(el).not.toBeNull();
  });

  // T10 ────────────────────────────────────────────────────────────────────

  it('T10: shows validation-name span when name control is touched and empty', async () => {
    const fixture = await setupNew();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.form.controls.name.markAsTouched();
    comp.form.controls.name.setValue('');
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('[data-testid="validation-name"]'));
    expect(el).not.toBeNull();
  });
});
