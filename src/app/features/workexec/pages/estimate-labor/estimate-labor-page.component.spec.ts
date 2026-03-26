import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateLaborPageComponent } from './estimate-labor-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('EstimateLaborPageComponent [Story 237]', () => {
  let fixture: ComponentFixture<EstimateLaborPageComponent>;
  let component: EstimateLaborPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateLaborPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EstimateLaborPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] });
    expect(component).toBeTruthy();
  });

  it('should POST LABOR item with serviceId on valid submit', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] });

    component.addForm.setValue({ description: 'Brake Inspection', quantity: 1, unitPrice: 129.99, taxCode: 'LABOR_STANDARD', serviceId: 'svc-brake', notes: '' });
    component.addLaborItem();

    const addReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/items`);
    expect(addReq.request.body['itemType']).toBe('LABOR');
    expect(addReq.request.body['serviceId']).toBe('svc-brake');
    addReq.flush({ id: 'item-2', estimateId: 'est-123', itemType: 'LABOR', quantity: 1, unitPrice: 129.99 });

    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate-totals`).flush({ subtotal: 129.99, taxAmount: 11.05, total: 141.04 });
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [
      { id: 'item-2', estimateId: 'est-123', itemType: 'LABOR', quantity: 1, unitPrice: 129.99, lineTotal: 129.99 }
    ]});

    expect(component.saveState()).toBe('success');
  });
});
