/**
 * Supplier vendor-profile administration client.
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * There is no `@durion-sdk/supplier` package. Per the documented convention for
 * SDK-less domains this service calls `ApiBaseService` directly (ADR-0010 —
 * never `HttpClient` in a feature). When the generated supplier SDK lands, only
 * this file changes; models, components, and pages are already SDK-agnostic.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1222 (admin API) as specified by
 * ADR-0050. Reconcile this block against the controller when the backend lands.
 *
 *   GET    /supplier/v1/vendor-profiles                              → VendorProfileSummary[]
 *   POST   /supplier/v1/vendor-profiles                              → VendorProfile
 *   GET    /supplier/v1/vendor-profiles/{profileId}                  → VendorProfile
 *   PUT    /supplier/v1/vendor-profiles/{profileId}                  → VendorProfile
 *   DELETE /supplier/v1/vendor-profiles/{profileId}                  → void
 *
 *   GET    /supplier/v1/vendor-profiles/{profileId}/auth-configs     → SupplierAuthConfig[]
 *   POST   /supplier/v1/vendor-profiles/{profileId}/auth-configs     → SupplierAuthConfig
 *   PUT    /supplier/v1/vendor-profiles/{profileId}/auth-configs/{authConfigId}
 *   DELETE /supplier/v1/vendor-profiles/{profileId}/auth-configs/{authConfigId}
 *
 *   GET    /supplier/v1/vendor-profiles/{profileId}/accounts         → SupplierAccounts
 *   PUT    /supplier/v1/vendor-profiles/{profileId}/accounts/billing → SupplierBillingAccount
 *   PUT    /supplier/v1/vendor-profiles/{profileId}/accounts/delivery/{locationId}
 *   DELETE /supplier/v1/vendor-profiles/{profileId}/accounts/delivery/{locationId}
 *
 *   GET    /supplier/v1/vendor-profiles/{profileId}/bindings         → SupplierBinding[]
 *   POST   /supplier/v1/vendor-profiles/{profileId}/bindings         → SupplierBinding
 *   PUT    /supplier/v1/vendor-profiles/{profileId}/bindings/{bindingId}
 *   DELETE /supplier/v1/vendor-profiles/{profileId}/bindings/{bindingId}
 *
 *   GET    /supplier/v1/vendor-profiles/{profileId}/health           → SupplierBindingHealth[]
 *   GET    /supplier/v1/capabilities                                 → SupplierCapabilityDescriptor[]
 *
 * The accounts response carries `activeLocations` so the UI can flag delivery
 * mapping gaps without reaching across the domain boundary into pos-location.
 *
 * Credential fields are write-only reference strings in both directions
 * (ADR-0050 §4): request payloads carry `env:`-style references and responses
 * never contain a resolved secret.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierAccounts,
  SupplierAuthConfig,
  SupplierAuthConfigRequest,
  SupplierBillingAccount,
  SupplierBillingAccountRequest,
  SupplierBinding,
  SupplierBindingHealth,
  SupplierBindingRequest,
  SupplierCapabilityDescriptor,
  SupplierDeliveryAccount,
  SupplierDeliveryAccountRequest,
  VendorProfile,
  VendorProfileRequest,
  VendorProfileSummary,
} from '../models/supplier-profile.models';

const ROOT = '/supplier/v1/vendor-profiles';

@Injectable({ providedIn: 'root' })
export class SupplierProfileService {
  private readonly api = inject(ApiBaseService);

  // ── Profiles ───────────────────────────────────────────────────────────────

  listProfiles(): Observable<VendorProfileSummary[]> {
    return this.api.get<VendorProfileSummary[]>(ROOT);
  }

  getProfile(vendorProfileId: string): Observable<VendorProfile> {
    return this.api.get<VendorProfile>(`${ROOT}/${vendorProfileId}`);
  }

  createProfile(request: VendorProfileRequest): Observable<VendorProfile> {
    return this.api.post<VendorProfile>(ROOT, request);
  }

  updateProfile(
    vendorProfileId: string,
    request: VendorProfileRequest,
  ): Observable<VendorProfile> {
    return this.api.put<VendorProfile>(`${ROOT}/${vendorProfileId}`, request);
  }

  deleteProfile(vendorProfileId: string): Observable<void> {
    return this.api.delete<void>(`${ROOT}/${vendorProfileId}`);
  }

  // ── Auth configs ───────────────────────────────────────────────────────────

  listAuthConfigs(vendorProfileId: string): Observable<SupplierAuthConfig[]> {
    return this.api.get<SupplierAuthConfig[]>(`${ROOT}/${vendorProfileId}/auth-configs`);
  }

  createAuthConfig(
    vendorProfileId: string,
    request: SupplierAuthConfigRequest,
  ): Observable<SupplierAuthConfig> {
    return this.api.post<SupplierAuthConfig>(
      `${ROOT}/${vendorProfileId}/auth-configs`,
      request,
    );
  }

  updateAuthConfig(
    vendorProfileId: string,
    authConfigId: string,
    request: SupplierAuthConfigRequest,
  ): Observable<SupplierAuthConfig> {
    return this.api.put<SupplierAuthConfig>(
      `${ROOT}/${vendorProfileId}/auth-configs/${authConfigId}`,
      request,
    );
  }

  deleteAuthConfig(vendorProfileId: string, authConfigId: string): Observable<void> {
    return this.api.delete<void>(`${ROOT}/${vendorProfileId}/auth-configs/${authConfigId}`);
  }

  // ── Accounts (billing / delivery — canonical vocabulary, ADR-0050 §5) ───────

  getAccounts(vendorProfileId: string): Observable<SupplierAccounts> {
    return this.api.get<SupplierAccounts>(`${ROOT}/${vendorProfileId}/accounts`);
  }

  updateBillingAccount(
    vendorProfileId: string,
    request: SupplierBillingAccountRequest,
  ): Observable<SupplierBillingAccount> {
    return this.api.put<SupplierBillingAccount>(
      `${ROOT}/${vendorProfileId}/accounts/billing`,
      request,
    );
  }

  upsertDeliveryAccount(
    vendorProfileId: string,
    request: SupplierDeliveryAccountRequest,
  ): Observable<SupplierDeliveryAccount> {
    const { locationId, ...payload } = request;
    return this.api.put<SupplierDeliveryAccount>(
      `${ROOT}/${vendorProfileId}/accounts/delivery/${locationId}`,
      payload,
    );
  }

  deleteDeliveryAccount(vendorProfileId: string, locationId: string): Observable<void> {
    return this.api.delete<void>(
      `${ROOT}/${vendorProfileId}/accounts/delivery/${locationId}`,
    );
  }

  // ── Capability bindings ────────────────────────────────────────────────────

  listBindings(vendorProfileId: string): Observable<SupplierBinding[]> {
    return this.api.get<SupplierBinding[]>(`${ROOT}/${vendorProfileId}/bindings`);
  }

  createBinding(
    vendorProfileId: string,
    request: SupplierBindingRequest,
  ): Observable<SupplierBinding> {
    return this.api.post<SupplierBinding>(`${ROOT}/${vendorProfileId}/bindings`, request);
  }

  updateBinding(
    vendorProfileId: string,
    bindingId: string,
    request: SupplierBindingRequest,
  ): Observable<SupplierBinding> {
    return this.api.put<SupplierBinding>(
      `${ROOT}/${vendorProfileId}/bindings/${bindingId}`,
      request,
    );
  }

  deleteBinding(vendorProfileId: string, bindingId: string): Observable<void> {
    return this.api.delete<void>(`${ROOT}/${vendorProfileId}/bindings/${bindingId}`);
  }

  // ── Health / registry ──────────────────────────────────────────────────────

  getHealth(vendorProfileId: string): Observable<SupplierBindingHealth[]> {
    return this.api.get<SupplierBindingHealth[]>(`${ROOT}/${vendorProfileId}/health`);
  }

  listCapabilities(): Observable<SupplierCapabilityDescriptor[]> {
    return this.api.get<SupplierCapabilityDescriptor[]>('/supplier/v1/capabilities');
  }
}
