export interface Role {
  code: string;
  label: string;
}

export interface RoleAssignment {
  assignmentId: string;
  personId: string;
  roleCode: string;
  scopeType: 'GLOBAL' | 'LOCATION';
  locationId?: string;
  effectiveStartAt: string;
  effectiveEndAt?: string;
  status?: string;
}

export interface CreateAssignmentRequest {
  personId: string;
  roleCode: string;
  scopeType: 'GLOBAL' | 'LOCATION';
  locationId?: string;
  effectiveStartAt: string;
  effectiveEndAt?: string;
}
