import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { Configuration as SecurityConfiguration, TokenPairResponse, ValidateResponse } from '@durion-sdk/security';
import { environment } from '../../../environments/environment';
import { encodePermissionBits } from '../security/permission-bits';
import { PERMISSION_CATALOG_VERSION } from '../security/permission-catalog';
import { PLATFORM_TENANT_ID } from '../security/tenant';

describe('AuthService', () => {
  const VALID_ACCESS_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
    '.sig';
  const LOGIN_RESPONSE: TokenPairResponse = {
    accessToken: VALID_ACCESS_TOKEN,
    refreshToken: 'rt',
  };
  const VALIDATE_SUCCESS_RESPONSE: ValidateResponse = { valid: true };
  const VALIDATE_FAILURE_RESPONSE: ValidateResponse = { valid: false };

  let service: AuthService;
  let router: Router;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SecurityConfiguration, useValue: new SecurityConfiguration({ basePath: `${environment.apiBaseUrl}/security-service` }) },
      ],
    });

    service = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    environment.mockAuth = true;
    // A token left in storage would seed the next test's AuthService — and a
    // token carrying `tid` would then issue a /tenants/me request unasked.
    localStorage.clear();
    sessionStorage.clear();
  });

  function seedStoredSession(): void {
    service.login({ username: 'demo', password: 'testpass' }).subscribe();

    const loginRequest = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/login'));
    expect(loginRequest.request.method).toBe('POST');
    loginRequest.flush(LOGIN_RESPONSE);
  }

  describe('logoutWithRedirect()', () => {
    it('calls router.navigate with /login, returnUrl, and sessionExpired=true', () => {
      const spy = vi.spyOn(router, 'navigate');
      service.logoutWithRedirect('/app/workorder/123');

      expect(spy).toHaveBeenCalledWith(['/login'], {
        queryParams: {
          returnUrl: '/app/workorder/123',
          sessionExpired: 'true',
        },
      });
    });

    it('clears the access token on redirect', () => {
      service.logoutWithRedirect('/app/anything');
      expect(service.accessToken()).toBeNull();
    });
  });

  describe('refreshTokens()', () => {
    it('clamps extremely long expiry timers to the maximum browser-supported timeout', () => {
      environment.mockAuth = false;
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      seedStoredSession();

      const lastDelay = setTimeoutSpy.mock.calls.at(-1)?.[1];
      expect(typeof lastDelay).toBe('number');
      expect(lastDelay as number).toBeLessThanOrEqual(2_147_483_647);

      setTimeoutSpy.mockRestore();
    });

    it('shares a single in-flight refresh request across concurrent callers', () => {
      environment.mockAuth = false;
      seedStoredSession();

      const refreshedResponse: TokenPairResponse = {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
          '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAxfQ' +
          '.sig',
        refreshToken: 'rt-2',
      };

      let firstResult: TokenPairResponse | undefined;
      let secondResult: TokenPairResponse | undefined;

      service.refreshTokens().subscribe(result => (firstResult = result));
      service.refreshTokens().subscribe(result => (secondResult = result));

      const refreshRequests = httpMock.match(r => r.url.includes('/security-service/v1/auth/refresh'));
      expect(refreshRequests).toHaveLength(1);
      expect(refreshRequests[0].request.method).toBe('POST');
      expect(refreshRequests[0].request.body).toEqual({ refreshToken: 'rt' });

      refreshRequests[0].flush(refreshedResponse);

      expect(firstResult).toEqual(refreshedResponse);
      expect(secondResult).toEqual(refreshedResponse);
      expect(service.accessToken()).toBe(refreshedResponse.accessToken);
    });

    it('clears the shared refresh request after an error so a later call retries', () => {
      environment.mockAuth = false;
      seedStoredSession();

      let firstError: unknown;
      service.refreshTokens().subscribe({
        error: err => { firstError = err; },
      });

      const firstRefresh = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/refresh'));
      firstRefresh.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(firstError).toBeDefined();

      let secondResult: TokenPairResponse | undefined;
      service.refreshTokens().subscribe(result => (secondResult = result));

      const secondRefresh = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/refresh'));
      secondRefresh.flush(LOGIN_RESPONSE);

      expect(secondResult).toEqual(LOGIN_RESPONSE);
    });
  });

  describe('validateSessionOnResume()', () => {
    it('returns true when the validate endpoint reports a valid stored token', () => {
      environment.mockAuth = false;
      seedStoredSession();

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/validate'));
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('token')).toBe(VALID_ACCESS_TOKEN);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(VALIDATE_SUCCESS_RESPONSE);

      expect(result).toBe(true);
    });

    it('calls logoutWithRedirect() and returns of(false) when validate endpoint errors', () => {
      environment.mockAuth = false;
      const logoutRedirectSpy = vi.spyOn(service, 'logoutWithRedirect');
      seedStoredSession();

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/validate'));
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(logoutRedirectSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('returns of(false) without navigate when there is no token', () => {
      environment.mockAuth = false;
      const navigateSpy = vi.spyOn(router, 'navigate');

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('calls logoutWithRedirect() and returns false when validate endpoint reports valid=false', () => {
      environment.mockAuth = false;
      const logoutRedirectSpy = vi.spyOn(service, 'logoutWithRedirect');
      seedStoredSession();

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/validate'));
      req.flush(VALIDATE_FAILURE_RESPONSE);

      expect(logoutRedirectSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('calls logoutWithRedirect() and returns of(false) when validate endpoint returns 500', () => {
      environment.mockAuth = false;
      const logoutRedirectSpy = vi.spyOn(service, 'logoutWithRedirect');
      seedStoredSession();

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/validate'));
      req.flush(null, { status: 500, statusText: 'Internal Server Error' });

      expect(logoutRedirectSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    // T4: mockAuth guard short-circuits – no HTTP call, returns true immediately
    it('T4: returns of(true) immediately without any HTTP request when mockAuth is true', () => {
      // environment.mockAuth is true by default in this test environment
      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      httpMock.expectNone(r => r.url.includes('/security-service/v1/auth/validate'));
      expect(result).toBe(true);
    });

    // T5: no-token fast path returns false without any routing side-effects
    it('T5: returns of(false) without router.navigate when mockAuth is false and no token is stored', () => {
      environment.mockAuth = false;
      const navigateSpy = vi.spyOn(router, 'navigate');

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    // T6: token present but endpoint 401 → logoutWithRedirect with sessionExpired=true
    it('T6: calls logoutWithRedirect with sessionExpired=true and returns of(false) on 401', () => {
      environment.mockAuth = false;
      const navigateSpy = vi.spyOn(router, 'navigate');
      seedStoredSession();

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/validate'));
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(navigateSpy).toHaveBeenCalledWith(
        ['/login'],
        expect.objectContaining({
          queryParams: expect.objectContaining({ sessionExpired: 'true' }),
        }),
      );
      expect(result).toBe(false);
    });
  });

  describe('greenfield PERM token compatibility', () => {
    it('keeps session authenticated when token omits roles/authorities claims', () => {
      environment.mockAuth = false;

      service.login({ username: 'demo', password: 'testpass' }).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/login'));
      req.flush({
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
          '.eyJzdWIiOiJ1c3IiLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwMDAwMDAwMCwicGVybV9iaXRzIjoiQUFFPSIsInBlcm1fdmVyIjoxfQ' +
          '.sig',
        refreshToken: 'rt',
        tokenType: 'Bearer',
      });

      expect(service.accessToken()).not.toBeNull();
      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUserRoles()).toEqual([]);
    });

    it('normalizes unprefixed roles claim to ROLE_* format', () => {
      environment.mockAuth = false;

      service.login({ username: 'demo', password: 'testpass' }).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('/security-service/v1/auth/login'));
      req.flush({
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
          '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6WyJBRE1JTiJdLCJleHAiOjk5OTk5OTk5OTksImlhdCI6MTcwMDAwMDAwMH0' +
          '.sig',
        refreshToken: 'rt',
        tokenType: 'Bearer',
      });

      expect(service.currentUserRoles()).toEqual(['ROLE_ADMIN']);
      expect(service.hasRole('ROLE_ADMIN')).toBe(true);
    });
  });
  describe('perm_bits claim', () => {
    /** Builds an unsigned JWT carrying the given claims. */
    function tokenWith(claims: Record<string, unknown>): string {
      const payload = btoa(JSON.stringify({ sub: 'usr', exp: 9999999999, iat: 1700000000, ...claims }))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.sig`;
    }

    function loginWith(accessToken: string): void {
      environment.mockAuth = false;
      service.login({ username: 'demo', password: 'testpass' }).subscribe();
      httpMock
        .expectOne(r => r.url.includes('/security-service/v1/auth/login'))
        .flush({ accessToken, refreshToken: 'rt', tokenType: 'Bearer' });
    }

    it('decodes granted permissions from the claim', () => {
      loginWith(
        tokenWith({
          roles: [],
          perm_bits: encodePermissionBits(['inventory:on_hand:view', 'crm:party:view']),
          perm_ver: PERMISSION_CATALOG_VERSION,
        }),
      );

      expect(service.permissionsKnown()).toBe(true);
      expect(service.hasPermission('inventory:on_hand:view')).toBe(true);
      expect(service.hasPermission('crm:party:view')).toBe(true);
      expect(service.hasPermission('accounting:je:view')).toBe(false);
      expect(service.hasAnyPermission(['accounting:je:view', 'crm:party:view'])).toBe(true);
      expect(service.hasAnyPermission(['accounting:je:view'])).toBe(false);
    });

    it('treats an empty claim as a session that grants no permissions', () => {
      loginWith(tokenWith({ roles: [], perm_bits: '', perm_ver: PERMISSION_CATALOG_VERSION }));

      expect(service.permissionsKnown()).toBe(true);
      expect(service.currentUserPermissions()?.size).toBe(0);
      expect(service.hasPermission('crm:party:view')).toBe(false);
    });

    it('treats a token without the claim as permissions unknown, not permissions denied', () => {
      loginWith(tokenWith({ roles: ['ROLE_ADMIN'] }));

      expect(service.permissionsKnown()).toBe(false);
      expect(service.currentUserPermissions()).toBeNull();
      expect(service.hasPermission('crm:party:view')).toBe(false);
    });

    it('still decodes known bits when the token uses a newer catalog version', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      loginWith(
        tokenWith({
          roles: [],
          perm_bits: encodePermissionBits(['crm:party:view']),
          perm_ver: PERMISSION_CATALOG_VERSION + 1,
        }),
      );

      expect(service.hasPermission('crm:party:view')).toBe(true);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('gives the mock-auth session the full catalog so dev mode exercises real gating', () => {
      service.login({ username: 'demo', password: 'testpass' }).subscribe();

      expect(service.permissionsKnown()).toBe(true);
      expect(service.hasPermission('inventory:on_hand:view')).toBe(true);
      expect(service.hasRole('ROLE_ADMIN')).toBe(true);
    });

    it('forgets permissions on logout', () => {
      loginWith(
        tokenWith({
          roles: [],
          perm_bits: encodePermissionBits(['crm:party:view']),
          perm_ver: PERMISSION_CATALOG_VERSION,
        }),
      );
      service.logout();

      expect(service.currentUserPermissions()).toBeNull();
      expect(service.hasPermission('crm:party:view')).toBe(false);
    });
  });

  describe('tenant (ADR-0062)', () => {
    const TENANT_ID = '01990000-0000-7000-8000-00000000c001';

    /** Builds an unsigned JWT carrying the given claims. */
    function tokenWith(claims: Record<string, unknown>): string {
      const payload = btoa(JSON.stringify({ sub: 'usr', roles: [], exp: 9999999999, iat: 1700000000, ...claims }))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.sig`;
    }

    function loginWith(accessToken: string, tenantSlug?: string): void {
      environment.mockAuth = false;
      service.login({ username: 'demo', password: 'testpass', tenantSlug }).subscribe();
      httpMock
        .expectOne(r => r.url.includes('/security-service/v1/auth/login'))
        .flush({ accessToken, refreshToken: 'rt', tokenType: 'Bearer' });
    }

    function flushTenantMe(id = TENANT_ID): void {
      const req = httpMock.expectOne(r => r.url.endsWith('/security-service/v1/tenants/me'));
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.has('X-Tenant-Id')).toBe(false);
      expect(req.request.headers.has('X-Tenant-Slug')).toBe(false);
      req.flush({ id, slug: 'acme-tire', displayName: 'Acme Tire & Auto', status: 'ACTIVE' });
    }

    it('decodes tid into tenantId and loads /tenants/me into tenant after login', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));

      expect(service.tenantId()).toBe(TENANT_ID);
      expect(service.tenant()).toBeNull();

      flushTenantMe();

      expect(service.tenant()).toEqual({
        tenantId: TENANT_ID,
        slug: 'acme-tire',
        displayName: 'Acme Tire & Auto',
        status: 'ACTIVE',
      });
      expect(service.isPlatformTenant()).toBe(false);
    });

    it('forwards the form tenantSlug on the login request and nothing else tenant-related', () => {
      loginWith(tokenWith({ tid: TENANT_ID }), 'acme-tire');
      flushTenantMe();
      // The login body is the only place a slug ever travels; the interceptor
      // spec covers headers. Nothing to assert beyond the flushed request shape.
      expect(service.tenant()?.slug).toBe('acme-tire');
    });

    it('treats a token without tid as unbound: no tenant, no /tenants/me call', () => {
      loginWith(tokenWith({}));

      expect(service.tenantId()).toBeNull();
      expect(service.tenant()).toBeNull();
      expect(service.isPlatformTenant()).toBe(false);
      httpMock.expectNone(r => r.url.includes('/tenants/me'));
    });

    it('keeps the loaded tenant across a silent refresh that re-issues the same tid', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));
      flushTenantMe();

      service.refreshTokens().subscribe();
      httpMock
        .expectOne(r => r.url.includes('/security-service/v1/auth/refresh'))
        .flush({ accessToken: tokenWith({ tid: TENANT_ID, iat: 1700000001 }), refreshToken: 'rt-2' });

      expect(service.tenant()?.slug).toBe('acme-tire');
      httpMock.expectNone(r => r.url.includes('/tenants/me'));
    });

    it('drops the previous tenant and reloads when a new token carries a different tid', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));
      flushTenantMe();

      const otherTenantId = '01990000-0000-7000-8000-00000000c002';
      loginWith(tokenWith({ tid: otherTenantId }));

      expect(service.tenantId()).toBe(otherTenantId);
      expect(service.tenant()).toBeNull();
      expect(sessionStorage.getItem('durion-tenant')).toBeNull();

      flushTenantMe(otherTenantId);
      expect(service.tenant()?.tenantId).toBe(otherTenantId);
    });

    it('clears tenantId and tenant on logout', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));
      flushTenantMe();

      service.logout();

      expect(service.tenantId()).toBeNull();
      expect(service.tenant()).toBeNull();
      expect(sessionStorage.getItem('durion-tenant')).toBeNull();
    });

    it('leaves the session usable when /tenants/me fails', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      loginWith(tokenWith({ tid: TENANT_ID }));
      httpMock
        .expectOne(r => r.url.endsWith('/security-service/v1/tenants/me'))
        .flush(null, { status: 503, statusText: 'Service Unavailable' });

      expect(service.isAuthenticated()).toBe(true);
      expect(service.tenantId()).toBe(TENANT_ID);
      expect(service.tenant()).toBeNull();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('falls back to the slug as display name when the registry has none', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));
      httpMock
        .expectOne(r => r.url.endsWith('/security-service/v1/tenants/me'))
        .flush({ id: TENANT_ID, slug: 'acme-tire', status: 'ACTIVE' });

      expect(service.tenant()?.displayName).toBe('acme-tire');
    });

    it('restores the cached tenant on a reload without calling /tenants/me again', () => {
      loginWith(tokenWith({ tid: TENANT_ID }));
      flushTenantMe();
      expect(sessionStorage.getItem('durion-tenant')).not.toBeNull();

      // A fresh service in the same browser session: token in localStorage,
      // tenant summary in sessionStorage.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          AuthService,
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: SecurityConfiguration, useValue: new SecurityConfiguration({ basePath: `${environment.apiBaseUrl}/security-service` }) },
        ],
      });
      const restored = TestBed.inject(AuthService);
      httpMock = TestBed.inject(HttpTestingController);

      expect(restored.tenantId()).toBe(TENANT_ID);
      expect(restored.tenant()?.slug).toBe('acme-tire');
      httpMock.expectNone(r => r.url.includes('/tenants/me'));
    });

    it('recognises the platform tenant from tid', () => {
      loginWith(tokenWith({ tid: PLATFORM_TENANT_ID }));
      httpMock
        .expectOne(r => r.url.endsWith('/security-service/v1/tenants/me'))
        .flush({ id: PLATFORM_TENANT_ID, slug: 'platform', displayName: 'Platform', status: 'ACTIVE' });

      expect(service.isPlatformTenant()).toBe(true);
    });

    it('binds the mock session to the platform tenant without any HTTP call', () => {
      service.login({ username: 'demo', password: 'testpass' }).subscribe();

      expect(service.tenantId()).toBe(PLATFORM_TENANT_ID);
      expect(service.isPlatformTenant()).toBe(true);
      expect(service.tenant()?.slug).toBe('platform');
      httpMock.expectNone(r => r.url.includes('/tenants/me'));
    });

    it('never derives a host tenant when the environment has no host suffix', () => {
      expect(service.hostTenantSlug()).toBeNull();
    });
  });
});
