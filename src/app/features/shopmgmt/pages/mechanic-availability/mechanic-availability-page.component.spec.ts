import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import {
  PeopleAvailabilityResponse,
  PeopleAvailabilityResponseAssignmentStatusEnum,
} from '@durion-sdk/people';
import { MechanicAvailabilityPageComponent } from './mechanic-availability-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { DispatchBoardService } from '../../services/dispatch-board.service';

const availabilityFixture: PeopleAvailabilityResponse = {
  personId: '123e4567-e89b-12d3-a456-426614174001',
  firstName: 'Alex',
  lastName: 'Johnson',
  assignmentStatus: PeopleAvailabilityResponseAssignmentStatusEnum.Active,
  locationId: '123e4567-e89b-12d3-a456-426614174000',
  primary: true,
};

const dispatchBoardServiceStub = {
  getPrimaryLocation: vi.fn().mockReturnValue(of({
    locationId: '123e4567-e89b-12d3-a456-426614174000',
    locationName: 'Downtown Service Center',
  })),
  getAvailability: vi.fn().mockReturnValue(of([availabilityFixture])),
};

describe('MechanicAvailabilityPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<MechanicAvailabilityPageComponent>;

  const setup = async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: dispatchBoardServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
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

  it('calls getCurrentUserPrimaryLocation on init', async () => {
    await setup();
    expect(dispatchBoardServiceStub.getPrimaryLocation).toHaveBeenCalledTimes(1);
  });

  it('calls getPeopleAvailability on load', async () => {
    await setup();
    expect(dispatchBoardServiceStub.getAvailability).toHaveBeenCalled();
  });

  it('renders .availability-grid when data loaded', async () => {
    await setup();
    const grid = fixture.debugElement.query(By.css('.availability-grid'));
    expect(grid).toBeTruthy();
    expect(grid.nativeElement.textContent).toContain('Alex Johnson');
    expect(grid.nativeElement.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174001');
    expect(fixture.componentInstance.isAvailable(fixture.componentInstance.availabilityData()[0])).toBe(true);
  });

  it('displays the primary location name without exposing its UUID', async () => {
    await setup();
    const location = fixture.debugElement.query(By.css('[data-testid="location-name"]'));

    expect(location.nativeElement.value).toBe('Downtown Service Center');
    expect(fixture.nativeElement.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('uses the translated unavailable value when a mechanic name is missing', async () => {
    await setup();

    expect(fixture.componentInstance.getMechanicName({
      ...availabilityFixture,
      personId: '123e4567-e89b-12d3-a456-426614174002',
      firstName: undefined,
      lastName: undefined,
    })).toBe('COMMON.NOT_AVAILABLE');
  });

  it('treats ended assignments as unavailable', async () => {
    await setup();

    expect(fixture.componentInstance.isAvailable({
      ...availabilityFixture,
      assignmentStatus: PeopleAvailabilityResponseAssignmentStatusEnum.Ended,
    })).toBe(false);
  });

  it('renders unavailable instead of the UUID when the primary location name is missing', async () => {
    dispatchBoardServiceStub.getPrimaryLocation.mockReturnValueOnce(of({
      locationId: '123e4567-e89b-12d3-a456-426614174000',
    }));
    await setup();

    const location = fixture.debugElement.query(By.css('[data-testid="location-name"]'));
    expect(location.nativeElement.value).toBe('COMMON.NOT_AVAILABLE');
    expect(fixture.nativeElement.textContent).not.toContain('123e4567-e89b-12d3-a456-426614174000');
  });

  it('does not call getAvailability when primary location lookup fails', async () => {
    vi.clearAllMocks();
    const errorDispatchBoardService = {
      getPrimaryLocation: vi.fn().mockReturnValue(throwError(() => new Error('404'))),
      getAvailability: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: errorDispatchBoardService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    expect(errorDispatchBoardService.getAvailability).not.toHaveBeenCalled();
    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });

  // #201: the service maps a 404 (no primary assignment) to an empty response.
  it('treats the empty primary-location response as location-required without calling availability', async () => {
    vi.clearAllMocks();
    const emptyLocationService = {
      getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: undefined })),
      getAvailability: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: emptyLocationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    expect(emptyLocationService.getAvailability).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED');
  });

  it('prompts for a location when the primary location is blank', async () => {
    vi.clearAllMocks();
    const blankLocationService = {
      getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: null })),
      getAvailability: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: blankLocationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    expect(blankLocationService.getAvailability).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toBe(
      'SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED',
    );
  });

  it('requires a location before loading availability', async () => {
    await setup();
    vi.clearAllMocks();

    const component = fixture.componentInstance;
    component.filterForm.controls.locationId.setValue('   ');
    component.loadAvailability();
    fixture.detectChanges();

    expect(dispatchBoardServiceStub.getAvailability).not.toHaveBeenCalled();
    expect(component.error()).toBe('SHOPMGMT.MECHANIC_AVAILABILITY.ERROR.LOCATION_REQUIRED');
  });

  it('shows .error-banner on error', async () => {
    vi.clearAllMocks();
    const errorDispatchBoardService = {
      getPrimaryLocation: vi.fn().mockReturnValue(of({ locationId: 'loc-1' })),
      getAvailability: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
    };

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: DispatchBoardService, useValue: errorDispatchBoardService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });
});
