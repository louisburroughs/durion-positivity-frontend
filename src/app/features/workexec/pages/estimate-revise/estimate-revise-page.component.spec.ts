import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateRevisePageComponent } from './estimate-revise-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('EstimateRevisePageComponent [Story 235]', () => {
  let fixture: ComponentFixture<EstimateRevisePageComponent>;
  let component: EstimateRevisePageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateRevisePageComponent],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EstimateRevisePageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component).toBeTruthy();
  });

  it('should show error for non-revisable status', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
    fixture.detectChanges();
    expect(component.pageState()).toBe('error');
    expect(component.errorMessage()).toContain('APPROVED');
  });

  it('should call reopenEstimate before createEstimate when PENDING_APPROVAL', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'PENDING_APPROVAL', customerId: 'cust-1', vehicleId: 'veh-1', crmPartyId: 'p1', crmVehicleId: 'cv1', crmContactIds: []
    });
    component.executeRevise();
    const reopenReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/reopen`);
    reopenReq.flush({ id: 'est-123', status: 'DRAFT', customerId: 'cust-1', vehicleId: 'veh-1' });
    const createReq = http.expectOne(`${BASE}/v1/workorders/estimates`);
    createReq.flush({ id: 'est-new', status: 'DRAFT', customerId: 'cust-1', vehicleId: 'veh-1' });
    expect(component.reviseState()).toBe('success');
  });
});
