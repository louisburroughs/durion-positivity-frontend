import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaysPageComponent } from './bays-page.component';
import { LocationService } from '../../services/location.service';

const locationServiceStub = {
  getAllLocations: vi.fn().mockReturnValue(of([{ id: 'loc-1', name: 'Depot' }])),
  listBays: vi.fn().mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }])),
};

describe('BaysPageComponent', () => {
  let fixture: ComponentFixture<BaysPageComponent>;
  let component: BaysPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    locationServiceStub.listBays.mockReturnValue(of([{ id: 'bay-1', name: 'Bay 1' }]));

    await TestBed.configureTestingModule({
      imports: [BaysPageComponent],
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
});
