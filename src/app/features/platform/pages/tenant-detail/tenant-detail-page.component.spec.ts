import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantDetailPageComponent } from './tenant-detail-page.component';
import { PlatformTenantService } from '../../services/platform-tenant.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Tenant } from '../../models/tenant.models';

const active: Tenant = {
  id: 't-1',
  slug: 'acme-tire',
  displayName: 'Acme Tire & Auto',
  status: 'ACTIVE',
  accountId: 'a-1',
  cell: 'us-east-1',
  initialAdminEmail: 'owner@acme.example',
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
  activatedAt: '2026-09-10T12:05:00Z',
};

const suspended: Tenant = { ...active, status: 'SUSPENDED', suspendedAt: '2026-09-11T08:00:00Z' };

describe('TenantDetailPageComponent', () => {
  let fixture: ComponentFixture<TenantDetailPageComponent>;
  let component: TenantDetailPageComponent;
  let service: {
    getTenant: ReturnType<typeof vi.fn>;
    suspendTenant: ReturnType<typeof vi.fn>;
    reactivateTenant: ReturnType<typeof vi.fn>;
  };
  let permissions: string[];
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const authStub = {
    permissionsKnown: () => true,
    hasAnyPermission: (codes: readonly string[]) => codes.some(code => permissions.includes(code)),
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyRole: () => false,
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function setup(response: Tenant | HttpErrorResponse = active, id = 't-1'): Promise<void> {
    service = {
      getTenant: vi
        .fn()
        .mockReturnValue(response instanceof HttpErrorResponse ? throwError(() => response) : of(response)),
      suspendTenant: vi.fn().mockReturnValue(of(suspended)),
      reactivateTenant: vi.fn().mockReturnValue(of(active)),
    };
    paramMap$ = new BehaviorSubject(convertToParamMap({ id }));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TenantDetailPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PlatformTenantService, useValue: service },
        { provide: AuthService, useValue: authStub },
        { provide: ActivatedRoute, useValue: { paramMap: paramMap$.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['platform:tenant:read', 'platform:tenant:suspend', 'platform:tenant:reactivate'];
  });

  it('loads the tenant named by the route and renders its record', async () => {
    await setup();

    expect(service.getTenant).toHaveBeenCalledWith('t-1');
    expect(component.state()).toBe('ready');
    expect(el().querySelector('h1')?.textContent?.trim()).toBe('Acme Tire & Auto');
    expect(el().textContent).toContain('owner@acme.example');
  });

  it('reloads when the route id changes and unsubscribes on destroy (ADR-0033)', async () => {
    await setup();
    paramMap$.next(convertToParamMap({ id: 't-2' }));
    fixture.detectChanges();

    expect(service.getTenant).toHaveBeenLastCalledWith('t-2');

    fixture.destroy();
    paramMap$.next(convertToParamMap({ id: 't-3' }));
    expect(service.getTenant).not.toHaveBeenCalledWith('t-3');
  });

  it('clears the previous record on an id change and drops a late answer for the old id', async () => {
    await setup();
    const slowT1 = new Subject<Tenant>();
    const slowT2 = new Subject<Tenant>();
    service.getTenant.mockImplementation((id: string) => (id === 't-2' ? slowT2 : slowT1));

    // A reload of t-1 is still in flight when the operator moves to t-2.
    component.load('t-1');
    paramMap$.next(convertToParamMap({ id: 't-2' }));
    fixture.detectChanges();

    expect(component.tenant()).toBeNull();
    expect(component.state()).toBe('loading');

    slowT1.next({ ...active, id: 't-1', displayName: 'Stale' });
    expect(component.tenant()).toBeNull();

    slowT2.next({ ...active, id: 't-2', displayName: 'Bolt Brakes' });
    expect(component.tenant()?.displayName).toBe('Bolt Brakes');
    expect(component.state()).toBe('ready');

    // A stale error for a superseded load is dropped just the same.
    const staleErr = new Subject<Tenant>();
    service.getTenant.mockReturnValueOnce(staleErr).mockReturnValueOnce(of({ ...active, id: 't-2' }));
    component.load('t-2');
    component.load('t-2');
    staleErr.error(new HttpErrorResponse({ status: 500, statusText: 'x' }));
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
  });

  it('sets both state and errorKey when the load fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.RETRYABLE');
  });

  it('distinguishes not-found and forbidden loads', async () => {
    await setup(new HttpErrorResponse({ status: 404, statusText: 'x' }));
    expect(component.state()).toBe('notFound');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.NOT_FOUND');

    await setup(new HttpErrorResponse({ status: 403, statusText: 'x' }));
    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.FORBIDDEN');
  });

  it('offers suspend for an ACTIVE tenant and reactivate for a SUSPENDED one', async () => {
    await setup(active);
    expect(el().querySelector('.tenant-page__suspend')).toBeTruthy();
    expect(el().querySelector('.tenant-page__reactivate')).toBeNull();

    await setup(suspended);
    expect(el().querySelector('.tenant-page__suspend')).toBeNull();
    expect(el().querySelector('.tenant-page__reactivate')).toBeTruthy();
  });

  it('hides a lifecycle control the session lacks the authority for', async () => {
    permissions = ['platform:tenant:read'];
    await setup(active);

    expect(el().querySelector('.tenant-page__suspend')).toBeNull();
    expect(component.canSuspend()).toBe(false);
  });

  it('suspends only after confirmation and shows the new status', async () => {
    await setup(active);

    component.askConfirmation('suspend');
    fixture.detectChanges();
    expect(service.suspendTenant).not.toHaveBeenCalled();
    // Non-modal alertdialog announced politely, focus on the safe Cancel.
    const confirm = el().querySelector('.tenant-page__confirm');
    expect(confirm).toBeTruthy();
    expect(confirm?.getAttribute('role')).toBe('alertdialog');
    expect(confirm?.getAttribute('aria-live')).toBe('polite');
    expect(confirm?.getAttribute('aria-modal')).toBeNull();
    expect(confirm?.getAttribute('aria-labelledby')).toBe('tenant-confirm-title');
    expect(confirm?.getAttribute('aria-describedby')).toBe('tenant-confirm-body');
    expect(el().querySelector('.tenant-page__confirm-no')?.hasAttribute('autofocus')).toBe(true);

    component.confirmTransition();
    fixture.detectChanges();

    expect(service.suspendTenant).toHaveBeenCalledWith('t-1');
    expect(component.tenant()?.status).toBe('SUSPENDED');
    expect(component.pendingTransition()).toBeNull();
    expect(component.successKey()).toBe('PLATFORM.TENANTS.DETAIL.SUSPENDED_SUCCESS');
    expect(el().querySelector('.tenant-page__success')?.textContent).toContain('SUSPENDED_SUCCESS');
  });

  it('cancelling the confirmation performs nothing', async () => {
    await setup(active);

    component.askConfirmation('suspend');
    component.cancelTransition();

    expect(component.pendingTransition()).toBeNull();
    expect(service.suspendTenant).not.toHaveBeenCalled();
  });

  it('reactivates a suspended tenant', async () => {
    await setup(suspended);

    component.askConfirmation('reactivate');
    component.confirmTransition();

    expect(service.reactivateTenant).toHaveBeenCalledWith('t-1');
    expect(component.tenant()?.status).toBe('ACTIVE');
    expect(component.successKey()).toBe('PLATFORM.TENANTS.DETAIL.REACTIVATED_SUCCESS');
  });

  it('ignores a lifecycle answer that arrives after the route moved to another tenant', async () => {
    await setup(active);
    const slowSuspend = new Subject<Tenant>();
    service.suspendTenant.mockReturnValueOnce(slowSuspend);
    service.getTenant.mockReturnValue(new Subject<Tenant>());

    component.askConfirmation('suspend');
    component.confirmTransition();
    expect(component.saving()).toBe(true);

    paramMap$.next(convertToParamMap({ id: 't-2' }));
    fixture.detectChanges();
    expect(component.saving()).toBe(false);
    expect(component.pendingTransition()).toBeNull();

    slowSuspend.next(suspended);
    expect(component.tenant()).toBeNull();
    expect(component.successKey()).toBeNull();
  });

  it('renders forbidden and not-found states from a rejected transition and drops the record', async () => {
    await setup(active);
    service.suspendTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'x' })),
    );
    component.askConfirmation('suspend');
    component.confirmTransition();
    fixture.detectChanges();
    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.FORBIDDEN');
    expect(component.tenant()).toBeNull();
    expect(el().querySelector('.tenant-page__suspend')).toBeNull();
    expect(el().querySelector('.tenant-page__facts')).toBeNull();

    await setup(suspended);
    service.reactivateTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'x' })),
    );
    component.askConfirmation('reactivate');
    component.confirmTransition();
    fixture.detectChanges();
    expect(component.state()).toBe('notFound');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.NOT_FOUND');
    expect(component.tenant()).toBeNull();
    expect(el().querySelector('.tenant-page__reactivate')).toBeNull();
  });

  it('drops a lifecycle answer that arrives after leaving and returning to the same tenant', async () => {
    await setup(active);
    const slowSuspend = new Subject<Tenant>();
    service.suspendTenant.mockReturnValueOnce(slowSuspend);
    service.getTenant.mockReturnValue(of(active));

    component.askConfirmation('suspend');
    component.confirmTransition();

    paramMap$.next(convertToParamMap({ id: 't-2' }));
    paramMap$.next(convertToParamMap({ id: 't-1' }));
    fixture.detectChanges();
    expect(component.tenant()?.status).toBe('ACTIVE');
    expect(component.state()).toBe('ready');

    slowSuspend.next(suspended);
    expect(component.tenant()?.status).toBe('ACTIVE');
    expect(component.successKey()).toBeNull();

    // The same holds for a late failure: no banner for a request this page no longer owns.
    const slowFail = new Subject<Tenant>();
    service.suspendTenant.mockReturnValueOnce(slowFail);
    component.askConfirmation('suspend');
    component.confirmTransition();
    component.reload();
    slowFail.error(new HttpErrorResponse({ status: 409, statusText: 'x' }));
    expect(component.state()).toBe('ready');
    expect(component.errorKey()).toBeNull();
  });

  it('clears the record while a retry loads so a failed retry shows no stale facts', async () => {
    await setup(active);
    const slow = new Subject<Tenant>();
    service.getTenant.mockReturnValueOnce(slow);

    component.reload();
    fixture.detectChanges();
    expect(component.tenant()).toBeNull();
    expect(component.state()).toBe('loading');
    expect(el().querySelector('.tenant-page__facts')).toBeNull();

    slow.error(new HttpErrorResponse({ status: 500, statusText: 'x' }));
    fixture.detectChanges();
    expect(component.state()).toBe('error');
    expect(component.tenant()).toBeNull();
    expect(el().querySelector('.tenant-page__facts')).toBeNull();
  });

  it('sets state to error before errorKey when a transition is rejected (ADR-0031)', async () => {
    await setup(active);
    service.suspendTenant.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'x' })),
    );

    component.askConfirmation('suspend');
    component.confirmTransition();

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.TENANTS.ERROR.TRANSITION_CONFLICT');
    expect(component.saving()).toBe(false);
    expect(component.tenant()?.status).toBe('ACTIVE');
  });
});
