import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoleManagementService, UserAPIService, PermissionRegistryService } from '@durion-sdk/security';
import type { RolePermissionsRequest } from '@durion-sdk/security';
import { ShopAuditService } from '@durion-sdk/shop-manager';
import type { ShopAuditFilter } from '@durion-sdk/shop-manager';
import {
  CreateRoleRequest,
  PagedResponse,
  RoleAssignment,
  SecurityPermission,
  SecurityRole,
  UpdateRolePermissionsRequest,
} from '../models/security.models';

@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly roleManagement = inject(RoleManagementService);
  private readonly userApi = inject(UserAPIService);
  private readonly permissionRegistry = inject(PermissionRegistryService);
  private readonly shopAuditSdk = inject(ShopAuditService);

  getAllRoles(_page = 0, _size = 20): Observable<PagedResponse<SecurityRole>> {
    return this.roleManagement.getAllRoles().pipe(
      map(roles => ({
        results: roles.map(role => ({
          name: role.name ?? '',
          description: role.description,
          grantedPermissions: role.permissions
            ? Array.from(role.permissions).map(p => ({ permissionKey: p.name ?? '' }))
            : undefined,
          createdAt: role.createdAt,
          updatedAt: role.lastModifiedAt,
        } satisfies SecurityRole)),
        totalCount: roles.length,
        pageNumber: _page,
        pageSize: _size,
        totalPages: Math.ceil(roles.length / _size),
      })),
    );
  }

  createRole(req: CreateRoleRequest): Observable<SecurityRole> {
    return this.roleManagement.createRole(req as unknown as { [key: string]: string }).pipe(
      map(dto => ({
        name: dto.name ?? '',
        description: dto.description,
        grantedPermissions: dto.permissions
          ? Array.from(dto.permissions).map(p => ({ permissionKey: p.name ?? '' }))
          : undefined,
        createdAt: dto.createdAt,
        updatedAt: dto.lastModifiedAt,
      } satisfies SecurityRole)),
    );
  }

  getRoleByName(name: string): Observable<SecurityRole> {
    return this.roleManagement.getRoleByName(name) as Observable<SecurityRole>;
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

  updateRolePermissions(req: UpdateRolePermissionsRequest): Observable<void> {
    const sdkReq: RolePermissionsRequest = {
      roleId: req.roleName,
      permissionNames: new Set(req.permissionKeys),
    };
    return this.roleManagement.updateRolePermissions(sdkReq).pipe(map(() => undefined));
  }

  revokeRoleAssignment(assignmentId: string): Observable<void> {
    return this.roleManagement.revokeRoleAssignment(assignmentId) as Observable<void>;
  }

  createUser(body: Record<string, unknown>): Observable<unknown> {
    return this.userApi.createUser(body as { [key: string]: unknown });
  }

  getUserById(userId: string): Observable<unknown> {
    return this.userApi.getUserById(userId) as Observable<unknown>;
  }

  getUserRoleAssignments(userId: string): Observable<RoleAssignment[]> {
    return this.roleManagement.getUserRoleAssignments(userId) as unknown as Observable<RoleAssignment[]>;
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
    const filter: ShopAuditFilter = { appointmentId };
    const result$ = this.shopAuditSdk.searchShopAudit(filter);
    return result$ as Observable<unknown[]>;
  }
}
