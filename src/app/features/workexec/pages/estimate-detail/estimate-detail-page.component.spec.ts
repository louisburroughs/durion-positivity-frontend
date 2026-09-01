import { TestBed, ComponentFixture } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EstimateDetailPageComponent } from './estimate-detail-page.component';
import { BASE_PATH } from '@durion-sdk/workorder';
import { environment } from '../../../../../environments/environment';

const BASE = environment.apiBaseUrl;
const mockRoute = { snapshot: { paramMap: { get: (k: string) => k === 'estimateId' ? 'est-123' : null } } };
const STUB_ESTIMATE = { id: 'est-123', status: 'DRAFT', customerId: 'c', vehicleId: 'v', items: [] };

// Minimal real-text translations so the TranslatePipe resolves the keys (and
// interpolates params) that the DOM assertions below depend on.
const translations = {
  WORKEXEC: {
    ESTIMATE_DETAIL: {
      CONTACT_BADGE: '{{name}} ({{role}})',
      UNAVAILABLE: 'Unavailable',
      NOT_SET: 'Not set',
    },
  },
};

describe('EstimateDetailPageComponent [Story 236]', () => {
  let fixture: ComponentFixture<EstimateDetailPageComponent>;
  let component: EstimateDetailPageComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [EstimateDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([{ path: '**', redirectTo: '' }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: BASE_PATH, useValue: environment.apiBaseUrl },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en-US', translations);
    translate.use('en-US');
    fixture = TestBed.createComponent(EstimateDetailPageComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
    contactsResponse = { contacts: [] };
  });

  /**
   * Flushes the initial GET triggered by loadEstimate(), advances fake timers past
   * the 350 ms debounce, then flushes the resulting POST (calculateEstimateTotals)
   * and the subsequent refresh GET (getEstimateById) so all pending requests are
   * settled before assertions or http.verify().
   */
  // CRM contacts payload returned by the GET /v1/crm/parties/:id/contacts call
  // that loadContacts() triggers; individual tests can reassign before draining.
  let contactsResponse: object = { contacts: [] };

  function drainPipeline(estimateOverride?: object): void {
    const estimate = estimateOverride ?? STUB_ESTIMATE;
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(estimate);
    // loadContacts() + resolveCrmRefs() fire CRM GETs only when the estimate
    // carries a crmPartyId.
    const partyId = (estimate as { crmPartyId?: string }).crmPartyId;
    if (partyId) {
      http.expectOne(r => r.url.endsWith('/contacts')).flush(contactsResponse);
      http.expectOne(r => r.url.endsWith(`/accounts/parties/${partyId}`))
        .flush({ partyId, legalName: 'Globex Corp', customerNumber: 'CUST-9' });
      const vehId = (estimate as { crmVehicleId?: string }).crmVehicleId;
      if (vehId) {
        http.expectOne(r => r.url.endsWith(`/vehicles/${vehId}`))
          .flush({ vehicleId: vehId, year: 2020, make: 'Ford', model: 'F-150', vin: '1FTEST' });
      }
    }
    vi.advanceTimersByTime(350);
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate`).flush({ subtotal: 0, taxAmount: 0, total: 0 });
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush(estimate);
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
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate`).flush(
      { code: 'ERR_TAX_CODE_MISSING', message: 'Tax code missing' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(component.taxBlocked()).toBe(true);
    expect(component.totalsState()).toBe('blocked-config');
    expect(component.canSubmitForApproval()).toBe(false);
  });

  it('does not call /calculate for a non-DRAFT estimate and renders stored totals', () => {
    fixture.detectChanges();
    // Estimate already promoted past DRAFT: backend freezes totals and returns
    // 409 on /calculate. The page must render the persisted totals instead.
    http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
      ...STUB_ESTIMATE,
      status: 'APPROVED',
      subtotal: 100,
      taxAmount: 8,
      total: 108,
    });
    vi.advanceTimersByTime(350);
    // No POST /calculate is issued; http.verify() in afterEach asserts no
    // outstanding requests. totalsState stays out of the 'error' state.
    expect(component.totalsState()).toBe('updated');
    expect(component.totalsState()).not.toBe('error');
  });

  describe('CRM References [Story 157]', () => {
    it('displays crm-ref-block with populated CRM IDs when estimate has crmPartyId and crmVehicleId', async () => {
      fixture.detectChanges();
      drainPipeline({
        ...STUB_ESTIMATE,
        crmPartyId: 'crm-party-123',
        crmVehicleId: 'crm-vehicle-456',
        crmContactIds: ['crm-contact-789'],
      });
      fixture.detectChanges();

      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock).toBeTruthy();
      // Resolved labels are shown; the raw ids remain available via the title attribute.
      expect(crmRefBlock?.textContent ?? '').toContain('Globex Corp');
      expect(crmRefBlock?.textContent ?? '').toContain('2020 Ford F-150');
      expect(crmRefBlock?.innerHTML ?? '').toContain('crm-party-123');
      expect(crmRefBlock?.innerHTML ?? '').toContain('crm-vehicle-456');
    });

    it('resolves customer contacts from CRM and renders name + role', async () => {
      contactsResponse = {
        contacts: [
          {
            relationshipId: 'rel-1',
            individualId: 'person-1',
            individual: { displayName: 'Jane Roe', email: 'jane@example.com', phone: '555-1212' },
            roles: ['PRIMARY_CONTACT'],
            status: 'ACTIVE',
          },
        ],
      };
      fixture.detectChanges();
      drainPipeline({
        ...STUB_ESTIMATE,
        crmPartyId: 'crm-party-123',
        crmVehicleId: 'crm-vehicle-456',
        crmContactIds: [],
      });
      fixture.detectChanges();

      expect(component.contacts().length).toBe(1);
      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock?.textContent ?? '').toContain('Jane Roe');
      // role enum is humanized for display
      expect(crmRefBlock?.textContent ?? '').toContain('Primary Contact');
      expect(crmRefBlock?.textContent ?? '').not.toContain('PRIMARY_CONTACT');
    });

    it('shows "Unavailable" when the CRM contacts lookup fails', async () => {
      fixture.detectChanges();
      http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({
        ...STUB_ESTIMATE,
        crmPartyId: 'crm-party-123',
      });
      http.expectOne(r => r.url.endsWith('/contacts')).flush(
        { message: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
      // resolveCrmRefs() also fires party/vehicle GETs when crmPartyId is present.
      http.expectOne(r => r.url.endsWith('/accounts/parties/crm-party-123'))
        .flush({ partyId: 'crm-party-123', legalName: 'Globex Corp' });
      vi.advanceTimersByTime(350);
      http.expectOne(`${BASE}/v1/workorders/estimates/est-123/calculate`).flush({ subtotal: 0, taxAmount: 0, total: 0 });
      http.expectOne(`${BASE}/v1/workorders/estimates/est-123`).flush({ ...STUB_ESTIMATE, crmPartyId: 'crm-party-123' });
      fixture.detectChanges();

      expect(component.contactsError()).toBe(true);
      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock?.textContent ?? '').toContain('Unavailable');
    });

    it('keeps the vehicle VIN separately from the display label', async () => {
      fixture.detectChanges();
      drainPipeline({
        ...STUB_ESTIMATE,
        crmPartyId: 'crm-party-123',
        crmVehicleId: 'crm-vehicle-456',
      });
      fixture.detectChanges();

      expect(component.vehicleVin()).toBe('1FTEST');
    });

    it('shows "Not set" when estimate has no crmPartyId', async () => {
      fixture.detectChanges();
      drainPipeline({
        ...STUB_ESTIMATE,
        crmPartyId: undefined,
        crmVehicleId: undefined,
        crmContactIds: undefined,
      });
      fixture.detectChanges();

      const crmRefBlock = fixture.nativeElement.querySelector('.crm-ref-block');
      expect(crmRefBlock).toBeTruthy();
      expect(crmRefBlock?.textContent ?? '').toContain('Not set');
    });
  });

  // #201: the fleet lookup panel is no longer hosted here — the generated
  // fleet read needs a supplier reference this page cannot supply.
  describe('retired fleet lookup panel [#201]', () => {
    it('renders no fleet lookup panel and injects no supplier service', () => {
      fixture.detectChanges();
      drainPipeline({ ...STUB_ESTIMATE, crmPartyId: 'crm-party-123', crmVehicleId: 'crm-vehicle-456' });
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-supplier-fleet-lookup-panel')).toBeNull();
      const own = Object.keys(component as unknown as Record<string, unknown>);
      expect(own.some(key => /supplier|fleet|authoriz|vendorProfile/i.test(key))).toBe(false);
    });
  });
});
