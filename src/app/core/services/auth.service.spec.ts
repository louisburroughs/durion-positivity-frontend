import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { AuthService } from './auth.service';

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
      // Seed a token via login to ensure the service has an access token
      const loginReq = { username: 'demo', password: /* test credential */ 'testpass' };
      service.login(loginReq).subscribe();

      // Flush login (mockAuth=false path: expect POST /auth/login)
      // Since environment.mockAuth may be true in test, we must handle both paths.
      // If mockAuth is true, login resolves synchronously; we can check accessToken.
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

    it('calls logout() and returns of(false) when validate endpoint errors', () => {
      const logoutSpy = vi.spyOn(service, 'logout');
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

      expect(logoutSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('calls logout() and returns of(false) when there is no token', () => {
      const logoutSpy = vi.spyOn(service, 'logout');

      let result: boolean | undefined;
      service.validateSessionOnResume().subscribe(v => (result = v));

      expect(logoutSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('calls logout() and returns of(false) when validate endpoint returns 500', () => {
      const logoutSpy = vi.spyOn(service, 'logout');
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

      expect(logoutSpy).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
