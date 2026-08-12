/**
 * SupplierProfileService contract tests.
 *
 * ADR-0035: every public method asserts verb + URL against the assumed
 * `/supplier/v1/**` contract documented on the service.
 * ADR-0032: every fixture is typed as its exact domain interface.
 */
import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { environment } from '../../../../environments/environment';
import { SupplierProfileService } from './supplier-profile.service';
import {
  SupplierAccounts,
  SupplierAuthConfig,
  SupplierAuthConfigRequest,
  SupplierBillingAccount,
  SupplierBinding,
  SupplierBindingHealth,
  SupplierBindingRequest,
  SupplierCapabilityDescriptor,
  SupplierDeliveryAccount,
  VendorProfile,
  VendorProfileRequest,
  VendorProfileSummary,
} from '../models/supplier-profile.models';

const BASE = environment.apiBaseUrl;
const PROFILE_ID = 'ffc9a4c2-0000-7000-8000-000000000001';

const summaryFixture: VendorProfileSummary = {
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: 'ADMIN',
};

const profileFixture: VendorProfile = {
  ...summaryFixture,
  connectTimeoutMs: 5000,
  readTimeoutMs: 20000,
  maxRetries: 2,
};

const profileRequestFixture: VendorProfileRequest = {
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
};

const authConfigFixture: SupplierAuthConfig = {
  authConfigId: 'auth-1',
  authRef: 'michelin-prod',
  authType: 'BASIC_PLUS_APIKEY',
  usernameRef: 'env:MICHELIN_EDI_USER',
  passwordRef: 'env:MICHELIN_EDI_PASSWORD',
  apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
};

const authConfigRequestFixture: SupplierAuthConfigRequest = {
  authRef: 'michelin-prod',
  authType: 'BASIC_PLUS_APIKEY',
  usernameRef: 'env:MICHELIN_EDI_USER',
  passwordRef: 'env:MICHELIN_EDI_PASSWORD',
  apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
};

const billingFixture: SupplierBillingAccount = {
  accountNumber: '4711',
  agencyCode: 'A1',
};

const deliveryFixture: SupplierDeliveryAccount = {
  locationId: 'ffc9a4c2-0000-7000-8000-0000000000aa',
  locationName: 'Springfield Main',
  accountNumber: '4711-01',
};

const accountsFixture: SupplierAccounts = {
  billing: billingFixture,
  delivery: [deliveryFixture],
  activeLocations: [
    { locationId: 'ffc9a4c2-0000-7000-8000-0000000000aa', name: 'Springfield Main' },
  ],
};

const bindingFixture: SupplierBinding = {
  bindingId: 'bind-1',
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  protocolVersion: 'B4_0',
  baseUrl: 'https://edi.example.com',
  path: '/pricat',
  authRef: 'michelin-prod',
  cronSchedule: '0 0 3 * * *',
  enabled: true,
};

const bindingRequestFixture: SupplierBindingRequest = {
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  protocolVersion: 'B4_0',
  baseUrl: 'https://edi.example.com',
  path: '/pricat',
  authRef: 'michelin-prod',
  cronSchedule: '0 0 3 * * *',
  enabled: true,
};

const healthFixture: SupplierBindingHealth = {
  capability: 'PRICE_CATALOG',
  bindingId: 'bind-1',
  status: 'HEALTHY',
  breakerState: 'CLOSED',
  observedAt: '2026-08-12T10:00:00Z',
  stalenessThresholdMinutes: 120,
};

const capabilityFixture: SupplierCapabilityDescriptor = {
  capability: 'PRICE_CATALOG',
  protocolOptions: [{ protocolFamily: 'EDIWHEEL_B', versions: ['B4_0'] }],
};

describe('SupplierProfileService', () => {
  let service: SupplierProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SupplierProfileService, ApiBaseService],
    });
    service = TestBed.inject(SupplierProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ── Profiles ───────────────────────────────────────────────────────────────

  it('listProfiles() — GET /supplier/v1/vendor-profiles', () => {
    service.listProfiles().subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles`);
    expect(req.request.method).toBe('GET');
    req.flush([summaryFixture]);
  });

  it('getProfile() — GET /supplier/v1/vendor-profiles/{id}', () => {
    service.getProfile(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}`);
    expect(req.request.method).toBe('GET');
    req.flush(profileFixture);
  });

  it('createProfile() — POST /supplier/v1/vendor-profiles without server-generated fields', () => {
    service.createProfile(profileRequestFixture).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(profileRequestFixture);
    expect(req.request.body).not.toHaveProperty('vendorProfileId');
    expect(req.request.body).not.toHaveProperty('createdAt');
    req.flush(profileFixture);
  });

  it('updateProfile() — PUT /supplier/v1/vendor-profiles/{id}', () => {
    service.updateProfile(PROFILE_ID, profileRequestFixture).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}`);
    expect(req.request.method).toBe('PUT');
    req.flush(profileFixture);
  });

  it('deleteProfile() — DELETE /supplier/v1/vendor-profiles/{id}', () => {
    service.deleteProfile(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ── Auth configs ───────────────────────────────────────────────────────────

  it('listAuthConfigs() — GET .../auth-configs', () => {
    service.listAuthConfigs(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/auth-configs`);
    expect(req.request.method).toBe('GET');
    req.flush([authConfigFixture]);
  });

  it('createAuthConfig() — POST .../auth-configs sends only reference strings, never a secret', () => {
    service.createAuthConfig(PROFILE_ID, authConfigRequestFixture).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/auth-configs`);
    expect(req.request.method).toBe('POST');

    const body = req.request.body as Record<string, unknown>;
    // Every credential-bearing property is a `*Ref` and carries a reference scheme.
    for (const [key, value] of Object.entries(body)) {
      if (key.endsWith('Ref') && key !== 'authRef') {
        expect(String(value)).toMatch(/^(env|secret|vault):/);
      }
    }
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('clientSecret');
    req.flush(authConfigFixture);
  });

  it('updateAuthConfig() — PUT .../auth-configs/{authConfigId}', () => {
    service.updateAuthConfig(PROFILE_ID, 'auth-1', authConfigRequestFixture).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/auth-configs/auth-1`,
    );
    expect(req.request.method).toBe('PUT');
    req.flush(authConfigFixture);
  });

  it('deleteAuthConfig() — DELETE .../auth-configs/{authConfigId}', () => {
    service.deleteAuthConfig(PROFILE_ID, 'auth-1').subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/auth-configs/auth-1`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ── Accounts ───────────────────────────────────────────────────────────────

  it('getAccounts() — GET .../accounts', () => {
    service.getAccounts(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/accounts`);
    expect(req.request.method).toBe('GET');
    req.flush(accountsFixture);
  });

  it('updateBillingAccount() — PUT .../accounts/billing', () => {
    service.updateBillingAccount(PROFILE_ID, { accountNumber: '4711', agencyCode: 'A1' }).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/accounts/billing`,
    );
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ accountNumber: '4711', agencyCode: 'A1' });
    req.flush(billingFixture);
  });

  it('upsertDeliveryAccount() — PUT .../accounts/delivery/{locationId} with locationId in the path only', () => {
    service
      .upsertDeliveryAccount(PROFILE_ID, {
        locationId: 'loc-1',
        accountNumber: '4711-01',
        agencyCode: 'A1',
      })
      .subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/accounts/delivery/loc-1`,
    );
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ accountNumber: '4711-01', agencyCode: 'A1' });
    req.flush(deliveryFixture);
  });

  it('deleteDeliveryAccount() — DELETE .../accounts/delivery/{locationId}', () => {
    service.deleteDeliveryAccount(PROFILE_ID, 'loc-1').subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/accounts/delivery/loc-1`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ── Bindings ───────────────────────────────────────────────────────────────

  it('listBindings() — GET .../bindings', () => {
    service.listBindings(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/bindings`);
    expect(req.request.method).toBe('GET');
    req.flush([bindingFixture]);
  });

  it('createBinding() — POST .../bindings', () => {
    service.createBinding(PROFILE_ID, bindingRequestFixture).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/bindings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).not.toHaveProperty('bindingId');
    req.flush(bindingFixture);
  });

  it('updateBinding() — PUT .../bindings/{bindingId}', () => {
    service.updateBinding(PROFILE_ID, 'bind-1', bindingRequestFixture).subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/bindings/bind-1`,
    );
    expect(req.request.method).toBe('PUT');
    req.flush(bindingFixture);
  });

  it('deleteBinding() — DELETE .../bindings/{bindingId}', () => {
    service.deleteBinding(PROFILE_ID, 'bind-1').subscribe();
    const req = http.expectOne(
      `${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/bindings/bind-1`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ── Health / registry ──────────────────────────────────────────────────────

  it('getHealth() — GET .../health', () => {
    service.getHealth(PROFILE_ID).subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/vendor-profiles/${PROFILE_ID}/health`);
    expect(req.request.method).toBe('GET');
    req.flush([healthFixture]);
  });

  it('listCapabilities() — GET /supplier/v1/capabilities', () => {
    service.listCapabilities().subscribe();
    const req = http.expectOne(`${BASE}/supplier/v1/capabilities`);
    expect(req.request.method).toBe('GET');
    req.flush([capabilityFixture]);
  });
});
