/**
 * ScheduleViewPageComponent unit tests — CAP-137 story #138
 *
 * Route: /app/shopmgmt/schedule
 * Selector: app-schedule-view-page
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  reads locationId, date, resourceType, resourceId from query params on init
 *   3.  renders .filter-bar with required form inputs
 *   4.  renders .load-board-btn
 *   5.  Load Schedule button disabled when locationId empty
 *   6.  calls viewSchedule with locationId and date on loadBoard()
 *   7.  renders .board-region when schedule data is returned
 *   8.  renders .resource-lane for each resource in data
 *   9.  renders .work-item-card for each appointment in a lane
 *   10. shows .conflict-badge when rescheduleCount > 0
 *   11. shows .details-panel after clicking a .work-item-card
 *   12. closes .details-panel when close button clicked
 *   13. shows .availability-warning on error
 *   14. shows .empty-board when schedule data is empty and no error
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';
import { ScheduleViewPageComponent } from './schedule-view-page.component';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_SCHEDULE = [
  {
    resourceId: 'bay-1',
    resourceName: 'Bay 1',
    resourceType: 'BAY',
    appointments: [
      { appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'fac-1', scheduledStart: '2026-05-01T09:00:00Z', rescheduleCount: 0 },
      { appointmentId: 'appt-2', status: 'SCHEDULED', facilityId: 'fac-1', scheduledStart: '2026-05-01T11:00:00Z', rescheduleCount: 2 },
    ],
  },
  {
    resourceId: 'bay-2',
    resourceName: 'Bay 2',
    resourceType: 'BAY',
    appointments: [],
  },
];

const appointmentServiceStub = {
  getAppointment: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  searchAudit: vi.fn(),
  createAppointment: vi.fn(),
  executeOverride: vi.fn(),
  viewSchedule: vi.fn(),
  getShopServiceDetails: vi.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ScheduleViewPageComponent [CAP-137]', () => {
  let fixture: ComponentFixture<ScheduleViewPageComponent>;
  let component: ScheduleViewPageComponent;

  const setup = async (queryParams = {}) => {
    vi.clearAllMocks();
    appointmentServiceStub.viewSchedule.mockReturnValue(of(STUB_SCHEDULE));

    await TestBed.configureTestingModule({
      imports: [ScheduleViewPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { queryParams: of(queryParams) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleViewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    TestBed.resetTestingModule();
  });

  // 1. renders without crashing
  it('renders without crashing', async () => {
    await setup();
    expect(fixture.nativeElement).toBeTruthy();
  });

  // 2. reads query params on init
  it('patches locationId and date form fields from query params', async () => {
    await setup({ locationId: 'loc-99', date: '2026-06-01' });
    expect(component.filterForm.value.locationId).toBe('loc-99');
    expect(component.filterForm.value.selectedDate).toBe('2026-06-01');
  });

  // 3. renders .filter-bar
  it('renders .filter-bar with form inputs', async () => {
    await setup();
    expect(fixture.debugElement.query(By.css('.filter-bar'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="locationId"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="selectedDate"]'))).not.toBeNull();
  });

  // 4. renders .load-board-btn
  it('renders .load-board-btn', async () => {
    await setup();
    expect(fixture.debugElement.query(By.css('.load-board-btn'))).not.toBeNull();
  });

  // 5. load board button disabled when locationId empty
  it('Load Schedule button is disabled when locationId is empty', async () => {
    await setup();
    const btn = fixture.debugElement.query(By.css('.load-board-btn'));
    expect((btn.nativeElement as HTMLButtonElement).disabled).toBe(true);
  });

  // 6. calls viewSchedule on loadBoard()
  it('calls viewSchedule with locationId and date on loadBoard()', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    expect(appointmentServiceStub.viewSchedule).toHaveBeenCalledWith('loc-1', '2026-05-01');
  });

  // 7. renders .board-region when data returned
  it('renders .board-region when schedule data is returned', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.board-region'))).not.toBeNull();
  });

  // 8. renders .resource-lane for each resource
  it('renders a .resource-lane for each resource entry', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    const lanes = fixture.debugElement.queryAll(By.css('.resource-lane'));
    expect(lanes.length).toBe(STUB_SCHEDULE.length);
  });

  // 9. renders .work-item-card for each appointment
  it('renders .work-item-card for each appointment in a lane', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    const cards = fixture.debugElement.queryAll(By.css('.work-item-card'));
    expect(cards.length).toBe(2); // only bay-1 has 2 appointments
  });

  // 10. shows .conflict-badge when rescheduleCount > 0
  it('shows .conflict-badge for appointments that have been rescheduled', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    const badges = fixture.debugElement.queryAll(By.css('.conflict-badge'));
    expect(badges.length).toBe(1);
  });

  // 11. shows .details-panel on card click
  it('shows .details-panel when a .work-item-card is clicked', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.work-item-card'));
    card.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.details-panel'))).not.toBeNull();
  });

  // 12. closes .details-panel on close click
  it('closes .details-panel when close button is clicked', async () => {
    await setup({ locationId: 'loc-1', date: '2026-05-01' });
    component.loadBoard();
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.css('.work-item-card'));
    card.nativeElement.click();
    fixture.detectChanges();
    const closeBtn = fixture.debugElement.query(By.css('.details-close'));
    closeBtn.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.details-panel'))).toBeNull();
  });

  // 13. shows .availability-warning on error
  it('shows .availability-warning when viewSchedule returns an error', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.viewSchedule.mockReturnValue(throwError(() => new Error('error')));

    await TestBed.configureTestingModule({
      imports: [ScheduleViewPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { queryParams: of({ locationId: 'loc-1', date: '2026-05-01' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleViewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.loadBoard();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.availability-warning'))).not.toBeNull();
  });

  // 14. shows .empty-board when data is []
  it('shows .empty-board when schedule data is empty and no error', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.viewSchedule.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [ScheduleViewPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { queryParams: of({ locationId: 'loc-1', date: '2026-05-01' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleViewPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.loadBoard();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.empty-board'))).not.toBeNull();
  });
});
