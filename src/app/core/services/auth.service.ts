import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, shareReplay, tap, throwError, finalize } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../../environments/environment';
import {
  AuthAPIService,
  JWTAPIService,
  LoginRequest,
  TenantAPIService,
  TenantMeResponse,
  TokenPairResponse,
} from '@durion-sdk/security';
import { JwtClaims, TenantSummary } from '../models/auth.models';
import { PERMISSION_BY_BIT, PERMISSION_CATALOG_VERSION } from '../security/permission-catalog';
import { decodePermissionBits, encodePermissionBits, isCatalogStale } from '../security/permission-bits';
import { PLATFORM_TENANT_ID, tenantSlugFromHost } from '../security/tenant';

// Fake JWT used only when environment.mockAuth === true.
// Carries every catalog permission so mock sessions exercise the same
// perm_bits gating path as a real ROLE_ADMIN token rather than bypassing it,
// and a fixed `tid` (the platform tenant, so the platform-admin pages are
// reachable in dev) so tenant-aware code paths run under mock auth too.
function buildMockAccessToken(): string {
  const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const payload = {
    sub: 'demo',
    roles: ['ROLE_ADMIN', 'ROLE_PLATFORM_ADMIN'],
    exp: 9999999999,
    iat: 1700000000,
    perm_bits: encodePermissionBits(PERMISSION_BY_BIT),
    perm_ver: PERMISSION_CATALOG_VERSION,
    tid: PLATFORM_TENANT_ID,
  };
  const encodedPayload = btoa(JSON.stringify(payload))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `${header}.${encodedPayload}.mock-signature-not-verified`;
}

/**
 * Built on first use and cached, so a production session never pays to encode
 * the permission catalog for a token it will never issue.
 */
let mockResponse: TokenPairResponse | null = null;
function mockTokenPair(): TokenPairResponse {
  mockResponse ??= {
    accessToken: buildMockAccessToken(),
    refreshToken: 'mock-refresh-token',
  };
  return mockResponse;
}

/** The mock session's tenant; mirrors what `/v1/tenants/me` answers for the platform tenant. */
const MOCK_TENANT: TenantSummary = {
  tenantId: PLATFORM_TENANT_ID,
  slug: 'platform',
  displayName: 'Platform',
  status: 'ACTIVE',
};

const ACCESS_TOKEN_KEY = 'durion-access-token';
const REFRESH_TOKEN_KEY = 'durion-refresh-token';
const ROLES_KEY = 'durion-user-roles';
const ROLES_EXP_KEY = 'durion-user-roles-exp';
const TENANT_KEY = 'durion-tenant';
const EXPIRY_SKEW_MS = 30_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

/**
 * AuthService
 * -----------
 * Handles JWT-based authentication against durion-positivity-backend via @durion-sdk/security.
 *
 * Token storage: localStorage (access + refresh).
 * Guards read `isAuthenticated()` signal; HttpInterceptor reads `accessToken()`.
 *
 * Tenancy (ADR-0062): the session's tenant is the token's `tid` claim, exposed
 * as `tenantId()`; `tenant()` is the registry's view of it, loaded from
 * `GET /v1/tenants/me` once per tenant binding and kept across silent
 * refreshes. Nothing here ever sends a tenant identifier — the gateway derives
 * `X-Tenant-Id` from the token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly authApiService = inject(AuthAPIService);
  private readonly jwtApiService = inject(JWTAPIService);
  private readonly tenantApiService = inject(TenantAPIService);

  private readonly _accessToken = signal<string | null>(this.loadFromStorage(ACCESS_TOKEN_KEY));
  private readonly _refreshToken = signal<string | null>(this.loadFromStorage(REFRESH_TOKEN_KEY));
  private readonly _roles = signal<string[]>(this.loadRolesFromSession());
  private readonly _tenant = signal<TenantSummary | null>(null);
  private refreshRequest$: Observable<TokenPairResponse> | null = null;
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

  /**
   * Permission codes decoded from the token's `perm_bits` claim, or null when
   * the token carries no such claim (legacy token — permissions unknown).
   * Distinguish that from an empty set, which is a token that genuinely grants
   * no permissions.
   */
  readonly currentUserPermissions = computed<ReadonlySet<string> | null>(() => {
    const claims = this.currentUserClaims();
    if (!claims || claims.perm_bits === undefined) return null;

    if (isCatalogStale(claims.perm_ver)) {
      console.warn(
        `[AuthService] Token perm_ver ${claims.perm_ver} is newer than the bundled permission ` +
          `catalog (v${PERMISSION_CATALOG_VERSION}). Permissions added since then cannot be ` +
          'read; regenerate with scripts/security/generate-permission-catalog.mjs.',
      );
    }

    return decodePermissionBits(claims.perm_bits);
  });

  /** True when the session token carries a `perm_bits` claim we can gate on. */
  readonly permissionsKnown = computed(() => this.currentUserPermissions() !== null);

  /**
   * Tenant id from the token's `tid` claim, or null for a token issued before
   * the claim existed (or no session). This is the only source of the tenant.
   */
  readonly tenantId = computed<string | null>(() => this.currentUserClaims()?.tid ?? null);

  /**
   * The registry's view of the session tenant (slug, display name, status),
   * loaded after login and on session restore; null until it arrives, after
   * logout, and for a token without `tid`.
   */
  readonly tenant = this._tenant.asReadonly();

  /** True when the session is bound to the platform tenant — a platform operator. */
  readonly isPlatformTenant = computed(() => this.tenantId() === PLATFORM_TENANT_ID);

  constructor() {
    this.reconcileSessionFromToken();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  login(credentials: LoginRequest): Observable<TokenPairResponse> {
    if (environment.mockAuth) {
      // Mock mode: accept any credentials and return a fake session immediately.
      console.warn('[AuthService] mockAuth is enabled – using fake credentials. Disable in environment.ts before connecting a real backend.');
      const mockTokens = mockTokenPair();
      this.storeTokens(mockTokens.accessToken!, mockTokens.refreshToken!);
      return of(mockTokens);
    }
    return this.authApiService.loginUser(credentials).pipe(
      tap(resp => this.storeTokens(resp.accessToken!, resp.refreshToken!)),
    );
  }

  logout(): void {
    // Future enhancement: call revokeToken() with the current access token when backend revocation is needed.
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

  /**
   * Tenant slug named by the page host under `environment.tenantHostSuffix`,
   * or null when the host carries no tenant (localhost, a shared preview host,
   * SSR) and the login form must ask for the slug.
   */
  hostTenantSlug(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return tenantSlugFromHost(globalThis.location?.hostname ?? '', environment.tenantHostSuffix);
  }

  hasRole(role: string): boolean {
    return this._roles().includes(role);
  }

  hasAnyRole(roles: readonly string[]): boolean {
    const userRoles = this._roles();
    return roles.some(role => userRoles.includes(role));
  }

  /**
   * True when the session holds the given permission code. Returns false when
   * the token carries no `perm_bits` claim — callers that must stay open for
   * legacy tokens should check `permissionsKnown()` first, as `canAccess()` does.
   */
  hasPermission(permission: string): boolean {
    return this.currentUserPermissions()?.has(permission) ?? false;
  }

  hasAnyPermission(permissions: readonly string[]): boolean {
    const granted = this.currentUserPermissions();
    if (!granted) return false;
    return permissions.some(permission => granted.has(permission));
  }

  refreshTokens(): Observable<TokenPairResponse> {
    const refreshToken = this._refreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token'));
    }

    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    this.refreshRequest$ = this.jwtApiService.refreshTokenPair({ refreshToken }).pipe(
      tap(resp => this.storeTokens(resp.accessToken!, resp.refreshToken!)),
      finalize(() => {
        this.refreshRequest$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshRequest$;
  }

  validateSessionOnResume(): Observable<boolean> {
    if (environment.mockAuth) {
      return of(true);
    }

    const token = this._accessToken();
    if (!token) {
      return of(false);
    }

    return this.jwtApiService.validateToken(token).pipe(
      map(response => response.valid === true),
      tap(isValid => {
        if (!isValid) {
          this.logoutWithRedirect(this.router.url);
        }
      }),
      catchError(() => {
        this.logoutWithRedirect(this.router.url);
        return of(false);
      }),
    );
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private storeTokens(accessToken: string, refreshToken: string): void {
    const previousTenantId = this.tenantId();
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    this.cacheRolesFromToken(accessToken);
    this.syncTenant(previousTenantId);
  }

  private clearTokens(): void {
    if (this.expiryTimerId) {
      clearTimeout(this.expiryTimerId);
      this.expiryTimerId = null;
    }

    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._roles.set([]);
    this._tenant.set(null);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(ROLES_KEY);
      sessionStorage.removeItem(ROLES_EXP_KEY);
      sessionStorage.removeItem(TENANT_KEY);
    }
  }

  // ── Tenant ────────────────────────────────────────────────────────────────

  /**
   * Bring `tenant()` in line with the token that was just stored.
   *
   * A silent refresh re-issues the same `tid`, so the loaded tenant is kept. A
   * different `tid` (a login into another tenant on a shared host) drops every
   * per-tenant cache first — the tenant summary here, the roles cache already
   * overwritten by `cacheRolesFromToken` — so nothing from the previous tenant
   * survives into the new session.
   */
  private syncTenant(previousTenantId: string | null): void {
    const tenantId = this.tenantId();

    if (tenantId !== previousTenantId) {
      this._tenant.set(null);
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.removeItem(TENANT_KEY);
      }
    }

    if (!tenantId) {
      this._tenant.set(null);
      return;
    }

    if (this._tenant()?.tenantId === tenantId) return;

    const cached = this.loadTenantFromSession();
    if (cached?.tenantId === tenantId) {
      this._tenant.set(cached);
      return;
    }

    this.loadTenant(tenantId);
  }

  private loadTenant(tenantId: string): void {
    if (environment.mockAuth) {
      this._tenant.set({ ...MOCK_TENANT, tenantId });
      return;
    }

    if (!isPlatformBrowser(this.platformId)) return;

    this.tenantApiService.getMyTenant().subscribe({
      next: response => {
        // Ignore a late answer for a tenant the session has since left.
        if (this.tenantId() !== tenantId) return;
        const tenant = this.toTenantSummary(response, tenantId);
        this._tenant.set(tenant);
        sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
      },
      error: (err: unknown) => {
        // The tenant name is presentation only; the session stays usable
        // without it and the header simply shows no tenant.
        console.warn('[AuthService] Could not load the session tenant', err);
      },
    });
  }

  private toTenantSummary(response: TenantMeResponse, tenantId: string): TenantSummary {
    const slug = response.slug ?? '';
    return {
      tenantId: response.id ?? tenantId,
      slug,
      displayName: response.displayName?.trim() || slug,
      status: response.status ?? '',
    };
  }

  private loadTenantFromSession(): TenantSummary | null {
    if (!isPlatformBrowser(this.platformId)) return null;

    const raw = sessionStorage.getItem(TENANT_KEY);
    if (!raw) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as TenantSummary).tenantId === 'string' &&
        typeof (parsed as TenantSummary).slug === 'string'
      ) {
        return parsed as TenantSummary;
      }
    } catch {
      // fall through — a corrupt cache is simply discarded
    }
    sessionStorage.removeItem(TENANT_KEY);
    return null;
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
    if (this._accessToken()) {
      // Same tenant as before the reload: keep the cached summary, fetch only if absent.
      this.syncTenant(this.tenantId());
    }
  }

  private cacheRolesFromToken(token: string): void {
    const claims = this.decodeJwt(token);
    const tokenExpiryMs = claims?.exp ? claims.exp * 1000 : 0;
    const sessionExpiryMs = tokenExpiryMs - EXPIRY_SKEW_MS;

    if (!claims || sessionExpiryMs <= Date.now()) {
      this.clearTokens();
      return;
    }

    const roleCandidates = Array.isArray(claims.roles) ? claims.roles : [];

    const effectiveRoles = Array.from(
      new Set(
        roleCandidates
          .filter((role): role is string => typeof role === 'string')
          .map(role => (role.startsWith('ROLE_') ? role : `ROLE_${role}`)),
      ),
    );

    this._roles.set(effectiveRoles);

    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem(ROLES_KEY, JSON.stringify(effectiveRoles));
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

    const delay = Math.min(MAX_TIMEOUT_DELAY_MS, Math.max(0, expiresAtMs - Date.now()));
    this.expiryTimerId = setTimeout(() => {
      if (Date.now() < expiresAtMs) {
        this.scheduleSessionExpiry(expiresAtMs);
        return;
      }

      this.clearTokens();
      this.router.navigate(['/login']);
    }, delay);
  }
}
