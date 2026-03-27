import { HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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
  private static readonly BASE = '/v1';

  constructor(private readonly api: ApiBaseService) {}

  getAllRoles(page = 0, size = 20): Observable<PagedResponse<SecurityRole>> {
    const params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    return this.api.get<PagedResponse<SecurityRole>>(`${SecurityService.BASE}/roles`, params);
  }

  createRole(req: CreateRoleRequest): Observable<SecurityRole> {
    return this.api.post<SecurityRole>(`${SecurityService.BASE}/roles`, req);
  }

  getRoleByName(name: string): Observable<SecurityRole> {
    return this.api.get<SecurityRole>(`${SecurityService.BASE}/roles/${encodeURIComponent(name)}`);
  }

  getAllPermissions(page = 0, size = 100): Observable<PagedResponse<SecurityPermission>> {
    const params = new HttpParams().set('page', page.toString()).set('size', size.toString());
    return this.api.get<PagedResponse<SecurityPermission>>(
      `${SecurityService.BASE}/permissions`,
      params,
    );
  }

  updateRolePermissions(req: UpdateRolePermissionsRequest): Observable<void> {
    return this.api.put<void>(`${SecurityService.BASE}/roles/permissions`, req);
  }

  revokeRoleAssignment(assignmentId: string): Observable<void> {
    return this.api.delete<void>(`${SecurityService.BASE}/roles/assignments/${encodeURIComponent(assignmentId)}`);
  }

  getUserRoleAssignments(userId: string): Observable<RoleAssignment[]> {
    return this.api.get<RoleAssignment[]>(
      `${SecurityService.BASE}/roles/assignments/user/${encodeURIComponent(userId)}`,
    );
  }
}
