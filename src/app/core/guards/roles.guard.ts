import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { canAccess } from '../security/route-access';

function getStringArray(route: ActivatedRouteSnapshot, key: string): string[] {
  const value = route.data[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function attemptedUrl(route: ActivatedRouteSnapshot): string {
  const segments = route.pathFromRoot
    .flatMap(node => node.url.map(urlSegment => urlSegment.path))
    .filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '/chat';
}

function evaluateRoleAccess(route: ActivatedRouteSnapshot): boolean | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: attemptedUrl(route) },
    });
  }

  const allowed = canAccess(auth, {
    roles: getStringArray(route, 'roles'),
    permissions: getStringArray(route, 'permissions'),
  });

  return allowed ? true : router.createUrlTree(['/forbidden']);
}

/**
 * rolesGuard
 * ----------
 * Optional role- and permission-based route protection.
 *
 * Usage on a route — `permissions` is preferred, since it matches how the
 * backend actually authorizes; `roles` remains for coarse admin-only areas and
 * as the fallback for tokens issued without a `perm_bits` claim:
 *
 *   data: { permissions: INVENTORY_PERMISSIONS }
 *   data: { roles: ['ROLE_ADMIN'] }
 *
 * Both are "any of". See `core/security/route-access.ts` for the decision the
 * nav registry shares, so a gated route is never offered in the nav.
 */
export const rolesGuard: CanActivateFn = route => evaluateRoleAccess(route);

/**
 * rolesChildGuard
 * ---------------
 * Applies the same role/permission checks to child routes under a protected parent.
 */
export const rolesChildGuard: CanActivateChildFn = childRoute =>
  evaluateRoleAccess(childRoute);
