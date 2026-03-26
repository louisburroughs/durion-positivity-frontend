import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ApprovalDigitalPageComponent } from './approval-digital-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('ApprovalDigitalPageComponent [Story 271]', () => {
  let fixture: ComponentFixture<ApprovalDigitalPageComponent>;
  let component: ApprovalDigitalPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalDigitalPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ApprovalDigitalPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component).toBeTruthy();
  });

  it('should start with signature empty', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    expect(component.signatureEmpty()).toBe(true);
  });

  it('should not submit if signature is empty', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.signerForm.setValue({ customerId: 'cust-1', signerName: 'Jane', notes: '', purchaseOrderNumber: '' });
    component.submitApproval();
    http.expectNone(`${BASE}/v1/workorders/estimates/est-123/approval`);
    expect(component.errorMessage()).toContain('signature');
  });

  it('should POST to approval endpoint with signatureData', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    // simulate non-empty signature
    component.signatureEmpty.set(false);
    // mock canvas toDataURL using vi.fn()
    const canvas = document.createElement('canvas');
    const spy = vi.fn().mockReturnValue('data:image/png;base64,abc');
    canvas.toDataURL = spy;
    component.canvasRef = { nativeElement: canvas } as any;
    component.signerForm.setValue({ customerId: 'cust-1', signerName: 'Jane Customer', notes: '', purchaseOrderNumber: '' });
    component.submitApproval();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/approval`);
    expect(req.request.body['signatureData']).toBeTruthy();
    expect(req.request.body['signerName']).toBe('Jane Customer');
    req.flush({ id: 'est-123', status: 'APPROVED', customerId: 'c', vehicleId: 'v', approvedAt: new Date().toISOString(), signerName: 'Jane Customer' });
    expect(component.submitState()).toBe('success');
  });

  it('should show expired state on APPROVAL_EXPIRED error', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' });
    component.signatureEmpty.set(false);
    const canvas = document.createElement('canvas');
    canvas.toDataURL = () => 'data:image/png;base64,abc';
    component.canvasRef = { nativeElement: canvas } as any;
    component.signerForm.setValue({ customerId: 'cust-1', signerName: 'Jane', notes: '', purchaseOrderNumber: '' });
    component.submitApproval();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/approval`);
    req.flush({ code: 'APPROVAL_EXPIRED', message: 'Approval window expired' }, { status: 400, statusText: 'Bad Request' });
    expect(component.pageState()).toBe('expired');
  });
});
