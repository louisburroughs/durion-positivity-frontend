import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationRegistryService } from './navigation-registry.service';
import type { NavItem } from '../models/nav-item.model';

describe('NavigationRegistryService', () => {
  let service: NavigationRegistryService;
  let roleSignal: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    roleSignal = signal(false);

    TestBed.configureTestingModule({
      providers: [
        NavigationRegistryService,
        {
          provide: AuthService,
          useValue: { hasAnyRole: vi.fn().mockImplementation(() => roleSignal()) },
        },
      ],
    });

    service = TestBed.inject(NavigationRegistryService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('visibleNavItems()', () => {
    it('returns 9 non-role-gated items when hasAnyRole returns false', () => {
      const items: NavItem[] = service.visibleNavItems();

      expect(items).toHaveLength(9);

      const keys = items.map(i => i.key);
      expect(keys).not.toContain('SHELL.NAV.ADMIN');
      expect(keys).not.toContain('SHELL.NAV.SECURITY');
    });

    it('returns all 11 items when user has ROLE_ADMIN', () => {
      roleSignal.set(true);

      const items: NavItem[] = service.visibleNavItems();

      expect(items).toHaveLength(11);

      const keys = items.map(i => i.key);
      expect(keys).toContain('SHELL.NAV.ADMIN');
      expect(keys).toContain('SHELL.NAV.SECURITY');
    });

    it('recomputes reactively when the underlying role signal changes', () => {
      expect(service.visibleNavItems()).toHaveLength(9);

      roleSignal.set(true);

      expect(service.visibleNavItems()).toHaveLength(11);

      roleSignal.set(false);

      expect(service.visibleNavItems()).toHaveLength(9);
    });

    it('points the location nav item at the concrete locations page', () => {
      const item = service.visibleNavItems().find(i => i.key === 'SHELL.NAV.LOCATION');

      expect(item?.route).toBe('/app/location/locations');
    });
  });
});
