/**
 * AppointmentReschedulePageComponent unit tests — CAP-249 (#333)
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
 *   8.  calls rescheduleAppointment with a UTC instant converted from the datetime-local value
 *   9.  shows .success-banner on success and re-reads the appointment (ADR-0063 §5)
 *   10. shows .conflict-panel when 409 Conflict returned
 *   11. renders .hard-conflict items inside the conflict panel (localized, not server prose)
 *   12. renders .soft-conflict items inside the conflict panel
 *   13. shows .suggested-slots when suggestedAlternatives present, as fillable buttons
 *   14. shows .override-reason-field when only soft conflicts and override permitted
 *   15. submit is disabled when a HARD conflict exists (no override allowed)
 *   16. shows .approval-reason-field when 422 + policy approval hint returned
 *   17. keeps form state on 409 VERSION_MISMATCH (prompts reload)
 *   18. maps 400 fieldErrors to inline .field-error messages attached via aria-describedby
 *   19. shows a visible, localized message on 403 / 404 / 5xx submit outcomes (previously silent)
 *   20. shows a visible message on 422 without requiresApproval (previously silent)
 *   21. renders a load-error state via state()/errorKey() and hides the form
 *   22. shows the current appointment schedule and pre-fills the form
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

const SOFT_CONFLICT = { severity: 'SOFT', code: 'BAY_DOUBLE_BOOKED', message: 'Preferred slot occupied', overridable: true };
const HARD_CONFLICT = { severity: 'HARD', code: 'FACILITY_CLOSED', message: 'Facility closed on this date', overridable: false };

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
  scheduledStartDateTime: '2026-04-02T09:00',
  scheduledEndDateTime: '2026-04-02T10:00',
  reason: 'CUSTOMER_REQUEST',
  notes: '',
};

// ---------------------------------------------------------------------------
// Service stub
// ---------------------------------------------------------------------------

const appointmentServiceStub = {
  getAppointment: vi.fn(),
  getFacilityName: vi.fn(),
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

describe('AppointmentReschedulePageComponent [CAP-249/#333]', () => {
  let fixture: ComponentFixture<AppointmentReschedulePageComponent>;
  let component: AppointmentReschedulePageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_APPOINTMENT));
    appointmentServiceStub.getFacilityName.mockReturnValue(of('Downtown Shop'));
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
    TestBed.resetTestingModule();
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
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: '', reason: '' });
    fixture.detectChanges();
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  // 8 ─────────────────────────────────────────────────────────────────────

  it('calls rescheduleAppointment with appointmentId and a UTC instant converted from the local value', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    fixture.detectChanges();

    component.submit();

    // Same local-time construction the component's fromDatetimeLocalValue uses, so this holds
    // regardless of the test runner's own timezone (ADR-0038 §7).
    const expectedStart = new Date(2026, 3, 2, 9, 0).toISOString();
    expect(appointmentServiceStub.rescheduleAppointment).toHaveBeenCalledWith(
      'appt-1',
      expect.objectContaining({
        scheduledStartDateTime: expectedStart,
        reason: VALID_FORM_VALUES.reason,
      }),
    );
  });

  // 9 ─────────────────────────────────────────────────────────────────────

  it('shows .success-banner and re-reads the appointment when reschedule completes successfully', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.success-banner'));
    expect(el).toBeTruthy();
    // getAppointment: once on load, once again on the post-success re-read.
    expect(appointmentServiceStub.getAppointment).toHaveBeenCalledTimes(2);
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

  it('renders .hard-conflict items in the conflict panel, localized rather than the server message', () => {
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
    expect(el.nativeElement.textContent).not.toContain(HARD_CONFLICT.message);
  });

  // 12 ────────────────────────────────────────────────────────────────────

  it('renders .soft-conflict items in the conflict panel, localized rather than the server message', () => {
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
    expect(el.nativeElement.textContent).not.toContain(SOFT_CONFLICT.message);
  });

  // 13 ────────────────────────────────────────────────────────────────────

  it('shows .suggested-slots as fillable buttons, formatted through the date pipe', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    const slots = fixture.debugElement.queryAll(By.css('.suggested-slot'));
    expect(slots.length).toBe(1);
    expect(slots[0].nativeElement.tagName).toBe('BUTTON');
    expect(slots[0].nativeElement.textContent).not.toContain('2026-04-01T11:00:00Z');

    slots[0].nativeElement.click();
    fixture.detectChanges();
    expect(component.form.value.scheduledStartDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
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

  it('maps 400 fieldErrors to inline .field-error messages attached via aria-describedby', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 400,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          // Named by the backend REQUEST's own field, not this form's control name (CAP-249 verify finding).
          fieldErrors: [
            { field: 'newStartAt', message: 'Must be in the future' },
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
    expect(el.nativeElement.textContent).not.toContain('Must be in the future');
    expect(el.nativeElement.id).toBe('scheduledStartDateTime-error');

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[name="scheduledStartDateTime"]');
    expect(input.getAttribute('aria-describedby')).toBe('scheduledStartDateTime-error');
  });

  // 19 ────────────────────────────────────────────────────────────────────

  it.each([403, 404, 500, 503])(
    'shows a visible, localized message on a %i submit outcome',
    (status) => {
      appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status })),
      );
      fixture.detectChanges();
      fixture.detectChanges();

      component.form.patchValue(VALID_FORM_VALUES);
      component.submit();
      fixture.detectChanges();

      expect(component.submitErrorKey()).toBe('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
      const el = fixture.debugElement.query(By.css('.error-banner'));
      expect(el).toBeTruthy();
    },
  );

  // 20 ────────────────────────────────────────────────────────────────────

  it('shows a visible message on a 422 without requiresApproval (previously silent)', () => {
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 422, error: { code: 'SOME_OTHER_POLICY' } })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue(VALID_FORM_VALUES);
    component.submit();
    fixture.detectChanges();

    expect(component.submitErrorKey()).toBe('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.SUBMIT_FAILED');
    expect(fixture.debugElement.query(By.css('.error-banner'))).toBeTruthy();
  });

  // 21 ────────────────────────────────────────────────────────────────────

  it('renders a load-error state via state()/errorKey() and hides the form', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );

    TestBed.resetTestingModule();
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
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('SHOPMGMT.APPOINTMENT_RESCHEDULE.ERROR.LOAD_NOT_FOUND');
    expect(fixture.debugElement.query(By.css('.load-error'))).toBeTruthy();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  // 22 ────────────────────────────────────────────────────────────────────

  it('shows the current appointment schedule and pre-fills the form from it', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const summary = fixture.debugElement.query(By.css('.appointment-summary'));
    expect(summary).toBeTruthy();
    expect(summary.nativeElement.textContent).not.toContain('2026-04-01T09:00:00Z');
    expect(appointmentServiceStub.getFacilityName).toHaveBeenCalledWith('fac-1');

    expect(component.form.value.scheduledStartDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(component.form.value.scheduledEndDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
