import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { LocationsPageComponent } from './locations-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { LocationService } from '../../services/location.service';

const stubService = {
  getAllLocations: vi.fn(),
  createLocation: vi.fn(),
};

describe('LocationsPageComponent [CAP-136]', () => {
  let fixture: ComponentFixture<LocationsPageComponent>;
  let component: LocationsPageComponent;

  const setup = async (locationsResponse: unknown = [{ locationId: 'loc-1', name: 'North Shop' }]) => {
    vi.clearAllMocks();
    stubService.getAllLocations.mockReturnValue(of(locationsResponse));
    stubService.createLocation.mockReturnValue(of({ locationId: 'loc-2' }));

    await TestBed.configureTestingModule({
      imports: [LocationsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('calls getAllLocations on init', async () => {
    await setup();
    expect(stubService.getAllLocations).toHaveBeenCalledTimes(1);
  });

  it('renders .location-card for each location', async () => {
    await setup();
    component.locations.set([
      { id: 'loc-1', name: 'North Shop' },
      { id: 'loc-2', name: 'South Shop' },
    ]);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.location-card'));
    expect(cards.length).toBe(2);
  });

  it('falls back to the empty state when the API returns null', async () => {
    await setup(null);
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('.empty-state'));
    expect(emptyState).toBeTruthy();
    expect(component.locations()).toEqual([]);
  });

  it('opens .create-modal when create button clicked', async () => {
    await setup();

    const button = fixture.debugElement.query(By.css('.open-create-btn'));
    button.nativeElement.click();
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('.create-modal'));
    expect(modal).toBeTruthy();
  });

  it('calls createLocation on submit', async () => {
    await setup();
    component.openCreateModal();
    component.createName.set('Airport Branch');
    component.createType.set('STORE');
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('.submit-create-btn'));
    submitButton.nativeElement.click();

    expect(stubService.createLocation).toHaveBeenCalledWith({
      name: 'Airport Branch',
      type: 'STORE',
    });
  });

  it('shows error banner and hides empty state when API fails', async () => {
    vi.clearAllMocks();
    stubService.getAllLocations.mockReturnValue(throwError(() => new Error('403')));
    stubService.createLocation.mockReturnValue(of({ locationId: 'loc-2' }));

    await TestBed.configureTestingModule({
      imports: [LocationsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: stubService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LocationsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('.empty-state'));
    expect(emptyState).toBeNull();
    expect(component.error()).toBe('LOCATION.LOCATIONS.ERROR.LOAD');
  });
});
