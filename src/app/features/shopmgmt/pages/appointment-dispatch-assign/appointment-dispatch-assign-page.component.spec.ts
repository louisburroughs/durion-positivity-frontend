import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentDispatchAssignPageComponent } from './appointment-dispatch-assign-page.component';
import { AppointmentService } from '../../services/appointment.service';

const stubService = {
  getAppointment: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
};

describe('AppointmentDispatchAssignPageComponent [CAP-138]', () => {
  let fixture: ComponentFixture<AppointmentDispatchAssignPageComponent>;
  let component: AppointmentDispatchAssignPageComponent;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setup = async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.listAssignments.mockReturnValue(of([
      { assignmentId: 'asn-1', assignmentType: 'BAY', mechanic: { mechanicId: 'm-1', displayName: 'Alex' } },
    ]));
    stubService.createAssignment.mockReturnValue(of({
      assignmentId: 'asn-2',
      assignmentType: 'BAY',
      mechanic: { mechanicId: 'm-2', displayName: 'Robin' },
    }));

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentDispatchAssignPageComponent);
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

  it('calls getAppointment and listAssignments on init', async () => {
    await setup();
    expect(stubService.getAppointment).toHaveBeenCalledWith('appt-1');
    expect(stubService.listAssignments).toHaveBeenCalledWith('appt-1');
  });

  it('renders .assignment-history with .assignment-item for each assignment', async () => {
    await setup();
    fixture.detectChanges();

    const history = fixture.debugElement.query(By.css('.assignment-history'));
    const items = fixture.debugElement.queryAll(By.css('.assignment-item'));
    expect(history).toBeTruthy();
    expect(items.length).toBe(1);
  });

  it('shows create form', async () => {
    await setup();
    const form = fixture.debugElement.query(By.css('.create-form'));
    expect(form).toBeTruthy();
  });

  it('calls createAssignment with appointmentId and form values', async () => {
    await setup();
    component.assignForm.setValue({
      resourceId: 'bay-2',
      mechanicId: 'mech-7',
      role: 'ASSIST',
    });

    const submitButton = fixture.debugElement.query(By.css('.submit-assignment-btn'));
    submitButton.nativeElement.click();

    expect(stubService.createAssignment).toHaveBeenCalledWith('appt-1', {
      resourceId: 'bay-2',
      mechanicId: 'mech-7',
      role: 'ASSIST',
    });
  });

  it('creates assignment with role=LEAD by default', async () => {
    await setup();
    component.assignForm.controls.resourceId.setValue('bay-3');
    component.assignForm.controls.mechanicId.setValue('mech-9');

    component.submitAssignment();

    expect(stubService.createAssignment).toHaveBeenCalledWith('appt-1', {
      resourceId: 'bay-3',
      mechanicId: 'mech-9',
      role: 'LEAD',
    });
  });

  it('shows .conflict-panel on 409 conflict response', async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.listAssignments.mockReturnValue(of([]));
    stubService.createAssignment.mockReturnValue(
      throwError(() =>
        new HttpErrorResponse({
          status: 409,
          statusText: 'Conflict',
          error: { conflicts: [{ type: 'SOFT', code: 'SKILL_GAP', message: 'Skill mismatch' }] },
        }),
      ),
    );

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentDispatchAssignPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    component.assignForm.setValue({
      resourceId: 'bay-4',
      mechanicId: 'mech-4',
      role: 'LEAD',
    });
    component.submitAssignment();
    fixture.detectChanges();

    const panel = fixture.debugElement.query(By.css('.conflict-panel'));
    expect(panel).toBeTruthy();
  });
});
