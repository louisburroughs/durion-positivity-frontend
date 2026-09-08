import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationRegistryService } from './navigation-registry.service';
import { CRM_PERMISSIONS, INVENTORY_PERMISSIONS } from '../../../core/security/route-permissions';
import type { NavItem } from '../models/nav-item.model';

describe('NavigationRegistryService', () => {
  let service: NavigationRegistryService;
  let roleSignal: ReturnType<typeof signal<boolean>>;
  /** null models a token with no perm_bits claim — permissions unknown. */
  let permissionSignal: ReturnType<typeof signal<string[] | null>>;

  beforeEach(() => {
    roleSignal = signal(false);
    permissionSignal = signal<string[] | null>(null);

    TestBed.configureTestingModule({
      providers: [
        NavigationRegistryService,
        {
          provide: AuthService,
          useValue: {
            hasAnyRole: vi.fn().mockImplementation(() => roleSignal()),
            permissionsKnown: vi.fn().mockImplementation(() => permissionSignal() !== null),
            hasAnyPermission: vi.fn().mockImplementation((permissions: readonly string[]) => {
              const granted = permissionSignal();
              return granted !== null && permissions.some(p => granted.includes(p));
            }),
          },
        },
      ],
    });

    service = TestBed.inject(NavigationRegistryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('visibleNavItems()', () => {
    describe('when the token carries no perm_bits claim', () => {
      it('returns 10 non-role-gated items when hasAnyRole returns false', () => {
        const items: NavItem[] = service.visibleNavItems();

        expect(items).toHaveLength(10);

        const keys = items.map(i => i.key);
        expect(keys).not.toContain('SHELL.NAV.ADMIN');
        expect(keys).not.toContain('SHELL.NAV.SECURITY');
      });

      it('returns all 14 items when user has ROLE_ADMIN', () => {
        roleSignal.set(true);

        const items: NavItem[] = service.visibleNavItems();

        expect(items).toHaveLength(14);

        const keys = items.map(i => i.key);
        expect(keys).toContain('SHELL.NAV.ADMIN');
        expect(keys).toContain('SHELL.NAV.SECURITY');
        expect(keys).toContain('SHELL.NAV.SITEMAP');
        expect(keys).toContain('SHELL.NAV.SUPPLIER');
      });

      it('recomputes reactively when the underlying role signal changes', () => {
        expect(service.visibleNavItems()).toHaveLength(10);

        roleSignal.set(true);

        expect(service.visibleNavItems()).toHaveLength(14);

        roleSignal.set(false);

        expect(service.visibleNavItems()).toHaveLength(10);
      });
    });

    describe('when the token carries permissions', () => {
      it('offers only the dashboard to a session holding no permissions', () => {
        permissionSignal.set([]);

        expect(service.visibleNavItems().map(i => i.key)).toEqual(['SHELL.NAV.DASHBOARD']);
      });

      it('offers a domain entry only to a session holding one of its permissions', () => {
        permissionSignal.set([CRM_PERMISSIONS[0]]);

        const keys = service.visibleNavItems().map(i => i.key);
        expect(keys).toContain('SHELL.NAV.CRM');
        expect(keys).not.toContain('SHELL.NAV.INVENTORY');
        expect(keys).not.toContain('SHELL.NAV.ACCOUNTING');
      });

      it('does not offer a role-gated entry to a permission-only session', () => {
        permissionSignal.set([INVENTORY_PERMISSIONS[0]]);

        const keys = service.visibleNavItems().map(i => i.key);
        expect(keys).toContain('SHELL.NAV.INVENTORY');
        expect(keys).not.toContain('SHELL.NAV.ADMIN');
        expect(keys).not.toContain('SHELL.NAV.SUPPLIER');
      });

      it('recomputes reactively when the granted permissions change', () => {
        permissionSignal.set([]);
        expect(service.visibleNavItems()).toHaveLength(1);

        permissionSignal.set([INVENTORY_PERMISSIONS[0]]);
        expect(service.visibleNavItems().map(i => i.key)).toContain('SHELL.NAV.INVENTORY');
      });
    });

    it('points the supplier nav item at the positivity landing page', () => {
      roleSignal.set(true);

      const item = service.visibleNavItems().find(i => i.key === 'SHELL.NAV.SUPPLIER');

      expect(item?.route).toBe('/app/positivity');
      expect(item?.group).toBe('admin');
      expect(item?.roles).toEqual(['ROLE_ADMIN']);
    });

    it('points the product nav item at the product landing page', () => {
      const item = service.visibleNavItems().find(i => i.key === 'SHELL.NAV.PRODUCT');

      expect(item?.route).toBe('/app/product');
    });

    it('points the location nav item at the location landing page', () => {
      const item = service.visibleNavItems().find(i => i.key === 'SHELL.NAV.LOCATION');

      expect(item?.route).toBe('/app/location');
    });
  });
});
