import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { LoginResponse, ValidateResponse } from '../models/auth.models';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  const VALID_ACCESS_TOKEN =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
    '.sig';
  const LOGIN_RESPONSE: LoginResponse = {
    accessToken: VALID_ACCESS_TOKEN,
    refreshToken: 'rt',
    tokenType: 'Bearer',
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
      ],
    });

    service = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    (environment as any).mockAuth = true;
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

  describe('validateSessionOnResume()', () => {
    it('returns true when the validate endpoint reports a valid stored token', () => {
      (environment as any).mockAuth = false;
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
      (environment as any).mockAuth = false;
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
      (environment as any).mockAuth = false;
      const navigateSpy = vi.spyOn(router, 'navigate');

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('calls logoutWithRedirect() and returns false when validate endpoint reports valid=false', () => {
      (environment as any).mockAuth = false;
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
      (environment as any).mockAuth = false;
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
      (environment as any).mockAuth = false;
      const navigateSpy = vi.spyOn(router, 'navigate');

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    // T6: token present but endpoint 401 → logoutWithRedirect with sessionExpired=true
    it('T6: calls logoutWithRedirect with sessionExpired=true and returns of(false) on 401', () => {
      (environment as any).mockAuth = false;
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
      (environment as any).mockAuth = false;

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
      (environment as any).mockAuth = false;

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
});
