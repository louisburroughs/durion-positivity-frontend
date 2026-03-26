import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimatePartsPageComponent } from './estimate-parts-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;

const mockActivatedRoute = {
  snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } },
};

describe('EstimatePartsPageComponent [Story 238]', () => {
  let fixture: ComponentFixture<EstimatePartsPageComponent>;
  let component: EstimatePartsPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimatePartsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EstimatePartsPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create the component', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });
    expect(component).toBeTruthy();
  });

  it('should load estimate on init', () => {
    fixture.detectChanges();
    const req = http.expectOne(`${BASE}/v1/workorders/estimates/est-123`);
    req.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] });
    fixture.detectChanges();
    expect(component.state()).toBe('ready');
    expect(component.estimate()?.id).toBe('est-123');
  });

  it('should not submit add form when fields empty', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });
    component.addItem();
    http.expectNone(`${BASE}/v1/workorders/estimates/est-123/items`);
    expect(component.saveState()).toBe('idle');
  });

  it('should POST addEstimateItem then recalculate and reload on valid add', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.addForm.setValue({ description: 'Brake pad', quantity: 2, unitPrice: 49.99, taxCode: '', productId: '' });
    component.addItem();

    const addReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/items`);
    expect(addReq.request.body['itemType']).toBe('PART');
    addReq.flush({ id: 'item-1', estimateId: 'est-123', itemType: 'PART', quantity: 2, unitPrice: 49.99 });

    const calcReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate-totals`);
    calcReq.flush({ subtotal: 99.98, taxAmount: 8.5, total: 108.48 });

    const reloadReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123`);
    reloadReq.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [
      { id: 'item-1', estimateId: 'est-123', itemType: 'PART', quantity: 2, unitPrice: 49.99, lineTotal: 99.98 }
    ]});

    expect(component.saveState()).toBe('success');
    expect(component.items().length).toBe(1);
  });

  it('should show 409 conflict error when estimate is not DRAFT', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [],
    });

    component.addForm.setValue({ description: 'Part', quantity: 1, unitPrice: 10, taxCode: '', productId: '' });
    component.addItem();

    const addReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/items`);
    addReq.flush({ code: 'INVALID_STATE' }, { status: 409, statusText: 'Conflict' });

    expect(component.saveState()).toBe('error');
    expect(component.errorMessage()).toContain('DRAFT');
  });
});
