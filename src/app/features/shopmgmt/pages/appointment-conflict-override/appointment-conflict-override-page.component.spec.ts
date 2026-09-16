import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentConflictOverridePageComponent } from './appointment-conflict-override-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';

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
          error: { conflicts: [{ type: 'HARD', code: 'OVERLAP', message: 'Overlapping appointment' }] },
        }),
      ),
    );
    stubService.executeOverride.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));

    await TestBed.configureTestingModule({
      imports: [AppointmentConflictOverridePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
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
