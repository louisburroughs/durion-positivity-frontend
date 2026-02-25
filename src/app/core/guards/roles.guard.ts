import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';

function getRequiredRoles(route: ActivatedRouteSnapshot): string[] {
  const value = route.data['roles'];
  if (!Array.isArray(value)) return [];
  return value.filter(role => typeof role === 'string');
}

function attemptedUrl(route: ActivatedRouteSnapshot): string {
  const segments = route.pathFromRoot
    .flatMap(node => node.url.map(urlSegment => urlSegment.path))
    .filter(Boolean);
  return segments.length ? `/${segments.join('/')}` : '/app';
}

function evaluateRoleAccess(route: ActivatedRouteSnapshot): boolean | UrlTree {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: attemptedUrl(route) },
    });
  }

  const requiredRoles = getRequiredRoles(route);
  if (!requiredRoles.length) return true;

  if (auth.hasAnyRole(requiredRoles)) {
    return true;
  }

  return router.createUrlTree(['/forbidden']);
}

/**
 * rolesGuard
 * ----------
 * Optional role-based route protection.
 *
 * Usage on a route:
 * data: { roles: ['ROLE_ADMIN'] }
 */
export const rolesGuard: CanActivateFn = route => evaluateRoleAccess(route);

/**
 * rolesChildGuard
 * ---------------
 * Applies role checks to child routes under a protected parent.
 */
export const rolesChildGuard: CanActivateChildFn = childRoute =>
  evaluateRoleAccess(childRoute);
