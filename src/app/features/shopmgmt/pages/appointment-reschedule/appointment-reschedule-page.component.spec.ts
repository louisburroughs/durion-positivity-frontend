/**
 * AppointmentReschedulePageComponent unit tests — CAP-249
 *
 * RED: These tests will fail to compile until the following files are created:
 *   src/app/features/shopmgmt/pages/appointment-reschedule/appointment-reschedule-page.component.ts
 *   src/app/features/shopmgmt/services/appointment.service.ts
 *
 * Route: /app/shopmgmt/appointments/:id/reschedule
 * Selector: app-appointment-reschedule-page
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  loads appointment on init using route param id
 *   3.  renders reschedule form with input[name="scheduledStartDateTime"]
 *   4.  renders input[name="scheduledEndDateTime"]
 *   5.  renders select[name="reason"] for reschedule reason
 *   6.  renders textarea[name="notes"]
 *   7.  submit button disabled when required fields empty
 *   8.  calls rescheduleAppointment on valid submit
 *   9.  shows .success-banner on success
 *   10. shows .conflict-panel when 409 Conflict returned
 *   11. renders .hard-conflict items inside the conflict panel
 *   12. renders .soft-conflict items inside the conflict panel
 *   13. shows .suggested-slots when suggestedAlternatives present
 *   14. shows .override-reason-field when only soft conflicts and override permitted
 *   15. submit is disabled when a HARD conflict exists (no override allowed)
 *   16. shows .approval-reason-field when 422 + policy approval hint returned
 *   17. keeps form state on 409 VERSION_MISMATCH (prompts reload)
 *   18. maps 400 fieldErrors to inline .field-error messages
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentReschedulePageComponent } from './appointment-reschedule-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// Inline stubs
// ---------------------------------------------------------------------------

const STUB_APPOINTMENT = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
  scheduledStart: '2026-04-01T09:00:00Z',
  scheduledEnd: '2026-04-01T10:00:00Z',
};

const SOFT_CONFLICT = { type: 'SOFT', code: 'SLOT_PREFERRED', message: 'Preferred slot occupied', overridable: true };
const HARD_CONFLICT = { type: 'HARD', code: 'FACILITY_CLOSED', message: 'Facility closed on this date', overridable: false };

const CONFLICT_PAYLOAD_SOFT = {
  conflicts: [SOFT_CONFLICT],
  suggestedAlternatives: [
    { scheduledStartDateTime: '2026-04-01T11:00:00Z', scheduledEndDateTime: '2026-04-01T12:00:00Z' },
  ],
};

const CONFLICT_PAYLOAD_HARD = {
  conflicts: [HARD_CONFLICT],
};

const CONFLICT_PAYLOAD_BOTH = {
  conflicts: [HARD_CONFLICT, SOFT_CONFLICT],
  suggestedAlternatives: [],
};

const VALID_FORM_VALUES = {
  scheduledStartDateTime: '2026-04-02T09:00:00Z',
  scheduledEndDateTime: '2026-04-02T10:00:00Z',
  reason: 'CUSTOMER_REQUEST',
  notes: '',
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

describe('AppointmentReschedulePageComponent [CAP-249]', () => {
  let fixture: ComponentFixture<AppointmentReschedulePageComponent>;
  let component: AppointmentReschedulePageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(of(STUB_APPOINTMENT));

    await TestBed.configureTestingModule({
      imports: [AppointmentReschedulePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentReschedulePageComponent);
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

  it('loads appointment on init using route param id', () => {
    fixture.detectChanges();

    expect(appointmentServiceStub.getAppointment).toHaveBeenCalledWith('appt-1');
  });

  // 3 ─────────────────────────────────────────────────────────────────────

  it('renders the reschedule form with input[name="scheduledStartDateTime"]', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('input[name="scheduledStartDateTime"]');
    expect(el).toBeTruthy();
  });

  // 4 ─────────────────────────────────────────────────────────────────────

  it('renders input[name="scheduledEndDateTime"]', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('input[name="scheduledEndDateTime"]');
    expect(el).toBeTruthy();
  });

  // 5 ─────────────────────────────────────────────────────────────────────

  it('renders select[name="reason"] for reschedule reason', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('select[name="reason"]');
    expect(el).toBeTruthy();
  });

  // 6 ─────────────────────────────────────────────────────────────────────

  it('renders textarea[name="notes"]', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('textarea[name="notes"]');
    expect(el).toBeTruthy();
  });

  // 7 ─────────────────────────────────────────────────────────────────────

  it('submit button is disabled when required fields are empty', () => {
    fixture.detectChanges();

    // Form starts empty
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  // 8 ─────────────────────────────────────────────────────────────────────

  it('calls rescheduleAppointment with appointmentId and form values on valid submit', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    fixture.detectChanges();

    component.submit();

    expect(appointmentServiceStub.rescheduleAppointment).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({
        scheduledStartDateTime: VALID_FORM_VALUES.scheduledStartDateTime,
        reason: VALID_FORM_VALUES.reason,
      }),
    );
  });

  // 9 ─────────────────────────────────────────────────────────────────────

  it('shows .success-banner when reschedule completes successfully', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.success-banner'));
    expect(el).toBeTruthy();
  });

  // 10 ────────────────────────────────────────────────────────────────────

  it('shows .conflict-panel when rescheduleAppointment returns 409', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(el).toBeTruthy();
  });

  // 11 ────────────────────────────────────────────────────────────────────

  it('renders .hard-conflict items in the conflict panel', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_BOTH })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.hard-conflict'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain(HARD_CONFLICT.message);
  });

  // 12 ────────────────────────────────────────────────────────────────────

  it('renders .soft-conflict items in the conflict panel', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_BOTH })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.soft-conflict'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain(SOFT_CONFLICT.message);
  });

  // 13 ────────────────────────────────────────────────────────────────────

  it('shows .suggested-slots when the conflict payload contains suggestedAlternatives', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.suggested-slots'));
    expect(el).toBeTruthy();
  });

  // 14 ────────────────────────────────────────────────────────────────────

  it('shows .override-reason-field when only soft conflicts are present and override is permitted', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.override-reason-field'));
    expect(el).toBeTruthy();
  });

  // 15 ────────────────────────────────────────────────────────────────────

  it('submit button is disabled when a HARD conflict exists (no override allowed)', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_HARD })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  // 16 ────────────────────────────────────────────────────────────────────

  it('shows .approval-reason-field when 422 response contains a policy approval hint', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 422,
        error: { code: 'APPROVAL_REQUIRED', message: 'Manager approval required', requiresApproval: true },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.approval-reason-field'));
    expect(el).toBeTruthy();
  });

  // 17 ────────────────────────────────────────────────────────────────────

  it('keeps form state and shows a reload prompt on 409 VERSION_MISMATCH', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 409,
        error: { code: 'VERSION_MISMATCH', message: 'Appointment was modified by another user' },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    // Form values should be preserved so the user can retry after reload
    expect(component.form.value.scheduledStartDateTime).toBe(VALID_FORM_VALUES.scheduledStartDateTime);

    const el = fixture.debugElement.query(By.css('.version-mismatch-prompt'));
    expect(el).toBeTruthy();
  });

  // 18 ────────────────────────────────────────────────────────────────────

  it('maps 400 fieldErrors to inline .field-error messages', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          fieldErrors: [
            { field: 'scheduledStartDateTime', message: 'Must be in the future' },
          ],
        },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.field-error'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('Must be in the future');
  });
});
