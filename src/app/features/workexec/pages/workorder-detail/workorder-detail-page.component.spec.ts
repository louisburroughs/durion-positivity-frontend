import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { WorkorderDetailPageComponent } from './workorder-detail-page.component';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const WO_ID = 'wo-001';

const mockRoute = {
  snapshot: { paramMap: { get: (k: string) => (k === 'workorderId' ? WO_ID : null) } },
};

const STUB_WORKORDER = {
  id: WO_ID,
  status: 'COMPLETED',
  items: [],
};

/** Flush the initial workorder detail GET + changeRequests GET triggered by ngOnInit. */
function drainInit(http: HttpTestingController, workorderOverride?: object): void {
  http
    .expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`)
    .flush(workorderOverride ?? STUB_WORKORDER);
  http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
}

describe('WorkorderDetailPageComponent [Stories 213–215]', () => {
  let fixture: ComponentFixture<WorkorderDetailPageComponent>;
  let component: WorkorderDetailPageComponent;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkorderDetailPageComponent],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(WorkorderDetailPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('should create and reach ready state', () => {
    fixture.detectChanges();
    drainInit(http);
    expect(component).toBeTruthy();
    expect(component.pageState()).toBe('ready');
  });

  // ── F4/r2998536749 — generateInvoice() dead status===200 branch removed ────

  describe('generateInvoice()', () => {
    it('navigates to existing invoice when API returns 409 with invoiceId (F4/r2998536749)', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.generateInvoice();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/generate-invoice`).flush(
        { message: 'already exists', invoiceId: 'existing-inv-id' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(navigateSpy).toHaveBeenCalledWith(['/app/billing/invoices', 'existing-inv-id']);
    });

    it('sets invoiceError and does NOT navigate on 409 without existingId', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.generateInvoice();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/generate-invoice`).flush(
        { message: 'draft already exists' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(component.invoiceError()).toBe('An invoice draft already exists for this work order.');
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('sets invoiceError and does NOT navigate on non-409 errors', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.generateInvoice();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/generate-invoice`).flush(
        { message: 'server error', invoiceId: 'should-not-navigate' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      expect(component.invoiceError()).toBe('Failed to create invoice. Please try again.');
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ── F5/r2998536732 — confirmComplete() setTimeout cleared on destroy ───────

  describe('confirmComplete() — setTimeout cleared on destroy', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not call loadWorkorder after component is destroyed before 1200 ms elapses (F5/r2998536732)', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'IN_PROGRESS' });

      component.completionNotes.set('all done');
      component.confirmComplete();
      http
        .expectOne(`${BASE}/v1/workorders/${WO_ID}/complete`)
        .flush({ failedChecks: [] });

      expect(component.completeModalState()).toBe('success');

      // Destroy before the 1200 ms timer fires — clearTimeout should be called
      fixture.destroy();
      vi.advanceTimersByTime(1500);

      // No loadWorkorder re-trigger: no detail GET pending
      http.expectNone(`${BASE}/v1/workorders/${WO_ID}/detail`);
    });
  });

  // ── F6/r2998536739 — confirmReopen() setTimeout cleared on destroy ─────────

  describe('confirmReopen() — setTimeout cleared on destroy', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not call loadWorkorder after component is destroyed before 1200 ms elapses (F6/r2998536739)', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'COMPLETED' });

      component.reopenReason.set('customer requested changes');
      component.confirmReopen();
      http
        .expectOne(`${BASE}/v1/workorders/${WO_ID}/reopen`)
        .flush({});

      expect(component.reopenModalState()).toBe('success');

      // Destroy before the 1200 ms timer fires — clearTimeout should be called
      fixture.destroy();
      vi.advanceTimersByTime(1500);

      // No loadWorkorder re-trigger: no detail GET pending
      http.expectNone(`${BASE}/v1/workorders/${WO_ID}/detail`);
    });
  });

  // ── PRCR-003 — checklist <ul> rendered when canComplete is true ────────────

  describe('checklist DOM structure (PRCR-003)', () => {
    it('renders ul.checklist-list when pageState is ready and canComplete() is true', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'IN_PROGRESS' });
      fixture.detectChanges();

      const list = fixture.nativeElement.querySelector('ul.checklist-list');
      expect(list).not.toBeNull();
    });
  });
});
