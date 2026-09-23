import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PermissionRegistryService, RoleManagementService, UserAPIService } from '@durion-sdk/security';
import { ShopAuditService } from '@durion-sdk/shop-manager';
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
    listRoles: vi.fn(),
    createRole: vi.fn(),
    getRoleByName: vi.fn(),
    updateRolePermissions: vi.fn(),
    revokeRoleAssignment: vi.fn(),
    listUserRoleAssignments: vi.fn(),
  };
  const userApiStub = { getUserById: vi.fn(), createUser: vi.fn() };
  const permissionRegistryStub = { listPermissions: vi.fn(), getAllPermissions1: vi.fn() };
  const shopAuditStub = { searchShopAudit: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SecurityService,
        { provide: ApiBaseService, useValue: apiStub },
        { provide: RoleManagementService, useValue: roleManagementStub },
        { provide: UserAPIService, useValue: userApiStub },
        { provide: PermissionRegistryService, useValue: permissionRegistryStub },
        { provide: ShopAuditService, useValue: shopAuditStub },
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
      roleManagementStub.listRoles.mockReturnValueOnce(of([
        {
          name: 'ROLE_ADMIN',
          description: 'Admin role',
        },
      ]));

      let result: PagedResponse<SecurityRole> | undefined;
      service.getAllRoles(0, 20).subscribe(r => (result = r));

      expect(roleManagementStub.listRoles).toHaveBeenCalledWith();
      expect(result).toEqual(pagedResp);
    });

    it('calls roleManagementSdk.getAllRoles() regardless of page/size args', () => {
      roleManagementStub.listRoles.mockReturnValueOnce(of([]));
      service.getAllRoles(2, 5).subscribe();

      expect(roleManagementStub.listRoles).toHaveBeenCalledWith();
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
    it('maps the SDK RoleDto — id, permissions and lastModifiedAt — into a SecurityRole', () => {
      // Shaped after the SDK's RoleDto: `permissions` is typed as a Set but arrives as a JSON array.
      roleManagementStub.getRoleByName.mockReturnValueOnce(of({
        id: '018f0a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
        name: 'INVENTORY_LEAD',
        description: 'Runs the parts room',
        permissions: [
          { id: 'p-1', name: 'inventory:item:view', domain: 'inventory', deprecated: false, description: 'See items' },
          { id: 'p-2', name: 'inventory:item:edit', domain: 'inventory', deprecated: false },
        ],
        createdAt: '2026-09-01T00:00:00Z',
        lastModifiedAt: '2026-09-20T00:00:00Z',
      }));

      let result: SecurityRole | undefined;
      service.getRoleByName('INVENTORY_LEAD').subscribe(r => (result = r));

      expect(roleManagementStub.getRoleByName).toHaveBeenCalledWith('INVENTORY_LEAD');
      expect(result).toEqual({
        id: '018f0a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
        name: 'INVENTORY_LEAD',
        description: 'Runs the parts room',
        grantedPermissions: [
          { permissionKey: 'inventory:item:view', description: 'See items' },
          { permissionKey: 'inventory:item:edit', description: undefined },
        ],
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
      } satisfies SecurityRole);
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
    it('sends the role UUID and a JSON-serializable, de-duplicated permissionNames list', () => {
      const req: UpdateRolePermissionsRequest = {
        roleId: '018f0a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
        permissionKeys: ['PERM_READ', 'PERM_WRITE', 'PERM_READ'],
      };
      roleManagementStub.updateRolePermissions.mockReturnValueOnce(of(undefined));

      service.updateRolePermissions(req).subscribe();

      const sdkReq = roleManagementStub.updateRolePermissions.mock.calls[0]?.[0];
      expect(sdkReq.roleId).toBe('018f0a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b');
      // The SDK types this as a Set, but HttpClient JSON-encodes the body as-is and a Set
      // encodes to `{}` — the wire shape must be an array or the backend gets no names.
      expect(JSON.parse(JSON.stringify(sdkReq))).toEqual({
        roleId: '018f0a1b-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
        permissionNames: ['PERM_READ', 'PERM_WRITE'],
      });
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
        { id: 'a1', userId: 'u1', roleName: 'ROLE_ADMIN' },
      ];
      roleManagementStub.listUserRoleAssignments.mockReturnValueOnce(of(assignments));

      let result: RoleAssignment[] | undefined;
      service.getUserRoleAssignments('u1').subscribe(r => (result = r));

      expect(roleManagementStub.listUserRoleAssignments).toHaveBeenCalledWith('u1');
      expect(result).toEqual(assignments);
    });

    it('passes userId as-is to the SDK', () => {
      roleManagementStub.listUserRoleAssignments.mockReturnValueOnce(of([]));
      service.getUserRoleAssignments('user@domain.com').subscribe();

      expect(roleManagementStub.listUserRoleAssignments).toHaveBeenCalledWith('user@domain.com');
    });
  });
  // ── SDK delegation (ADR-0035 minimum coverage for migrated methods) ────────

  describe('createUser()', () => {
    it('forwards the body to UserAPIService.createUser', () => {
      userApiStub.createUser.mockReturnValueOnce(of({ id: 'u-1' }));

      let result: unknown;
      service.createUser({ username: 'alex', password: 'pw', roles: ['ADMIN'] }).subscribe(r => (result = r));

      expect(userApiStub.createUser).toHaveBeenCalledWith({
        username: 'alex',
        password: 'pw',
        roles: ['ADMIN'],
      });
      expect(result).toEqual({ id: 'u-1' });
    });
  });

  describe('searchAudit()', () => {
    it('passes the appointmentId as the second positional SDK parameter', () => {
      shopAuditStub.searchShopAudit.mockReturnValueOnce(of([]));

      service.searchAudit('appt-1').subscribe();

      expect(shopAuditStub.searchShopAudit).toHaveBeenCalledWith(undefined, 'appt-1');
    });

    it('emits the audit entries returned by the SDK', () => {
      const entries = [{ auditId: 'a-1', appointmentId: 'appt-1' }];
      shopAuditStub.searchShopAudit.mockReturnValueOnce(of(entries));

      let result: unknown[] | undefined;
      service.searchAudit('appt-1').subscribe(r => (result = r));

      expect(result).toEqual(entries);
    });
  });
});
