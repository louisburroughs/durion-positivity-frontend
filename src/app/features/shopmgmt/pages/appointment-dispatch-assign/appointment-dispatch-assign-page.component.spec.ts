import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentDispatchAssignPageComponent } from './appointment-dispatch-assign-page.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AppointmentService } from '../../services/appointment.service';
import type { AppointmentDetail } from '../../models/appointment.models';
import enUS from '../../../../../assets/i18n/en-US.json';

const stubService = {
  getAppointment: vi.fn(),
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
  getFacilityName: vi.fn(),
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
    stubService.getFacilityName.mockReturnValue(of('Downtown Shop'));

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent, TranslateModule.forRoot()],
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
      bayId: 'bay-2',
      assignmentType: 'ASSIST',
      mechanic: { mechanicId: 'mech-7' },
    });
  });

  it('creates assignment with role=LEAD by default', async () => {
    await setup();
    component.assignForm.controls.resourceId.setValue('bay-3');
    component.assignForm.controls.mechanicId.setValue('mech-9');

    component.submitAssignment();

    expect(stubService.createAssignment).toHaveBeenCalledWith('appt-1', {
      bayId: 'bay-3',
      assignmentType: 'LEAD',
      mechanic: { mechanicId: 'mech-9' },
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
          error: { conflicts: [{ severity: 'SOFT', code: 'SKILL_GAP', message: 'Skill mismatch' }] },
        }),
      ),
    );
    stubService.getFacilityName.mockReturnValue(of('Downtown Shop'));

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent, TranslateModule.forRoot()],
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

  // #358: the facility must be resolved and shown by name, never the raw locationId/facilityId UUID.
  it('resolves the facility name via getFacilityName and renders it', async () => {
    await setup();
    expect(stubService.getFacilityName).toHaveBeenCalledWith('loc-1');
    const header = fixture.debugElement.query(By.css('.appointment-header'));
    expect(header.nativeElement.textContent).toContain('Downtown Shop');
  });

  it('falls back to COMMON.NOT_AVAILABLE when the facility name cannot be resolved', async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.listAssignments.mockReturnValue(of([]));
    stubService.getFacilityName.mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentDispatchAssignPageComponent);
    component = fixture.componentInstance;
    // ADR-0035 §8: assert the real localized fallback, not merely the UUID's absence.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('loc-1');
    expect(fixture.nativeElement.textContent).toContain(enUS.COMMON.NOT_AVAILABLE);
  });

  it('never renders the facility/location UUID or a raw mechanic UUID as visible text', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('loc-1');
    expect(text).not.toContain('m-1');
  });

  it('falls back to COMMON.NOT_AVAILABLE for an assignment with no mechanic displayName, never the raw mechanicId', async () => {
    vi.clearAllMocks();
    stubService.getAppointment.mockReturnValue(of({ appointmentId: 'appt-1', status: 'SCHEDULED', facilityId: 'loc-1' }));
    stubService.listAssignments.mockReturnValue(of([
      { assignmentId: 'asn-1', assignmentType: 'BAY', mechanic: { mechanicId: 'm-unresolved' } },
    ]));
    stubService.getFacilityName.mockReturnValue(of('Downtown Shop'));

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: of({ id: 'appt-1' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentDispatchAssignPageComponent);
    component = fixture.componentInstance;
    // ADR-0035 §8: assert the real localized fallback, not merely the UUID's absence.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', enUS);
    translate.use('en-US');
    fixture.detectChanges();

    const assignmentItem = fixture.debugElement.query(By.css('.assignment-item'));
    expect(assignmentItem.nativeElement.textContent).not.toContain('m-unresolved');
    expect(assignmentItem.nativeElement.textContent).toContain(enUS.COMMON.NOT_AVAILABLE);
  });

  // PR #363 review: a route id revisited (A → B → A) must bump facilityLoadSeq on every entry,
  // not only inside loadFacilityName, so a facility lookup still in flight from the FIRST visit
  // to A can never land during the SECOND visit to A (ADR-0063 §1). Driven through Subjects
  // (ADR-0035 §6) so the race is exercised explicitly rather than resolved synchronously.
  it('a facility lookup pending from a previous visit to the same :id never overwrites the current one (A → B → A)', async () => {
    vi.clearAllMocks();
    const params = new Subject<{ id: string }>();
    const readB = new Subject<AppointmentDetail>();
    const readA2 = new Subject<AppointmentDetail>();
    const facilityA1 = new Subject<string | undefined>();
    const facilityCurrent = new Subject<string | undefined>();
    let appointmentACalls = 0;
    let facilityCalls = 0;

    stubService.listAssignments.mockReturnValue(of([]));
    stubService.getAppointment.mockImplementation((id: string) => {
      if (id === 'appt-A') {
        appointmentACalls++;
        // First visit to A resolves synchronously (issuing facility lookup A1); the second
        // visit's appointment read stays pending until the test resolves it.
        return appointmentACalls === 1
          ? of({ appointmentId: 'appt-A', status: 'SCHEDULED', facilityId: 'loc-1' })
          : readA2.asObservable();
      }
      // B's own appointment read never resolves in this test, so it never issues a facility
      // lookup of its own — the bug this guards against does not require one to.
      return readB.asObservable();
    });
    stubService.getFacilityName.mockImplementation(() => {
      facilityCalls++;
      return facilityCalls === 1 ? facilityA1.asObservable() : facilityCurrent.asObservable();
    });

    await TestBed.configureTestingModule({
      imports: [AppointmentDispatchAssignPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: stubService },
        { provide: ActivatedRoute, useValue: { params: params.asObservable() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppointmentDispatchAssignPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    params.next({ id: 'appt-A' }); // facility lookup A1 issued and left pending
    params.next({ id: 'appt-B' }); // its own appointment read is left pending too
    params.next({ id: 'appt-A' }); // back to A: a brand-new appointment read is now pending

    facilityA1.next('Stale Shop');
    facilityA1.complete();
    expect(component.facilityName()).not.toBe('Stale Shop');

    readA2.next({ appointmentId: 'appt-A', status: 'SCHEDULED', facilityId: 'loc-1' });
    readA2.complete();
    facilityCurrent.next('Current Shop');
    facilityCurrent.complete();
    expect(component.facilityName()).toBe('Current Shop');
  });
});
