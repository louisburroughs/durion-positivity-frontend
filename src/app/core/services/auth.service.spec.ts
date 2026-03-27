import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
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
    it('returns observable of true when validate endpoint succeeds', () => {
      (environment as any).mockAuth = false;
      // Seed a token via login to ensure the service has an access token
      const loginReq = { username: 'demo', password: /* test credential */ 'testpass' };
      service.login(loginReq).subscribe();

      // Since mockAuth is false, login makes an HTTP POST /auth/login
      const pendingLogin = httpMock.match(req => req.url.includes('/auth/login'));
      if (pendingLogin.length) {
        pendingLogin[0].flush({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
            '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
            '.sig',
          refreshToken: 'rt',
          tokenType: 'Bearer',
        });
      }

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/auth/validate'));
      req.flush(null, { status: 200, statusText: 'OK' });

      expect(result).toBe(true);
    });

    it('calls logoutWithRedirect() and returns of(false) when validate endpoint errors', () => {
      (environment as any).mockAuth = false;
      const logoutRedirectSpy = vi.spyOn(service, 'logoutWithRedirect');
      const loginReq = { username: 'demo', password: /* test credential */ 'testpass' };
      service.login(loginReq).subscribe();

      const pendingLogin = httpMock.match(req => req.url.includes('/auth/login'));
      if (pendingLogin.length) {
        pendingLogin[0].flush({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
            '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
            '.sig',
          refreshToken: 'rt',
          tokenType: 'Bearer',
        });
      }

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/auth/validate'));
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

    it('calls logoutWithRedirect() and returns of(false) when validate endpoint returns 500', () => {
      (environment as any).mockAuth = false;
      const logoutRedirectSpy = vi.spyOn(service, 'logoutWithRedirect');
      const loginReq = { username: 'demo', password: /* test credential */ 'testpass' };
      service.login(loginReq).subscribe();

      const pendingLogin = httpMock.match(req => req.url.includes('/auth/login'));
      if (pendingLogin.length) {
        pendingLogin[0].flush({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
            '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
            '.sig',
          refreshToken: 'rt',
          tokenType: 'Bearer',
        });
      }

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/auth/validate'));
      req.flush(null, { status: 500, statusText: 'Internal Server Error' });

      expect(logoutRedirectSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    // T4: mockAuth guard short-circuits – no HTTP call, returns true immediately
    it('T4: returns of(true) immediately without any HTTP request when mockAuth is true', () => {
      // environment.mockAuth is true by default in this test environment
      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      httpMock.expectNone(r => r.url.includes('/auth/validate'));
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
      service.login({ username: 'demo', password: /* test credential */ 'testpass' }).subscribe();

      const pendingLogin = httpMock.match(req => req.url.includes('/auth/login'));
      if (pendingLogin.length) {
        pendingLogin[0].flush({
          accessToken:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
            '.eyJzdWIiOiJ1c3IiLCJyb2xlcyI6W10sImV4cCI6OTk5OTk5OTk5OSwiaWF0IjoxNzAwMDAwMDAwfQ' +
            '.sig',
          refreshToken: 'rt',
          tokenType: 'Bearer',
        });
      }

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      const req = httpMock.expectOne(r => r.url.includes('/auth/validate'));
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
});
