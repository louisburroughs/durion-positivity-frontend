import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApprovalSubmitPageComponent } from './approval-submit-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('ApprovalSubmitPageComponent [Story 233]', () => {
  let fixture: ComponentFixture<ApprovalSubmitPageComponent>;
  let component: ApprovalSubmitPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalSubmitPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ApprovalSubmitPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component).toBeTruthy();
  });

  it('should POST to submit-for-approval endpoint', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.executeSubmit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/submit-for-approval`);
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'est-123', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v', submittedAt: new Date().toISOString(), submittedBy: 'advisor@shop.local' });
    expect(component.submitState()).toBe('success');
    expect(component.estimate()!.status).toBe('PENDING_APPROVAL');
  });

  it('should show field errors on 400 response', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.executeSubmit();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/submit-for-approval`);
    req.flush({
      code: 'VALIDATION_ERROR',
      message: 'Estimate is incomplete',
      fieldErrors: [{ field: 'lineItems', message: 'At least one line item required' }]
    }, { status: 400, statusText: 'Bad Request' });
    expect(component.fieldErrors().length).toBe(1);
  });

  it('should show error when estimate is not DRAFT', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'PENDING_APPROVAL', customerId: 'c', vehicleId: 'v' });
    fixture.detectChanges();
    expect(component.pageState()).toBe('error');
  });
});
