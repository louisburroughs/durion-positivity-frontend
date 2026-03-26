import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApprovalPartialPageComponent } from './approval-partial-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('ApprovalPartialPageComponent [Story 269]', () => {
  let fixture: ComponentFixture<ApprovalPartialPageComponent>;
  let component: ApprovalPartialPageComponent;
  let http: HttpTestingController;

  const mockEstimate = {
    id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v',
    items: [
      { id: 'item-1', estimateId: 'est-123', itemType: 'PART', description: 'Brake Pad', quantity: 2, unitPrice: 49.99, lineTotal: 99.98 },
      { id: 'item-2', estimateId: 'est-123', itemType: 'LABOR', description: 'Brake Inspection', quantity: 1, unitPrice: 129.99, lineTotal: 129.99 },
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApprovalPartialPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ApprovalPartialPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create and initialize all items as approved', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(mockEstimate);
    expect(component.approvedCount()).toBe(2);
    expect(component.declinedCount()).toBe(0);
  });

  it('should track per-item decision changes', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(mockEstimate);
    component.setDecision('item-2', false);
    expect(component.declinedCount()).toBe(1);
    expect(component.lineDecisions()['item-2']).toBe(false);
  });

  it('should POST partial approval with lineItemApprovals', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(mockEstimate);
    component.setDecision('item-2', false);
    component.setRejectionReason('item-2', 'Too expensive');
    component.headerForm.setValue({ customerId: 'cust-1', notes: '', purchaseOrderNumber: '' });
    component.submitPartialApproval();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/approval`);
    expect(req.request.body['lineItemApprovals']).toHaveLength(2);
    const declined = req.request.body['lineItemApprovals'].find((l: any) => l.lineItemId === 'item-2');
    expect(declined.approved).toBe(false);
    expect(declined.rejectionReason).toBe('Too expensive');
    req.flush({ id: 'est-123', status: 'APPROVED', customerId: 'c', vehicleId: 'v' });
    expect(component.submitState()).toBe('success');
  });
});
