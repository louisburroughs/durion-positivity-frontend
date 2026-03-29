import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { SecurityService } from '../../../services/security.service';
import { RoleDetailPageComponent } from './role-detail-page.component';
import { TranslateModule } from '@ngx-translate/core';

describe('RoleDetailPageComponent', () => {
  let fixture: ComponentFixture<RoleDetailPageComponent>;
  let component: RoleDetailPageComponent;

  const mockRole = {
    name: 'ROLE_ADMIN',
    description: 'Admin role',
    grantedPermissions: [
      { permissionKey: 'PERM_READ' },
      { permissionKey: 'PERM_WRITE' },
    ],
  };

  const mockAllPermissions = {
    results: [
      { permissionKey: 'PERM_READ' },
      { permissionKey: 'PERM_WRITE' },
      { permissionKey: 'PERM_DELETE' },
    ],
    totalCount: 3,
    pageNumber: 0,
    pageSize: 100,
    totalPages: 1,
  };

  const securityServiceStub = {
    getRoleByName: vi.fn().mockReturnValue(of(mockRole)),
    getAllPermissions: vi.fn().mockReturnValue(of(mockAllPermissions)),
    updateRolePermissions: vi.fn().mockReturnValue(of(undefined)),
  };

  const routeParamGet = vi.fn((key: string) => (key === 'name' ? 'ROLE_ADMIN' : null));
  const activatedRouteStub = {
    snapshot: { paramMap: { get: routeParamGet } },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        { provide: SecurityService, useValue: securityServiceStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleDetailPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('ngOnInit', () => {
    it('loads role by name from route param and populates role() and permissions() signals', () => {
      fixture.detectChanges();

      expect(securityServiceStub.getRoleByName).toHaveBeenCalledWith('ROLE_ADMIN');
      expect(component.role()?.name).toBe('ROLE_ADMIN');
      expect(component.permissions().length).toBe(2);
      expect(component.permissions()[0].permissionKey).toBe('PERM_READ');
    });

    it('loads all permissions for grant modal', () => {
      fixture.detectChanges();

      expect(securityServiceStub.getAllPermissions).toHaveBeenCalled();
      expect(component.allPermissions().length).toBe(3);
    });

    it('sets error when getRoleByName errors', () => {
      securityServiceStub.getRoleByName.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Role not found' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('Role not found');
    });

    it('sets error when route param is missing', () => {
      routeParamGet.mockReturnValueOnce(null);
      fixture.detectChanges();

      expect(component.error()).toBeTruthy();
    });

    it('sets loading to false after successful role load', () => {
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('sets loading to false after role load error', () => {
      securityServiceStub.getRoleByName.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Not found' } })),
      );
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
    });

    it('permissions() defaults to empty array when role.grantedPermissions is undefined', () => {
      securityServiceStub.getRoleByName.mockReturnValueOnce(
        of({ name: 'ROLE_EMPTY' }),
      );
      fixture.detectChanges();

      expect(component.permissions()).toEqual([]);
    });

    it('clears stale role, permissions, and confirmRevokeKey when service errors after previous load', () => {
      fixture.detectChanges();

      component.role.set({ name: 'STALE_ROLE' } as any);
      component.permissions.set([{ permissionKey: 'STALE_PERM' } as any]);
      component.confirmRevokeKey.set('SOME_KEY');

      securityServiceStub.getRoleByName.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Role not found' } })),
      );
      component.loadRole();

      expect(component.role()).toBeNull();
      expect(component.permissions()).toEqual([]);
      expect(component.confirmRevokeKey()).toBeNull();
    });
  });

  describe('openGrantModal()', () => {
    beforeEach(() => fixture.detectChanges());

    it('sets showGrantModal() to true', () => {
      expect(component.showGrantModal()).toBe(false);
      component.openGrantModal();
      expect(component.showGrantModal()).toBe(true);
    });

    it('pre-populates selectedPermKeys with currently granted permission keys', () => {
      component.openGrantModal();
      expect(component.selectedPermKeys()).toEqual(['PERM_READ', 'PERM_WRITE']);
    });
  });

  describe('togglePermission()', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.selectedPermKeys.set(['PERM_READ', 'PERM_WRITE']);
    });

    it('adds key when not present', () => {
      component.togglePermission('PERM_DELETE');
      expect(component.selectedPermKeys()).toContain('PERM_DELETE');
    });

    it('removes key when already present', () => {
      component.togglePermission('PERM_READ');
      expect(component.selectedPermKeys()).not.toContain('PERM_READ');
      expect(component.selectedPermKeys()).toContain('PERM_WRITE');
    });
  });

  describe('confirmRevoke() / cancelRevoke()', () => {
    beforeEach(() => fixture.detectChanges());

    it('confirmRevoke(key) sets confirmRevokeKey() to that key', () => {
      component.confirmRevoke('PERM_READ');
      expect(component.confirmRevokeKey()).toBe('PERM_READ');
    });

    it('cancelRevoke() clears confirmRevokeKey() to null', () => {
      component.confirmRevoke('PERM_READ');
      component.cancelRevoke();
      expect(component.confirmRevokeKey()).toBeNull();
    });
  });

  describe('executeRevoke()', () => {
    beforeEach(() => fixture.detectChanges());

    it('calls updateRolePermissions with filtered keys (excluding the revoked key) then reloads', () => {
      component.confirmRevoke('PERM_WRITE');
      component.executeRevoke();

      expect(securityServiceStub.updateRolePermissions).toHaveBeenCalledWith({
        roleName: 'ROLE_ADMIN',
        permissionKeys: ['PERM_READ'],
      });
      // reload triggers another getRoleByName call
      expect(securityServiceStub.getRoleByName).toHaveBeenCalledTimes(2);
    });

    it('clears confirmRevokeKey after successful revoke', () => {
      component.confirmRevoke('PERM_WRITE');
      component.executeRevoke();
      expect(component.confirmRevokeKey()).toBeNull();
    });

    it('does nothing when confirmRevokeKey is null', () => {
      component.executeRevoke();
      expect(securityServiceStub.updateRolePermissions).not.toHaveBeenCalled();
    });

    it('sets error and loading=false when revoke service call errors', () => {
      securityServiceStub.updateRolePermissions.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Revoke failed' } })),
      );
      component.confirmRevoke('PERM_WRITE');
      component.executeRevoke();

      expect(component.error()).toBe('Revoke failed');
      expect(component.loading()).toBe(false);
    });
  });

  describe('loadAllPermissions() error', () => {
    it('sets error when getAllPermissions errors', () => {
      securityServiceStub.getAllPermissions.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Permissions unavailable' } })),
      );
      fixture.detectChanges();

      expect(component.error()).toBe('Permissions unavailable');
    });
  });

  describe('submitGrantPermissions()', () => {
    beforeEach(() => fixture.detectChanges());

    it('calls updateRolePermissions, closes modal, and reloads the role', () => {
      component.openGrantModal();
      component.selectedPermKeys.set(['PERM_READ']);
      component.submitGrantPermissions();

      expect(securityServiceStub.updateRolePermissions).toHaveBeenCalledWith({
        roleName: 'ROLE_ADMIN',
        permissionKeys: ['PERM_READ'],
      });
      expect(component.showGrantModal()).toBe(false);
      expect(securityServiceStub.getRoleByName).toHaveBeenCalledTimes(2);
    });

    it('sets error and loading=false when updateRolePermissions errors', () => {
      securityServiceStub.updateRolePermissions.mockReturnValueOnce(
        throwError(() => ({ error: { message: 'Update failed' } })),
      );
      component.openGrantModal();
      component.submitGrantPermissions();

      expect(component.error()).toBe('Update failed');
      expect(component.loading()).toBe(false);
    });

    it('does nothing when role() is null', () => {
      component.role.set(null);
      component.submitGrantPermissions();

      expect(securityServiceStub.updateRolePermissions).not.toHaveBeenCalled();
    });
  });
});
