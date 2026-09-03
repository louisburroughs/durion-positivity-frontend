/**
 * SupplierProfileService contract tests.
 *
 * ADR-0035: every public method has coverage.
 * ADR-0032: every fixture is typed as its exact interface — the SDK view types
 * here, so a drift in the generated contract fails compilation rather than
 * quietly passing.
 */
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthConfigView,
  AuthConfigViewTypeEnum,
  CommercialAccountRequestRoleEnum,
  CommercialAccountView,
  CommercialAccountViewRoleEnum,
  EndpointBindingView,
  EndpointBindingViewCaptureLevelEnum,
  SupplierAuthConfigsService,
  SupplierCommercialAccountsService,
  SupplierEndpointBindingsService,
  SupplierVendorProfilesService,
  VendorProfileView,
  VendorProfileViewRetryBackoffEnum,
  VendorProfileViewSourceOfTruthEnum,
} from '@durion-sdk/supplier';
import { LocationAPIService, LocationResponseDTO } from '@durion-sdk/location';
import { SupplierProfileService } from './supplier-profile.service';
import {
  SupplierAccounts,
  SupplierAuthConfigRequest,
  SupplierBindingRequest,
  VendorProfileRequest,
} from '../models/supplier-profile.models';

const PROFILE_ID = 'ffc9a4c2-0000-7000-8000-000000000001';
const LOCATION_A = 'ffc9a4c2-0000-7000-8000-0000000000aa';
const LOCATION_B = 'ffc9a4c2-0000-7000-8000-0000000000bb';

const profileView: VendorProfileView = {
  vendorProfileId: PROFILE_ID,
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  sourceOfTruth: VendorProfileViewSourceOfTruthEnum.Admin,
  connectTimeoutMillis: 5000,
  readTimeoutMillis: 20000,
  maxRetries: 2,
  sandboxBaseUrlOverride: 'https://sandbox.example.com',
  retryBackoff: VendorProfileViewRetryBackoffEnum.Exponential,
};

const authConfigView: AuthConfigView = {
  authConfigId: 'auth-1',
  name: 'michelin-prod',
  type: AuthConfigViewTypeEnum.BasicPlusApikey,
  apiKeyHeader: 'X-Api-Key',
};

const billingView: CommercialAccountView = {
  accountId: 'acct-billing',
  role: CommercialAccountViewRoleEnum.Billing,
  accountNumber: '4711',
  agencyCode: 'A1',
};

const deliveryView: CommercialAccountView = {
  accountId: 'acct-delivery',
  role: CommercialAccountViewRoleEnum.Delivery,
  accountNumber: '4711-01',
  deliveryLocationId: LOCATION_A,
};

const bindingView: EndpointBindingView = {
  bindingId: 'bind-1',
  capability: 'PRICE_CATALOG',
  protocolFamily: 'EDIWHEEL_B',
  version: 'B4_0',
  baseUrl: 'https://edi.example.com',
  path: '/pricat',
  authConfigName: 'michelin-prod',
  schedule: '0 0 3 * * *',
  enabled: true,
  captureLevel: EndpointBindingViewCaptureLevelEnum.Redacted,
};

// SDK 0.11 made the repair-capability counts required on LocationResponseDTO.
// Supplier profiles care only about id/name/active, so the fixtures state the
// contract's own rule: an inactive location always reports zero and no capability.
const activeLocation: LocationResponseDTO = {
  id: LOCATION_A,
  name: 'Springfield Main',
  active: true,
  activeBayCount: 2,
  activeMobileUnitCount: 0,
  hasRepairCapability: true,
};
const secondActiveLocation: LocationResponseDTO = {
  id: LOCATION_B,
  name: 'Shelbyville',
  active: true,
  activeBayCount: 1,
  activeMobileUnitCount: 1,
  hasRepairCapability: true,
};
const inactiveLocation: LocationResponseDTO = {
  id: 'loc-dead',
  name: 'Closed Depot',
  active: false,
  activeBayCount: 0,
  activeMobileUnitCount: 0,
  hasRepairCapability: false,
};

const profileRequest: VendorProfileRequest = {
  supplierRef: 'michelin-eu',
  displayName: 'Michelin EU',
  enabled: true,
  sandbox: false,
  connectTimeoutMillis: 5000,
  readTimeoutMillis: 20000,
  maxRetries: 2,
  retryBackoff: 'EXPONENTIAL',
};

describe('SupplierProfileService', () => {
  let service: SupplierProfileService;

  const profilesSdk = {
    listVendorProfiles: vi.fn(),
    getVendorProfile: vi.fn(),
    createVendorProfile: vi.fn(),
    updateVendorProfile: vi.fn(),
    deleteVendorProfile: vi.fn(),
  };
  const authConfigsSdk = {
    listAuthConfigs: vi.fn(),
    createAuthConfig: vi.fn(),
    updateAuthConfig: vi.fn(),
    deleteAuthConfig: vi.fn(),
  };
  const accountsSdk = {
    listCommercialAccounts: vi.fn(),
    createCommercialAccount: vi.fn(),
    updateCommercialAccount: vi.fn(),
    deleteCommercialAccount: vi.fn(),
  };
  const bindingsSdk = {
    listEndpointBindings: vi.fn(),
    createEndpointBinding: vi.fn(),
    updateEndpointBinding: vi.fn(),
    deleteEndpointBinding: vi.fn(),
  };
  const locationSdk = { listLocations: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SupplierProfileService,
        { provide: SupplierVendorProfilesService, useValue: profilesSdk },
        { provide: SupplierAuthConfigsService, useValue: authConfigsSdk },
        { provide: SupplierCommercialAccountsService, useValue: accountsSdk },
        { provide: SupplierEndpointBindingsService, useValue: bindingsSdk },
        { provide: LocationAPIService, useValue: locationSdk },
      ],
    });
    service = TestBed.inject(SupplierProfileService);
  });

  afterEach(() => vi.clearAllMocks());

  // ── Profiles ───────────────────────────────────────────────────────────────

  it('listProfiles() maps the SDK view to profile summaries', () => {
    profilesSdk.listVendorProfiles.mockReturnValue(of([profileView]));

    let result: unknown;
    service.listProfiles().subscribe(value => (result = value));

    expect(profilesSdk.listVendorProfiles).toHaveBeenCalled();
    expect(result).toEqual([
      {
        vendorProfileId: PROFILE_ID,
        supplierRef: 'michelin-eu',
        displayName: 'Michelin EU',
        enabled: true,
        sandbox: false,
        sourceOfTruth: 'ADMIN',
      },
    ]);
  });

  it('listProfiles() resolves the SDK’s optional fields at the boundary', () => {
    profilesSdk.listVendorProfiles.mockReturnValue(of([{} as VendorProfileView]));

    let result: { supplierRef: string; enabled: boolean }[] = [];
    service.listProfiles().subscribe(value => (result = value));

    expect(result[0].supplierRef).toBe('');
    expect(result[0].enabled).toBe(false);
  });

  it('getProfile() carries the contract-named timeout fields through', () => {
    profilesSdk.getVendorProfile.mockReturnValue(of(profileView));

    let result: { connectTimeoutMillis?: number; readTimeoutMillis?: number } = {};
    service.getProfile(PROFILE_ID).subscribe(value => (result = value));

    expect(profilesSdk.getVendorProfile).toHaveBeenCalledWith(PROFILE_ID);
    expect(result.connectTimeoutMillis).toBe(5000);
    expect(result.readTimeoutMillis).toBe(20000);
  });

  it('createProfile() sends the request without server-generated fields', () => {
    profilesSdk.createVendorProfile.mockReturnValue(of(profileView));

    service.createProfile(profileRequest).subscribe();

    const body = profilesSdk.createVendorProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('vendorProfileId');
    expect(body).not.toHaveProperty('sourceOfTruth');
    expect(body['connectTimeoutMillis']).toBe(5000);
    expect(body['retryBackoff']).toBe('EXPONENTIAL');
  });

  it('updateProfile() targets the profile id', () => {
    profilesSdk.updateVendorProfile.mockReturnValue(of(profileView));

    service.updateProfile(PROFILE_ID, profileRequest).subscribe();

    expect(profilesSdk.updateVendorProfile).toHaveBeenCalledWith(PROFILE_ID, expect.any(Object));
  });

  it('deleteProfile() completes with no value', () => {
    profilesSdk.deleteVendorProfile.mockReturnValue(of(null));

    let emitted: unknown = 'unset';
    service.deleteProfile(PROFILE_ID).subscribe(value => (emitted = value));

    expect(profilesSdk.deleteVendorProfile).toHaveBeenCalledWith(PROFILE_ID);
    expect(emitted).toBeUndefined();
  });

  // ── Auth configs ───────────────────────────────────────────────────────────

  it('listAuthConfigs() maps `name` to the local `authRef`', () => {
    authConfigsSdk.listAuthConfigs.mockReturnValue(of([authConfigView]));

    let result: { authRef: string; authType: string }[] = [];
    service.listAuthConfigs(PROFILE_ID).subscribe(value => (result = value));

    expect(authConfigsSdk.listAuthConfigs).toHaveBeenCalledWith(PROFILE_ID);
    expect(result[0].authRef).toBe('michelin-prod');
    expect(result[0].authType).toBe('BASIC_PLUS_APIKEY');
  });

  it('the auth read model exposes no credential material at all', () => {
    authConfigsSdk.listAuthConfigs.mockReturnValue(of([authConfigView]));

    let result: Record<string, unknown>[] = [];
    service.listAuthConfigs(PROFILE_ID).subscribe(value => (result = value as never));

    // `authRef` is the config's NAME, not a credential. The contract's
    // AuthConfigView has no credential field by shape — assert we did not
    // invent one on the way through.
    const refKeys = Object.keys(result[0]).filter(
      key => key.endsWith('Ref') && key !== 'authRef',
    );
    expect(refKeys).toEqual([]);
    expect(result[0]).not.toHaveProperty('passwordRef');
    expect(result[0]).not.toHaveProperty('clientSecretRef');
  });

  it('createAuthConfig() sends only scheme-prefixed references, never a secret', () => {
    authConfigsSdk.createAuthConfig.mockReturnValue(of(authConfigView));
    const request: SupplierAuthConfigRequest = {
      authRef: 'michelin-prod',
      authType: 'BASIC_PLUS_APIKEY',
      usernameRef: 'env:MICHELIN_EDI_USER',
      passwordRef: 'env:MICHELIN_EDI_PASSWORD',
      apiKeyRef: 'env:MICHELIN_EDI_APIKEY',
      apiKeyHeader: 'X-Api-Key',
    };

    service.createAuthConfig(PROFILE_ID, request).subscribe();

    const [profileId, body] = authConfigsSdk.createAuthConfig.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(profileId).toBe(PROFILE_ID);
    expect(body['name']).toBe('michelin-prod');
    for (const [key, value] of Object.entries(body)) {
      if (key.endsWith('Ref') && value !== undefined) {
        expect(String(value)).toMatch(/^(env|secret|vault):/);
      }
    }
    expect(body).not.toHaveProperty('password');
    expect(body).not.toHaveProperty('apiKey');
    expect(body).not.toHaveProperty('clientSecret');
  });

  it('updateAuthConfig() targets the auth config id', () => {
    authConfigsSdk.updateAuthConfig.mockReturnValue(of(authConfigView));

    service
      .updateAuthConfig(PROFILE_ID, 'auth-1', { authRef: 'r', authType: 'BEARER' })
      .subscribe();

    expect(authConfigsSdk.updateAuthConfig).toHaveBeenCalledWith(
      PROFILE_ID,
      'auth-1',
      expect.objectContaining({ name: 'r', type: 'BEARER' }),
    );
  });

  it('deleteAuthConfig() targets the auth config id', () => {
    authConfigsSdk.deleteAuthConfig.mockReturnValue(of(null));

    service.deleteAuthConfig(PROFILE_ID, 'auth-1').subscribe();

    expect(authConfigsSdk.deleteAuthConfig).toHaveBeenCalledWith(PROFILE_ID, 'auth-1');
  });

  // ── Accounts + the delivery-gap composition ────────────────────────────────

  it('getAccounts() splits billing from delivery and names the mapped locations', () => {
    accountsSdk.listCommercialAccounts.mockReturnValue(of([billingView, deliveryView]));
    locationSdk.listLocations.mockReturnValue(of([activeLocation, secondActiveLocation]));

    let result!: SupplierAccounts;
    service.getAccounts(PROFILE_ID).subscribe(value => (result = value));

    expect(result.billing).toEqual({ accountId: 'acct-billing', accountNumber: '4711', agencyCode: 'A1' });
    expect(result.delivery).toHaveLength(1);
    expect(result.delivery[0].locationId).toBe(LOCATION_A);
    expect(result.delivery[0].locationName).toBe('Springfield Main');
    expect(result.locationsAvailable).toBe(true);
  });

  it('getAccounts() lists only active locations for the gap check', () => {
    accountsSdk.listCommercialAccounts.mockReturnValue(of([deliveryView]));
    locationSdk.listLocations.mockReturnValue(
      of([activeLocation, secondActiveLocation, inactiveLocation]),
    );

    let activeIds: string[] = [];
    service
      .getAccounts(PROFILE_ID)
      .subscribe(value => (activeIds = value.activeLocations.map(l => l.locationId)));

    expect(activeIds).toEqual([LOCATION_A, LOCATION_B]);
    expect(activeIds).not.toContain('loc-dead');
  });

  it('getAccounts() still returns the mappings when the location roster fails', () => {
    accountsSdk.listCommercialAccounts.mockReturnValue(of([billingView, deliveryView]));
    locationSdk.listLocations.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'x' })),
    );

    let result: { delivery: unknown[]; activeLocations: unknown[]; locationsAvailable: boolean } | null =
      null;
    let errored = false;
    service.getAccounts(PROFILE_ID).subscribe({
      next: value => (result = value),
      error: () => (errored = true),
    });

    // A pos-location outage must not take down the accounts tab.
    expect(errored).toBe(false);
    expect(result!.delivery).toHaveLength(1);
    // …but it must not claim "no gaps" either.
    expect(result!.locationsAvailable).toBe(false);
    expect(result!.activeLocations).toEqual([]);
  });

  it('getAccounts() reports no billing account when the profile has none', () => {
    accountsSdk.listCommercialAccounts.mockReturnValue(of([deliveryView]));
    locationSdk.listLocations.mockReturnValue(of([activeLocation]));

    let billing: unknown = 'unset';
    service.getAccounts(PROFILE_ID).subscribe(value => (billing = value.billing));

    expect(billing).toBeNull();
  });

  it('saveBillingAccount() creates with the BILLING role when there is no account id', () => {
    accountsSdk.createCommercialAccount.mockReturnValue(of(billingView));

    service.saveBillingAccount(PROFILE_ID, { accountNumber: '4711', agencyCode: 'A1' }).subscribe();

    expect(accountsSdk.updateCommercialAccount).not.toHaveBeenCalled();
    expect(accountsSdk.createCommercialAccount).toHaveBeenCalledWith(PROFILE_ID, {
      role: CommercialAccountRequestRoleEnum.Billing,
      accountNumber: '4711',
      agencyCode: 'A1',
    });
  });

  it('saveBillingAccount() updates in place when the account id is known', () => {
    accountsSdk.updateCommercialAccount.mockReturnValue(of(billingView));

    service
      .saveBillingAccount(PROFILE_ID, { accountId: 'acct-billing', accountNumber: '4712' })
      .subscribe();

    expect(accountsSdk.createCommercialAccount).not.toHaveBeenCalled();
    expect(accountsSdk.updateCommercialAccount).toHaveBeenCalledWith(
      PROFILE_ID,
      'acct-billing',
      expect.objectContaining({ role: CommercialAccountRequestRoleEnum.Billing }),
    );
  });

  it('saveDeliveryAccount() sends the location as deliveryLocationId with the DELIVERY role', () => {
    accountsSdk.createCommercialAccount.mockReturnValue(of(deliveryView));

    service
      .saveDeliveryAccount(PROFILE_ID, { locationId: LOCATION_A, accountNumber: '4711-01' })
      .subscribe();

    expect(accountsSdk.createCommercialAccount).toHaveBeenCalledWith(PROFILE_ID, {
      role: CommercialAccountRequestRoleEnum.Delivery,
      accountNumber: '4711-01',
      agencyCode: undefined,
      deliveryLocationId: LOCATION_A,
    });
  });

  it('saveDeliveryAccount() updates in place when the account id is known', () => {
    accountsSdk.updateCommercialAccount.mockReturnValue(of(deliveryView));

    service
      .saveDeliveryAccount(PROFILE_ID, {
        accountId: 'acct-delivery',
        locationId: LOCATION_A,
        accountNumber: '4711-02',
      })
      .subscribe();

    expect(accountsSdk.updateCommercialAccount).toHaveBeenCalledWith(
      PROFILE_ID,
      'acct-delivery',
      expect.objectContaining({ deliveryLocationId: LOCATION_A }),
    );
  });

  it('deleteAccount() targets the account id', () => {
    accountsSdk.deleteCommercialAccount.mockReturnValue(of(null));

    service.deleteAccount(PROFILE_ID, 'acct-delivery').subscribe();

    expect(accountsSdk.deleteCommercialAccount).toHaveBeenCalledWith(PROFILE_ID, 'acct-delivery');
  });

  // ── Bindings ───────────────────────────────────────────────────────────────

  it('listBindings() maps the contract field names onto the domain model', () => {
    bindingsSdk.listEndpointBindings.mockReturnValue(of([bindingView]));

    let result: {
      protocolVersion: string;
      authRef: string;
      cronSchedule?: string | null;
      captureLevel?: string;
    }[] = [];
    service.listBindings(PROFILE_ID).subscribe(value => (result = value));

    expect(result[0].protocolVersion).toBe('B4_0');
    expect(result[0].authRef).toBe('michelin-prod');
    expect(result[0].cronSchedule).toBe('0 0 3 * * *');
    expect(result[0].captureLevel).toBe('REDACTED');
  });

  it('createBinding() sends version/authConfigName/schedule under the contract names', () => {
    bindingsSdk.createEndpointBinding.mockReturnValue(of(bindingView));
    const request: SupplierBindingRequest = {
      capability: 'PRICE_CATALOG',
      protocolFamily: 'EDIWHEEL_B',
      protocolVersion: 'B4_0',
      baseUrl: 'https://edi.example.com',
      path: '/pricat',
      authRef: 'michelin-prod',
      cronSchedule: '0 0 3 * * *',
      enabled: true,
      captureLevel: 'REDACTED',
    };

    service.createBinding(PROFILE_ID, request).subscribe();

    const body = bindingsSdk.createEndpointBinding.mock.calls[0][1] as Record<string, unknown>;
    expect(body['version']).toBe('B4_0');
    expect(body['authConfigName']).toBe('michelin-prod');
    expect(body['schedule']).toBe('0 0 3 * * *');
    expect(body).not.toHaveProperty('bindingId');
    expect(body).not.toHaveProperty('protocolVersion');
  });

  it('createBinding() omits the schedule entirely for an on-demand capability', () => {
    bindingsSdk.createEndpointBinding.mockReturnValue(of(bindingView));

    service
      .createBinding(PROFILE_ID, {
        capability: 'ORDER',
        protocolFamily: 'EDIWHEEL_B',
        protocolVersion: 'B4_0',
        baseUrl: 'https://edi.example.com',
        path: '/order',
        authRef: 'michelin-prod',
        cronSchedule: null,
        enabled: true,
      })
      .subscribe();

    const body = bindingsSdk.createEndpointBinding.mock.calls[0][1] as Record<string, unknown>;
    expect(body['schedule']).toBeUndefined();
  });

  it('createBinding() accepts a capability key this UI has never heard of', () => {
    bindingsSdk.createEndpointBinding.mockReturnValue(of(bindingView));

    service
      .createBinding(PROFILE_ID, {
        capability: 'SOME_NEW_CAPABILITY',
        protocolFamily: 'BRAND_NEW_FAMILY',
        protocolVersion: 'Z9_9',
        baseUrl: 'https://edi.example.com',
        path: '/x',
        authRef: 'michelin-prod',
        enabled: true,
      })
      .subscribe();

    const body = bindingsSdk.createEndpointBinding.mock.calls[0][1] as Record<string, unknown>;
    expect(body['capability']).toBe('SOME_NEW_CAPABILITY');
    expect(body['protocolFamily']).toBe('BRAND_NEW_FAMILY');
    expect(body['version']).toBe('Z9_9');
  });

  it('updateBinding() targets the binding id', () => {
    bindingsSdk.updateEndpointBinding.mockReturnValue(of(bindingView));

    service
      .updateBinding(PROFILE_ID, 'bind-1', {
        capability: 'PRICE_CATALOG',
        protocolFamily: 'EDIWHEEL_B',
        protocolVersion: 'B4_0',
        baseUrl: 'https://edi.example.com',
        path: '/pricat',
        authRef: 'michelin-prod',
        enabled: false,
      })
      .subscribe();

    expect(bindingsSdk.updateEndpointBinding).toHaveBeenCalledWith(PROFILE_ID, 'bind-1', expect.any(Object));
  });

  it('deleteBinding() targets the binding id', () => {
    bindingsSdk.deleteEndpointBinding.mockReturnValue(of(null));

    service.deleteBinding(PROFILE_ID, 'bind-1').subscribe();

    expect(bindingsSdk.deleteEndpointBinding).toHaveBeenCalledWith(PROFILE_ID, 'bind-1');
  });
});
