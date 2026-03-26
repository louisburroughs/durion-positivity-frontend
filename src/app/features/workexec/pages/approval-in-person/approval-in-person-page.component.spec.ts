import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApprovalInPersonPageComponent } from './approval-in-person-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('ApprovalInPersonPageComponent [Story 270]', () => {
  let fixture: ComponentFixture<ApprovalInPersonPageComponent>;
  let component: ApprovalInPersonPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalInPersonPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ApprovalInPersonPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component).toBeTruthy();
  });

  it('should POST approveEstimate without signature data for in-person', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.approvalForm.setValue({ customerId: 'cust-1', notes: 'Confirmed in person', purchaseOrderNumber: '' });
    component.submitApproval();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/approval`);
    expect(req.request.body['signatureData']).toBeUndefined();
    expect(req.request.body['customerId']).toBe('cust-1');
    req.flush({ id: 'est-123', status: 'APPROVED', customerId: 'c', vehicleId: 'v', approvedAt: new Date().toISOString() });
    expect(component.submitState()).toBe('success');
  });

  it('should reload on 409 conflict', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.approvalForm.setValue({ customerId: 'c', notes: '', purchaseOrderNumber: '' });
    component.submitApproval();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/approval`);
    req.flush({}, { status: 409, statusText: 'Conflict' });
    // Should trigger reload
    const reloadReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123`);
    reloadReq.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
  });
});
