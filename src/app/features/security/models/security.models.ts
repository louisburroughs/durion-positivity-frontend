export interface SecurityRole {
  name: string;
  description?: string;
  status?: string;
  grantedPermissions?: SecurityPermission[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SecurityPermission {
  permissionKey: string;
  description?: string;
}

export interface CreateRoleRequest {
  name: string;
  description?: string;
}

export interface UpdateRolePermissionsRequest {
  roleName: string;
  permissionKeys: string[];
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleName: string;
  scopeType: 'GLOBAL' | 'LOCATION';
  createdAt?: string;
}

export interface SecurityApiError {
  code: string;
  message: string;
  correlationId?: string;
  fieldErrors?: Array<{ field: string; message: string; rejectedValue?: unknown }>;
}

export interface PagedResponse<T> {
  results: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}
