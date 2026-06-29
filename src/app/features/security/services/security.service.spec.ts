import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PermissionRegistryService, RoleManagementService, UserAPIService } from '@durion-sdk/security';
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
    createRole: vi.fn(),
    getRoleByName: vi.fn(),
    updateRolePermissions: vi.fn(),
    revokeRoleAssignment: vi.fn(),
    getUserRoleAssignments: vi.fn(),
  };
  const userApiStub = { getUserById: vi.fn(), createUser: vi.fn() };
  const permissionRegistryStub = { listPermissions: vi.fn(), getAllPermissions1: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: RoleManagementService, useValue: roleManagementStub },
        { provide: UserAPIService, useValue: userApiStub },
        { provide: PermissionRegistryService, useValue: permissionRegistryStub },
      ],
    });
    service = TestBed.inject(SecurityService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllRoles()', () => {
    it('calls roleManagementSdk.getAllRoles() and maps the SDK role array into a paged response', () => {
      const pagedResp: PagedResponse<SecurityRole> = {
        results: [{ name: 'ROLE_ADMIN', description: 'Admin role' }],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 20,
        totalPages: 1,
      };
      roleManagementStub.getAllRoles.mockReturnValueOnce(of([
        {
          name: 'ROLE_ADMIN',
          description: 'Admin role',
        },
      ]));

      let result: PagedResponse<SecurityRole> | undefined;
      service.getAllRoles(0, 20).subscribe(r => (result = r));

      expect(roleManagementStub.getAllRoles).toHaveBeenCalledWith();
      expect(result).toEqual(pagedResp);
    });

    it('calls roleManagementSdk.getAllRoles() regardless of page/size args', () => {
      roleManagementStub.getAllRoles.mockReturnValueOnce(of([]));
      service.getAllRoles(2, 5).subscribe();

      expect(roleManagementStub.getAllRoles).toHaveBeenCalledWith();
    });
  });

  describe('createRole()', () => {
    it('delegates to RoleManagementService.createRole and maps RoleDto to SecurityRole', () => {
      const req: CreateRoleRequest = { name: 'ROLE_MANAGER', description: 'Manager role' };
      roleManagementStub.createRole.mockReturnValueOnce(of({
        name: 'ROLE_MANAGER',
        description: 'Manager role',
        permissions: new Set(),
        createdAt: '2024-01-01',
        lastModifiedAt: '2024-01-02',
      }));

      let result: SecurityRole | undefined;
      service.createRole(req).subscribe(r => (result = r));

      expect(roleManagementStub.createRole).toHaveBeenCalledWith(req);
      expect(result).toEqual({
        name: 'ROLE_MANAGER',
        description: 'Manager role',
        grantedPermissions: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      });
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
    it('calls permissionRegistry.listPermissions and maps SDK page to PagedResponse', () => {
      const sdkPage = {
        content: [{ name: 'PERM_READ' }],
        totalElements: 1,
        number: 0,
        size: 100,
        totalPages: 1,
      };
      permissionRegistryStub.listPermissions.mockReturnValueOnce(of(sdkPage));

      let result: PagedResponse<SecurityPermission> | undefined;
      service.getAllPermissions(0, 100).subscribe(r => (result = r));

      expect(permissionRegistryStub.listPermissions).toHaveBeenCalledOnce();
      expect(result).toEqual({
        results: [{ permissionKey: 'PERM_READ' }],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 100,
        totalPages: 1,
      });
    });
  });

  describe('updateRolePermissions()', () => {
    it('maps roleName to roleId and permissionKeys to a permissionNames Set', () => {
      const req: UpdateRolePermissionsRequest = {
        roleName: 'ROLE_ADMIN',
        permissionKeys: ['PERM_READ', 'PERM_WRITE'],
      };
      roleManagementStub.updateRolePermissions.mockReturnValueOnce(of(undefined));

      service.updateRolePermissions(req).subscribe();

      const sdkReq = roleManagementStub.updateRolePermissions.mock.calls[0]?.[0];
      expect(sdkReq).toEqual({
        roleId: 'ROLE_ADMIN',
        permissionNames: new Set(['PERM_READ', 'PERM_WRITE']),
      });
      expect(sdkReq.permissionNames).toBeInstanceOf(Set);
      expect(Array.from(sdkReq.permissionNames)).toEqual(['PERM_READ', 'PERM_WRITE']);
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
