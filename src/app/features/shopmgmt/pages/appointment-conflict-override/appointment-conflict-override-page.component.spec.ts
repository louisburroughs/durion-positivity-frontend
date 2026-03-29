import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentConflictOverridePageComponent } from './appointment-conflict-override-page.component';
import { TranslateModule } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';

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
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
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

  it('calls executeOverride with overrideReason on override submit', async () => {
    await setup();
    component.enableOverrideMode();
    component.overrideForm.setValue({ overrideReason: 'Manager approval granted' });
    fixture.detectChanges();

    const button = fixture.debugElement.query(By.css('.submit-override-btn'));
    button.nativeElement.click();

    expect(stubService.executeOverride).toHaveBeenCalledWith('appt-1', {
      overrideReason: 'Manager approval granted',
    });
  });
});
