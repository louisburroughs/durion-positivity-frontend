import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaysPageComponent } from './bays-page.component';
import { LocationService } from '../../services/location.service';

const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
  listBays: vi.fn().mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }])),
  createBay: vi.fn().mockReturnValue(of({})),
  patchBay: vi.fn().mockReturnValue(of({})),
};

describe('BaysPageComponent', () => {
  let fixture: ComponentFixture<BaysPageComponent>;
  let component: BaysPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.listBays.mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }]));
    locationServiceStub.createBay.mockReturnValue(of({}));
    locationServiceStub.patchBay.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [BaysPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: LocationService, useValue: locationServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BaysPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not load bays before a location is selected', () => {
    expect(component.locationId()).toBe('');
    expect(locationServiceStub.listBays).not.toHaveBeenCalled();
  });

  it('loads bays and writes the query param on selection', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate');
    component.onLocationSelected('loc-1');
    expect(component.locationId()).toBe('loc-1');
    expect(locationServiceStub.listBays).toHaveBeenCalledWith('loc-1');
    expect(navSpy).toHaveBeenCalledWith([], expect.objectContaining({
      queryParams: { locationId: 'loc-1' },
      queryParamsHandling: 'merge',
    }));
  });

  it('shows a not-found notice and resets on invalid id', () => {
    component.onLocationSelected('loc-1');
    component.onInvalidSelection('bad-id');
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(true);
    expect(component.bays()).toEqual([]);
  });

  it('resets to the prompt state when the picker selection is cleared', () => {
    component.onLocationSelected('loc-1');
    locationServiceStub.listBays.mockClear();

    component.onLocationSelected('');

    expect(component.bays()).toEqual([]);
    expect(component.locationId()).toBe('');
    expect(component.invalidId()).toBe(false);
    expect(locationServiceStub.listBays).not.toHaveBeenCalledWith('');
  });

  it('renders one bay-card per bay after a location is selected', () => {
    locationServiceStub.listBays.mockReturnValue(
      of([
        { id: 'bay-1', name: 'Bay 1' },
        { id: 'bay-2', name: 'Bay 2' },
      ]),
    );

    component.onLocationSelected('loc-1');
    fixture.detectChanges();

    const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.bay-card');
    expect(cards.length).toBe(2);
  });

  it('creates a bay then reloads the list', () => {
    component.onLocationSelected('loc-1');
    locationServiceStub.listBays.mockClear();

    component.openCreate();
    component.createBayName.set('New Bay');
    component.submitCreate();

    expect(locationServiceStub.createBay).toHaveBeenCalledWith('loc-1', { name: 'New Bay' });
    expect(locationServiceStub.listBays).toHaveBeenCalledWith('loc-1');
  });

  it('patches a bay when editing', () => {
    component.onLocationSelected('loc-1');

    component.selectBay({ id: 'bay-1', name: 'Bay 1' });
    component.editBayName.set('Renamed Bay');
    component.submitEdit();

    expect(locationServiceStub.patchBay).toHaveBeenCalledWith('loc-1', 'bay-1', { name: 'Renamed Bay' });
  });
});
