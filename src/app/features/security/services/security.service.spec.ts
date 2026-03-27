import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        { provide: ApiBaseService, useValue: apiStub },
      ],
    });
    service = TestBed.inject(SecurityService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllRoles()', () => {
    it('calls GET /v1/roles with page and size params and returns paged response', () => {
      const pagedResp: PagedResponse<SecurityRole> = {
        results: [{ name: 'ROLE_ADMIN' }],
        totalCount: 1,
        pageNumber: 0,
        pageSize: 20,
        totalPages: 1,
      };
      apiStub.get.mockReturnValueOnce(of(pagedResp));

      let result: PagedResponse<SecurityRole> | undefined;
      service.getAllRoles(0, 20).subscribe(r => (result = r));

      expect(apiStub.get).toHaveBeenCalledOnce();
      const [path, params] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/roles');
      expect(params.get('page')).toBe('0');
      expect(params.get('size')).toBe('20');
      expect(result).toEqual(pagedResp);
    });

    it('forwards page and size when non-default values are provided', () => {
      apiStub.get.mockReturnValueOnce(of({ results: [], totalCount: 0, pageNumber: 2, pageSize: 5, totalPages: 0 }));
      service.getAllRoles(2, 5).subscribe();

      const [, params] = apiStub.get.mock.calls[0];
      expect(params.get('page')).toBe('2');
      expect(params.get('size')).toBe('5');
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
    it('calls GET /v1/roles/{name} with the encoded name', () => {
      const role: SecurityRole = { name: 'ROLE_ADMIN' };
      apiStub.get.mockReturnValueOnce(of(role));

      let result: SecurityRole | undefined;
      service.getRoleByName('ROLE_ADMIN').subscribe(r => (result = r));

      expect(apiStub.get).toHaveBeenCalledWith('/v1/roles/ROLE_ADMIN');
      expect(result).toEqual(role);
    });

    it('encodes special characters in the role name', () => {
      apiStub.get.mockReturnValueOnce(of({ name: 'ROLE TEST' }));
      service.getRoleByName('ROLE TEST').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toContain('ROLE%20TEST');
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
    it('calls PUT /v1/roles/permissions with the request body', () => {
      const req: UpdateRolePermissionsRequest = {
        roleName: 'ROLE_ADMIN',
        permissionKeys: ['PERM_READ', 'PERM_WRITE'],
      };
      apiStub.put.mockReturnValueOnce(of(undefined));

      service.updateRolePermissions(req).subscribe();

      expect(apiStub.put).toHaveBeenCalledWith('/v1/roles/permissions', req);
    });
  });

  describe('revokeRoleAssignment()', () => {
    it('calls DELETE /v1/roles/assignments/{id} with the encoded assignment id', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));

      service.revokeRoleAssignment('assign-001').subscribe();

      expect(apiStub.delete).toHaveBeenCalledWith('/v1/roles/assignments/assign-001');
    });

    it('encodes special characters in assignment id', () => {
      apiStub.delete.mockReturnValueOnce(of(undefined));
      service.revokeRoleAssignment('assign/001').subscribe();

      const [path] = apiStub.delete.mock.calls[0];
      expect(path).toContain('assign%2F001');
    });
  });

  describe('getUserRoleAssignments()', () => {
    it('calls GET /v1/roles/assignments/user/{userId} and returns assignments', () => {
      const assignments: RoleAssignment[] = [
        { id: 'a1', userId: 'u1', roleName: 'ROLE_ADMIN', scopeType: 'GLOBAL' },
      ];
      apiStub.get.mockReturnValueOnce(of(assignments));

      let result: RoleAssignment[] | undefined;
      service.getUserRoleAssignments('u1').subscribe(r => (result = r));

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toBe('/v1/roles/assignments/user/u1');
      expect(result).toEqual(assignments);
    });

    it('encodes special characters in userId', () => {
      apiStub.get.mockReturnValueOnce(of([]));
      service.getUserRoleAssignments('user@domain.com').subscribe();

      const [path] = apiStub.get.mock.calls[0];
      expect(path).toContain('user%40domain.com');
    });
  });
});
