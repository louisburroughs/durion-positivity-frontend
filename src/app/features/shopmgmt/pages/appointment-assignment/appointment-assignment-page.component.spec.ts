/**
 * AppointmentAssignmentPageComponent unit tests — CAP-249
 *
 * RED: These tests will fail to compile until the following files are created:
 *   src/app/features/shopmgmt/pages/appointment-assignment/appointment-assignment-page.component.ts
 *   src/app/features/shopmgmt/services/appointment.service.ts
 *
 * Route: /app/shopmgmt/appointments/:id/assignments
 * Selector: app-appointment-assignment-page
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  shows loading state on init
 *   3.  calls getAppointment and listAssignments on init with route param id
 *   4.  renders .assignment-section when assignment data is loaded
 *   5.  renders .empty-assignment when no assignment returned
 *   6.  shows .mechanic-display with displayName when mechanic present
 *   7.  shows "Mechanic ID: {id}" fallback when displayName absent
 *   8.  renders .assignment-type-label with assignmentType (e.g. BAY)
 *   9.  renders .bay-details when assignmentType = BAY
 *   10. renders .mobile-unit-details when assignmentType = MOBILE_UNIT
 *   11. renders .assignment-notes when notes present
 *   12. shows .empty-state when assignment list is empty
 *   13. shows .update-notification when SSE / polling update detected
 *   14. ignores SSE event with version ≤ current version
 *   15. shows .sse-error-banner when SSE fails (fallback polling continues)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentAssignmentPageComponent } from './appointment-assignment-page.component';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// Inline stubs
// ---------------------------------------------------------------------------

const STUB_APPOINTMENT = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
  scheduledStart: '2026-04-01T09:00:00Z',
};

const STUB_ASSIGNMENT_BAY = {
  assignmentId: 'asn-1',
  assignmentType: 'BAY',
  bayId: 'bay-1',
  bayIdentifier: 'B-01',
  bayName: 'Bay 1',
  mechanic: { mechanicId: 'mech-1', displayName: 'Alice Wrench' },
  notes: 'Oil change, no issues',
  version: 5,
};

const STUB_ASSIGNMENT_MOBILE = {
  assignmentId: 'asn-2',
  assignmentType: 'MOBILE_UNIT',
  mobileUnitId: 'mu-7',
  mechanic: { mechanicId: 'mech-2', displayName: '' },
  version: 3,
};

// ---------------------------------------------------------------------------
// Service stub
// ---------------------------------------------------------------------------

const appointmentServiceStub = {
  getAppointment: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  searchAudit: vi.fn(),
  createAppointment: vi.fn(),
  executeOverride: vi.fn(),
  viewSchedule: vi.fn(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentAssignmentPageComponent [CAP-249]', () => {
  let fixture: ComponentFixture<AppointmentAssignmentPageComponent>;
  let component: AppointmentAssignmentPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentServiceStub.listAssignments.mockReturnValue(of([STUB_ASSIGNMENT_BAY]));

    await TestBed.configureTestingModule({
      imports: [AppointmentAssignmentPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentAssignmentPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // 1 ─────────────────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // 2 ─────────────────────────────────────────────────────────────────────

  it('shows loading state on init before data arrives', () => {
    const subject = new Subject<typeof STUB_APPOINTMENT>();
    appointmentServiceStub.getAppointment.mockReturnValueOnce(subject.asObservable());

    fixture.detectChanges(); // triggers ngOnInit; getAppointment hasn't emitted yet

    expect(component.loading()).toBe(true);

    subject.next(STUB_APPOINTMENT);
    subject.complete();
  });

  // 3 ─────────────────────────────────────────────────────────────────────

  it('calls getAppointment and listAssignments on init with route param id', () => {
    fixture.detectChanges();

    expect(appointmentServiceStub.getAppointment).toHaveBeenCalledWith('appt-1');
    expect(appointmentServiceStub.listAssignments).toHaveBeenCalledWith('appt-1');
  });

  // 4 ─────────────────────────────────────────────────────────────────────

  it('renders .assignment-section when assignment data is loaded', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.assignment-section'));
    expect(el).toBeTruthy();
  });

  // 5 ─────────────────────────────────────────────────────────────────────

  it('renders .empty-assignment when listAssignments returns an empty list', () => {
    appointmentServiceStub.listAssignments.mockReturnValueOnce(of([]));
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.empty-assignment'));
    expect(el).toBeTruthy();
  });

  // 6 ─────────────────────────────────────────────────────────────────────

  it('shows .mechanic-display with displayName when mechanic is present', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.mechanic-display'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Alice Wrench');
  });

  // 7 ─────────────────────────────────────────────────────────────────────

  it('shows "Mechanic ID: {id}" fallback when mechanic displayName is absent', () => {
    appointmentServiceStub.listAssignments.mockReturnValueOnce(of([STUB_ASSIGNMENT_MOBILE]));
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.mechanic-display'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Mechanic ID: mech-2');
  });

  // 8 ─────────────────────────────────────────────────────────────────────

  it('renders .assignment-type-label showing the assignmentType value', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.assignment-type-label'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('BAY');
  });

  // 9 ─────────────────────────────────────────────────────────────────────

  it('renders .bay-details (bayId + bayIdentifier) when assignmentType is BAY', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.bay-details'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('B-01');
  });

  // 10 ────────────────────────────────────────────────────────────────────

  it('renders .mobile-unit-details when assignmentType is MOBILE_UNIT', () => {
    appointmentServiceStub.listAssignments.mockReturnValueOnce(of([STUB_ASSIGNMENT_MOBILE]));
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.mobile-unit-details'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('mu-7');
  });

  // 11 ────────────────────────────────────────────────────────────────────

  it('renders .assignment-notes when notes are present', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.assignment-notes'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Oil change, no issues');
  });

  // 12 ────────────────────────────────────────────────────────────────────

  it('shows .empty-state when assignment list is empty', () => {
    appointmentServiceStub.listAssignments.mockReturnValueOnce(of([]));
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.empty-state'));
    expect(el).toBeTruthy();
  });

  // 13 ────────────────────────────────────────────────────────────────────

  it('shows .update-notification when an SSE / polling update is detected', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    // Signal the component that an inbound update is available
    component.showUpdateNotification.set(true);
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.update-notification'));
    expect(el).toBeTruthy();
  });

  // 14 ────────────────────────────────────────────────────────────────────

  it('ignores a versioned update whose version is ≤ the current assignment version', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    // Current version in stub is 5; push an older update (version 3)
    component.processVersionedUpdate({ version: 3 });
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.update-notification'));
    expect(el).toBeFalsy();
  });

  // 15 ────────────────────────────────────────────────────────────────────

  it('shows .sse-error-banner when SSE connection fails', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.sseError.set(true);
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.sse-error-banner'));
    expect(el).toBeTruthy();
  });
});
