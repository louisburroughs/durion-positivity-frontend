import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, tap, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import { JwtClaims, LoginRequest, LoginResponse } from '../models/auth.models';

// Fake JWT used only when environment.mockAuth === true.
// Payload decodes to: { sub: 'demo', roles: ['ROLE_ADMIN'], exp: 9999999999 }
const MOCK_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJzdWIiOiJkZW1vIiwicm9sZXMiOlsiUk9MRV9BRE1JTiJdLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwMDAwMDAwMH0' +
  '.mock-signature-not-verified';
const MOCK_RESPONSE: LoginResponse = {
  accessToken: MOCK_ACCESS_TOKEN,
  refreshToken: 'mock-refresh-token',
  tokenType: 'Bearer',
};

const ACCESS_TOKEN_KEY = 'durion-access-token';
const REFRESH_TOKEN_KEY = 'durion-refresh-token';
const ROLES_KEY = 'durion-user-roles';
const ROLES_EXP_KEY = 'durion-user-roles-exp';
const EXPIRY_SKEW_MS = 30_000;

/**
 * AuthService
 * -----------
 * Handles JWT-based authentication against durion-positivity-backend.
 *
 * Endpoints (configured via environment.apiBaseUrl):
 *   POST /auth/login   → LoginResponse
 *   POST /auth/refresh → LoginResponse   (Future enhancement: finalize when backend is ready)
 *   POST /auth/logout  → 204             (Future enhancement: call backend to invalidate refresh token)
 *
 * Token storage: localStorage (access + refresh).
 * Guards read `isAuthenticated()` signal; HttpInterceptor reads `accessToken()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  private readonly _accessToken = signal<string | null>(this.loadFromStorage(ACCESS_TOKEN_KEY));
  private readonly _refreshToken = signal<string | null>(this.loadFromStorage(REFRESH_TOKEN_KEY));
  private readonly _roles = signal<string[]>(this.loadRolesFromSession());
  private expiryTimerId: ReturnType<typeof setTimeout> | null = null;

  /** Reactive derived state. Components / guards can use these. */
  readonly accessToken = this._accessToken.asReadonly();
  readonly isAuthenticated = computed(() => {
    const token = this._accessToken();
    if (!token) return false;

    const claims = this.decodeJwt(token);
    if (!claims?.exp) return false;

    return claims.exp * 1000 > Date.now() + EXPIRY_SKEW_MS;
  });
  readonly currentUserClaims = computed<JwtClaims | null>(() => {
    const token = this._accessToken();
    return token ? this.decodeJwt(token) : null;
  });
  readonly currentUserRoles = this._roles.asReadonly();

  constructor() {
    this.reconcileSessionFromToken();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  login(credentials: LoginRequest): Observable<LoginResponse> {
    if (environment.mockAuth) {
      // Mock mode: accept any credentials and return a fake session immediately.
      console.warn('[AuthService] mockAuth is enabled – using fake credentials. Disable in environment.ts before connecting a real backend.');
      this.storeTokens(MOCK_RESPONSE.accessToken, MOCK_RESPONSE.refreshToken);
      return of(MOCK_RESPONSE);
    }
    return this.http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/login`, credentials)
      .pipe(
        tap(resp => this.storeTokens(resp.accessToken, resp.refreshToken)),
        catchError(err => throwError(() => err)),
      );
  }

  logout(): void {
    // Future enhancement: call POST /auth/logout with refresh token when backend endpoint is available.
    this.clearTokens();
    this.router.navigate(['/login']);
  }

  logoutWithRedirect(returnUrl: string): void {
    this.clearTokens();
    this.router.navigate(['/login'], {
      queryParams: {
        returnUrl,
        sessionExpired: 'true',
      },
    });
  }

  hasRole(role: string): boolean {
    return this._roles().includes(role);
  }

  hasAnyRole(roles: readonly string[]): boolean {
    const userRoles = this._roles();
    return roles.some(role => userRoles.includes(role));
  }

  /**
   * refreshTokens
    * Future enhancement: complete full refresh flow lifecycle.
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

  validateSessionOnResume(): Observable<boolean> {
    if (environment.mockAuth) {
      return of(true);
    }

    const token = this._accessToken();
    if (!token) {
      return of(false);
    }

    return this.http
      .get<void>(`${environment.apiBaseUrl}/auth/validate`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .pipe(
        map(() => true),
        catchError(() => {
          this.logoutWithRedirect(this.router.url);
          return of(false);
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
    this.cacheRolesFromToken(accessToken);
  }

  private clearTokens(): void {
    if (this.expiryTimerId) {
      clearTimeout(this.expiryTimerId);
      this.expiryTimerId = null;
    }

    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._roles.set([]);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(ROLES_KEY);
      sessionStorage.removeItem(ROLES_EXP_KEY);
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

  private loadRolesFromSession(): string[] {
    if (!isPlatformBrowser(this.platformId)) return [];

    const expRaw = sessionStorage.getItem(ROLES_EXP_KEY);
    const rolesRaw = sessionStorage.getItem(ROLES_KEY);

    if (!expRaw || !rolesRaw) return [];

    const expiresAt = Number(expRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      sessionStorage.removeItem(ROLES_KEY);
      sessionStorage.removeItem(ROLES_EXP_KEY);
      return [];
    }

    try {
      const parsed = JSON.parse(rolesRaw);
      return Array.isArray(parsed) ? parsed.filter(r => typeof r === 'string') : [];
    } catch {
      sessionStorage.removeItem(ROLES_KEY);
      sessionStorage.removeItem(ROLES_EXP_KEY);
      return [];
    }
  }

  private reconcileSessionFromToken(): void {
    const token = this._accessToken();
    if (!token) {
      this._roles.set([]);
      return;
    }
    this.cacheRolesFromToken(token);
  }

  private cacheRolesFromToken(token: string): void {
    const claims = this.decodeJwt(token);
    const tokenExpiryMs = claims?.exp ? claims.exp * 1000 : 0;
    const sessionExpiryMs = tokenExpiryMs - EXPIRY_SKEW_MS;

    if (!claims || !Array.isArray(claims.roles) || sessionExpiryMs <= Date.now()) {
      this.clearTokens();
      return;
    }

    this._roles.set(claims.roles);

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem(ROLES_KEY, JSON.stringify(claims.roles));
      sessionStorage.setItem(ROLES_EXP_KEY, String(sessionExpiryMs));
    }

    this.scheduleSessionExpiry(sessionExpiryMs);
  }

  private scheduleSessionExpiry(expiresAtMs: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.expiryTimerId) {
      clearTimeout(this.expiryTimerId);
      this.expiryTimerId = null;
    }

    const delay = Math.max(0, expiresAtMs - Date.now());
    this.expiryTimerId = setTimeout(() => {
      this.clearTokens();
      this.router.navigate(['/login']);
    }, delay);
  }
}
