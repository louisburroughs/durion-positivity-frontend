import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TokenPairResponse } from '@durion-sdk/security';
import { of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { LastTenantService } from '../../core/services/last-tenant.service';
import { ThemeService } from '../../core/services/theme.service';
import { LoginComponent } from './login.component';
import { Organization, OrganizationSearchService } from './organization-search.service';
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

  const ACME: Organization = { slug: 'acme-tire', displayName: 'Acme Tire & Auto' };
  const TUCSON: Organization = { slug: 'acme-tucson', displayName: 'Acme Tire & Auto — Tucson' };

  // null means the directory is switched off, which is how the component learns to fall back.
  const searchStub = {
    search: vi.fn((_q: string) => of<Organization[] | null>([ACME, TUCSON])),
  };

  const lastTenantStub = {
    remembered: vi.fn(() => null as Organization | null),
    remember: vi.fn(),
    forget: vi.fn(),
  };

  /** Types into the organization field and lets the debounce elapse. */
  function typeOrganization(value: string): void {
    component.onOrganizationInput(value);
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
  }

  function setup(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authServiceStub },
        { provide: ThemeService, useValue: themeServiceStub },
        { provide: OrganizationSearchService, useValue: searchStub },
        { provide: LastTenantService, useValue: lastTenantStub },
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

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    authServiceStub.hostTenantSlug.mockReturnValue(null);
    searchStub.search.mockImplementation((_q: string) => of<Organization[] | null>([ACME, TUCSON]));
    lastTenantStub.remembered.mockReturnValue(null);
    TestBed.resetTestingModule();
  });

  /** Picks an organization so the form has something to submit. */
  function chooseAcme(): void {
    typeOrganization('acme');
    component.choose(ACME);
    fixture.detectChanges();
  }

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
      chooseAcme();
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
      chooseAcme();
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
      chooseAcme();
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
      chooseAcme();
      component.submit();
      subject.next({ accessToken: 'tok', refreshToken: 'rt' });

      expect(spy).toHaveBeenCalledWith('/chat');
    });
  });

  describe('organization selection (ADR-0062)', () => {
    function fillCredentials(): void {
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
    }

    it('shows the organization combobox when the host names no tenant', () => {
      setup({});
      fixture.detectChanges();

      expect(component.hostTenantSlug()).toBeNull();
      expect(fixture.nativeElement.querySelector('#organization')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#tenantSlug')).toBeNull();
      expect(fixture.nativeElement.querySelector('.tenant-readonly')).toBeNull();
    });

    it('does not search until the minimum query length is reached', () => {
      setup({});
      fixture.detectChanges();

      typeOrganization('ac');

      expect(searchStub.search).not.toHaveBeenCalled();
      expect(component.listOpen()).toBe(false);
    });

    it('searches once the query is long enough, after the debounce', () => {
      setup({});
      fixture.detectChanges();

      component.onOrganizationInput('acme');
      expect(searchStub.search).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(searchStub.search).toHaveBeenCalledWith('acme');
      expect(component.results()).toEqual([ACME, TUCSON]);
    });

    it('submits the slug of the organization that was chosen', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      chooseAcme();

      component.submit();

      expect(authServiceStub.login).toHaveBeenCalledWith({
        username: 'admin',
        password: 'pass1',
        tenantSlug: 'acme-tire',
      });
    });

    it('refuses to submit free text that was never chosen from the list', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      typeOrganization('acme');

      component.submit();

      expect(component.organizationReady()).toBe(false);
      expect(authServiceStub.login).not.toHaveBeenCalled();
    });

    it('drops a pick once the user types again, so a stale slug is never sent', () => {
      setup({});
      fixture.detectChanges();
      fillCredentials();
      chooseAcme();
      expect(component.organizationReady()).toBe(true);

      typeOrganization('bobs');

      expect(component.selected()).toBeNull();
      component.submit();
      expect(authServiceStub.login).not.toHaveBeenCalled();
    });

    it('hides the combobox and shows the host-derived tenant read-only, sending no slug', () => {
      authServiceStub.hostTenantSlug.mockReturnValue('acme-tire');
      setup({});
      fixture.detectChanges();

      expect(component.hostTenantSlug()).toBe('acme-tire');
      expect(fixture.nativeElement.querySelector('#organization')).toBeNull();
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
      chooseAcme();
      component.submit();
      subject.error({ status: 401 });

      expect(component.error()).toBe('AUTH.LOGIN.ERROR.INVALID_CREDENTIALS');
    });

    it('says nothing that distinguishes "no such organization" from a server failure', () => {
      setup({});
      fixture.detectChanges();
      searchStub.search.mockImplementation(() => of<Organization[] | null>([]));

      typeOrganization('nosuch');

      expect(component.noMatches()).toBe(true);
      expect(component.error()).toBeNull();
    });
  });

  describe('remembering the organization', () => {
    it('pre-selects the organization the last sign-in used', () => {
      lastTenantStub.remembered.mockReturnValue(ACME);
      setup({});
      fixture.detectChanges();

      expect(component.selected()).toEqual(ACME);
      expect(component.organizationReady()).toBe(true);
    });

    it('lets the host override what was remembered', () => {
      lastTenantStub.remembered.mockReturnValue(ACME);
      authServiceStub.hostTenantSlug.mockReturnValue('other-tenant');
      setup({});
      fixture.detectChanges();

      expect(component.selected()).toBeNull();
    });

    it('remembers only after the sign-in succeeds', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<TokenPairResponse>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      chooseAcme();

      component.submit();
      expect(lastTenantStub.remember).not.toHaveBeenCalled();

      subject.next({ accessToken: 'tok', refreshToken: 'rt' });
      expect(lastTenantStub.remember).toHaveBeenCalledWith(ACME);
    });

    it('does not remember an organization a failed sign-in used', () => {
      setup({});
      fixture.detectChanges();
      const subject = new Subject<never>();
      authServiceStub.login.mockReturnValueOnce(subject);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      chooseAcme();

      component.submit();
      subject.error({ status: 401 });

      expect(lastTenantStub.remember).not.toHaveBeenCalled();
    });

    it('"use a different organization" forgets it and clears the field', () => {
      lastTenantStub.remembered.mockReturnValue(ACME);
      setup({});
      fixture.detectChanges();

      component.changeOrganization();

      expect(lastTenantStub.forget).toHaveBeenCalled();
      expect(component.selected()).toBeNull();
      expect(component.organizationQuery()).toBe('');
    });
  });

  describe('when the organization directory is switched off', () => {
    function makeUnavailable(): void {
      searchStub.search.mockImplementation(() => of<Organization[] | null>(null));
      typeOrganization('acme');
    }

    it('falls back to the tenant slug field', () => {
      setup({});
      fixture.detectChanges();

      makeUnavailable();

      expect(component.searchUnavailable()).toBe(true);
      expect(fixture.nativeElement.querySelector('#tenantSlug')).toBeTruthy();
      expect(fixture.nativeElement.querySelector('#organization')).toBeNull();
    });

    it('sends tenantSlug, trimmed and lowercased, from the fallback field', () => {
      setup({});
      fixture.detectChanges();
      makeUnavailable();
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.form.patchValue({ tenantSlug: '  Acme-Tire ' });

      component.submit();

      expect(authServiceStub.login).toHaveBeenCalledWith({
        username: 'admin',
        password: 'pass1',
        tenantSlug: 'acme-tire',
      });
    });

    it('omits tenantSlug when the fallback field is left blank', () => {
      setup({});
      fixture.detectChanges();
      makeUnavailable();
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });

      component.submit();

      expect(authServiceStub.login).toHaveBeenCalledWith({ username: 'admin', password: 'pass1' });
      expect(authServiceStub.login.mock.calls[0][0]).not.toHaveProperty('tenantSlug');
    });

    it('rejects a malformed slug client-side without calling the API', () => {
      setup({});
      fixture.detectChanges();
      makeUnavailable();
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.form.patchValue({ tenantSlug: 'Not A Slug!' });

      component.submit();

      expect(component.tenantSlugCtrl.invalid).toBe(true);
      expect(authServiceStub.login).not.toHaveBeenCalled();
    });
  });

  describe('stale search responses', () => {
    it('discards a response for text the user has already changed', () => {
      setup({});
      fixture.detectChanges();
      // The lookup for "acme" is still in flight when the user backspaces below
      // the minimum. switchMap cannot cancel it — nothing new passes the debounce —
      // so without the guard its results would reopen the list under "ac".
      const pending = new Subject<Organization[] | null>();
      searchStub.search.mockReturnValueOnce(pending);
      typeOrganization('acme');

      component.onOrganizationInput('ac');
      pending.next([ACME, TUCSON]);
      fixture.detectChanges();

      expect(component.listOpen()).toBe(false);
      expect(component.results()).toEqual([]);
    });

    it('cannot submit an option that arrived for stale text', () => {
      setup({});
      fixture.detectChanges();
      const pending = new Subject<Organization[] | null>();
      searchStub.search.mockReturnValueOnce(pending);
      typeOrganization('acme');
      component.onOrganizationInput('zz');
      pending.next([ACME]);
      fixture.detectChanges();
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });

      component.submit();

      expect(component.organizationReady()).toBe(false);
      expect(authServiceStub.login).not.toHaveBeenCalled();
    });

    it('searches again for text that was edited back to what was already asked', () => {
      // "acm", backspace, "m" again. Deduplicating the repeat suppressed the
      // request while the field had already been put into its searching state,
      // so nothing ever arrived to take it out again: the list stayed shut and
      // Sign in stayed refused until the user typed some other string.
      setup({});
      fixture.detectChanges();
      typeOrganization('acm');
      expect(searchStub.search).toHaveBeenCalledTimes(1);

      component.onOrganizationInput('ac');
      typeOrganization('acm');

      expect(searchStub.search).toHaveBeenCalledTimes(2);
      expect(component.searching()).toBe(false);
      expect(component.listOpen()).toBe(true);
      expect(component.results()).toEqual([ACME, TUCSON]);
    });

    it('lets that retyped query be chosen and submitted', () => {
      setup({});
      fixture.detectChanges();
      typeOrganization('acm');
      component.onOrganizationInput('ac');
      typeOrganization('acm');

      // Picked out of the list the user can actually see, not handed in: with
      // the request suppressed there is nothing there to pick.
      const offered = component.results();
      expect(offered).toEqual([ACME, TUCSON]);
      component.choose(offered[0]);
      component.form.patchValue({ username: 'admin', password: /* test credential */ 'pass1' });
      component.submit();

      expect(component.organizationReady()).toBe(true);
      expect(authServiceStub.login).toHaveBeenCalledWith({
        username: 'admin',
        password: 'pass1',
        tenantSlug: ACME.slug,
      });
    });

    it('still honours a 404 whenever it lands — it is about the deployment, not the query', () => {
      setup({});
      fixture.detectChanges();
      const pending = new Subject<Organization[] | null>();
      searchStub.search.mockReturnValueOnce(pending);
      typeOrganization('acme');

      component.onOrganizationInput('ac');
      pending.next(null);
      fixture.detectChanges();

      expect(component.searchUnavailable()).toBe(true);
    });
  });

  describe('keyboard navigation', () => {
    function key(name: string): KeyboardEvent {
      return new KeyboardEvent('keydown', { key: name, cancelable: true });
    }

    it('moves through the list and wraps at the end', () => {
      setup({});
      fixture.detectChanges();
      typeOrganization('acme');

      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(0);
      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(1);
      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(0);
      component.onKeydown(key('ArrowUp'));
      expect(component.activeIndex()).toBe(1);
    });

    it('Enter chooses the active option', () => {
      setup({});
      fixture.detectChanges();
      typeOrganization('acme');
      component.onKeydown(key('ArrowDown'));

      component.onKeydown(key('Enter'));

      expect(component.selected()).toEqual(ACME);
      expect(component.listOpen()).toBe(false);
    });

    it('Escape closes the list without choosing', () => {
      setup({});
      fixture.detectChanges();
      typeOrganization('acme');

      component.onKeydown(key('Escape'));

      expect(component.listOpen()).toBe(false);
      expect(component.selected()).toBeNull();
    });

    it('ArrowDown after Escape reopens on an option, so the next Enter chooses', () => {
      setup({});
      fixture.detectChanges();
      typeOrganization('acme');
      component.onKeydown(key('Escape'));

      component.onKeydown(key('ArrowDown'));
      expect(component.activeIndex()).toBe(0);

      component.onKeydown(key('Enter'));
      expect(component.selected()).toEqual(ACME);
    });

    it('reports an expanded popup only when it has options', () => {
      setup({});
      fixture.detectChanges();
      searchStub.search.mockImplementation(() => of<Organization[] | null>([]));

      typeOrganization('nosuch');

      // The live region still announces "no matches", but a screen reader must not
      // be told there is an expanded popup with nothing in it.
      expect(component.noMatches()).toBe(true);
      expect(component.listExpanded()).toBe(false);
    });
  });
});
