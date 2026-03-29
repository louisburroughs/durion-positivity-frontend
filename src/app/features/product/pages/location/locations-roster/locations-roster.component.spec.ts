import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LocationsRosterComponent } from './locations-roster.component';
import { ProductLocationService } from '../../../services/product-location.service';

describe('LocationsRosterComponent', () => {
  let fixture: ComponentFixture<LocationsRosterComponent>;
  let component: LocationsRosterComponent;

  const mockRosterEntry = {
    id: 'loc-01',
    name: 'Main Shop',
    status: 'ACTIVE' as const,
    region: 'North',
    lastValidatedAt: '2026-01-01T00:00:00Z',
    validationStatus: 'PENDING' as const,
  };

  const mockLocation = { id: 'loc-01', name: 'Main Shop' };

  const mockLocationService = {
    getRoster: vi.fn().mockReturnValue(of([mockRosterEntry])),
    getAllLocations: vi.fn().mockReturnValue(of([mockLocation])),
    validateLocation: vi.fn().mockReturnValue(
      of({ locationId: 'loc-01', valid: true, errors: [], validatedAt: '2026-03-01T00:00:00Z' }),
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationsRosterComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ProductLocationService, useValue: mockLocationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationsRosterComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── ngOnInit: roster load ─────────────────────────────────────────────────────

  it('loads roster and locations on init', () => {
    fixture.detectChanges(); // triggers ngOnInit

    expect(mockLocationService.getRoster).toHaveBeenCalled();
    expect(mockLocationService.getAllLocations).toHaveBeenCalled();
  });

  it('transitions to "ready" after successful roster load', () => {
    fixture.detectChanges();

    expect(component.state()).toBe('ready');
  });

  it('populates roster signal after load', () => {
    fixture.detectChanges();

    expect(component.roster()).toHaveLength(1);
    expect(component.roster()[0].id).toBe('loc-01');
  });

  it('populates locations signal after load', () => {
    fixture.detectChanges();

    expect(component.locations()).toHaveLength(1);
    expect(component.locations()[0].id).toBe('loc-01');
  });

  it('transitions to "empty" when roster returns no entries', () => {
    mockLocationService.getRoster.mockReturnValueOnce(of([]));
    mockLocationService.getAllLocations.mockReturnValueOnce(of([]));

    fixture.detectChanges();

    expect(component.state()).toBe('empty');
  });

  it('transitions to "error" when roster load fails', () => {
    mockLocationService.getRoster.mockReturnValueOnce(throwError(() => new Error('network error')));
    mockLocationService.getAllLocations.mockReturnValueOnce(of([]));

    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PRODUCT.LOCATION.ROSTER.ERROR.LOAD');
  });

  // ── validate() ───────────────────────────────────────────────────────────────

  it('validate(locationId) calls service with the given locationId', () => {
    fixture.detectChanges();
    component.validate('loc-01');

    expect(mockLocationService.validateLocation).toHaveBeenCalledWith('loc-01');
  });

  it('validate(locationId) updates validationStatus to "VALID" on success', () => {
    fixture.detectChanges();
    component.validate('loc-01');

    const entry = component.roster().find(e => e.id === 'loc-01');
    expect(entry?.validationStatus).toBe('VALID');
  });

  it('validate(locationId) updates lastValidatedAt on success', () => {
    fixture.detectChanges();
    component.validate('loc-01');

    const entry = component.roster().find(e => e.id === 'loc-01');
    expect(entry?.lastValidatedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('validate(locationId) sets validationStatus to "INVALID" when result.valid is false', () => {
    mockLocationService.validateLocation.mockReturnValueOnce(
      of({ locationId: 'loc-01', valid: false, errors: ['missing address'], validatedAt: '2026-03-01T00:00:00Z' }),
    );
    fixture.detectChanges();
    component.validate('loc-01');

    const entry = component.roster().find(e => e.id === 'loc-01');
    expect(entry?.validationStatus).toBe('INVALID');
  });

  it('validate(locationId) sets errorKey on failure', () => {
    mockLocationService.validateLocation.mockReturnValueOnce(
      throwError(() => new Error('timeout')),
    );
    fixture.detectChanges();
    component.validate('loc-01');

    expect(component.errorKey()).toBe('PRODUCT.LOCATION.ROSTER.ERROR.VALIDATE');
  });
});
