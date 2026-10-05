import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { WorkorderDetailPageComponent } from './workorder-detail-page.component';
import { AuthService } from '../../../../core/services/auth.service';
import { BASE_PATH } from '@durion-sdk/workorder';
import { Configuration as PeopleConfiguration } from '@durion-sdk/people';
import { environment } from '../../../../../environments/environment';
import enUS from '../../../../../assets/i18n/en-US.json';

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
      // From the shipped bundle (ADR-0035 §8), so the assertions below track the real copy.
      TECHNICIAN_ASSIGNED: enUS.WORKEXEC.WORKORDER_DETAIL.TECHNICIAN_ASSIGNED,
    },
    ERROR: {
      INVOICE_DRAFT_EXISTS: 'An invoice draft already exists for this work order.',
      CREATE_INVOICE: 'Failed to create invoice. Please try again.',
      INVOICE_QUEUED_SLOW:
        'Invoice generation was queued but is taking longer than expected. Refresh this page shortly.',
      CONFIRM_INVOICE: 'Failed to confirm invoice creation. Refresh this page shortly.',
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

describe('WorkorderDetailPageComponent [Stories 213–215]', () => {
  let fixture: ComponentFixture<WorkorderDetailPageComponent>;
  let component: WorkorderDetailPageComponent;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkorderDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
        { provide: PeopleConfiguration, useValue: new PeopleConfiguration({ basePath: environment.apiBaseUrl }) },
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

  // #286 audit: aria-selected is not allowed on role=button. Only Scope and
  // Audit are in-page views (the rest route away), so the current one is
  // aria-current="true" — not "page", which would misstate navigation.
  describe('tab bar semantics (#286)', () => {
    it('marks only the active in-page view with aria-current="true" and never uses aria-selected', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'WORK_IN_PROGRESS' });
      fixture.detectChanges();

      const tabs = Array.from(fixture.nativeElement.querySelectorAll('.wo-tab')) as HTMLButtonElement[];
      expect(tabs.length).toBeGreaterThan(1);
      const current = tabs.filter(t => t.hasAttribute('aria-current'));
      expect(current).toHaveLength(1);
      expect(current[0].getAttribute('aria-current')).toBe('true');
      expect(current[0].classList).toContain('wo-tab--active');
      expect(tabs.every(t => !t.hasAttribute('aria-selected'))).toBe(true);
      expect(tabs.every(t => t.type === 'button')).toBe(true);
    });

    it('moves aria-current to Audit when the audit view is selected', () => {
      fixture.detectChanges();
      drainInit(http, { ...STUB_WORKORDER, status: 'WORK_IN_PROGRESS' });
      fixture.detectChanges();

      component.selectTab('audit');
      fixture.detectChanges();
      http.match(() => true);

      const tabs = Array.from(fixture.nativeElement.querySelectorAll('.wo-tab')) as HTMLButtonElement[];
      const current = tabs.filter(t => t.hasAttribute('aria-current'));
      expect(current).toHaveLength(1);
      expect(current[0]).toBe(tabs[tabs.length - 1]); // Audit is the last tab
      expect(tabs.some(t => t.getAttribute('aria-current') === 'page')).toBe(false);
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
     * assignedTechnicianName is left unset unless a test passes it, which is
     * what the backend sends when it can't resolve the display name.
     */
    function drainWithTechnician(employeeFlush: () => void, assignedTechnicianName?: string | null): void {
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`).flush({
        ...STUB_WORKORDER,
        assignedTechnicianId: TECH_ID,
        ...(assignedTechnicianName === undefined ? {} : { assignedTechnicianName }),
      });
      employeeFlush();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
    }

    /** A session whose token grants everything except the PII-guarded employee read. */
    function withoutEmployeePii(): void {
      const auth = TestBed.inject(AuthService);
      vi.spyOn(auth, 'permissionsKnown').mockReturnValue(true);
      vi.spyOn(auth, 'hasPermission').mockImplementation(p => p !== 'people:employee_pii:view');
    }

    it('shows the name carried on the workorder to a role without people:employee_pii:view, with no employee request (#446)', () => {
      withoutEmployeePii();
      fixture.detectChanges();
      drainWithTechnician(() => http.expectNone(`${BASE}/v1/people/employees/${TECH_ID}`), 'Jane Smith');
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Jane Smith');
      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent?.trim()).toBe('Jane Smith');
    });

    it('falls back to "Assigned" for a role without people:employee_pii:view when the workorder carries a null name (#446)', () => {
      withoutEmployeePii();
      fixture.detectChanges();
      drainWithTechnician(() => http.expectNone(`${BASE}/v1/people/employees/${TECH_ID}`), null);
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBeNull();
      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent?.trim()).toBe(enUS.WORKEXEC.WORKORDER_DETAIL.TECHNICIAN_ASSIGNED);
      expect(value?.textContent ?? '').not.toContain(TECH_ID);
    });

    it('shows the workorder name while the employee lookup is in flight, then adds the employee number', () => {
      fixture.detectChanges();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`).flush({
        ...STUB_WORKORDER,
        assignedTechnicianId: TECH_ID,
        assignedTechnicianName: 'Jane Smith',
      });
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
      fixture.detectChanges();

      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent?.trim()).toBe('Jane Smith');

      http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush({
        id: TECH_ID, firstName: 'Jane', lastName: 'Smith', employeeNumber: 'EMP-007',
      });
      fixture.detectChanges();

      expect(value?.textContent?.trim()).toBe('Jane Smith · #EMP-007');
    });

    it('keeps the workorder name when the employee lookup fails', () => {
      fixture.detectChanges();
      drainWithTechnician(
        () =>
          http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush(
            { message: 'forbidden' },
            { status: 403, statusText: 'Forbidden' },
          ),
        'Jane Smith',
      );
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Jane Smith');
    });

    it('prefers the workorder name over the employee profile name, so every role reads the same header', () => {
      fixture.detectChanges();
      drainWithTechnician(
        () =>
          http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush({
            id: TECH_ID, firstName: 'Jane', lastName: 'Smith', preferredName: 'Janie', employeeNumber: 'EMP-007',
          }),
        'Jane Smith',
      );
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Jane Smith · #EMP-007');
    });

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
      expect(value?.textContent?.trim()).toBe(enUS.WORKEXEC.WORKORDER_DETAIL.TECHNICIAN_ASSIGNED);
    });

    it('skips the PII-guarded employee lookup without people:employee_pii:view and shows "Assigned" (#446)', () => {
      withoutEmployeePii();
      fixture.detectChanges();
      drainWithTechnician(() => http.expectNone(`${BASE}/v1/people/employees/${TECH_ID}`));
      fixture.detectChanges();

      expect(component.hasTechnician()).toBe(true);
      expect(component.technicianLookupSettled()).toBe(true);
      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent?.trim()).toBe(enUS.WORKEXEC.WORKORDER_DETAIL.TECHNICIAN_ASSIGNED);
    });

    it('makes the employee lookup for a session that holds people:employee_pii:view', () => {
      const auth = TestBed.inject(AuthService);
      vi.spyOn(auth, 'permissionsKnown').mockReturnValue(true);
      vi.spyOn(auth, 'hasPermission').mockImplementation(p => p === 'people:employee_pii:view');
      fixture.detectChanges();
      drainWithTechnician(() =>
        http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush({
          id: TECH_ID, firstName: 'Jane', lastName: 'Smith', employeeNumber: 'EMP-007',
        }),
      );
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Jane Smith · #EMP-007');
    });

    it('shows the resolving placeholder until the employee lookup settles', () => {
      fixture.detectChanges();
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`).flush({ ...STUB_WORKORDER, assignedTechnicianId: TECH_ID });
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
      fixture.detectChanges();

      const value = fixture.nativeElement.querySelector('.wo-header__meta-value');
      expect(value?.textContent?.trim()).toBe('…');
      http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`).flush({ id: TECH_ID, firstName: 'Jane', lastName: 'Smith' });
    });

    it('drops a late answer from an older lookup after a reload (ADR-0063)', () => {
      const TECH_B = 'tech-uuid-2';
      fixture.detectChanges();
      drainWithTechnician(() => {});
      const staleLookup = http.expectOne(`${BASE}/v1/people/employees/${TECH_ID}`);

      component.loadWorkorder(WO_ID);
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`).flush({ ...STUB_WORKORDER, assignedTechnicianId: TECH_B });
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
      http.expectOne(`${BASE}/v1/people/employees/${TECH_B}`).flush({ id: TECH_B, firstName: 'Ravi', lastName: 'Shah' });
      // The first lookup answers last, and fails: it must not clear Ravi's name.
      staleLookup.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      expect(component.technicianDisplay()).toBe('Ravi Shah');
      expect(component.technicianLookupSettled()).toBe(true);
    });

    it('ignores an older detail load that answers after a newer one (ADR-0063)', () => {
      const TECH_A = 'tech-uuid-a';
      const TECH_B = 'tech-uuid-b';
      fixture.detectChanges();
      const detailA = http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`);

      component.loadWorkorder(WO_ID);
      const detailB = http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`);
      detailB.flush({ ...STUB_WORKORDER, workorderNumber: 'WO-B', assignedTechnicianId: TECH_B });
      http.expectOne(`${BASE}/v1/workorders/${WO_ID}/changeRequests`).flush([]);
      http.expectOne(`${BASE}/v1/people/employees/${TECH_B}`).flush({ id: TECH_B, firstName: 'Ravi', lastName: 'Shah' });
      // Load A answers last: it must neither replace the workorder nor start a lookup.
      detailA.flush({ ...STUB_WORKORDER, workorderNumber: 'WO-A', assignedTechnicianId: TECH_A });
      http.expectNone(`${BASE}/v1/people/employees/${TECH_A}`);
      fixture.detectChanges();

      expect(component.workorder()?.workorderNumber).toBe('WO-B');
      expect(component.technicianDisplay()).toBe('Ravi Shah');
    });

    it('ignores an older detail load that fails after a newer one succeeded', () => {
      fixture.detectChanges();
      const detailA = http.expectOne(`${BASE}/v1/workorders/${WO_ID}/detail`);

      component.loadWorkorder(WO_ID);
      drainInit(http);
      detailA.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(component.pageState()).toBe('ready');
      expect(component.errorMessage()).toBeNull();
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

  // #201: the fleet authorization panel is no longer hosted here — the
  // generated fleet read needs a supplier reference this page cannot supply.
  describe('retired fleet authorization panel [#201]', () => {
    it('renders no fleet authorization panel and injects no supplier service', () => {
      fixture.detectChanges();
      drainInit(http);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-supplier-fleet-authorization-panel')).toBeNull();
      const own = Object.keys(component as unknown as Record<string, unknown>);
      expect(own.some(key => /supplier|fleet|authoriz|vendor/i.test(key))).toBe(false);
    });
  });
});
