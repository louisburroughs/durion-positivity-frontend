import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantCreatePageComponent } from './tenant-create-page.component';
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

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function setup(accounts: AccountSummary[] | HttpErrorResponse = [account]): Promise<void> {
    tenantService = { createTenant: vi.fn().mockReturnValue(of(created)) };
    accountService = {
      listAccounts: vi
        .fn()
        .mockReturnValue(accounts instanceof HttpErrorResponse ? throwError(() => accounts) : of(accounts)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TenantCreatePageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PlatformTenantService, useValue: tenantService },
        { provide: PlatformAccountService, useValue: accountService },
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
});
