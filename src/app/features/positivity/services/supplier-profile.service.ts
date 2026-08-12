/**
 * Supplier vendor-profile administration client.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Backed by the generated `@durion-sdk/supplier` client (ADR-0010: a feature
 * never injects `HttpClient`). The admin surface lives under
 * `/v1/supplier/admin/**` and is reached through four generated services:
 *
 *   SupplierVendorProfilesService      profiles
 *   SupplierAuthConfigsService         auth configs
 *   SupplierCommercialAccountsService  billing / delivery accounts
 *   SupplierEndpointBindingsService    capability bindings
 *
 * SDK view fields are almost all optional. That optionality is resolved **here**,
 * once, so pages and templates get the required-field shapes in
 * `models/supplier-profile.models.ts` and never carry `?? ''` noise.
 *
 * ── Delivery mapping gaps ────────────────────────────────────────────────────
 * The supplier contract has no active-location roster: a delivery account only
 * carries the `deliveryLocationId` it maps. The roster comes from
 * `@durion-sdk/location`, and the two are composed here so the accounts panel
 * still consumes a single `SupplierAccounts`-shaped result.
 *
 * A failure of the location call degrades **only** the gap check
 * (`locationsAvailable: false`) — the mappings the operator came to read still
 * render. Erroring the whole tab because a different domain was unreachable
 * would hide correct data to report an unrelated fault.
 *
 * ── Source-of-truth lock ─────────────────────────────────────────────────────
 * A profile with `sourceOfTruth: 'YAML'` rejects every mutation with `409`
 * (ADR-0050 §6). That is enforced by the backend; the UI surfaces it up front
 * by disabling write controls with a stated reason rather than hiding them.
 *
 * ── Not in the contract ──────────────────────────────────────────────────────
 * There is no health/circuit-breaker endpoint and no capability-registry
 * endpoint anywhere in the supplier SDK. Neither is called from here.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  AuthConfigRequest,
  AuthConfigRequestTypeEnum,
  AuthConfigView,
  CommercialAccountRequest,
  CommercialAccountRequestRoleEnum,
  CommercialAccountView,
  CommercialAccountViewRoleEnum,
  EndpointBindingRequest,
  EndpointBindingRequestCaptureLevelEnum,
  EndpointBindingView,
  SupplierAuthConfigsService,
  SupplierCommercialAccountsService,
  SupplierEndpointBindingsService,
  SupplierVendorProfilesService,
  VendorProfileRequest as SdkVendorProfileRequest,
  VendorProfileRequestRetryBackoffEnum,
  VendorProfileView,
} from '@durion-sdk/supplier';
import { LocationAPIService, LocationResponseDTO } from '@durion-sdk/location';
import {
  SupplierAccounts,
  SupplierActiveLocation,
  SupplierAuthConfig,
  SupplierAuthConfigRequest,
  SupplierBillingAccount,
  SupplierBillingAccountRequest,
  SupplierBinding,
  SupplierBindingRequest,
  SupplierCaptureLevel,
  SupplierDeliveryAccount,
  SupplierDeliveryAccountRequest,
  VendorProfile,
  VendorProfileRequest,
  VendorProfileSummary,
} from '../models/supplier-profile.models';

@Injectable({ providedIn: 'root' })
export class SupplierProfileService {
  private readonly profilesSdk = inject(SupplierVendorProfilesService);
  private readonly authConfigsSdk = inject(SupplierAuthConfigsService);
  private readonly accountsSdk = inject(SupplierCommercialAccountsService);
  private readonly bindingsSdk = inject(SupplierEndpointBindingsService);
  private readonly locationSdk = inject(LocationAPIService);

  // ── Profiles ───────────────────────────────────────────────────────────────

  listProfiles(): Observable<VendorProfileSummary[]> {
    return this.profilesSdk
      .listProfiles()
      .pipe(map(views => views.map(view => this.toProfileSummary(view))));
  }

  getProfile(vendorProfileId: string): Observable<VendorProfile> {
    return this.profilesSdk
      .getProfile(vendorProfileId)
      .pipe(map(view => this.toProfile(view)));
  }

  createProfile(request: VendorProfileRequest): Observable<VendorProfile> {
    return this.profilesSdk
      .createProfile(this.toSdkProfileRequest(request))
      .pipe(map(view => this.toProfile(view)));
  }

  updateProfile(
    vendorProfileId: string,
    request: VendorProfileRequest,
  ): Observable<VendorProfile> {
    return this.profilesSdk
      .updateProfile(vendorProfileId, this.toSdkProfileRequest(request))
      .pipe(map(view => this.toProfile(view)));
  }

  deleteProfile(vendorProfileId: string): Observable<void> {
    return this.profilesSdk.deleteProfile(vendorProfileId).pipe(map(() => undefined));
  }

  // ── Auth configs ───────────────────────────────────────────────────────────

  listAuthConfigs(vendorProfileId: string): Observable<SupplierAuthConfig[]> {
    return this.authConfigsSdk
      .listAuthConfigs(vendorProfileId)
      .pipe(map(views => views.map(view => this.toAuthConfig(view))));
  }

  createAuthConfig(
    vendorProfileId: string,
    request: SupplierAuthConfigRequest,
  ): Observable<SupplierAuthConfig> {
    return this.authConfigsSdk
      .createAuthConfig(vendorProfileId, this.toSdkAuthConfigRequest(request))
      .pipe(map(view => this.toAuthConfig(view)));
  }

  updateAuthConfig(
    vendorProfileId: string,
    authConfigId: string,
    request: SupplierAuthConfigRequest,
  ): Observable<SupplierAuthConfig> {
    return this.authConfigsSdk
      .updateAuthConfig(vendorProfileId, authConfigId, this.toSdkAuthConfigRequest(request))
      .pipe(map(view => this.toAuthConfig(view)));
  }

  deleteAuthConfig(vendorProfileId: string, authConfigId: string): Observable<void> {
    return this.authConfigsSdk
      .deleteAuthConfig(vendorProfileId, authConfigId)
      .pipe(map(() => undefined));
  }

  // ── Accounts (billing / delivery — canonical vocabulary, ADR-0050 §5) ───────

  /**
   * Accounts plus the active-location roster used for the mapping-gap check.
   *
   * The roster call is deliberately fault-tolerant: a pos-location outage sets
   * `locationsAvailable: false` and leaves the mappings intact.
   */
  getAccounts(vendorProfileId: string): Observable<SupplierAccounts> {
    return forkJoin({
      accounts: this.accountsSdk.listAccounts(vendorProfileId),
      locations: this.locationSdk
        .getAllLocations()
        .pipe(catchError(() => of<LocationResponseDTO[] | null>(null))),
    }).pipe(map(result => this.toAccounts(result.accounts, result.locations)));
  }

  /** Create or replace the profile's single BILLING account. */
  saveBillingAccount(
    vendorProfileId: string,
    request: SupplierBillingAccountRequest,
  ): Observable<SupplierBillingAccount> {
    const payload: CommercialAccountRequest = {
      role: CommercialAccountRequestRoleEnum.Billing,
      accountNumber: request.accountNumber,
      agencyCode: request.agencyCode,
    };
    const call$ = request.accountId
      ? this.accountsSdk.updateAccount(vendorProfileId, request.accountId, payload)
      : this.accountsSdk.createAccount(vendorProfileId, payload);
    return call$.pipe(map(view => this.toBillingAccount(view)));
  }

  /** Create or replace the DELIVERY account for one pos-location. */
  saveDeliveryAccount(
    vendorProfileId: string,
    request: SupplierDeliveryAccountRequest,
  ): Observable<SupplierDeliveryAccount> {
    const payload: CommercialAccountRequest = {
      role: CommercialAccountRequestRoleEnum.Delivery,
      accountNumber: request.accountNumber,
      agencyCode: request.agencyCode,
      deliveryLocationId: request.locationId,
    };
    const call$ = request.accountId
      ? this.accountsSdk.updateAccount(vendorProfileId, request.accountId, payload)
      : this.accountsSdk.createAccount(vendorProfileId, payload);
    return call$.pipe(map(view => this.toDeliveryAccount(view)));
  }

  deleteAccount(vendorProfileId: string, accountId: string): Observable<void> {
    return this.accountsSdk
      .deleteAccount(vendorProfileId, accountId)
      .pipe(map(() => undefined));
  }

  // ── Capability bindings ────────────────────────────────────────────────────

  listBindings(vendorProfileId: string): Observable<SupplierBinding[]> {
    return this.bindingsSdk
      .listBindings(vendorProfileId)
      .pipe(map(views => views.map(view => this.toBinding(view))));
  }

  createBinding(
    vendorProfileId: string,
    request: SupplierBindingRequest,
  ): Observable<SupplierBinding> {
    return this.bindingsSdk
      .createBinding(vendorProfileId, this.toSdkBindingRequest(request))
      .pipe(map(view => this.toBinding(view)));
  }

  updateBinding(
    vendorProfileId: string,
    bindingId: string,
    request: SupplierBindingRequest,
  ): Observable<SupplierBinding> {
    return this.bindingsSdk
      .updateBinding(vendorProfileId, bindingId, this.toSdkBindingRequest(request))
      .pipe(map(view => this.toBinding(view)));
  }

  deleteBinding(vendorProfileId: string, bindingId: string): Observable<void> {
    return this.bindingsSdk
      .deleteBinding(vendorProfileId, bindingId)
      .pipe(map(() => undefined));
  }

  // ── Mapping (SDK view ⇄ domain model) ──────────────────────────────────────

  private toProfileSummary(view: VendorProfileView): VendorProfileSummary {
    return {
      vendorProfileId: view.vendorProfileId ?? '',
      supplierRef: view.supplierRef ?? '',
      displayName: view.displayName ?? '',
      enabled: view.enabled ?? false,
      sandbox: view.sandbox ?? false,
      sourceOfTruth: view.sourceOfTruth ?? 'ADMIN',
    };
  }

  private toProfile(view: VendorProfileView): VendorProfile {
    return {
      ...this.toProfileSummary(view),
      connectTimeoutMillis: view.connectTimeoutMillis,
      readTimeoutMillis: view.readTimeoutMillis,
      maxRetries: view.maxRetries,
      sandboxBaseUrlOverride: view.sandboxBaseUrlOverride,
      retryBackoff: view.retryBackoff,
    };
  }

  private toSdkProfileRequest(request: VendorProfileRequest): SdkVendorProfileRequest {
    return {
      supplierRef: request.supplierRef,
      displayName: request.displayName,
      enabled: request.enabled,
      sandbox: request.sandbox,
      connectTimeoutMillis: request.connectTimeoutMillis,
      readTimeoutMillis: request.readTimeoutMillis,
      maxRetries: request.maxRetries,
      sandboxBaseUrlOverride: request.sandboxBaseUrlOverride,
      retryBackoff: request.retryBackoff as VendorProfileRequestRetryBackoffEnum | undefined,
    };
  }

  private toAuthConfig(view: AuthConfigView): SupplierAuthConfig {
    return {
      authConfigId: view.authConfigId ?? '',
      authRef: view.name ?? '',
      authType: view.type ?? 'BASIC_PLUS_APIKEY',
      apiKeyHeader: view.apiKeyHeader,
    };
  }

  private toSdkAuthConfigRequest(request: SupplierAuthConfigRequest): AuthConfigRequest {
    return {
      name: request.authRef,
      type: request.authType as AuthConfigRequestTypeEnum,
      usernameRef: request.usernameRef,
      passwordRef: request.passwordRef,
      apiKeyRef: request.apiKeyRef,
      apiKeyHeader: request.apiKeyHeader,
      tokenUrlRef: request.tokenUrlRef,
      clientIdRef: request.clientIdRef,
      clientSecretRef: request.clientSecretRef,
      bearerTokenRef: request.bearerTokenRef,
    };
  }

  private toBillingAccount(view: CommercialAccountView): SupplierBillingAccount {
    return {
      accountId: view.accountId ?? '',
      accountNumber: view.accountNumber ?? '',
      agencyCode: view.agencyCode,
    };
  }

  private toDeliveryAccount(
    view: CommercialAccountView,
    locationNames?: ReadonlyMap<string, string>,
  ): SupplierDeliveryAccount {
    const locationId = view.deliveryLocationId ?? '';
    return {
      accountId: view.accountId ?? '',
      locationId,
      locationName: locationNames?.get(locationId),
      accountNumber: view.accountNumber ?? '',
      agencyCode: view.agencyCode,
    };
  }

  /**
   * Compose the accounts view.
   *
   * `locations === null` means the roster call failed; the gap check is then
   * unavailable rather than empty — an empty roster would claim "no gaps", which
   * is the opposite of what we know.
   */
  private toAccounts(
    accounts: CommercialAccountView[],
    locations: LocationResponseDTO[] | null,
  ): SupplierAccounts {
    const activeLocations: SupplierActiveLocation[] = (locations ?? [])
      .filter(location => location.active === true)
      .map(location => ({ locationId: location.id, name: location.name }));
    const locationNames = new Map(
      (locations ?? []).map(location => [location.id, location.name] as const),
    );

    const billingView = accounts.find(
      account => account.role === CommercialAccountViewRoleEnum.Billing,
    );

    return {
      billing: billingView ? this.toBillingAccount(billingView) : null,
      delivery: accounts
        .filter(account => account.role === CommercialAccountViewRoleEnum.Delivery)
        .map(account => this.toDeliveryAccount(account, locationNames)),
      activeLocations,
      locationsAvailable: locations !== null,
    };
  }

  private toBinding(view: EndpointBindingView): SupplierBinding {
    return {
      bindingId: view.bindingId ?? '',
      capability: view.capability ?? '',
      protocolFamily: view.protocolFamily ?? '',
      protocolVersion: view.version ?? '',
      baseUrl: view.baseUrl ?? '',
      path: view.path ?? '',
      authRef: view.authConfigName ?? '',
      cronSchedule: view.schedule ?? null,
      enabled: view.enabled ?? false,
      captureLevel: view.captureLevel as SupplierCaptureLevel | undefined,
    };
  }

  private toSdkBindingRequest(request: SupplierBindingRequest): EndpointBindingRequest {
    return {
      capability: request.capability,
      protocolFamily: request.protocolFamily,
      version: request.protocolVersion,
      baseUrl: request.baseUrl,
      path: request.path,
      authConfigName: request.authRef,
      schedule: request.cronSchedule ?? undefined,
      enabled: request.enabled,
      captureLevel: request.captureLevel as EndpointBindingRequestCaptureLevelEnum | undefined,
    };
  }
}
