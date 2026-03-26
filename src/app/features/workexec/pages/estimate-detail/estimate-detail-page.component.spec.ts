import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EstimateDetailPageComponent } from './estimate-detail-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };
const STUB_ESTIMATE = { id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] };

describe('EstimateDetailPageComponent [Story 236]', () => {
  let fixture: ComponentFixture<EstimateDetailPageComponent>;
  let component: EstimateDetailPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
    http.verify();
  });

  /**
   * Flushes the initial GET triggered by loadEstimate(), advances fake timers past
   * the 350 ms debounce, then flushes the resulting POST (calculateEstimateTotals)
   * and the subsequent refresh GET (getEstimateById) so all pending requests are
   * settled before assertions or http.verify().
   */
  function drainPipeline(): void {
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(STUB_ESTIMATE);
    vi.advanceTimersByTime(350);
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate-totals`).flush({ subtotal: 0, taxAmount: 0, total: 0 });
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(STUB_ESTIMATE);
  }

  it('should create and enter ready state', () => {
    fixture.detectChanges();
    drainPipeline();
    expect(component).toBeTruthy();
    expect(component.pageState()).toBe('ready');
  });

  it('should block Submit for Approval when taxBlocked is set', () => {
    fixture.detectChanges();
    drainPipeline();
    component.taxBlocked.set(true);
    component.totalsState.set('blocked-config');
    expect(component.canSubmitForApproval()).toBe(false);
  });

  it('should set taxBlocked via debounced pipeline on tax config error', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(STUB_ESTIMATE);
    vi.advanceTimersByTime(350);
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate-totals`).flush(
      { code: 'ERR_TAX_CODE_MISSING', message: 'Tax code missing' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(component.taxBlocked()).toBe(true);
    expect(component.totalsState()).toBe('blocked-config');
    expect(component.canSubmitForApproval()).toBe(false);
  });
});
