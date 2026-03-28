/**
 * AppointmentCreatePageComponent unit tests — CAP-249
 *
 * RED: These tests will fail to compile until the following files are created:
 *   src/app/features/shopmgmt/pages/appointment-create/appointment-create-page.component.ts
 *   src/app/features/shopmgmt/services/appointment.service.ts
 *
 * Route: /app/shopmgmt/appointments/new
 * Selector: app-appointment-create-page
 *
 * ActivatedRoute mock: queryParams carry sourceType, sourceId, facilityId, facilityTimeZoneId.
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  shows .source-summary with sourceType and sourceId from queryParams
 *   3.  shows .facility-info with facilityId and facilityTimeZoneId (read-only)
 *   4.  renders input[name="scheduledStartDateTime"]
 *   5.  renders input[name="scheduledEndDateTime"]
 *   6.  submit button disabled when scheduledStartDateTime is empty
 *   7.  calls createAppointment on valid submit
 *   8.  generates a clientRequestId in UUID format in the request body
 *   9.  includes an Idempotency-Key header on submit
 *   10. navigates to the new appointment detail page on 201 success
 *   11. shows .error-banner with correlationId on 400
 *   12. shows .error-banner with generic access-denied message on 403
 *   13. shows .error-banner on 404 with a "Back to Source" link
 *   14. shows .eligibility-error on 422
 *   15. shows .conflict-panel on 409
 *   16. shows .hard-conflict and .soft-conflict severity badges in the conflict panel
 *   17. shows .override-section when only SOFT conflicts and override permitted
 *   18. requires .override-reason input when override toggle is enabled
 *   19. keeps the same clientRequestId on retry (idempotent re-submission)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentCreatePageComponent } from './appointment-create-page.component';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// UUID regex
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Inline stubs
// ---------------------------------------------------------------------------

const STUB_QUERY_PARAMS = {
  sourceType: 'ESTIMATE',
  sourceId: 'est-100',
  facilityId: 'fac-1',
  facilityTimeZoneId: 'America/Chicago',
};

const STUB_CREATED_APPOINTMENT = {
  appointmentId: 'appt-99',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
};

const SOFT_CONFLICT = { type: 'SOFT', code: 'SLOT_PREFERRED', message: 'Preferred slot occupied', overridable: true };
const HARD_CONFLICT = { type: 'HARD', code: 'FACILITY_CLOSED', message: 'Facility closed on this date', overridable: false };

const CONFLICT_PAYLOAD_SOFT = {
  conflicts: [SOFT_CONFLICT],
};

const CONFLICT_PAYLOAD_BOTH = {
  conflicts: [HARD_CONFLICT, SOFT_CONFLICT],
};

const VALID_START = '2026-04-01T09:00:00Z';

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

describe('AppointmentCreatePageComponent [CAP-249]', () => {
  let fixture: ComponentFixture<AppointmentCreatePageComponent>;
  let component: AppointmentCreatePageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    appointmentServiceStub.createAppointment.mockReturnValue(of(STUB_CREATED_APPOINTMENT));

    await TestBed.configureTestingModule({
      imports: [AppointmentCreatePageComponent],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of(STUB_QUERY_PARAMS) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentCreatePageComponent);
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

  it('shows .source-summary with sourceType and sourceId from queryParams', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.source-summary'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('ESTIMATE');
    expect(el.nativeElement.textContent).toContain('est-100');
  });

  // 3 ─────────────────────────────────────────────────────────────────────

  it('shows .facility-info with facilityId and facilityTimeZoneId as read-only fields', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.facility-info'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('fac-1');
    expect(el.nativeElement.textContent).toContain('America/Chicago');
  });

  // 4 ─────────────────────────────────────────────────────────────────────

  it('renders input[name="scheduledStartDateTime"]', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('input[name="scheduledStartDateTime"]');
    expect(el).toBeTruthy();
  });

  // 5 ─────────────────────────────────────────────────────────────────────

  it('renders input[name="scheduledEndDateTime"]', () => {
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('input[name="scheduledEndDateTime"]');
    expect(el).toBeTruthy();
  });

  // 6 ─────────────────────────────────────────────────────────────────────

  it('submit button is disabled when scheduledStartDateTime is empty', () => {
    fixture.detectChanges();

    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(btn?.disabled).toBe(true);
  });

  // 7 ─────────────────────────────────────────────────────────────────────

  it('calls createAppointment on valid submit', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();

    expect(appointmentServiceStub.createAppointment).toHaveBeenCalledOnce();
  });

  // 8 ─────────────────────────────────────────────────────────────────────

  it('generates a clientRequestId in UUID format in the request body', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();

    const [body] = appointmentServiceStub.createAppointment.mock.calls[0];
    expect(body.clientRequestId).toMatch(UUID_PATTERN);
  });

  // 9 ─────────────────────────────────────────────────────────────────────

  it('includes an Idempotency-Key header on submit', () => {
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();

    const [, idempotencyKey] = appointmentServiceStub.createAppointment.mock.calls[0];
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(0);
  });

  // 10 ────────────────────────────────────────────────────────────────────

  it('navigates to the appointment detail page on successful creation', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.stringContaining('appt-99')]),
    );
  });

  // 11 ────────────────────────────────────────────────────────────────────

  it('shows .error-banner containing correlationId on 400 error', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 400,
        error: { code: 'VALIDATION_ERROR', message: 'Bad request', correlationId: 'cor-xyz' },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.error-banner'));
    expect(el).toBeTruthy();
    expect(el.nativeElement.textContent).toContain('cor-xyz');
  });

  // 12 ────────────────────────────────────────────────────────────────────

  it('shows .error-banner with a generic access-denied message on 403 (no resource detail leaked)', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 403,
        error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource' },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.error-banner'));
    expect(el).toBeTruthy();
    // 403: generic message only, no resource-specific details rendered
    expect(el.nativeElement.textContent).not.toContain('fac-1');
  });

  // 13 ────────────────────────────────────────────────────────────────────

  it('shows .error-banner with a "Back to Source" link on 404', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 404,
        error: { code: 'SOURCE_NOT_FOUND', message: 'Source entity not found' },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css('.error-banner'));
    expect(errorEl).toBeTruthy();

    const backLink = fixture.debugElement.query(By.css('.back-to-source'));
    expect(backLink).toBeTruthy();
  });

  // 14 ────────────────────────────────────────────────────────────────────

  it('shows .eligibility-error on 422 eligibility rejection', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({
        status: 422,
        error: { code: 'ELIGIBILITY_FAILED', message: 'Customer not eligible for appointment' },
      })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.eligibility-error'));
    expect(el).toBeTruthy();
  });

  // 15 ────────────────────────────────────────────────────────────────────

  it('shows .conflict-panel on 409 Conflict', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_BOTH })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(el).toBeTruthy();
  });

  // 16 ────────────────────────────────────────────────────────────────────

  it('shows .hard-conflict and .soft-conflict severity badges in the conflict panel', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_BOTH })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.hard-conflict'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.soft-conflict'))).toBeTruthy();
  });

  // 17 ────────────────────────────────────────────────────────────────────

  it('shows .override-section when only SOFT conflicts are present and override is permitted', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.override-section'));
    expect(el).toBeTruthy();
  });

  // 18 ────────────────────────────────────────────────────────────────────

  it('requires .override-reason input when the override toggle is enabled', () => {
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit();
    fixture.detectChanges();

    // User enables the override toggle
    component.overrideEnabled.set(true);
    fixture.detectChanges();

    const el = fixture.debugElement.query(By.css('.override-reason'));
    expect(el).toBeTruthy();
  });

  // 19 ────────────────────────────────────────────────────────────────────

  it('keeps the same clientRequestId across multiple submit attempts (idempotent retry)', () => {
    // First call fails with 409
    appointmentServiceStub.createAppointment.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, error: CONFLICT_PAYLOAD_SOFT })),
    );
    // Second call succeeds
    appointmentServiceStub.createAppointment.mockReturnValueOnce(of(STUB_CREATED_APPOINTMENT));

    fixture.detectChanges();
    fixture.detectChanges();

    component.form.patchValue({ scheduledStartDateTime: VALID_START });
    component.submit(); // first attempt → 409
    fixture.detectChanges();

    const firstCallBody = appointmentServiceStub.createAppointment.mock.calls[0][0];
    const firstClientRequestId: string = firstCallBody.clientRequestId;

    component.submit(); // retry
    fixture.detectChanges();

    const secondCallBody = appointmentServiceStub.createAppointment.mock.calls[1][0];
    expect(secondCallBody.clientRequestId).toBe(firstClientRequestId);
  });
});
