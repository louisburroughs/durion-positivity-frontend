import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TranslateModule } from '@ngx-translate/core';
import { MobileUnitsPageComponent } from './mobile-units-page.component';
import { LocationService } from '../../services/location.service';

const units = [
  { id: 'u-1', name: 'Van A', baseLocationId: 'loc-1' },
  { id: 'u-2', name: 'Van B', baseLocationId: 'loc-2' },
  { id: 'u-3', name: 'Van C', baseLocationId: 'loc-1' },
];

const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
  listMobileUnits: vi.fn().mockReturnValue(of(units)),
  createMobileUnit: vi.fn(),
  replaceCoverageRules: vi.fn(),
};

describe('MobileUnitsPageComponent', () => {
  let fixture: ComponentFixture<MobileUnitsPageComponent>;
  let component: MobileUnitsPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.getAllLocations.mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }]));
    locationServiceStub.listMobileUnits.mockReturnValue(of(units));
    locationServiceStub.createMobileUnit.mockReturnValue(of({ mobileUnitId: 'mu-2' }));
    locationServiceStub.replaceCoverageRules.mockReturnValue(of({ success: true }));

    await TestBed.configureTestingModule({
      imports: [MobileUnitsPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileUnitsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  it('shows no units before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(component.mobileUnits()).toEqual([]);
  });

  it('filters units by baseLocationId on selection and writes the query param', () => {
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.mobileUnits().map((u: any) => u.id)).toEqual(['u-1', 'u-3']);
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.mobileUnits()).toEqual([]);
  });

  it('renders without crashing', () => {
    expect(fixture.nativeElement).toBeTruthy();
  });

  it('renders .unit-card for each filtered unit once a location is selected', () => {
    component.onLocationSelected('loc-1');
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css('.unit-card'));
    expect(cards.length).toBe(2);
  });

  it('opens create modal once a location is selected', () => {
    component.onLocationSelected('loc-1');
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.open-create-btn'));
    button.nativeElement.click();
    fixture.detectChanges();

    const modal = fixture.debugElement.query(By.css('.create-modal-overlay'));
    expect(modal).toBeTruthy();
  });

  it('calls createMobileUnit on submit', () => {
    component.onLocationSelected('loc-1');
    fixture.detectChanges();
    component.openCreate();
    component.createName.set('Downtown Unit');
    fixture.detectChanges();

    const submitButton = fixture.debugElement.query(By.css('.submit-create-btn'));
    submitButton.nativeElement.click();

    expect(locationServiceStub.createMobileUnit).toHaveBeenCalledWith({ name: 'Downtown Unit' });
  });
});
