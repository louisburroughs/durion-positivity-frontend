import { describe, beforeEach, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Data, Router, UrlTree, provideRouter } from '@angular/router';

import { rolesChildGuard, rolesGuard } from './roles.guard';
import { AuthService } from '../services/auth.service';

/**
 * Fake session shaped like the parts of AuthService the guard reads.
 * `permissions: null` models a token with no `perm_bits` claim — permissions
 * unknown, which is not the same as a token that grants none.
 */
interface FakeSession {
  authenticated: boolean;
  roles: string[];
  permissions: string[] | null;
}

function snapshotWith(data: Data, path = 'inventory'): ActivatedRouteSnapshot {
  return {
    data,
    url: [{ path, parameters: {} }],
    pathFromRoot: [{ url: [{ path: 'app', parameters: {} }] }, { url: [{ path, parameters: {} }] }],
  } as unknown as ActivatedRouteSnapshot;
}

describe('rolesGuard / rolesChildGuard', () => {
  let session: FakeSession;

  const authStub = {
    isAuthenticated: () => session.authenticated,
    permissionsKnown: () => session.permissions !== null,
    hasAnyRole: (roles: readonly string[]) => roles.some(role => session.roles.includes(role)),
    hasAnyPermission: (permissions: readonly string[]) =>
      session.permissions !== null && permissions.some(p => session.permissions!.includes(p)),
    hasPermission: (permission: string) =>
      session.permissions !== null && session.permissions.includes(permission),
  };

  function evaluate(data: Data): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => rolesGuard(snapshotWith(data), {} as never)) as
      | boolean
      | UrlTree;
  }

  function urlOf(result: boolean | UrlTree): string {
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  beforeEach(() => {
    session = { authenticated: true, roles: [], permissions: [] };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: authStub }],
    });
  });

  it('redirects an unauthenticated visitor to /login with the attempted URL', () => {
    session.authenticated = false;
    expect(urlOf(evaluate({}))).toBe('/login?returnUrl=%2Fapp%2Finventory');
  });

  it('allows a route that declares no constraint', () => {
    expect(evaluate({})).toBe(true);
  });

  describe('role gating', () => {
    it('allows a user holding one of the required roles', () => {
      session.roles = ['ROLE_ADMIN'];
      expect(evaluate({ roles: ['ROLE_ADMIN'] })).toBe(true);
    });

    it('sends a user without the role to /forbidden', () => {
      session.roles = ['ROLE_TECHNICIAN'];
      expect(urlOf(evaluate({ roles: ['ROLE_ADMIN'] }))).toBe('/forbidden');
    });
  });

  describe('permission gating', () => {
    it('allows a user holding any one of the required permissions', () => {
      session.permissions = ['inventory:on_hand:view'];
      expect(evaluate({ permissions: ['inventory:adjustment:view', 'inventory:on_hand:view'] })).toBe(
        true,
      );
    });

    it('sends a user holding none of them to /forbidden', () => {
      session.permissions = ['crm:party:view'];
      expect(urlOf(evaluate({ permissions: ['inventory:on_hand:view'] }))).toBe('/forbidden');
    });

    it('sends a user whose token grants no permissions at all to /forbidden', () => {
      session.permissions = [];
      expect(urlOf(evaluate({ permissions: ['inventory:on_hand:view'] }))).toBe('/forbidden');
    });

    it('decides on permissions alone, ignoring roles, when the claim is present', () => {
      session.roles = ['ROLE_ADMIN'];
      session.permissions = [];
      expect(urlOf(evaluate({ permissions: ['inventory:on_hand:view'], roles: ['ROLE_ADMIN'] }))).toBe(
        '/forbidden',
      );
    });

    it('ignores non-string entries in the route data', () => {
      session.permissions = ['inventory:on_hand:view'];
      expect(evaluate({ permissions: [42, null, 'inventory:on_hand:view'] })).toBe(true);
    });
  });

  /**
   * A few endpoints AND two authorities — cross-dock needs
   * `inventory:receiving:complete` *and* `inventory:issue:parts`. Gating those
   * pages on "any of" would admit a session the backend still refuses.
   */
  describe('allPermissions gating', () => {
    const CROSS_DOCK = ['inventory:receiving:complete', 'inventory:issue:parts'];

    it('allows a user holding every required permission', () => {
      session.permissions = [...CROSS_DOCK, 'inventory:on_hand:view'];
      expect(evaluate({ allPermissions: CROSS_DOCK })).toBe(true);
    });

    it('sends a user holding only one of them to /forbidden', () => {
      session.permissions = ['inventory:receiving:complete'];
      expect(urlOf(evaluate({ allPermissions: CROSS_DOCK }))).toBe('/forbidden');
    });

    it('applies alongside an any-of list on the same route', () => {
      session.permissions = ['inventory:on_hand:view'];
      expect(
        urlOf(evaluate({ permissions: ['inventory:on_hand:view'], allPermissions: CROSS_DOCK })),
      ).toBe('/forbidden');

      session.permissions = ['inventory:on_hand:view', ...CROSS_DOCK];
      expect(evaluate({ permissions: ['inventory:on_hand:view'], allPermissions: CROSS_DOCK })).toBe(
        true,
      );
    });

    it('falls back to roles for a token without a perm_bits claim', () => {
      session.permissions = null;
      session.roles = ['ROLE_ADMIN'];
      expect(evaluate({ allPermissions: CROSS_DOCK, roles: ['ROLE_ADMIN'] })).toBe(true);
    });
  });

  describe('tokens issued without a perm_bits claim', () => {
    beforeEach(() => {
      session.permissions = null;
    });

    it('falls back to the declared roles', () => {
      session.roles = ['ROLE_ADMIN'];
      expect(evaluate({ permissions: ['inventory:on_hand:view'], roles: ['ROLE_ADMIN'] })).toBe(true);
    });

    it('refuses when the role fallback also fails', () => {
      session.roles = ['ROLE_TECHNICIAN'];
      expect(urlOf(evaluate({ permissions: ['inventory:on_hand:view'], roles: ['ROLE_ADMIN'] }))).toBe(
        '/forbidden',
      );
    });

    it('stays open when the route declares permissions but no role fallback', () => {
      expect(evaluate({ permissions: ['inventory:on_hand:view'] })).toBe(true);
    });
  });

  it('applies the same decision as a child guard', () => {
    session.permissions = ['crm:party:view'];
    const result = TestBed.runInInjectionContext(() =>
      rolesChildGuard(snapshotWith({ permissions: ['inventory:on_hand:view'] }), {} as never),
    );
    expect(urlOf(result as UrlTree)).toBe('/forbidden');
  });
});
