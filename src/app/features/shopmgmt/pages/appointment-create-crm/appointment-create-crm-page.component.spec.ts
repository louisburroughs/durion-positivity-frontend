/**
 * AppointmentCreateCrmPageComponent unit tests — CAP-137 story #139
 *
 * Route: /app/shopmgmt/appointments/new/crm
 * Selector: app-appointment-create-crm-page
 *
 * Covers:
 *   1.  renders without crashing
 *   2.  pre-fills locationId, crmCustomerId, crmVehicleId from query params
 *   3.  renders crmCustomerId, crmVehicleId, locationId, startAt, endAt inputs
 *   4.  submit button disabled when required fields are empty
 *   5.  addServiceRequest() adds a service request input row
 *   6.  removeServiceRequest(i) removes the row at that index
 *   7.  calls createAppointment with correct payload on valid submit
 *   8.  createAppointment called with an Idempotency-Key (clientRequestId present)
 *   9.  navigates to /app/shopmgmt/appointments/:id on success
 *   10. shows .error-banner on API error
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { AppointmentCreateCrmPageComponent } from './appointment-create-crm-page.component';
import { AppointmentService } from '../../services/appointment.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const STUB_CREATED = { appointmentId: 'appt-new-1', status: 'SCHEDULED', facilityId: 'fac-1' };

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

describe('AppointmentCreateCrmPageComponent [CAP-137]', () => {
  let fixture: ComponentFixture<AppointmentCreateCrmPageComponent>;
  let component: AppointmentCreateCrmPageComponent;
  let router: Router;

  const setup = async (queryParams = {}) => {
    vi.clearAllMocks();
    appointmentServiceStub.createAppointment.mockReturnValue(of(STUB_CREATED));

    await TestBed.configureTestingModule({
      imports: [AppointmentCreateCrmPageComponent],
      providers: [
        provideRouter([]),
        { provide: AppointmentService, useValue: appointmentServiceStub },
        { provide: ActivatedRoute, useValue: { queryParams: of(queryParams) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppointmentCreateCrmPageComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
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

  // 2. pre-fills from query params
  it('pre-fills locationId, crmCustomerId, crmVehicleId from query params', async () => {
    await setup({ locationId: 'loc-5', crmCustomerId: 'crm-cust-1', crmVehicleId: 'crm-veh-1' });
    expect(component.createForm.value.locationId).toBe('loc-5');
    expect(component.createForm.value.crmCustomerId).toBe('crm-cust-1');
    expect(component.createForm.value.crmVehicleId).toBe('crm-veh-1');
  });

  // 3. renders required inputs
  it('renders crmCustomerId, crmVehicleId, locationId, startAt, endAt inputs', async () => {
    await setup();
    expect(fixture.debugElement.query(By.css('input[name="crmCustomerId"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="crmVehicleId"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="locationId"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="startAt"]'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('input[name="endAt"]'))).not.toBeNull();
  });

  // 4. submit disabled when required fields empty
  it('submit button is disabled when required fields are empty', async () => {
    await setup();
    const btn = fixture.debugElement.query(By.css('button[type="submit"]'));
    expect((btn.nativeElement as HTMLButtonElement).disabled).toBe(true);
  });

  // 5. addServiceRequest adds a row
  it('addServiceRequest() adds a service request input row', async () => {
    await setup();
    component.addServiceRequest();
    fixture.detectChanges();
    const rows = fixture.debugElement.queryAll(By.css('.service-request-row'));
    expect(rows.length).toBe(1);
  });

  // 6. removeServiceRequest removes the row
  it('removeServiceRequest(0) removes the row at index 0', async () => {
    await setup();
    component.addServiceRequest();
    component.addServiceRequest();
    fixture.detectChanges();
    component.removeServiceRequest(0);
    fixture.detectChanges();
    const rows = fixture.debugElement.queryAll(By.css('.service-request-row'));
    expect(rows.length).toBe(1);
  });

  // 7. calls createAppointment with correct payload
  it('calls createAppointment with correct body on valid submit', async () => {
    await setup();
    component.createForm.setValue({
      crmCustomerId: 'crm-c1',
      crmVehicleId: 'crm-v1',
      locationId: 'loc-5',
      resourceId: '',
      startAt: '2026-05-01T09:00',
      endAt: '2026-05-01T10:00',
      serviceRequests: [],
    });
    component.submit();
    expect(appointmentServiceStub.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        facilityId: 'loc-5',
        scheduledStartDateTime: '2026-05-01T09:00',
      }),
      expect.any(String),
    );
  });

  // 8. idempotency key passed
  it('passes a non-empty idempotency key string to createAppointment', async () => {
    await setup();
    component.createForm.setValue({
      crmCustomerId: 'crm-c1',
      crmVehicleId: 'crm-v1',
      locationId: 'loc-5',
      resourceId: '',
      startAt: '2026-05-01T09:00',
      endAt: '2026-05-01T10:00',
      serviceRequests: [],
    });
    component.submit();
    const [, idempotencyKey] = appointmentServiceStub.createAppointment.mock.calls[0];
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(0);
  });

  // 9. navigates on success
  it('navigates to /app/shopmgmt/appointments/:id on success', async () => {
    await setup();
    component.createForm.setValue({
      crmCustomerId: 'crm-c1',
      crmVehicleId: 'crm-v1',
      locationId: 'loc-5',
      resourceId: '',
      startAt: '2026-05-01T09:00',
      endAt: '2026-05-01T10:00',
      serviceRequests: [],
    });
    component.submit();
    expect(router.navigate).toHaveBeenCalledWith(['/app/shopmgmt/appointments', 'appt-new-1']);
  });

  // 10. shows .error-banner on API error
  it('shows .error-banner when createAppointment returns an error', async () => {
    await setup();
    appointmentServiceStub.createAppointment.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 422, error: { message: 'Slot unavailable' } })),
    );
    component.createForm.setValue({
      crmCustomerId: 'crm-c1',
      crmVehicleId: 'crm-v1',
      locationId: 'loc-5',
      resourceId: '',
      startAt: '2026-05-01T09:00',
      endAt: '2026-05-01T10:00',
      serviceRequests: [],
    });
    component.submit();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.error-banner'))).not.toBeNull();
  });
});
