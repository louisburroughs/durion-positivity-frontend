import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { JwtClaims, LoginRequest, LoginResponse } from '../models/auth.models';

const ACCESS_TOKEN_KEY  = 'durion-access-token';
const REFRESH_TOKEN_KEY = 'durion-refresh-token';

/**
 * AuthService
 * -----------
 * Handles JWT-based authentication against durion-positivity-backend.
 *
 * Endpoints (configured via environment.apiBaseUrl):
 *   POST /auth/login   → LoginResponse
 *   POST /auth/refresh → LoginResponse   (TODO: implement when backend ready)
 *   POST /auth/logout  → 204             (TODO: call backend to invalidate refresh token)
 *
 * Token storage: localStorage (access + refresh).
 * Guards read `isAuthenticated()` signal; HttpInterceptor reads `accessToken()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router     = inject(Router);
  private readonly http       = inject(HttpClient);

  private readonly _accessToken  = signal<string | null>(this.loadFromStorage(ACCESS_TOKEN_KEY));
  private readonly _refreshToken = signal<string | null>(this.loadFromStorage(REFRESH_TOKEN_KEY));

  /** Reactive derived state. Components / guards can use these. */
  readonly accessToken    = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => !!this._accessToken());
  readonly currentUserClaims = computed<JwtClaims | null>(() => {
    const token = this._accessToken();
    return token ? this.decodeJwt(token) : null;
  });

  // ── Public API ────────────────────────────────────────────────────────────

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, credentials)
      .pipe(
        tap(resp => this.storeTokens(resp.accessToken, resp.refreshToken)),
        catchError(err => throwError(() => err)),
      );
  }

  logout(): void {
    // TODO: call POST /auth/logout with refresh token when backend endpoint is available.
    this.clearTokens();
    this.router.navigate(['/login']);
  }

  /**
   * refreshTokens
   * TODO: Implement full refresh flow.
   * The backend is expected to expose POST /auth/refresh accepting { refreshToken }.
   * Call this automatically from AuthInterceptor when a 401 is received.
   */
  refreshTokens(): Observable<LoginResponse> {
    const refreshToken = this._refreshToken();
    if (!refreshToken) {
      this.logout();
      return throwError(() => new Error('No refresh token'));
    }
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap(resp => this.storeTokens(resp.accessToken, resp.refreshToken)),
        catchError(err => {
          this.logout();
          return throwError(() => err);
        }),
      );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private storeTokens(accessToken: string, refreshToken: string): void {
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  }

  private clearTokens(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  private loadFromStorage(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  private decodeJwt(token: string): JwtClaims | null {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload.replaceAll('-', '+').replaceAll('_', '/'));
      return JSON.parse(decoded) as JwtClaims;
    } catch {
      return null;
    }
  }
}
