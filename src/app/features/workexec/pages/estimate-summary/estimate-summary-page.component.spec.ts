import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EstimateSummaryPageComponent } from './estimate-summary-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };

describe('EstimateSummaryPageComponent [Story 234]', () => {
  let fixture: ComponentFixture<EstimateSummaryPageComponent>;
  let component: EstimateSummaryPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstimateSummaryPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EstimateSummaryPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should create snapshot then load summary', () => {
    fixture.detectChanges();
    const snapReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/snapshots`);
    snapReq.flush({ id: 'snap-1', estimateId: 'est-123' });
    const summaryReq = http.expectOne(`${BASE}/v1/workorders/estimates/est-123/summary`);
    summaryReq.flush({ id: 'est-123', status: 'DRAFT', subtotal: 100, taxAmount: 8.5, total: 108.5 });
    fixture.detectChanges();
    expect(component.pageState()).toBe('ready');
    expect(component.summary()?.total).toBe(108.5);
  });

  it('should show Proceed to Approval CTA when DRAFT and not expired', () => {
    fixture.detectChanges();
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/snapshots`).flush({ id: 'snap-1', estimateId: 'est-123' });
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/summary`).flush({ id: 'est-123', status: 'DRAFT' });
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(true);
  });
});
