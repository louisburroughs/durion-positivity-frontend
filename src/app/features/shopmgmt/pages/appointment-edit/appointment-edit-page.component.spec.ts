/**
 * AppointmentEditPageComponent unit tests — CAP-137
 *
 * Route: /app/shopmgmt/appointments/:id/edit
 * Selector: app-appointment-edit-page
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  loads appointment on init using route param id
 *   3.  renders .appointment-summary when data loaded
 *   4.  shows enabled Reschedule and Cancel buttons when status === SCHEDULED
 *   5.  shows disabled buttons + .actions-helper-text when status !== SCHEDULED
 *   6.  shows .audit-entry items when audit loads
 *   7.  shows .audit-unavailable when searchAudit fails
 *   8.  opens .reschedule-modal when Reschedule button clicked
 *   9.  closes reschedule modal when Cancel button clicked
 *   10. calls rescheduleAppointment with appointmentId on valid submit
 *   11. shows .success-banner after successful reschedule
 *   12. shows .conflict-panel with .hard-conflict / .soft-conflict on 409
 *   13. shows .error-banner in reschedule modal on non-conflict error
 *   14. opens .cancel-modal when Cancel Appointment button clicked
 *   15. calls cancelAppointment with appointmentId and form values on submit
 *   16. shows .success-banner after successful cancel
 *   17. shows .error-banner in cancel modal on error
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentEditPageComponent } from './appointment-edit-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_SCHEDULED = {
  appointmentId: 'appt-42',
  status: 'SCHEDULED',
  facilityId: 'fac-1',
  scheduledStart: '2026-05-01T09:00:00Z',
  scheduledEnd: '2026-05-01T10:00:00Z',
};

const STUB_CANCELLED = {
  appointmentId: 'appt-42',
  status: 'CANCELLED',
  facilityId: 'fac-1',
};

const STUB_AUDIT = [
  { id: 'a1', timestamp: '2026-05-01T08:00:00Z', actor: 'user1', action: 'CREATED', details: 'ok' },
];

const HARD_CONFLICT = { type: 'HARD', code: 'FACILITY_CLOSED', message: 'Facility is closed.', overridable: false };
const SOFT_CONFLICT = { type: 'SOFT', code: 'SLOT_PREFERRED', message: 'Preferred slot occupied.', overridable: true };

// ---------------------------------------------------------------------------
// Service stub
// ---------------------------------------------------------------------------

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

describe('AppointmentEditPageComponent [CAP-137]', () => {
  let fixture: ComponentFixture<AppointmentEditPageComponent>;
  let component: AppointmentEditPageComponent;

  const setup = async (apptStub: Record<string, unknown> = STUB_SCHEDULED) => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(apptStub));
    appointmentServiceStub.searchAudit.mockReturnValue(of(STUB_AUDIT));
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(of(STUB_SCHEDULED));
    appointmentServiceStub.cancelAppointment.mockReturnValue(of(STUB_CANCELLED));

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-42' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
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

  // 2. loads appointment using route param id
  it('calls getAppointment with route param id on init', async () => {
    await setup();
    expect(appointmentServiceStub.getAppointment).toHaveBeenCalledWith('appt-42');
  });

  // 3. renders .appointment-summary when data loaded
  it('renders .appointment-summary when appointment loaded', async () => {
    await setup();
    const summary = fixture.debugElement.query(By.css('.appointment-summary'));
    expect(summary).not.toBeNull();
  });

  // 4. enabled buttons when SCHEDULED
  it('shows enabled Reschedule and Cancel buttons when status is SCHEDULED', async () => {
    await setup(STUB_SCHEDULED);
    const buttons = fixture.debugElement.queryAll(By.css('.actions-row button'));
    const enabledButtons = buttons.filter(b => !(b.nativeElement as HTMLButtonElement).disabled);
    expect(enabledButtons.length).toBeGreaterThanOrEqual(2);
  });

  // 5. disabled buttons + helper text when not SCHEDULED
  it('shows disabled buttons and .actions-helper-text when status is CANCELLED', async () => {
    await setup(STUB_CANCELLED);
    const helperText = fixture.debugElement.query(By.css('.actions-helper-text'));
    expect(helperText).not.toBeNull();
    const buttons = fixture.debugElement.queryAll(By.css('.actions-row button[disabled]'));
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  // 6. .audit-entry items render
  it('renders .audit-entry elements for each audit record', async () => {
    await setup();
    const entries = fixture.debugElement.queryAll(By.css('.audit-entry'));
    expect(entries.length).toBe(STUB_AUDIT.length);
  });

  // 7. .audit-unavailable on searchAudit error
  it('shows .audit-unavailable when searchAudit fails', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_SCHEDULED));
    appointmentServiceStub.searchAudit.mockReturnValue(throwError(() => new Error('audit error')));

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-42' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
    fixture.detectChanges();

    const unavail = fixture.debugElement.query(By.css('.audit-unavailable'));
    expect(unavail).not.toBeNull();
  });

  // 8. opens .reschedule-modal
  it('opens .reschedule-modal when Reschedule button clicked', async () => {
    await setup();
    component.openReschedule();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(By.css('.reschedule-modal'));
    expect(modal).not.toBeNull();
  });

  // 9. closes reschedule modal
  it('closes .reschedule-modal when Cancel clicked', async () => {
    await setup();
    component.openReschedule();
    fixture.detectChanges();
    const cancelBtn = fixture.debugElement.query(By.css('.reschedule-modal .btn-secondary'));
    cancelBtn?.nativeElement.click();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(By.css('.reschedule-modal'));
    expect(modal).toBeNull();
  });

  // 10. calls rescheduleAppointment on submit
  it('calls rescheduleAppointment with appointmentId on valid reschedule submit', async () => {
    await setup();
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00:00Z',
      scheduledEndDateTime: '2026-05-02T10:00:00Z',
      reason: 'CUSTOMER_REQUEST',
    });
    component.submitReschedule();
    expect(appointmentServiceStub.rescheduleAppointment).toHaveBeenCalledWith(
      'appt-42',
      expect.objectContaining({ scheduledStartDateTime: '2026-05-02T09:00:00Z' }),
    );
  });

  // 11. .success-banner after reschedule
  it('shows .success-banner after successful reschedule', async () => {
    await setup();
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00:00Z',
      scheduledEndDateTime: '2026-05-02T10:00:00Z',
      reason: '',
    });
    component.submitReschedule();
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.css('.success-banner'));
    expect(banner).not.toBeNull();
  });

  // 12. .conflict-panel on 409
  it('shows .conflict-panel with .hard-conflict and .soft-conflict on 409 conflict response', async () => {
    await setup();
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({
        status: 409,
        error: { conflicts: [HARD_CONFLICT, SOFT_CONFLICT] },
      })),
    );
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00:00Z',
      scheduledEndDateTime: '2026-05-02T10:00:00Z',
      reason: '',
    });
    component.submitReschedule();
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(panel).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.hard-conflict'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.soft-conflict'))).not.toBeNull();
  });

  // 13. .error-banner in reschedule modal on non-conflict error
  it('shows .error-banner in reschedule modal on generic server error', async () => {
    await setup();
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Internal error' } })),
    );
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00:00Z',
      scheduledEndDateTime: '2026-05-02T10:00:00Z',
      reason: '',
    });
    component.submitReschedule();
    fixture.detectChanges();
    const error = fixture.debugElement.query(By.css('.reschedule-modal .error-banner'));
    expect(error).not.toBeNull();
  });

  // 14. opens .cancel-modal
  it('opens .cancel-modal when Cancel Appointment button clicked', async () => {
    await setup();
    component.openCancel();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(By.css('.cancel-modal'));
    expect(modal).not.toBeNull();
  });

  // 15. calls cancelAppointment on submit
  it('calls cancelAppointment with appointmentId and form values on submit', async () => {
    await setup();
    component.openCancel();
    component.cancelForm.setValue({
      cancellationReason: 'WEATHER',
      notes: 'Storm incoming',
    });
    component.submitCancel();
    expect(appointmentServiceStub.cancelAppointment).toHaveBeenCalledWith(
      'appt-42',
      expect.objectContaining({ cancellationReason: 'WEATHER', notes: 'Storm incoming' }),
    );
  });

  // 16. .success-banner after cancel
  it('shows .success-banner after successful cancel', async () => {
    await setup();
    component.openCancel();
    component.cancelForm.setValue({ cancellationReason: 'WEATHER', notes: '' });
    component.submitCancel();
    fixture.detectChanges();
    const banner = fixture.debugElement.query(By.css('.success-banner'));
    expect(banner).not.toBeNull();
  });

  // 17. .error-banner in cancel modal on error
  it('shows .error-banner in cancel modal on API error', async () => {
    await setup();
    appointmentServiceStub.cancelAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Cannot cancel' } })),
    );
    component.openCancel();
    component.cancelForm.setValue({ cancellationReason: 'OTHER', notes: '' });
    component.submitCancel();
    fixture.detectChanges();
    const error = fixture.debugElement.query(By.css('.cancel-modal .error-banner'));
    expect(error).not.toBeNull();
  });
});
