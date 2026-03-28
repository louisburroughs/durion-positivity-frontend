import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { MechanicAvailabilityPageComponent } from './mechanic-availability-page.component';
import { AppointmentService } from '../../services/appointment.service';

const stubAppointmentService = {
  getCurrentUserPrimaryLocation: vi.fn(),
  getPeopleAvailability: vi.fn(),
};

describe('MechanicAvailabilityPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<MechanicAvailabilityPageComponent>;

  const setup = async () => {
    vi.clearAllMocks();
    stubAppointmentService.getCurrentUserPrimaryLocation.mockReturnValue(of({ locationId: 'loc-1' }));
    stubAppointmentService.getPeopleAvailability.mockReturnValue(of([{ mechanicName: 'Alex', available: true }]));

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubAppointmentService },
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
    expect(stubAppointmentService.getCurrentUserPrimaryLocation).toHaveBeenCalledTimes(1);
  });

  it('calls getPeopleAvailability on load', async () => {
    await setup();
    expect(stubAppointmentService.getPeopleAvailability).toHaveBeenCalled();
  });

  it('renders .availability-grid when data loaded', async () => {
    await setup();
    const grid = fixture.debugElement.query(By.css('.availability-grid'));
    expect(grid).toBeTruthy();
  });

  it('shows .error-banner on error', async () => {
    vi.clearAllMocks();
    stubAppointmentService.getCurrentUserPrimaryLocation.mockReturnValue(of({ locationId: 'loc-1' }));
    stubAppointmentService.getPeopleAvailability.mockReturnValue(throwError(() => new Error('boom')));

    await TestBed.configureTestingModule({
      imports: [MechanicAvailabilityPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubAppointmentService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MechanicAvailabilityPageComponent);
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });
});
