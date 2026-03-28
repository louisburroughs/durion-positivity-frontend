import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { EstimateFromAppointmentPageComponent } from './estimate-from-appointment-page.component';
import { WorkexecService } from '../../services/workexec.service';

const stubWorkexecService = {
  createEstimateFromAppointment: vi.fn(),
};

const stubRouter = {
  navigate: vi.fn().mockResolvedValue(true),
};

describe('EstimateFromAppointmentPageComponent [CAP-140]', () => {
  let fixture: ComponentFixture<EstimateFromAppointmentPageComponent>;
  let component: EstimateFromAppointmentPageComponent;

  const setup = async () => {
    vi.clearAllMocks();
    stubWorkexecService.createEstimateFromAppointment.mockReturnValue(of({ estimateId: 'est-1' }));

    await TestBed.configureTestingModule({
      imports: [EstimateFromAppointmentPageComponent],
      providers: [
        provideRouter([]),
        { provide: WorkexecService, useValue: stubWorkexecService },
        { provide: Router, useValue: stubRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimateFromAppointmentPageComponent);
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

  it('calls createEstimateFromAppointment on submit with form data', async () => {
    await setup();
    component.estimateForm.setValue({
      appointmentId: 'appt-1',
      workorderId: 'wo-2',
      notes: 'notes',
    });

    component.submit();

    expect(stubWorkexecService.createEstimateFromAppointment).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      workorderId: 'wo-2',
      notes: 'notes',
    });
  });

  it('navigates to /workexec/workorders on success', async () => {
    await setup();
    component.estimateForm.setValue({
      appointmentId: 'appt-1',
      workorderId: '',
      notes: '',
    });

    component.submit();

    expect(stubRouter.navigate).toHaveBeenCalledWith(['/workexec/workorders']);
  });

  it('shows .error-banner on failure', async () => {
    await setup();
    stubWorkexecService.createEstimateFromAppointment.mockReturnValueOnce(throwError(() => new Error('nope')));

    component.estimateForm.setValue({
      appointmentId: 'appt-1',
      workorderId: '',
      notes: '',
    });

    component.submit();
    fixture.detectChanges();

    const banner = fixture.debugElement.query(By.css('.error-banner'));
    expect(banner).toBeTruthy();
  });

  it('submit button disabled when appointmentId empty', async () => {
    await setup();
    component.estimateForm.setValue({ appointmentId: '', workorderId: '', notes: '' });
    fixture.detectChanges();

    const submit = fixture.debugElement.query(By.css('.submit-btn'));
    expect((submit.nativeElement as HTMLButtonElement).disabled).toBe(true);
  });
});
