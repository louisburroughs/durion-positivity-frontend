import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  PlatformTenantAPIService,
  TenantCreateRequest as SdkTenantCreateRequest,
  TenantResponse,
} from '@durion-sdk/tenant';
import { Tenant, TenantCreateRequest, TenantStatus } from '../models/tenant.models';

/**
 * Platform Tenant API (`@durion-sdk/tenant`, gateway `/tenant/v1/platform/tenants`).
 *
 * Every call needs a `platform:tenant:*` authority and a session bound to the
 * platform tenant; pos-tenant answers 403 `PLATFORM_TENANT_REQUIRED` otherwise.
 * The caller's own tenant context is never supplied by the client — the
 * gateway binds it from the token (ADR-0062). The tenant ids in these paths
 * are the target resources of the registry, not the caller's binding.
 *
 * ADR-0062 §7: `@durion-sdk/tenant` is consumed only under `features/platform`.
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantService {
  private readonly api = inject(PlatformTenantAPIService);

  /** `listTenants` — every tenant, oldest first, optionally filtered by status. */
  listTenants(status?: TenantStatus): Observable<Tenant[]> {
    return this.api.listTenants(status).pipe(map(tenants => tenants.map(t => this.toTenant(t))));
  }

  /** `getTenant` — one tenant's registry record. */
  getTenant(id: string): Observable<Tenant> {
    return this.api.getTenant(id).pipe(map(t => this.toTenant(t)));
  }

  /** `createTenant` — registers a PENDING tenant; provisioning moves it to ACTIVE. */
  createTenant(request: TenantCreateRequest): Observable<Tenant> {
    return this.api
      .createTenant(request as SdkTenantCreateRequest)
      .pipe(map(t => this.toTenant(t)));
  }

  /** `suspendTenant` — ACTIVE → SUSPENDED; logins for the tenant are refused. */
  suspendTenant(id: string): Observable<Tenant> {
    return this.api.suspendTenant(id).pipe(map(t => this.toTenant(t)));
  }

  /** `reactivateTenant` — SUSPENDED → ACTIVE. */
  reactivateTenant(id: string): Observable<Tenant> {
    return this.api.reactivateTenant(id).pipe(map(t => this.toTenant(t)));
  }

  private toTenant(dto: TenantResponse): Tenant {
    return {
      id: dto.id,
      slug: dto.slug,
      displayName: dto.displayName,
      status: dto.status as TenantStatus,
      accountId: dto.accountId,
      cell: dto.cell ?? null,
      initialAdminEmail: dto.initialAdminEmail,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      activatedAt: dto.activatedAt ?? null,
      suspendedAt: dto.suspendedAt ?? null,
      decommissionedAt: dto.decommissionedAt ?? null,
    };
  }
}
