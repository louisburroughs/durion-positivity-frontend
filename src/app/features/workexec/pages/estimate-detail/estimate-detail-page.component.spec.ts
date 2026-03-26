import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateDetailPageComponent } from './estimate-detail-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('EstimateDetailPageComponent [Story 236]', () => {
  let fixture: ComponentFixture<EstimateDetailPageComponent>;
  let component: EstimateDetailPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateDetailPageComponent],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EstimateDetailPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Flush any pending debounced requests
    http.match(`${BASE}/v1/workorders/estimates/est-123/calculate-totals`).forEach(r => r.flush({}));
    http.match(`${BASE}/v1/workorders/estimates/est-123`).forEach(r => r.flush({ id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v' }));
    http.verify();
  });

  it('should create and enter ready state', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: []
    });
    expect(component).toBeTruthy();
    expect(component.pageState()).toBe('ready');
  });

  it('should block Submit for Approval when taxBlocked is set', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: []
    });
    // Directly set the tax-blocked signal (simulating what the debounced pipeline would set)
    component.taxBlocked.set(true);
    component.totalsState.set('blocked-config');
    expect(component.canSubmitForApproval()).toBe(false);
  });
});
