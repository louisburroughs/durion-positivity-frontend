import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantListPageComponent } from './tenant-list-page.component';
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
};

const suspended: Tenant = { ...active, id: 't-2', slug: 'bolt-brakes', displayName: 'Bolt Brakes', status: 'SUSPENDED', cell: null };

describe('TenantListPageComponent', () => {
  let fixture: ComponentFixture<TenantListPageComponent>;
  let component: TenantListPageComponent;
  let service: { listTenants: ReturnType<typeof vi.fn> };
  let permissions: string[];

  const authStub = {
    permissionsKnown: () => true,
    hasAnyPermission: (codes: readonly string[]) => codes.some(code => permissions.includes(code)),
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyRole: () => false,
  };

  async function setup(response: Tenant[] | HttpErrorResponse = [active, suspended]): Promise<void> {
    service = {
      listTenants: vi
        .fn()
        .mockReturnValue(response instanceof HttpErrorResponse ? throwError(() => response) : of(response)),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TenantListPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: PlatformTenantService, useValue: service },
        { provide: AuthService, useValue: authStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantListPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.clearAllMocks();
    permissions = ['platform:tenant:read', 'platform:tenant:create'];
  });

  it('loads every tenant on creation and renders them', async () => {
    await setup();

    expect(service.listTenants).toHaveBeenCalledWith(undefined);
    expect(component.state()).toBe('ready');
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
  });

  it('reports empty when no tenant matches', async () => {
    await setup([]);

    expect(component.state()).toBe('empty');
    expect((fixture.nativeElement as HTMLElement).querySelector('.plt-table')).toBeNull();
  });

  it('sets both state and errorKey when the list fails', async () => {
    await setup(new HttpErrorResponse({ status: 500, statusText: 'x' }));

    expect(component.state()).toBe('error');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.RETRYABLE');
  });

  it('renders a forbidden state on 403 without leaking the body', async () => {
    await setup(new HttpErrorResponse({ status: 403, statusText: 'x', error: { message: 'secret' } }));

    expect(component.state()).toBe('forbidden');
    expect(component.errorKey()).toBe('PLATFORM.ERROR.FORBIDDEN');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('secret');
  });

  it('reloads with the lifecycle status filter', async () => {
    await setup();
    service.listTenants.mockClear();

    component.onStatusFilterChange('SUSPENDED');

    expect(service.listTenants).toHaveBeenCalledWith('SUSPENDED');
    expect(component.statusFilter()).toBe('SUSPENDED');
  });

  it('ignores an unknown filter value and lists everything', async () => {
    await setup();
    service.listTenants.mockClear();

    component.onStatusFilterChange('BOGUS');

    expect(service.listTenants).toHaveBeenCalledWith(undefined);
    expect(component.statusFilter()).toBe('');
  });

  it('shows status as translated text, not colour alone', async () => {
    await setup();
    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.plt-status')).map(n =>
      n.textContent?.trim(),
    );

    expect(chips).toEqual(['PLATFORM.TENANTS.STATUS.ACTIVE', 'PLATFORM.TENANTS.STATUS.SUSPENDED']);
  });

  it('links to each tenant with routerLink (ADR-0037)', async () => {
    await setup();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tenants-page__link'));

    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/app/platform/tenants/t-1');
  });

  it('offers the register action only to a session the create route would admit', async () => {
    await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('.tenants-page__create')?.getAttribute('href')).toBe(
      '/app/platform/tenants/new',
    );

    permissions = ['platform:tenant:read'];
    await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('.tenants-page__create')).toBeNull();
  });
});
