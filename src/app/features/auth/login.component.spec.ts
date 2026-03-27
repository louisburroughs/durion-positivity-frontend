import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;

  const authServiceStub = {
    login: vi.fn().mockReturnValue(new Subject()),
  };

  const themeServiceStub = {
    theme: () => 'light',
    isDark: () => false,
  };

  function setup(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
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
      expect(banner.textContent).toContain('session has expired');
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
      component.form.setValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.error({ status: 401 });

      expect(component.error()).toBe('Invalid username or password. Please try again.');
      expect(component.loading()).toBe(false);
    });

    it('sets network error message when status is 0', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<never>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.setValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.error({ status: 0 });

      expect(component.error()).toContain('Cannot reach the server');
      expect(component.loading()).toBe(false);
    });

    it('redirects to returnUrl on successful login', () => {
      setup({ returnUrl: '/app/security' });
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const spy = vi.spyOn(router, 'navigateByUrl');
      const subject = new Subject<any>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.setValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();
      subject.next({ accessToken: 'tok', refreshToken: 'rt', tokenType: 'Bearer' });

      expect(spy).toHaveBeenCalledWith('/app/security');
    });
  });
});
