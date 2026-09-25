/**
 * AppointmentEditPageComponent unit tests — CAP-137 / CAP-249 (#332)
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
 *   6.  shows .audit-entry items when audit loads, translated event + NOT_AVAILABLE actor
 *   7.  shows .audit-unavailable when searchAudit fails
 *   8.  opens .reschedule-modal when Reschedule button clicked
 *   9.  closes reschedule modal when Cancel button clicked, and returns focus to the opener
 *   10. calls rescheduleAppointment with appointmentId and a converted UTC instant on valid submit
 *   11. shows .success-banner after successful reschedule
 *   12. shows .conflict-panel with .hard-conflict / .soft-conflict on 409
 *   13. shows .error-banner in reschedule modal on non-conflict error (localized key, not server prose)
 *   14. opens .cancel-modal when Cancel Appointment button clicked
 *   15. calls cancelAppointment with appointmentId and form values on submit
 *   16. shows .success-banner after successful cancel
 *   17. shows .error-banner in cancel modal on error
 *   18. renders an error state when the initial load fails (state()/errorKey(), no raw status/facility)
 *   19. resolves the facility name the way schedule-view/dispatch-board do, falling back to NOT_AVAILABLE
 *   20. never renders the raw status enum, a timestamp, or a UUID as visible text
 *   21. reschedule reason select only offers the RescheduleAppointmentRequest enum values (#359 review)
 *   22. resets rescheduleLoading/showRescheduleModal/success/errors/conflicts on a route change
 *       mid-submit, leaving the next appointment idle rather than stuck (ADR-0063 §3)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentEditPageComponent } from './appointment-edit-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { AppointmentService } from '../../services/appointment.service';
import { RESCHEDULE_REASON_CODES } from '../../models/appointment.models';

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
  {
    id: 'a1',
    eventType: 'SCHEDULE_CREATED',
    actorUserId: 'user-1',
    recordedAt: '2026-05-01T08:00:00Z',
    changeSummaryText: 'Appointment booked',
    retentionYears: 7,
  },
];

const HARD_CONFLICT = { severity: 'HARD', code: 'FACILITY_CLOSED', message: 'Facility is closed.', overridable: false };
const SOFT_CONFLICT = { severity: 'SOFT', code: 'BAY_DOUBLE_BOOKED', message: 'Preferred slot occupied.', overridable: true };

// ---------------------------------------------------------------------------
// Service stub
// ---------------------------------------------------------------------------

const appointmentServiceStub = {
  getAppointment: vi.fn(),
  getFacilityName: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  searchAudit: vi.fn(),
  createAppointment: vi.fn(),
  executeOverride: vi.fn(),
  viewSchedule: vi.fn(),
};

/** Permissions known and both write authorities held, unless a test narrows it (ADR-0040 §6a). */
const authStub = {
  known: true,
  granted: ['appointments:reschedule', 'appointments:cancel'] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('AppointmentEditPageComponent [CAP-137/#332]', () => {
  let fixture: ComponentFixture<AppointmentEditPageComponent>;
  let component: AppointmentEditPageComponent;

  const setup = async (apptStub: Record<string, unknown> = STUB_SCHEDULED) => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(apptStub));
    appointmentServiceStub.getFacilityName.mockReturnValue(of('Downtown Shop'));
    appointmentServiceStub.searchAudit.mockReturnValue(of(STUB_AUDIT));
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(of(STUB_SCHEDULED));
    appointmentServiceStub.cancelAppointment.mockReturnValue(of(STUB_CANCELLED));

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-42' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.clearAllMocks();
    authStub.known = true;
    authStub.granted = ['appointments:reschedule', 'appointments:cancel'];
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

  // 5b. write-permission gating (ADR-0040 §6a) — independent of the route's read permission
  it('disables Reschedule and refuses openReschedule/submitReschedule when appointments:reschedule is not granted', async () => {
    authStub.granted = ['appointments:cancel'];
    try {
      await setup(STUB_SCHEDULED);
      const rescheduleBtn = fixture.debugElement.queryAll(By.css('.actions-row button'))[0].nativeElement as HTMLButtonElement;
      expect(rescheduleBtn.disabled).toBe(true);

      component.openReschedule();
      expect(component.showRescheduleModal()).toBe(false);

      component.rescheduleForm.setValue({
        scheduledStartDateTime: '2026-05-02T09:00',
        scheduledEndDateTime: '2026-05-02T10:00',
        reason: 'CUSTOMER_REQUEST',
      });
      component.submitReschedule();
      expect(appointmentServiceStub.rescheduleAppointment).not.toHaveBeenCalled();
    } finally {
      authStub.granted = ['appointments:reschedule', 'appointments:cancel'];
    }
  });

  it('disables Cancel and refuses openCancel/submitCancel when appointments:cancel is not granted', async () => {
    authStub.granted = ['appointments:reschedule'];
    try {
      await setup(STUB_SCHEDULED);
      const cancelBtn = fixture.debugElement.queryAll(By.css('.actions-row button'))[1].nativeElement as HTMLButtonElement;
      expect(cancelBtn.disabled).toBe(true);

      component.openCancel();
      expect(component.showCancelModal()).toBe(false);

      component.cancelForm.setValue({ cancellationReason: 'OTHER', notes: '' });
      component.submitCancel();
      expect(appointmentServiceStub.cancelAppointment).not.toHaveBeenCalled();
    } finally {
      authStub.granted = ['appointments:reschedule', 'appointments:cancel'];
    }
  });

  it('splits the two write authorities — granting only appointments:reschedule enables Reschedule but not Cancel', async () => {
    authStub.granted = ['appointments:reschedule'];
    try {
      await setup(STUB_SCHEDULED);
      const buttons = fixture.debugElement.queryAll(By.css('.actions-row button'));
      expect((buttons[0].nativeElement as HTMLButtonElement).disabled).toBe(false);
      expect((buttons[1].nativeElement as HTMLButtonElement).disabled).toBe(true);
    } finally {
      authStub.granted = ['appointments:reschedule', 'appointments:cancel'];
    }
  });

  it('treats unknown permissions (legacy token, no perm_bits claim) as granted, matching canAccess()', async () => {
    authStub.known = false;
    authStub.granted = [];
    try {
      await setup(STUB_SCHEDULED);
      const buttons = fixture.debugElement.queryAll(By.css('.actions-row button'));
      expect((buttons[0].nativeElement as HTMLButtonElement).disabled).toBe(false);
      expect((buttons[1].nativeElement as HTMLButtonElement).disabled).toBe(false);
    } finally {
      authStub.known = true;
      authStub.granted = ['appointments:reschedule', 'appointments:cancel'];
    }
  });

  // 6. .audit-entry items render, translated event + NOT_AVAILABLE actor
  it('renders .audit-entry elements for each audit record, never the raw actor id', async () => {
    await setup();
    const entries = fixture.debugElement.queryAll(By.css('.audit-entry'));
    expect(entries.length).toBe(STUB_AUDIT.length);

    // The actor is a person id (`actorUserId`) with no resolution service in this domain — it must
    // never appear on screen (ADR-0064 §5); appointment-edit-page.i18n.spec.ts asserts the event
    // renders as real translated prose, not the raw `eventType` code.
    const entry = entries[0].nativeElement as HTMLElement;
    expect(entry.textContent).not.toContain('user-1');
    const actor = entry.querySelector('.audit-actor');
    expect(actor?.textContent?.trim().length).toBeGreaterThan(0);
  });

  // 7. .audit-unavailable on searchAudit error
  it('shows .audit-unavailable when searchAudit fails', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_SCHEDULED));
    appointmentServiceStub.getFacilityName.mockReturnValue(of('Downtown Shop'));
    appointmentServiceStub.searchAudit.mockReturnValue(throwError(() => new Error('audit error')));

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: AuthService, useValue: authStub },
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
    expect(modal.nativeElement.tagName).toBe('DIALOG');
    expect((modal.nativeElement as HTMLDialogElement).matches(':modal')).toBe(true);
    expect(modal.nativeElement.getAttribute('aria-labelledby')).toBe('reschedule-modal-title');
  });

  // 9. closes reschedule modal, having trapped focus inside while open (ADR-0029 §9)
  it('closes .reschedule-modal when Cancel clicked, after trapping focus inside it while open', async () => {
    await setup();
    const openBtn = fixture.debugElement.queryAll(By.css('.actions-row button'))[0].nativeElement as HTMLButtonElement;
    openBtn.focus();
    openBtn.click();
    fixture.detectChanges();
    // showModal() moves focus inside the dialog; give the browser's focus handling a turn before
    // asserting on it (Chromium can settle this a tick after the synchronous call stack).
    await new Promise(resolve => setTimeout(resolve));
    const modalWhileOpen = fixture.debugElement.query(By.css('.reschedule-modal'));
    const dialogEl = modalWhileOpen!.nativeElement as HTMLDialogElement;
    // The `:modal` assertion in test 8 covers top-layer promotion; this covers the other half of
    // "no aria-modal-on-a-div" (ADR-0029 §8.1) — a real focus trap, not merely the pseudo-class.
    expect(dialogEl.contains(document.activeElement)).toBe(true);

    const cancelBtn = fixture.debugElement.query(By.css('.reschedule-modal .btn-secondary'));
    cancelBtn?.nativeElement.click();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));

    const modal = fixture.debugElement.query(By.css('.reschedule-modal'));
    expect(modal).toBeNull();
    expect(dialogEl.open).toBe(false);
    // `ModalDialogDirective.ngOnDestroy` restores focus to the element that had it before
    // `showModal()` ran (ADR-0029 §9) — asserted directly rather than only inferring it from the
    // dialog being closed.
    expect(document.activeElement).toBe(openBtn);
  });

  // 10. calls rescheduleAppointment with a converted UTC instant on submit
  it('calls rescheduleAppointment with appointmentId and the datetime-local value converted to UTC', async () => {
    await setup();
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00',
      scheduledEndDateTime: '2026-05-02T10:00',
      reason: 'CUSTOMER_REQUEST',
    });
    component.submitReschedule();

    // Same local-time construction the component's fromDatetimeLocalValue uses, so the
    // assertion holds regardless of the test runner's own timezone (ADR-0038 §7).
    const expectedStart = new Date(2026, 4, 2, 9, 0).toISOString();
    expect(appointmentServiceStub.rescheduleAppointment).toHaveBeenCalledWith(
      'appt-42',
      expect.objectContaining({ scheduledStartDateTime: expectedStart }),
    );
  });

  // 11. .success-banner after reschedule
  it('shows .success-banner after successful reschedule', async () => {
    await setup();
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00',
      scheduledEndDateTime: '2026-05-02T10:00',
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
      scheduledStartDateTime: '2026-05-02T09:00',
      scheduledEndDateTime: '2026-05-02T10:00',
      reason: '',
    });
    component.submitReschedule();
    fixture.detectChanges();
    const panel = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(panel).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.hard-conflict'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.soft-conflict'))).not.toBeNull();
    // The panel shows the localized conflict key, never the server's own message text.
    expect(fixture.nativeElement.textContent).not.toContain(HARD_CONFLICT.message);
  });

  // 13. .error-banner in reschedule modal on non-conflict error
  it('shows a localized .error-banner in the reschedule modal on a generic server error, never the server message', async () => {
    await setup();
    appointmentServiceStub.rescheduleAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, error: { message: 'Internal error' } })),
    );
    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00',
      scheduledEndDateTime: '2026-05-02T10:00',
      reason: '',
    });
    component.submitReschedule();
    fixture.detectChanges();
    const error = fixture.debugElement.query(By.css('.reschedule-modal .error-banner'));
    expect(error).not.toBeNull();
    expect(error.nativeElement.textContent).not.toContain('Internal error');
  });

  // 14. opens .cancel-modal
  it('opens .cancel-modal when Cancel Appointment button clicked', async () => {
    await setup();
    component.openCancel();
    fixture.detectChanges();
    const modal = fixture.debugElement.query(By.css('.cancel-modal'));
    expect(modal).not.toBeNull();
    expect(modal.nativeElement.tagName).toBe('DIALOG');
    expect((modal.nativeElement as HTMLDialogElement).matches(':modal')).toBe(true);
    expect(modal.nativeElement.getAttribute('aria-labelledby')).toBe('cancel-modal-title');
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
  it('shows a localized .error-banner in the cancel modal on API error, never the server message', async () => {
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
    expect(error.nativeElement.textContent).not.toContain('Cannot cancel');
  });

  // 18. load-error state
  it('renders an error state via state()/errorKey() when the initial load fails', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-42' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('SHOPMGMT.APPOINTMENT_EDIT.ERROR.LOAD_NOT_FOUND');
    expect(fixture.debugElement.query(By.css('.load-error'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.appointment-summary'))).toBeNull();
  });

  // 19. facility resolution
  it('resolves the facility name via getFacilityName and falls back to COMMON.NOT_AVAILABLE', async () => {
    await setup();
    expect(appointmentServiceStub.getFacilityName).toHaveBeenCalledWith('fac-1');
    const rows = fixture.debugElement.queryAll(By.css('.summary-row .value'));
    const facilityValue = rows[rows.length - 1].nativeElement.textContent;
    expect(facilityValue).toContain('Downtown Shop');
  });

  it('falls back to COMMON.NOT_AVAILABLE when the facility name cannot be resolved', async () => {
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValue(of(STUB_SCHEDULED));
    appointmentServiceStub.getFacilityName.mockReturnValue(of(undefined));
    appointmentServiceStub.searchAudit.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-42' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('fac-1');
  });

  // 20. no raw UUID/timestamp anywhere on the ready page (status-code coverage lives in the
  // .i18n.spec.ts, which loads the real bundles rather than this suite's key-echoing fake loader)
  it('never renders the appointment UUID or a raw ISO timestamp as visible text', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('appt-42');
    expect(text).not.toContain('2026-05-01T09:00:00Z');
  });

  // 21. reschedule reason is enum-backed, never free text (#359 review)
  it('renders the reschedule reason as a select offering only the RescheduleAppointmentRequest enum values', async () => {
    await setup();
    component.openReschedule();
    fixture.detectChanges();

    // The reason field must be a <select>, not a free-text input the SDK's
    // RescheduleAppointmentRequestReasonEnum could never accept.
    expect(fixture.nativeElement.querySelector('input[name="reason"]')).toBeNull();
    const select: HTMLSelectElement | null = fixture.nativeElement.querySelector('select[name="reason"]');
    expect(select).not.toBeNull();

    const values = Array.from(select!.options).map(o => o.value).filter(v => v !== '');
    expect(values).toEqual([...RESCHEDULE_REASON_CODES]);
    // Every value must be a real enum member — no stray literal snuck in alongside them.
    values.forEach(v => expect(RESCHEDULE_REASON_CODES).toContain(v));
  });

  // 22. resets mutation state on a route change mid-submit (ADR-0063 §3)
  it('resets rescheduleLoading/showRescheduleModal/success/errors/conflicts on a route change mid-submit, leaving the next appointment idle (ADR-0063 §3)', async () => {
    const params$ = new Subject<{ id: string }>();
    const reschedule$ = new Subject<typeof STUB_SCHEDULED>();
    vi.clearAllMocks();
    appointmentServiceStub.getAppointment.mockReturnValueOnce(of(STUB_SCHEDULED));
    appointmentServiceStub.getFacilityName.mockReturnValue(of('Downtown Shop'));
    appointmentServiceStub.searchAudit.mockReturnValue(of(STUB_AUDIT));
    appointmentServiceStub.rescheduleAppointment.mockReturnValueOnce(reschedule$);

    await TestBed.configureTestingModule({
      imports: [AppointmentEditPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: params$ } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentEditPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    params$.next({ id: 'appt-42' });
    fixture.detectChanges();

    component.openReschedule();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-05-02T09:00',
      scheduledEndDateTime: '2026-05-02T10:00',
      reason: 'CUSTOMER_REQUEST',
    });
    component.submitReschedule();
    // A reschedule submit for appt-42 is now in flight.
    expect(component.rescheduleLoading()).toBe(true);
    expect(component.showRescheduleModal()).toBe(true);

    // The route moves to a different appointment before appt-42's reschedule answers.
    appointmentServiceStub.getAppointment.mockReturnValueOnce(of({ ...STUB_SCHEDULED, appointmentId: 'appt-99' }));
    appointmentServiceStub.searchAudit.mockReturnValueOnce(of([]));
    params$.next({ id: 'appt-99' });
    fixture.detectChanges();

    // appt-99's page must come up idle — no stale modal open, no stuck loading state, no stale results.
    expect(component.rescheduleLoading()).toBe(false);
    expect(component.showRescheduleModal()).toBe(false);
    expect(component.rescheduleSuccess()).toBe(false);
    expect(component.rescheduleErrorKey()).toBeNull();
    expect(component.rescheduleConflicts()).toEqual([]);
    expect(fixture.debugElement.query(By.css('.reschedule-modal'))).toBeNull();

    // The stale appt-42 answer now lands; it must not resurrect appt-99's reschedule state.
    reschedule$.next({ ...STUB_SCHEDULED, appointmentId: 'appt-42' });
    reschedule$.complete();
    fixture.detectChanges();
    expect(component.showRescheduleModal()).toBe(false);
    expect(component.rescheduleLoading()).toBe(false);
    expect(component.appointment()?.appointmentId).toBe('appt-99');
  });
});
