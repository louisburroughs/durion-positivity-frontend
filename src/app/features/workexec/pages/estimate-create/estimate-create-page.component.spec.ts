import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateCreatePageComponent } from './estimate-create-page.component';
import { BASE_PATH } from '@durion-sdk/workorder';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;

describe('EstimateCreatePageComponent [Story 239]', () => {
  let fixture: ComponentFixture<EstimateCreatePageComponent>;
  let component: EstimateCreatePageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateCreatePageComponent],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
      ],
    }).compileComponents();

    fixture  = TestBed.createComponent(EstimateCreatePageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    // ngOnInit eagerly loads the customer list for the typeahead exactly once.
    // expectOne asserts the single init request (catches accidental double-loads)
    // and flushing it leaves each test a clean HTTP backend.
    http.expectOne(r => r.method === 'GET' && r.url.endsWith('/v1/crm')).flush({ content: [] });
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should start in idle state', () => {
    expect(component.state()).toBe('idle');
  });

  it('should show form heading', () => {
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(h1?.textContent).toContain('New Estimate');
  });

  it('should mark form invalid and not call service when fields empty', () => {
    component.submit();
    expect(component.state()).toBe('idle');
    http.expectNone(`${BASE}/v1/workorders/estimates`);
  });

  it('should transition to saving state and POST on valid submit', () => {
    component.form.setValue({
      customerId: 'cust-1',
      vehicleId: 'veh-1',
    });
    component.submit();
    expect(component.state()).toBe('saving');
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'est-new', status: 'DRAFT', customerId: 'cust-1', vehicleId: 'veh-1' });
  });

  it('should display access-denied message on 403', () => {
    component.form.setValue({ customerId: 'c', vehicleId: 'v' });
    component.submit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    req.flush({ code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(component.state()).toBe('access-denied');
  });

  it('should display error message on server error', () => {
    component.form.setValue({ customerId: 'c', vehicleId: 'v' });
    component.submit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    req.flush({ code: 'INTERNAL_ERROR', message: 'Server error' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toBe('Server error');
  });

  it('should reveal inline add-vehicle form when add option chosen', () => {
    expect(component.showAddVehicle()).toBe(false);
    component.onVehicleSelect(component.addVehicleOption);
    expect(component.showAddVehicle()).toBe(true);
    expect(component.form.controls.vehicleId.value).toBe('');
  });

  it('should not POST a new vehicle when VIN is empty', () => {
    component.form.patchValue({ customerId: 'cust-1' });
    component.onVehicleSelect(component.addVehicleOption);
    component.saveNewVehicle();
    expect(component.newVehicleForm.controls.vinNumber.touched).toBe(true);
    http.expectNone(r => r.method === 'POST' && /\/v1\/crm\/.+\/vehicles$/.test(r.url));
  });

  it('should POST new vehicle then select it on success', () => {
    component.form.patchValue({ customerId: 'cust-1' });
    component.onVehicleSelect(component.addVehicleOption);
    component.newVehicleForm.patchValue({ vinNumber: '1FTABC123', description: 'F-150' });

    component.saveNewVehicle();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/v1/crm/cust-1/vehicles'));
    expect(req.request.body).toEqual({ vinNumber: '1FTABC123', description: 'F-150' });
    req.flush({ vehicleId: 'veh-new', vin: '1FTABC123', make: 'Ford', model: 'F-150', year: 2019 });

    expect(component.customerVehicles().some(v => v.vehicleId === 'veh-new')).toBe(true);
    expect(component.form.controls.vehicleId.value).toBe('veh-new');
    expect(component.showAddVehicle()).toBe(false);
  });

  it('should surface an error when vehicle creation fails', () => {
    component.form.patchValue({ customerId: 'cust-1' });
    component.onVehicleSelect(component.addVehicleOption);
    component.newVehicleForm.patchValue({ vinNumber: '1FTABC123' });

    component.saveNewVehicle();

    const req = http.expectOne(r => r.method === 'POST' && r.url.endsWith('/v1/crm/cust-1/vehicles'));
    req.flush({ message: 'Duplicate VIN' }, { status: 409, statusText: 'Conflict' });

    expect(component.vehicleSaving()).toBe(false);
    expect(component.vehicleSaveError()).toBe('Duplicate VIN');
    expect(component.showAddVehicle()).toBe(true);
  });
});
