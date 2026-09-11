import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';
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
    expect(el().querySelector('[role="alertdialog"]')).toBeTruthy();

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
