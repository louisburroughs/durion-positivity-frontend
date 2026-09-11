import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { Tenant, TenantCreateRequest, TenantStatus } from '../models/tenant.models';

/**
 * Platform Tenant API (`/tenant/v1/platform/tenants` through the gateway).
 *
 * Every call needs a `platform:tenant:*` authority and a session bound to the
 * platform tenant; pos-tenant answers 403 `PLATFORM_TENANT_REQUIRED` otherwise.
 * The caller's own tenant context is never supplied by the client — the
 * gateway binds it from the token (ADR-0062). The tenant ids in these paths
 * are the target resources of the registry, not the caller's binding.
 *
 * Talks to `ApiBaseService` with local models until `@durion-sdk/tenant` is
 * generated; the method surface mirrors the operation ids of pos-tenant's
 * `PlatformTenantController` so the swap is mechanical.
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantService {
  private static readonly BASE = '/tenant/v1/platform/tenants';

  private readonly api = inject(ApiBaseService);

  /** `listTenants` — every tenant, oldest first, optionally filtered by status. */
  listTenants(status?: TenantStatus): Observable<Tenant[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.api.get<Tenant[]>(PlatformTenantService.BASE, params);
  }

  /** `getTenant` — one tenant's registry record. */
  getTenant(id: string): Observable<Tenant> {
    return this.api.get<Tenant>(`${PlatformTenantService.BASE}/${encodeURIComponent(id)}`);
  }

  /** `createTenant` — registers a PENDING tenant; provisioning moves it to ACTIVE. */
  createTenant(request: TenantCreateRequest): Observable<Tenant> {
    return this.api.post<Tenant>(PlatformTenantService.BASE, request);
  }

  /** `suspendTenant` — ACTIVE → SUSPENDED; logins for the tenant are refused. */
  suspendTenant(id: string): Observable<Tenant> {
    return this.api.post<Tenant>(`${PlatformTenantService.BASE}/${encodeURIComponent(id)}/suspend`, null);
  }

  /** `reactivateTenant` — SUSPENDED → ACTIVE. */
  reactivateTenant(id: string): Observable<Tenant> {
    return this.api.post<Tenant>(
      `${PlatformTenantService.BASE}/${encodeURIComponent(id)}/reactivate`,
      null,
    );
  }
}
