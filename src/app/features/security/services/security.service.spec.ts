import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { RoleManagementService, UserAPIService } from '@durion-sdk/security';
import {
  CreateRoleRequest,
  PagedResponse,
  RoleAssignment,
  SecurityPermission,
  SecurityRole,
  UpdateRolePermissionsRequest,
} from '../models/security.models';
import { SecurityService } from './security.service';

describe('SecurityService', () => {
  let service: SecurityService;

  const apiStub = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const roleManagementStub = {
    getAllRoles: vi.fn(),
    getRoleByName: vi.fn(),
    updateRolePermissions: vi.fn(),
    revokeRoleAssignment: vi.fn(),
    getUserRoleAssignments: vi.fn(),
  };
  const userApiStub = { getUserById: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: RoleManagementService, useValue: roleManagementStub },
        { provide: UserAPIService, useValue: userApiStub },
      ],
    });
    service = TestBed.inject(SecurityService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllRoles()', () => {
    it('calls roleManagementSdk.getAllRoles() and returns paged response', () => {
      const pagedResp: PagedResponse<SecurityRole> = {
        results: [{ name: 'ROLE_ADMIN' }],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 20,
        totalPages: 1,
      };
      roleManagementStub.getAllRoles.mockReturnValueOnce(of(pagedResp));

      let result: PagedResponse<SecurityRole> | undefined;
      service.getAllRoles(0, 20).subscribe(r => (result = r));

      expect(roleManagementStub.getAllRoles).toHaveBeenCalledWith();
      expect(result).toEqual(pagedResp);
    });

    it('calls roleManagementSdk.getAllRoles() regardless of page/size args', () => {
      roleManagementStub.getAllRoles.mockReturnValueOnce(of({ results: [], totalCount: 0, pageNumber: 2, pageSize: 5, totalPages: 0 }));
      service.getAllRoles(2, 5).subscribe();

      expect(roleManagementStub.getAllRoles).toHaveBeenCalledWith();
    });
  });

  describe('createRole()', () => {
    it('calls POST /v1/roles with the request body and returns created role', () => {
      const req: CreateRoleRequest = { name: 'ROLE_MANAGER', description: 'Manager role' };
      const createdRole: SecurityRole = { name: 'ROLE_MANAGER', description: 'Manager role' };
      apiStub.post.mockReturnValueOnce(of(createdRole));

      let result: SecurityRole | undefined;
      service.createRole(req).subscribe(r => (result = r));

      expect(apiStub.post).toHaveBeenCalledWith('/v1/roles', req);
      expect(result).toEqual(createdRole);
    });
  });

  describe('getRoleByName()', () => {
    it('calls roleManagementSdk.getRoleByName with the role name', () => {
      const role: SecurityRole = { name: 'ROLE_ADMIN' };
      roleManagementStub.getRoleByName.mockReturnValueOnce(of(role));

      let result: SecurityRole | undefined;
      service.getRoleByName('ROLE_ADMIN').subscribe(r => (result = r));

      expect(roleManagementStub.getRoleByName).toHaveBeenCalledWith('ROLE_ADMIN');
      expect(result).toEqual(role);
    });

    it('passes role name as-is to the SDK', () => {
      roleManagementStub.getRoleByName.mockReturnValueOnce(of({ name: 'ROLE TEST' }));
      service.getRoleByName('ROLE TEST').subscribe();

      expect(roleManagementStub.getRoleByName).toHaveBeenCalledWith('ROLE TEST');
    });
  });

  describe('getAllPermissions()', () => {
    it('calls GET /v1/permissions with page and size params', () => {
      const pagedResp: PagedResponse<SecurityPermission> = {
        results: [{ permissionKey: 'PERM_READ' }],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 100,
        totalPages: 1,
      };
      apiStub.get.mockReturnValueOnce(of(pagedResp));

      let result: PagedResponse<SecurityPermission> | undefined;
      service.getAllPermissions(0, 100).subscribe(r => (result = r));

      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/permissions');
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('100');
      expect(result).toEqual(pagedResp);
    });
  });

  describe('updateRolePermissions()', () => {
    it('calls roleManagementSdk.updateRolePermissions with the request body', () => {
      const req: UpdateRolePermissionsRequest = {
        roleName: 'ROLE_ADMIN',
        permissionKeys: ['PERM_READ', 'PERM_WRITE'],
      };
      roleManagementStub.updateRolePermissions.mockReturnValueOnce(of(undefined));

      service.updateRolePermissions(req).subscribe();

      expect(roleManagementStub.updateRolePermissions).toHaveBeenCalledWith(req);
    });
  });

  describe('revokeRoleAssignment()', () => {
    it('calls roleManagementSdk.revokeRoleAssignment with the assignment id', () => {
      roleManagementStub.revokeRoleAssignment.mockReturnValueOnce(of(undefined));

      service.revokeRoleAssignment('assign-001').subscribe();

      expect(roleManagementStub.revokeRoleAssignment).toHaveBeenCalledWith('assign-001');
    });

    it('passes assignmentId as-is to the SDK', () => {
      roleManagementStub.revokeRoleAssignment.mockReturnValueOnce(of(undefined));
      service.revokeRoleAssignment('assign/001').subscribe();

      expect(roleManagementStub.revokeRoleAssignment).toHaveBeenCalledWith('assign/001');
    });
  });

  describe('getUserRoleAssignments()', () => {
    it('calls roleManagementSdk.getUserRoleAssignments with the userId', () => {
      const assignments: RoleAssignment[] = [
        { id: 'a1', userId: 'u1', roleName: 'ROLE_ADMIN', scopeType: 'GLOBAL' },
      ];
      roleManagementStub.getUserRoleAssignments.mockReturnValueOnce(of(assignments));

      let result: RoleAssignment[] | undefined;
      service.getUserRoleAssignments('u1').subscribe(r => (result = r));

      expect(roleManagementStub.getUserRoleAssignments).toHaveBeenCalledWith('u1');
      expect(result).toEqual(assignments);
    });

    it('passes userId as-is to the SDK', () => {
      roleManagementStub.getUserRoleAssignments.mockReturnValueOnce(of([]));
      service.getUserRoleAssignments('user@domain.com').subscribe();

      expect(roleManagementStub.getUserRoleAssignments).toHaveBeenCalledWith('user@domain.com');
    });
  });
});
