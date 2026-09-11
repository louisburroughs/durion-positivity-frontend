import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantCreatePageComponent } from './tenant-create-page.component';
import { AuthService } from '../../../../core/services/auth.service';
import { PlatformAccountService } from '../../services/platform-account.service';
import { PlatformTenantService } from '../../services/platform-tenant.service';
import { AccountSummary, Tenant } from '../../models/tenant.models';

const account: AccountSummary = {
  id: 'a-1',
  legalName: 'Acme Tire & Auto LLC',
  tradingName: 'Acme Tire',
  status: 'ACTIVE',
  homeCountry: 'US',
  homeCurrency: 'USD',
  tenantIds: [],
};

const created: Tenant = {
  id: 't-9',
  slug: 'acme-tire',
  displayName: 'Acme Tire & Auto',
  status: 'PENDING',
  accountId: 'a-1',
  initialAdminEmail: 'owner@acme.example',
  createdAt: '2026-09-11T09:00:00Z',
  updatedAt: '2026-09-11T09:00:00Z',
};

describe('TenantCreatePageComponent', () => {
  let fixture: ComponentFixture<TenantCreatePageComponent>;
  let component: TenantCreatePageComponent;
  let tenantService: { createTenant: ReturnType<typeof vi.fn> };
  let accountService: { listAccounts: ReturnType<typeof vi.fn> };
  let permissions: string[];

  // Read access on by default so the pre-existing (reader) tests keep their
  // original navigate-to-detail behaviour; the create-only tests below pass
  // ['platform:tenant:create'] explicitly.
  const authStub = {
    permissionsKnown: () => true,
    hasAnyPermission: (codes: readonly string[]) => codes.some(code => permissions.includes(code)),
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyRole: () => false,
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function setup(
    accounts: AccountSummary[] | HttpErrorResponse | Observable<AccountSummary[]> = [account],
    perms: string[] = ['platform:tenant:read', 'platform:tenant:create'],
  ): Promise<void> {
    permissions = perms;
    tenantService = { createTenant: vi.fn().mockReturnValue(of(created)) };
    accountService = {
      listAccounts: vi
        .fn()
        .mockReturnValue(
          accounts instanceof HttpErrorResponse
            ? throwError(() => accounts)
            : accounts instanceof Observable
              ? accounts
              : of(accounts),
        ),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TenantCreatePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PlatformTenantService, useValue: tenantService },
        { provide: PlatformAccountService, useValue: accountService },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantCreatePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function fillValidForm(): void {
    component.form.setValue({
      slug: ' Acme-Tire ',
      displayName: ' Acme Tire & Auto ',
      accountId: 'a-1',
      cell: '',
      initialAdminEmail: 'owner@acme.example',
    });
  }

  beforeEach(() => vi.clearAllMocks());

  it('loads the account list into a select on creation', async () => {
    await setup();

    expect(accountService.listAccounts).toHaveBeenCalledTimes(1);
    expect(component.state()).toBe('ready');
    const select = el().querySelector('select#tenant-account');
    expect(select).toBeTruthy();
    expect(select?.textContent).toContain('Acme Tire & Auto LLC (Acme Tire)');
  });

  it('falls back to a plain account-id field when the account list fails, still allowing the form', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.RETRYABLE');
    expect(el().querySelector('select#tenant-account')).toBeNull();
    expect(el().querySelector('input#tenant-account')).toBeTruthy();
  });

  it('keeps the plain-id fallback usable when the account list is refused (create-only session)', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x', error: { message: 'no' } }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.ACCOUNTS_LOAD');
    expect(component.errorDetail()).toBeNull();
    expect(el().querySelector('input#tenant-account')).toBeTruthy();
    expect(el().textContent).not.toContain('PLATFORM.ERROR.FORBIDDEN');
  });

  it('leaves the account-list error state while a fallback submit is in flight', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));
    expect(component.state()).toBe('error');
    const pending = new Subject<Tenant>();
    tenantService.createTenant.mockReturnValueOnce(pending);
    fillValidForm();

    component.submit();
    fixture.detectChanges();

    expect(component.saving()).toBe(true);
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
    expect(el().querySelector('.plt-banner--error')).toBeNull();
    pending.complete();
  });

  it('renders the forbidden state when the create itself is refused', async () => {
    await setup();
    tenantService.createTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    fillValidForm();

    component.submit();

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.FORBIDDEN');
    expect(component.saving()).toBe(false);
  });

  it('does not submit an invalid form', async () => {
    await setup();

    component.submit();

    expect(tenantService.createTenant).not.toHaveBeenCalled();
    expect(component.form.touched).toBe(true);
  });

  it('rejects whitespace-only required text, which submit() would otherwise trim to empty', async () => {
    await setup();
    fillValidForm();
    component.form.patchValue({ slug: '   ', displayName: '   ', accountId: '   ' });

    component.submit();

    expect(component.slugCtrl.hasError('blank')).toBe(true);
    expect(component.displayNameCtrl.hasError('blank')).toBe(true);
    expect(component.accountIdCtrl.hasError('blank')).toBe(true);
    expect(tenantService.createTenant).not.toHaveBeenCalled();
  });

  it('shows the problem-detail sentence beneath the validation banner on a bare 400', async () => {
    await setup();
    tenantService.createTenant.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'x',
            error: { type: 'about:blank', title: 'Bad Request', status: 400, detail: 'Invalid request content.' },
          }),
      ),
    );
    fillValidForm();

    component.submit();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.VALIDATION');
    expect(component.errorDetail()).toBe('Invalid request content.');
    expect(el().querySelector('.plt-banner__detail')?.textContent?.trim()).toBe('Invalid request content.');
  });

  it('rejects a malformed slug and a malformed email client-side', async () => {
    await setup();
    fillValidForm();
    component.form.patchValue({ slug: 'Bad Slug', initialAdminEmail: 'nope' });

    component.submit();

    expect(component.slugCtrl.invalid).toBe(true);
    expect(component.initialAdminEmailCtrl.invalid).toBe(true);
    expect(tenantService.createTenant).not.toHaveBeenCalled();
  });

  it('submits a trimmed, lowercased request without an empty cell and navigates to the new tenant', async () => {
    await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fillValidForm();

    component.submit();

    expect(tenantService.createTenant).toHaveBeenCalledWith({
      slug: 'acme-tire',
      displayName: 'Acme Tire & Auto',
      accountId: 'a-1',
      initialAdminEmail: 'owner@acme.example',
    });
    expect(component.saving()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/app', 'platform', 'tenants', 't-9'], { state: { created: true } });
  });

  it('shows an inline success banner and resets the form instead of navigating for a create-only session', async () => {
    // A session holding platform:tenant:create but not platform:tenant:read
    // cannot open the detail page the reader test above navigates to.
    await setup([account], ['platform:tenant:create']);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    fillValidForm();

    component.submit();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(component.state()).toBe('ready');
    expect(component.successKey()).toBe('PLATFORM.TENANTS.FORM.CREATED_SUCCESS');
    expect(el().querySelector('.plt-banner--success')?.textContent).toContain(
      'PLATFORM.TENANTS.FORM.CREATED_SUCCESS',
    );
    expect(component.form.getRawValue()).toEqual({
      slug: '',
      displayName: '',
      accountId: '',
      cell: '',
      initialAdminEmail: '',
    });
  });

  it('clears a stale success banner when a new submission starts', async () => {
    await setup([account], ['platform:tenant:create']);
    fillValidForm();
    component.submit();
    expect(component.successKey()).not.toBeNull();

    fillValidForm();
    const pending = new Subject<Tenant>();
    tenantService.createTenant.mockReturnValueOnce(pending);
    component.submit();

    expect(component.successKey()).toBeNull();
    pending.complete();
  });

  it('includes the cell when given', async () => {
    await setup();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fillValidForm();
    component.form.patchValue({ cell: ' us-east-1 ' });

    component.submit();

    expect(tenantService.createTenant.mock.calls[0][0]).toMatchObject({ cell: 'us-east-1' });
  });

  it('sets state to error before errorKey and maps a taken slug on 409 (ADR-0031)', async () => {
    await setup();
    tenantService.createTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'x' })),
    );
    fillValidForm();

    component.submit();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.SLUG_TAKEN');
    expect(component.saving()).toBe(false);
  });

  it('maps validation failures onto the fields with the backend detail beneath', async () => {
    await setup();
    tenantService.createTenant.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            statusText: 'x',
            error: { fieldErrors: [{ field: 'initialAdminEmail', message: 'must be a well-formed email address' }] },
          }),
      ),
    );
    fillValidForm();

    component.submit();
    fixture.detectChanges();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.VALIDATION');
    expect(component.fieldError('initialAdminEmail')).toBe('PLATFORM.ERROR.FIELD.INITIAL_ADMIN_EMAIL');
    expect(el().querySelector('#tenant-admin-email-error')?.textContent).toContain('must be a well-formed email address');
  });

  it('maps an unknown account on 404', async () => {
    await setup();
    tenantService.createTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' })),
    );
    fillValidForm();

    component.submit();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.ACCOUNT_NOT_FOUND');
  });

  it('points the breadcrumb and Cancel link at the platform group root, not the list directly', async () => {
    // /app/platform's own '' route lands on the list for a reader and the
    // create form for a create-only session (platformLanding()); a hardcoded
    // link to the list would dead-end a create-only session at /forbidden.
    await setup();

    const back = el().querySelector<HTMLAnchorElement>('.tenant-create__back');
    const cancel = el().querySelector<HTMLAnchorElement>('a.plt-btn--secondary');

    expect(back?.getAttribute('href')).toBe('/app/platform');
    expect(cancel?.getAttribute('href')).toBe('/app/platform');
  });

  it('ignores submit() while the initial account load is still pending', async () => {
    const accounts$ = new Subject<AccountSummary[]>();
    await setup(accounts$);
    expect(component.state()).toBe('loading');
    fillValidForm();

    component.submit();

    expect(tenantService.createTenant).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });

  it('allows submit() once a pending account load resolves successfully (ordering: accounts then submit)', async () => {
    const accounts$ = new Subject<AccountSummary[]>();
    await setup(accounts$);
    fillValidForm();
    component.submit();
    expect(tenantService.createTenant).not.toHaveBeenCalled();

    accounts$.next([account]);
    accounts$.complete();
    fixture.detectChanges();
    expect(component.state()).toBe('ready');

    component.submit();

    expect(tenantService.createTenant).toHaveBeenCalledTimes(1);
  });

  it('allows submit() once a pending account load fails (ordering: accounts-failure then submit)', async () => {
    const accounts$ = new Subject<AccountSummary[]>();
    await setup(accounts$);
    fillValidForm();
    component.submit();
    expect(tenantService.createTenant).not.toHaveBeenCalled();

    accounts$.error(new HttpErrorResponse({ status: 500, statusText: 'x' }));
    fixture.detectChanges();
    expect(component.state()).toBe('error');

    component.submit();

    expect(tenantService.createTenant).toHaveBeenCalledTimes(1);
    // submit() clears the ACCOUNTS_LOAD error itself before the create call
    // goes out, so a since-settled create success never has to contend with it.
    expect(component.errorKey()).toBeNull();
  });

  it('renders the client-side cell length error with aria-invalid when there is no server field error', async () => {
    await setup();
    fillValidForm();
    component.form.patchValue({ cell: 'x'.repeat(65) });
    component.cellCtrl.markAsTouched();
    fixture.detectChanges();

    expect(component.cellCtrl.hasError('maxlength')).toBe(true);
    const input = el().querySelector<HTMLInputElement>('#tenant-cell');
    const error = el().querySelector('#tenant-cell-error');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(error?.textContent).toContain('PLATFORM.ERROR.FIELD.CELL');
  });
});
