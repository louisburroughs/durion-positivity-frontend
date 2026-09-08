import { describe, expect, it } from 'vitest';
import { Route } from '@angular/router';

import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { rolesChildGuard } from './core/guards/roles.guard';
import { PERMISSION_BY_BIT } from './core/security/permission-catalog';
import { NAV_REGISTRY } from './features/shell/services/navigation-registry.service';

describe('app route topology', () => {
  it('uses /app as the guarded shell entry route', () => {
    const appRoute = routes.find(route => route.path === 'app');

    expect(appRoute).toBeTruthy();
    expect(appRoute?.redirectTo).toBeUndefined();
    expect(typeof appRoute?.loadComponent).toBe('function');
    expect(appRoute?.canActivate).toEqual([authGuard]);
    expect(appRoute?.canActivateChild).toEqual([rolesChildGuard]);
    expect(Array.isArray(appRoute?.children)).toBe(true);
    expect(appRoute?.children?.some(child => child.path === '')).toBe(true);
  });

  it('keeps /chat as compatibility redirect to /app', () => {
    const chatRoute = routes.find(route => route.path === 'chat');

    expect(chatRoute).toBeTruthy();
    expect(chatRoute?.redirectTo).toBe('app');
  });
});

/**
 * Guards the fix for #230: 11 of 14 domain groups under /app declared no access
 * constraint, so any authenticated user could walk into pages that can only ever
 * 403. These specs fail the build if a new group ships ungated, if it is gated on
 * a permission code the backend catalog does not define, or if the nav offers an
 * entry the route guard would refuse.
 */
describe('/app route access', () => {
  const appRoute = routes.find(route => route.path === 'app');
  const children = appRoute?.children ?? [];

  /**
   * Routes intentionally open to every authenticated user. Both render entirely
   * from client-side data and call no API, so neither can 403 — and both are
   * reachable from chrome shown to everyone (the shell landing page and the
   * footer's sitemap link), so gating them would create the very dead end this
   * spec exists to prevent. The sitemap filters its own contents by role.
   */
  const UNGATED_BY_DESIGN = new Set(['', 'sitemap']);

  const declaredPermissions = (route: Route): readonly string[] =>
    (route.data?.['permissions'] as readonly string[] | undefined) ?? [];
  const declaredRoles = (route: Route): readonly string[] =>
    (route.data?.['roles'] as readonly string[] | undefined) ?? [];

  it('finds the domain groups it is meant to check', () => {
    // Cheap canary: if the route table is restructured, the specs below must not
    // silently start asserting over an empty list.
    expect(children.filter(child => child.loadChildren).length).toBeGreaterThanOrEqual(14);
  });

  it('gates every route under /app on roles or permissions', () => {
    const ungated = children
      .filter(child => !UNGATED_BY_DESIGN.has(child.path ?? ''))
      .filter(child => !declaredPermissions(child).length && !declaredRoles(child).length)
      .map(child => `/app/${child.path}`);

    expect(ungated).toEqual([]);
  });

  it('gates every group on permission codes the backend catalog defines', () => {
    const catalog = new Set(PERMISSION_BY_BIT);
    const unknown = children.flatMap(child =>
      declaredPermissions(child)
        .filter(permission => !catalog.has(permission))
        .map(permission => `/app/${child.path}: ${permission}`),
    );

    expect(unknown).toEqual([]);
  });

  it('declares a non-empty permission set wherever it gates on permissions', () => {
    // A domain prefix that matches nothing would produce an empty array, which
    // the guard reads as "no constraint" — an ungated group wearing a gate.
    const empty = children
      .filter(child => child.data?.['permissions'] !== undefined)
      .filter(child => !declaredPermissions(child).length)
      .map(child => `/app/${child.path}`);

    expect(empty).toEqual([]);
  });

  it('offers no nav entry that its route would refuse', () => {
    // The dead end this guards against is a nav entry a session can see but not
    // open, so the route must be no *stricter* than the nav entry offering it.
    // The reverse — a route open to more sessions than the nav advertises, as
    // with the footer-linked sitemap — is a menu-grouping choice, not a dead end.
    const routeByPath = new Map(children.map(child => [`/app/${child.path}`, child]));

    const deadEnds = NAV_REGISTRY.filter(item => item.route !== '/app').flatMap(item => {
      const child = routeByPath.get(item.route);
      if (!child) return [`${item.route}: no matching route`];

      const navPermissions = new Set(item.permissions ?? []);
      const navRoles = new Set(item.roles ?? []);
      const routePermissions = declaredPermissions(child);
      const routeRoles = declaredRoles(child);

      // Any session the nav admits must hold something the route accepts.
      if (routePermissions.length && !routePermissions.every(p => navPermissions.has(p))) {
        return [`${item.route}: route requires permissions the nav entry does not`];
      }
      if (routeRoles.length && !routeRoles.every(role => navRoles.has(role))) {
        return [`${item.route}: route requires roles the nav entry does not`];
      }
      return [];
    });

    expect(deadEnds).toEqual([]);
  });
});
