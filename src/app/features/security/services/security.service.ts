import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RoleManagementService, UserAPIService } from '@durion-sdk/security';
import type { RolePermissionsRequest } from '@durion-sdk/security';
import { ApiBaseService } from '../../../core/services/api-base.service';
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
  private readonly api = inject(ApiBaseService);

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
    return this.api.post<SecurityRole>('/v1/roles', req);
  }

  getRoleByName(name: string): Observable<SecurityRole> {
    return this.roleManagement.getRoleByName(name) as Observable<SecurityRole>;
  }

  getAllPermissions(page = 0, size = 100): Observable<PagedResponse<SecurityPermission>> {
    const params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    return this.api.get<PagedResponse<SecurityPermission>>('/v1/permissions', params);
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
    return this.api.post<unknown>('/v1/users', body);
  }

  getUserById(userId: string): Observable<unknown> {
    return this.userApi.getUserById(userId) as Observable<unknown>;
  }

  getUserRoleAssignments(userId: string): Observable<RoleAssignment[]> {
    return this.roleManagement.getUserRoleAssignments(userId) as Observable<RoleAssignment[]>;
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
    const params = new HttpParams().set('appointmentId', appointmentId);
    return this.api.get<unknown[]>('/v1/shop/audit', params);
  }
}
