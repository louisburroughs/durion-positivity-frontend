import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoleManagementService, UserAPIService, PermissionRegistryService } from '@durion-sdk/security';
import type { CreateUserRequest as SdkCreateUserRequest, RoleDto, RolePermissionsRequest } from '@durion-sdk/security';
import { ShopAuditService } from '@durion-sdk/shop-manager';
import {
  CreateRoleRequest,
  PagedResponse,
  RoleAssignment,
  SecurityPermission,
  SecurityRole,
  UpdateRolePermissionsRequest,
} from '../models/security.models';

/**
 * One mapping for every role read. The SDK's `permissions` is typed as a `Set` but arrives as
 * a JSON array; `Array.from` covers both. `lastModifiedAt` is the SDK's name for `updatedAt`.
 */
function toSecurityRole(dto: RoleDto): SecurityRole {
  return {
    id: dto.id,
    name: dto.name ?? '',
    description: dto.description,
    grantedPermissions: dto.permissions
      ? Array.from(dto.permissions).map(p => ({ permissionKey: p.name ?? '', description: p.description }))
      : undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.lastModifiedAt,
  };
}

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly roleManagement = inject(RoleManagementService);
  private readonly userApi = inject(UserAPIService);
  private readonly permissionRegistry = inject(PermissionRegistryService);
  private readonly shopAuditSdk = inject(ShopAuditService);

  getAllRoles(_page = 0, _size = 20): Observable<PagedResponse<SecurityRole>> {
    return this.roleManagement.listRoles().pipe(
      map(roles => ({
        results: roles.map(toSecurityRole),
        totalCount: roles.length,
        pageNumber: _page,
        pageSize: _size,
        totalPages: Math.ceil(roles.length / _size),
      })),
    );
  }

  createRole(req: CreateRoleRequest): Observable<SecurityRole> {
    return this.roleManagement.createRole(req).pipe(map(toSecurityRole));
  }

  getRoleByName(name: string): Observable<SecurityRole> {
    // Was a bare cast: the SDK's `permissions` never became `grantedPermissions`, so the
    // role page showed an empty permission table for every role.
    return this.roleManagement.getRoleByName(name).pipe(map(toSecurityRole));
  }

  /**
   * Returns all permissions as an unpaged list.
   *
   * SDK gap: `PermissionRegistryService.listPermissions()` accepts only an optional `domain` filter;
   * it does not expose `page` or `size` parameters. The `page` and `size` arguments below are
   * accepted for API compatibility but are NOT forwarded to the SDK. The call always returns the
   * full permission set for the domain (or all domains if domain is unspecified).
   *
   * Follow-up: update the security OpenAPI spec to add `page`/`size` query params to
   * `GET /v1/permissions` if pagination is required by consumers, then regenerate `@durion-sdk/security`.
   */
  getAllPermissions(page = 0, size = 100): Observable<PagedResponse<SecurityPermission>> {
    return this.permissionRegistry.listPermissions().pipe(
      map(p => {
        const sdkPage = p as {
          content?: Array<{ name?: string }>;
          totalElements?: number;
          number?: number;
          size?: number;
          totalPages?: number;
        };

        return ({
          results: (sdkPage.content ?? []).map(perm => ({
            permissionKey: perm.name ?? '',
          } satisfies SecurityPermission)),
          totalCount: sdkPage.totalElements ?? 0,
          pageNumber: sdkPage.number ?? page,
          pageSize: sdkPage.size ?? size,
          totalPages: sdkPage.totalPages ?? 0,
        } satisfies PagedResponse<SecurityPermission>);
      }),
    );
  }

  /**
   * `PUT /v1/roles/permissions` keys on the role's UUID (`roleId`), not its name — the name
   * 404s. The SDK types `permissionNames` as a `Set`, but it hands the body straight to
   * HttpClient, and `JSON.stringify(new Set(...))` is `{}`; the backend's `Set<String>` reads a
   * JSON array, so send a de-duplicated array under that type.
   */
  updateRolePermissions(req: UpdateRolePermissionsRequest): Observable<void> {
    const sdkReq: RolePermissionsRequest = {
      roleId: req.roleId,
      permissionNames: [...new Set(req.permissionKeys)] as unknown as Set<string>,
    };
    return this.roleManagement.updateRolePermissions(sdkReq).pipe(map(() => undefined));
  }

  revokeRoleAssignment(assignmentId: string): Observable<void> {
    return this.roleManagement.revokeRoleAssignment(assignmentId) as Observable<void>;
  }

  createUser(body: Record<string, unknown>): Observable<unknown> {
    return this.userApi.createUser(body as unknown as SdkCreateUserRequest);
  }

  getUserById(userId: string): Observable<unknown> {
    return this.userApi.getUserById(userId) as Observable<unknown>;
  }

  getUserRoleAssignments(userId: string): Observable<RoleAssignment[]> {
    return this.roleManagement.listUserRoleAssignments(userId) as unknown as Observable<RoleAssignment[]>;
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
    const result$ = this.shopAuditSdk.searchShopAudit(undefined, appointmentId);
    return result$ as Observable<unknown[]>;
  }
}
