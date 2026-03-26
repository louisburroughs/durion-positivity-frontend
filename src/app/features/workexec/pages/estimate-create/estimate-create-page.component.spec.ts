import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateCreatePageComponent } from './estimate-create-page.component';
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
      ],
    }).compileComponents();

    fixture  = TestBed.createComponent(EstimateCreatePageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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
      crmPartyId: '',
      crmVehicleId: '',
    });
    component.submit();
    expect(component.state()).toBe('saving');
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'est-new', status: 'DRAFT', customerId: 'cust-1', vehicleId: 'veh-1' });
  });

  it('should display access-denied message on 403', () => {
    component.form.setValue({ customerId: 'c', vehicleId: 'v', crmPartyId: '', crmVehicleId: '' });
    component.submit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    req.flush({ code: 'FORBIDDEN', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(component.state()).toBe('access-denied');
  });

  it('should display error message on server error', () => {
    component.form.setValue({ customerId: 'c', vehicleId: 'v', crmPartyId: '', crmVehicleId: '' });
    component.submit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates`);
    req.flush({ code: 'INTERNAL_ERROR', message: 'Server error' }, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.errorMessage()).toBe('Server error');
  });
});
