import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Location } from '@angular/common';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * authInterceptor
 * ---------------
 * Attaches `Authorization: Bearer <access_token>` to every outgoing request
 * that targets the configured API base URL.
 *
 * On 401, attempts a single token refresh then retries the original request.
 * If refresh fails, AuthService.logoutWithRedirect(currentPath) handles the redirect.
 *
 * The refresh request itself is excluded from the retry logic to prevent an
 * infinite loop: if the refresh endpoint returns 401, we do not call refresh
 * again from inside the refresh request.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const authService = inject(AuthService);
  const location = inject(Location);
  const token = authService.accessToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  const isRefreshRequest = req.url.includes('/auth/refresh');

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        token && // Only attempt refresh if we had a token to begin with
        !isRefreshRequest // Never retry the refresh call itself
      ) {
        // Attempt silent token refresh then retry once.
        return authService.refreshTokens().pipe(
          switchMap(refreshed => {
            const retryReq = req.clone({
              setHeaders: { Authorization: `Bearer ${refreshed.accessToken}` },
            });
            return next(retryReq);
          }),
          catchError(refreshErr => {
            if (!(refreshErr instanceof HttpErrorResponse && refreshErr.status === 401)) {
              authService.logoutWithRedirect(location.path());
            }
            return throwError(() => refreshErr);
          }),
        );
      }

      if (err instanceof HttpErrorResponse && err.status === 401 && isRefreshRequest) {
        authService.logoutWithRedirect(location.path());
      }

      return throwError(() => err);
    }),
  );
};
