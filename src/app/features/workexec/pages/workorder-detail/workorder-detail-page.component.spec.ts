import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { WorkorderDetailPageComponent } from './workorder-detail-page.component';
import { BASE_PATH } from '@durion-sdk/workorder';
import { Configuration as PeopleConfiguration } from '@durion-sdk/people';
import { environment } from '../../../../../environments/environment';
import { SupplierFleetService } from '../../../positivity/services/supplier-fleet.service';
import { SupplierFleetAuthorization } from '../../../positivity/models/supplier-fleet.models';

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

// Minimal real-text translations so the TranslatePipe resolves keys asserted in the DOM.
const translations = {
  WORKEXEC: {
    WORKORDER_DETAIL: {
      APPROVE_WO: 'Approve Work Order',
      ASSIGN_TECH: 'Assign Technician',
      NOT_SET: 'Not set',
    },
  },
};

/** Flush the initial workorder detail GET + changeRequests GET triggered by ngOnInit. */
function drainInit(http: HttpTestingController, workorderOverride?: object): void {
  http
    .expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`)
    .flush(workorderOverride ?? STUB_WORKORDER);
  http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
}

/**
 * Fleet authorization payload for the hosted panel (#194). Mocked at the
 * service so the panel never reaches HttpTestingController — the point of
 * these tests is the host, and the panel has its own suite.
 */
const fleetAuthorization: SupplierFleetAuthorization = {
  workorderId: WO_ID,
  state: 'GRANTED',
  authorizationReference: 'AUTH-88421',
  vendorProfileId: 'vp-fleet-1',
  vendorDisplayName: 'Michelin Fleet Services',
  contract: null,
  vendorReason: null,
  authorizedAmount: '840.00',
  currency: 'EUR',
  requestedAt: '2026-08-12T09:00:00Z',
  decidedAt: '2026-08-12T09:04:00Z',
  completionApproval: {
    state: 'MANUAL_REVIEW',
    vendorReason: 'Approval endpoint rejected the completion payload three times.',
    attemptCount: 3,
    lastAttemptAt: '2026-08-12T11:30:00Z',
    nextAttemptAt: null,
  },
  asOf: '2026-08-12T11:40:00Z',
  fetchedAt: '2026-08-12T11:59:00Z',
  stalenessThresholdMinutes: 60,
};

describe('WorkorderDetailPageComponent [Stories 213–215]', () => {
  let fixture: ComponentFixture<WorkorderDetailPageComponent>;
  let component: WorkorderDetailPageComponent;
  let http: HttpTestingController;
  let router: Router;
  let fleetService: {
    lookupVehicle: ReturnType<typeof vi.fn>;
    getWorkorderAuthorization: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fleetService = {
      lookupVehicle: vi.fn(),
      getWorkorderAuthorization: vi.fn().mockReturnValue(of(fleetAuthorization)),
    };
    await TestBed.configureTestingModule({
      imports: [WorkorderDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
        { provide: PeopleConfiguration, useValue: new PeopleConfiguration({ basePath: environment.apiBaseUrl }) },
        { provide: SupplierFleetService, useValue: fleetService },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', translations);
    translate.use('en-US');
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

  // ── #900 — async generation: poll the workorder until invoiceId is linked ──

  describe('generateInvoice() — async generation polling (#900)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** Kick off generateInvoice and flush the 202-style response without an invoiceId. */
    function startAsyncGeneration(): void {
      component.generateInvoice();
      http
        .expectOne(`${BASE}/v1/workorders/${WO_ID}/generate-invoice`)
        .flush({ status: 'PENDING' });
    }

    it('polls GET /v1/workorders/{id} until invoiceId appears, then navigates', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      startAsyncGeneration();
      expect(component.invoiceLoading()).toBe(true);

      // First poll: invoice not linked yet.
      vi.advanceTimersByTime(2000);
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}`).flush({ id: WO_ID, status: 'COMPLETED' });
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(component.invoiceLoading()).toBe(true);

      // Second poll: invoiceId linked — navigate and stop polling.
      vi.advanceTimersByTime(2000);
      http
        .expectOne(`${BASE}/v1/workorders/${WO_ID}`)
        .flush({ id: WO_ID, status: 'COMPLETED', invoiceId: 'inv-900' });

      expect(navigateSpy).toHaveBeenCalledWith(['/app/billing/invoices', 'inv-900']);
      expect(component.invoiceLoading()).toBe(false);
      expect(component.invoiceError()).toBeNull();

      // No further polling after success.
      vi.advanceTimersByTime(4000);
      http.expectNone(`${BASE}/v1/workorders/${WO_ID}`);
    });

    it('sets the timeout invoiceError after 15 attempts without an invoiceId', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      startAsyncGeneration();

      for (let i = 0; i < 15; i++) {
        vi.advanceTimersByTime(2000);
        http.expectOne(`${BASE}/v1/workorders/${WO_ID}`).flush({ id: WO_ID, status: 'COMPLETED' });
      }

      expect(component.invoiceLoading()).toBe(false);
      expect(component.invoiceError()).toBe(
        'Invoice generation was queued but is taking longer than expected. Refresh this page shortly.',
      );
      expect(navigateSpy).not.toHaveBeenCalled();

      // Polling stopped after the 15th attempt.
      vi.advanceTimersByTime(4000);
      http.expectNone(`${BASE}/v1/workorders/${WO_ID}`);
    });

    it('does not set the timeout error when the component is destroyed mid-poll', () => {
      fixture.detectChanges();
      drainInit(http);

      startAsyncGeneration();

      vi.advanceTimersByTime(2000);
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}`).flush({ id: WO_ID, status: 'COMPLETED' });

      // Navigate away while polling — takeUntilDestroyed completes the stream.
      fixture.destroy();
      vi.advanceTimersByTime(4000);
      http.expectNone(`${BASE}/v1/workorders/${WO_ID}`);
      expect(component.invoiceError()).toBeNull();
    });

    it('sets a poll-failure invoiceError when a poll request errors', () => {
      fixture.detectChanges();
      drainInit(http);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      startAsyncGeneration();

      vi.advanceTimersByTime(2000);
      http
        .expectOne(`${BASE}/v1/workorders/${WO_ID}`)
        .flush({ message: 'boom' }, { status: 500, statusText: 'Internal Server Error' });

      expect(component.invoiceLoading()).toBe(false);
      expect(component.invoiceError()).toBe(
        'Failed to confirm invoice creation. Refresh this page shortly.',
      );
      expect(navigateSpy).not.toHaveBeenCalled();
    });
  });

  // ── F5/r2998536732 — confirmComplete() setTimeout cleared on destroy ───────

  describe('confirmComplete() — setTimeout cleared on destroy', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('does not call loadWorkorder after component is destroyed before 1200 ms elapses (F5/r2998536732)', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'WORK_IN_PROGRESS' });

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
      drainInit(http, { ...STUB_WORKORDER, status: 'WORK_IN_PROGRESS' });
      fixture.detectChanges();

      const list = fixture.nativeElement.querySelector('ul.checklist-list');
      expect(list).not.toBeNull();
    });
  });

  describe('status-gated workflow actions', () => {
    it('shows Approve and disables Assign Technician when DRAFT', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'DRAFT' });
      fixture.detectChanges();

      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const approve = buttons.find(b => (b.textContent ?? '').includes('Approve Work Order'));
      const assign = buttons.find(b => (b.textContent ?? '').includes('Assign Technician'));
      expect(approve).toBeTruthy();
      expect(assign?.disabled).toBe(true);
    });

    it('hides Approve and enables Assign Technician when APPROVED', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'APPROVED' });
      fixture.detectChanges();

      const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      const approve = buttons.find(b => (b.textContent ?? '').includes('Approve Work Order'));
      const assign = buttons.find(b => (b.textContent ?? '').includes('Assign Technician'));
      expect(approve).toBeUndefined();
      expect(assign?.disabled).toBe(false);
    });
  });

  describe('technician header — name + employee number', () => {
    const TECH_ID = 'tech-uuid-1';

    /**
     * Flush detail (with technician), the employee lookup, and changeRequests.
     * The workorder payload carries no technician name — it is resolved from the
     * People domain — so assignedTechnicianName is left unset here.
     */
    function drainWithTechnician(employeeFlush: () => void): void {
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`).flush({
        ...STUB_WORKORDER,
        assignedTechnicianId: TECH_ID,
      });
      employeeFlush();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
    }

    it('renders the technician name (from People) with employee number once the lookup resolves', () => {
      fixture.detectChanges();
      drainWithTechnician(() =>
        http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush({
          id: TECH_ID,
          firstName: 'Jane',
          lastName: 'Smith',
          employeeNumber: 'EMP-007',
          status: 'ACTIVE',
          hireDate: '2024-01-01',
        }),
      );
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Jane Smith · #EMP-007');
      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent ?? '').toContain('Jane Smith');
      expect(value?.textContent ?? '').toContain('EMP-007');
      // Never the raw technician id.
      expect(value?.textContent ?? '').not.toContain(TECH_ID);
    });

    it('shows a placeholder (never the technician id) when the employee lookup fails', () => {
      fixture.detectChanges();
      drainWithTechnician(() =>
        http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush(
          { message: 'not found' },
          { status: 404, statusText: 'Not Found' },
        ),
      );
      fixture.detectChanges();

      // The header still shows the technician row (id is present) but no name/number resolved.
      expect(component.hasTechnician()).toBe(true);
      expect(component.technicianEmployeeNumber()).toBeNull();
      expect(component.technicianDisplay()).toBeNull();
      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent ?? '').not.toContain(TECH_ID);
    });

    it('does not call the employee endpoint when no technician is assigned', () => {
      fixture.detectChanges();
      drainInit(http);
      http.expectNone(`${BASE}/v1/people/employees/${TECH_ID}`);
      expect(component.technicianDisplay()).toBeNull();
    });
  });

  describe('CRM References [Story 157]', () => {
    it('displays crm-ref-block with populated CRM IDs when workorder has crmPartyId and crmVehicleId in audit tab', async () => {
      fixture.detectChanges();
      drainInit(http, {
        ...STUB_WORKORDER,
        crmPartyId: 'crm-party-123',
        crmVehicleId: 'crm-vehicle-456',
        crmContactIds: ['crm-contact-789'],
      });
      component.activeTab.set('audit');
      fixture.detectChanges();

      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock).toBeTruthy();
      expect(crmRefBlock?.textContent ?? '').toContain('crm-party-123');
      expect(crmRefBlock?.textContent ?? '').toContain('crm-vehicle-456');
    });

    it('shows "Not set" when workorder has no crmPartyId in audit tab', async () => {
      fixture.detectChanges();
      drainInit(http, {
        ...STUB_WORKORDER,
        crmPartyId: undefined,
        crmVehicleId: undefined,
        crmContactIds: undefined,
      });
      component.activeTab.set('audit');
      fixture.detectChanges();

      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock).toBeTruthy();
      expect(crmRefBlock?.textContent ?? '').toContain('Not set');
    });
  });

  /**
   * Fleet authorization panel isolation and read-only guarantees (#194,
   * DECISION-POSITIVITY-004).
   *
   * A fleet manager being down, slow or refusing this caller must never take
   * the workorder screen with it: the technician's items, labor and every
   * transition control are what the shop runs on.
   */
  describe('fleet authorization panel [#194]', () => {
    it('hosts the panel keyed by the platform workorder UUID', () => {
      fixture.detectChanges();
      drainInit(http);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('app-supplier-fleet-authorization-panel'),
      ).toBeTruthy();
      expect(fleetService.getWorkorderAuthorization).toHaveBeenCalledWith(WO_ID);
    });

    for (const [label, status] of [
      ['a 500', 500],
      ['a 503 vendor outage', 503],
      ['a 403 denial', 403],
    ] as ReadonlyArray<readonly [string, number]>) {
      it(`keeps the workorder intact through ${label} from the fleet manager`, () => {
        fleetService.getWorkorderAuthorization.mockReturnValue(
          throwError(() => new HttpErrorResponse({ status, statusText: 'x' })),
        );
        fixture.detectChanges();
        drainInit(http);
        fixture.detectChanges();

        expect(component.pageState()).toBe('ready');
        expect(component.errorMessage()).toBeNull();
        // Tabs and the completed-workorder actions are all still rendered.
        expect(fixture.nativeElement.querySelectorAll('.wo-tab').length).toBeGreaterThan(0);
        expect(component.canReopen()).toBe(true);
        expect(component.canCreateInvoice()).toBe(true);
      });
    }

    // #194 §6 — completion approval state, including MANUAL_REVIEW, is visible
    // on a completed fleet workorder.
    it('surfaces a MANUAL_REVIEW completion approval on the completed workorder', () => {
      fixture.detectChanges();
      drainInit(http);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.fleet-auth__completion')).toBeTruthy();
      expect(el.querySelector('.fleet-auth__completion-reason')?.textContent?.trim()).toBe(
        'Approval endpoint rejected the completion payload three times.',
      );
    });

    // #194 §6 — "No frontend path mutates authorization state." Asserted at the
    // host too, so a future control added anywhere on this page trips a test.
    it('exposes no control anywhere on the page that changes authorization state', () => {
      fleetService.getWorkorderAuthorization.mockReturnValue(
        of({
          ...fleetAuthorization,
          state: 'DENIED' as const,
          vendorReason: 'Vehicle no longer covered.',
        }),
      );
      fixture.detectChanges();
      drainInit(http);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const controlText = Array.from(el.querySelectorAll('button, a, input[type="submit"]'))
        .map(n => `${n.textContent ?? ''} ${n.className}`)
        .join(' ')
        .toLowerCase();

      expect(controlText).not.toMatch(
        /authorize|authorise|grant|deny|decline|override|escalate|request.?auth/,
      );
    });

    it('injects no supplier service into the host page itself', () => {
      fixture.detectChanges();
      drainInit(http);
      const own = Object.keys(component as unknown as Record<string, unknown>);

      expect(own.some(key => /supplier|fleet|authoriz|vendor/i.test(key))).toBe(false);
    });
  });
});
