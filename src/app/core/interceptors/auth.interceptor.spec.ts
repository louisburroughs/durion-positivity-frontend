import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { of, throwError } from 'rxjs';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let authServiceMock: {
    accessToken: ReturnType<typeof vi.fn>;
    refreshTokens: ReturnType<typeof vi.fn>;
    logoutWithRedirect: ReturnType<typeof vi.fn>;
  };
  let locationMock: { path: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authServiceMock = {
      accessToken: vi.fn().mockReturnValue(null),
      refreshTokens: vi.fn(),
      logoutWithRedirect: vi.fn(),
    };
    locationMock = {
      path: vi.fn().mockReturnValue('/current-path'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: Location, useValue: locationMock },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('attaches Authorization header when accessToken() returns a value', () => {
    authServiceMock.accessToken.mockReturnValue('my-token');
    const req = new HttpRequest('GET', '/api/test');
    let capturedReq: HttpRequest<unknown> | undefined;

    const mockNext = vi.fn().mockImplementation((r: HttpRequest<unknown>) => {
      capturedReq = r;
      return of(new HttpResponse({ status: 200 }));
    });

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, mockNext).subscribe();
    });

    expect(capturedReq?.headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('passes the request unmodified when accessToken() returns null', () => {
    authServiceMock.accessToken.mockReturnValue(null);
    const req = new HttpRequest('GET', '/api/test');
    let capturedReq: HttpRequest<unknown> | undefined;

    const mockNext = vi.fn().mockImplementation((r: HttpRequest<unknown>) => {
      capturedReq = r;
      return of(new HttpResponse({ status: 200 }));
    });

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, mockNext).subscribe();
    });

    expect(capturedReq?.headers.has('Authorization')).toBe(false);
  });

  it('on 401 with token, refreshes and retries with the new access token', () => {
    authServiceMock.accessToken.mockReturnValue('old-token');
    authServiceMock.refreshTokens.mockReturnValue(
      of({ accessToken: 'new-token', refreshToken: 'rt', tokenType: 'Bearer' }),
    );
    const req = new HttpRequest('GET', '/api/test');

    const mockNext = vi.fn()
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401 })))
      .mockReturnValueOnce(of(new HttpResponse({ status: 200 })));

    TestBed.runInInjectionContext(() => {
      authInterceptor(req, mockNext).subscribe();
    });

    expect(authServiceMock.refreshTokens).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledTimes(2);
    const retryReq = mockNext.mock.calls[1][0] as HttpRequest<unknown>;
    expect(retryReq.headers.get('Authorization')).toBe('Bearer new-token');
  });

  it('on refresh failure, calls logoutWithRedirect and propagates the error', () => {
    authServiceMock.accessToken.mockReturnValue('old-token');
    const refreshError = new Error('refresh failed');
    authServiceMock.refreshTokens.mockReturnValue(throwError(() => refreshError));
    locationMock.path.mockReturnValue('/app/dashboard');

    const req = new HttpRequest('GET', '/api/test');
    const mockNext = vi.fn().mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 401 })),
    );

    let caughtError: unknown;
    TestBed.runInInjectionContext(() => {
      authInterceptor(req, mockNext).subscribe({
        error: err => { caughtError = err; },
      });
    });

    expect(authServiceMock.logoutWithRedirect).toHaveBeenCalledWith('/app/dashboard');
    expect(caughtError).toBe(refreshError);
  });

  it('does not attempt refresh on non-401 errors', () => {
    authServiceMock.accessToken.mockReturnValue('my-token');
    const serverErr = new HttpErrorResponse({ status: 500 });
    const mockNext = vi.fn().mockReturnValue(throwError(() => serverErr));

    let caughtError: unknown;
    TestBed.runInInjectionContext(() => {
      authInterceptor(new HttpRequest('GET', '/api/test'), mockNext).subscribe({
        error: err => { caughtError = err; },
      });
    });

    expect(authServiceMock.refreshTokens).not.toHaveBeenCalled();
    expect(caughtError).toBe(serverErr);
  });
});
