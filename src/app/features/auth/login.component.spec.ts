import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TokenPairResponse } from '@durion-sdk/security';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LoginComponent } from './login.component';
import { TranslateModule } from '@ngx-translate/core';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;

  const authServiceStub = {
    login: vi.fn().mockReturnValue(new Subject()),
    hostTenantSlug: vi.fn().mockReturnValue(null as string | null),
  };

  const themeServiceStub = {
    theme: () => 'light',
    isDark: () => false,
  };

  function setup(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
        { provide: ThemeService, useValue: themeServiceStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => queryParams[key] ?? null,
              },
            },
          },
        },
      ],
    });

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
  }

  afterEach(() => {
    vi.clearAllMocks();
    authServiceStub.hostTenantSlug.mockReturnValue(null);
    TestBed.resetTestingModule();
  });

  describe('sessionExpired signal', () => {
    it('is true when ?sessionExpired=true is in query params', () => {
      setup({ sessionExpired: 'true' });
      fixture.detectChanges();
      expect(component.sessionExpired()).toBe(true);
    });

    it('is false when sessionExpired param is absent', () => {
      setup({});
      fixture.detectChanges();
      expect(component.sessionExpired()).toBe(false);
    });
  });

  describe('session-expired banner', () => {
    it('renders when sessionExpired() is true', () => {
      setup({ sessionExpired: 'true' });
      fixture.detectChanges();
      const banner = fixture.nativeElement.querySelector('.alert.alert-info');
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain('AUTH.LOGIN.SESSION_EXPIRED');
    });

    it('is absent when sessionExpired() is false', () => {
      setup({});
      fixture.detectChanges();
      const banner = fixture.nativeElement.querySelector('.alert.alert-info');
      expect(banner).toBeNull();
    });
  });

  describe('submit()', () => {
    it('does nothing when the form is invalid (empty fields)', () => {
      setup({});
      fixture.detectChanges();
      component.submit();

      expect(authServiceStub.login).not.toHaveBeenCalled();
    });

    it('sets credential error message on 401', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<never>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.error({ status: 401 });

      expect(component.error()).toBe('AUTH.LOGIN.ERROR.INVALID_CREDENTIALS');
      expect(component.loading()).toBe(false);
    });

    it('sets network error message when status is 0', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<never>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.error({ status: 0 });

      expect(component.error()).toBe('AUTH.LOGIN.ERROR.NETWORK');
      expect(component.loading()).toBe(false);
    });

    it('redirects to returnUrl on successful login', () => {
      setup({ returnUrl: '/app/security' });
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigateByUrl');
      const subject = new Subject<TokenPairResponse>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.next({ accessToken: 'tok', refreshToken: 'rt' });

      expect(spy).toHaveBeenCalledWith('/app/security');
    });

    it('redirects to /chat on successful login when returnUrl is absent', () => {
      setup({});
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigateByUrl');
      const subject = new Subject<TokenPairResponse>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.next({ accessToken: 'tok', refreshToken: 'rt' });

      expect(spy).toHaveBeenCalledWith('/chat');
    });
  });

  describe('tenant resolution (ADR-0062)', () => {
    function fillCredentials(): void {
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
    }

    it('shows the optional tenant field when the host names no tenant', () => {
      setup({});
      fixture.detectChanges();

      expect(component.hostTenantSlug()).toBeNull();
      expect(fixture.nativeElement.querySelector('#tenantSlug')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('.tenant-readonly')).toBeNull();
    });

    it('sends tenantSlug, trimmed and lowercased, when the operator fills it in', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      component.form.patchValue({ tenantSlug: '  Acme-Tire ' });
      component.submit();

      expect(authServiceStub.login).toHaveBeenCalledWith({
        username: 'admin',
        password: 'pass1',
        tenantSlug: 'acme-tire',
      });
    });

    it('omits tenantSlug from the request when the field is left blank', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      component.submit();

      expect(authServiceStub.login).toHaveBeenCalledWith({ username: 'admin', password: 'pass1' });
      expect(authServiceStub.login.mock.calls[0][0]).not.toHaveProperty('tenantSlug');
    });

    it('rejects a malformed slug client-side without calling the API', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      component.form.patchValue({ tenantSlug: 'Not A Slug!' });
      component.submit();

      expect(component.tenantSlugCtrl.invalid).toBe(true);
      expect(authServiceStub.login).not.toHaveBeenCalled();
    });

    it('hides the field and shows the host-derived tenant read-only, sending no slug', () => {
      authServiceStub.hostTenantSlug.mockReturnValue('acme-tire');
      setup({});
      fixture.detectChanges();

      expect(component.hostTenantSlug()).toBe('acme-tire');
      expect(fixture.nativeElement.querySelector('#tenantSlug')).toBeNull();
      expect(fixture.nativeElement.querySelector('.tenant-readonly')?.textContent?.trim()).toBe('acme-tire');

      fillCredentials();
      component.submit();
      expect(authServiceStub.login).toHaveBeenCalledWith({ username: 'admin', password: 'pass1' });
    });

    it('reports an unknown or inactive tenant with the same message as bad credentials', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<never>();
      authServiceStub.login.mockReturnValueOnce(subject);
      fillCredentials();
      component.form.patchValue({ tenantSlug: 'no-such-tenant' });
      component.submit();
      subject.error({ status: 401 });

      expect(component.error()).toBe('AUTH.LOGIN.ERROR.INVALID_CREDENTIALS');
    });
  });
});
