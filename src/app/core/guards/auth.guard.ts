import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * authGuard
 * ---------
 * Protects routes that require authentication.
 * Redirects unauthenticated users to /login, preserving the attempted URL
 * in a `returnUrl` query param so LoginComponent can redirect after success.
 */
export const authGuard: CanActivateFn = route => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  const attempted = route.url.map(s => s.path).join('/');
  return router.createUrlTree(['/login'], {
    queryParams: attempted ? { returnUrl: `/${attempted}` } : {},
  });
};
