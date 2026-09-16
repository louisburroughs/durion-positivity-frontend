import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentConflictOverridePageComponent } from './appointment-conflict-override-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../../../core/services/auth.service';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail } from '../../models/appointment.models';

/** CAP-326: a booking that warned — one SOFT conflict recorded, still overridable. */
const APPOINTMENT_WITH_SOFT_CONFLICT = {
  appointmentId: 'appt-1',
  status: 'SCHEDULED',
  facilityId: 'loc-1',
  conflicts: [
    {
      conflictId: 'conf-1',
      code: 'FACILITY_NEAR_CAPACITY',
      message: 'Booking puts the shop at 90% of its bays.',
      severity: 'SOFT',
      overridable: true,
      overridden: false,
    },
  ],
};

/** Permissions known and the override authority held, unless a test narrows it. */
const authStub = {
  known: true,
  granted: ['shop:conflict:override'] as readonly string[],
  permissionsKnown(): boolean {
    return this.known;
  },
  hasAnyPermission(required: readonly string[]): boolean {
    return required.some(code => this.granted.includes(code));
  },
};

const stubService = {
  getAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  executeOverride: vi.fn(),
};

describe('AppointmentConflictOverridePageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<AppointmentConflictOverridePageComponent>;
  let component: AppointmentConflictOverridePageComponent;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));
    stubService.rescheduleAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.executeOverride.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentConflictOverridePageComponent);
    component = fixture.componentInstance;
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

  it('calls getAppointment on init with route param id', async () => {
    await setup();
    expect(stubService.getAppointment).toHaveBeenCalledWith('appt-1');
  });

  it('renders .appointment-summary', async () => {
    await setup();
    const summary = fixture.debugElement.query(By.css('.appointment-summary'));
    expect(summary).toBeTruthy();
  });

  it('shows .reschedule-form', async () => {
    await setup();
    const form = fixture.debugElement.query(By.css('.reschedule-form'));
    expect(form).toBeTruthy();
  });

  it('calls rescheduleAppointment on submit', async () => {
    await setup();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-04-01T09:00',
      scheduledEndDateTime: '2026-04-01T10:00',
      reason: 'Customer request',
    });
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.submit-reschedule-btn'));
    button.nativeElement.click();

    expect(stubService.rescheduleAppointment).toHaveBeenCalledWith('appt-1', {
      scheduledStartDateTime: '2026-04-01T09:00',
      scheduledEndDateTime: '2026-04-01T10:00',
      reason: 'Customer request',
    });
  });

  it('shows .conflict-panel when reschedule returns 409 with conflicts', async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.rescheduleAppointment.mockReturnValue(
      throwError(() =>
        new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: { conflicts: [{ severity: 'HARD', code: 'OVERLAP', message: 'Overlapping appointment' }] },
        }),
      ),
    );
    stubService.executeOverride.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentConflictOverridePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-04-01T09:00',
      scheduledEndDateTime: '2026-04-01T10:00',
      reason: 'Customer request',
    });

    component.submitReschedule();
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(panel).toBeTruthy();
  });

  it('lists the conflicts recorded against the appointment and offers the override', async () => {
    await setup();

    const recorded = fixture.debugElement.query(By.css('.recorded-conflicts'));
    expect(recorded).toBeTruthy();
    expect(recorded.nativeElement.textContent).toContain('FACILITY_NEAR_CAPACITY');
    expect(fixture.debugElement.query(By.css('.enable-override-btn'))).toBeTruthy();
  });

  it('a refused reschedule shows the HARD hint and no override button, whatever is recorded (CAP-326)', async () => {
    vi.clearAllMocks();
    // A recorded SOFT conflict is overridable, but the refused attempt is not what it overrides.
    stubService.getAppointment.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));
    stubService.rescheduleAppointment.mockReturnValue(
      throwError(() =>
        new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: { conflicts: [{ severity: 'HARD', code: 'BAY_DOUBLE_BOOKED', message: 'Bay is booked' }] },
        }),
      ),
    );
    stubService.executeOverride.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentConflictOverridePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.rescheduleForm.setValue({
      scheduledStartDateTime: '2026-04-01T09:00',
      scheduledEndDateTime: '2026-04-01T10:00',
      reason: 'Customer request',
    });
    component.submitReschedule();
    fixture.detectChanges();

    expect(component.hasHardConflict()).toBe(true);
    expect(fixture.debugElement.query(By.css('.conflict-panel .conflict-hint'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.conflict-panel .enable-override-btn'))).toBeNull();
    // The recorded conflict keeps its own override entry point.
    expect(fixture.debugElement.query(By.css('.recorded-conflicts .enable-override-btn'))).toBeTruthy();
  });

  it('a 409 on override names the stale state and re-reads the appointment (CONFLICT_ALREADY_OVERRIDDEN)', async () => {
    await setup();
    stubService.executeOverride.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict', error: { code: 'CONFLICT_ALREADY_OVERRIDDEN' } })),
    );
    const loadsBefore = stubService.getAppointment.mock.calls.length;
    component.enableOverrideMode();
    component.overrideForm.setValue({ overrideReason: 'Manager approval granted' });
    component.submitOverride();

    expect(component.overrideError()).toBe('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.ALREADY_OVERRIDDEN');
    expect(component.overrideMode()).toBe(false);
    expect(stubService.getAppointment.mock.calls.length).toBe(loadsBefore + 1);
  });

  it('a 409 with any other code is the generic failure, still re-reading the appointment', async () => {
    await setup();
    stubService.executeOverride.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict', error: { errorCode: 'SCHEDULING_CONFLICT' } })),
    );
    const loadsBefore = stubService.getAppointment.mock.calls.length;
    component.enableOverrideMode();
    component.overrideForm.setValue({ overrideReason: 'Manager approval granted' });
    component.submitOverride();

    expect(component.overrideError()).toBe('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.OVERRIDE');
    expect(stubService.getAppointment.mock.calls.length).toBe(loadsBefore + 1);
  });

  it('a late read for a previous :id never overwrites the appointment now in the route', async () => {
    vi.clearAllMocks();
    const params = new Subject<{ id: string }>();
    const lateA = new Subject<AppointmentDetail>();
    stubService.getAppointment.mockImplementation((id: string) =>
      id === 'appt-A' ? lateA.asObservable() : of({ ...APPOINTMENT_WITH_SOFT_CONFLICT, appointmentId: 'appt-B' }),
    );
    stubService.rescheduleAppointment.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));
    stubService.executeOverride.mockReturnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppointmentConflictOverridePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    params.next({ id: 'appt-A' }); // still loading
    params.next({ id: 'appt-B' }); // answered synchronously
    expect(component.appointment()?.appointmentId).toBe('appt-B');

    lateA.next({ ...APPOINTMENT_WITH_SOFT_CONFLICT, appointmentId: 'appt-A' });
    lateA.complete();
    expect(component.appointment()?.appointmentId).toBe('appt-B');
  });

  it('calls executeOverride with the recorded conflict ids and the reason (CAP-326 D18.3)', async () => {
    await setup();
    component.enableOverrideMode();
    component.overrideForm.setValue({ overrideReason: 'Manager approval granted' });
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.submit-override-btn'));
    button.nativeElement.click();

    expect(stubService.executeOverride).toHaveBeenCalledWith('appt-1', {
      conflictIds: ['conf-1'],
      overrideReason: 'Manager approval granted',
    });
  });

  it('offers no override to a caller without shop:conflict:override, whatever is recorded (CAP-326 D12)', async () => {
    authStub.granted = ['appointments:reschedule'];
    try {
      await setup();
      expect(fixture.debugElement.query(By.css('.recorded-conflicts'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('.enable-override-btn'))).toBeNull();
      expect(component.canOverride()).toBe(false);
    } finally {
      authStub.granted = ['shop:conflict:override'];
    }
  });

  it('offers no override when nothing recorded is overridable', async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(
      of({ ...APPOINTMENT_WITH_SOFT_CONFLICT, conflicts: [{ ...APPOINTMENT_WITH_SOFT_CONFLICT.conflicts[0], overridable: false, overridden: true }] }),
    );
    stubService.rescheduleAppointment.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));
    stubService.executeOverride.mockReturnValue(of(APPOINTMENT_WITH_SOFT_CONFLICT));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentConflictOverridePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.recorded-conflicts'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.enable-override-btn'))).toBeNull();
    component.enableOverrideMode();
    component.overrideForm.setValue({ overrideReason: 'Nothing left' });
    component.submitOverride();
    expect(stubService.executeOverride).not.toHaveBeenCalled();
    expect(component.overrideError()).toBe('SHOPMGMT.APPOINTMENT_CONFLICT_OVERRIDE.ERROR.NOTHING_TO_OVERRIDE');
  });
});
