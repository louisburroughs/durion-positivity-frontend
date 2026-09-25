import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformTenantAPIService, TenantResponse } from '@durion-sdk/tenant';
import { PlatformTenantService } from './platform-tenant.service';
import { Tenant } from '../models/tenant.models';

const tenantDto: TenantResponse = {
  id: '01990000-0000-7000-8000-00000000c001',
  slug: 'acme-tire',
  displayName: 'Acme Tire & Auto',
  status: 'ACTIVE' as TenantResponse['status'],
  accountId: '01990000-0000-7000-8000-00000000a001',
  cell: 'us-east-1',
  initialAdminEmail: 'owner@acme.example',
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
};

const tenant: Tenant = {
  id: tenantDto.id,
  slug: tenantDto.slug,
  displayName: tenantDto.displayName,
  status: 'ACTIVE',
  accountId: tenantDto.accountId,
  cell: tenantDto.cell ?? null,
  initialAdminEmail: tenantDto.initialAdminEmail,
  createdAt: tenantDto.createdAt,
  updatedAt: tenantDto.updatedAt,
  activatedAt: null,
  suspendedAt: null,
  decommissionedAt: null,
};

describe('PlatformTenantService', () => {
  let service: PlatformTenantService;
  const api = {
    listTenants: vi.fn(),
    getTenant: vi.fn(),
    createTenant: vi.fn(),
    suspendTenant: vi.fn(),
    reactivateTenant: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PlatformTenantService, { provide: PlatformTenantAPIService, useValue: api }],
    });
    service = TestBed.inject(PlatformTenantService);
  });

  it('lists tenants from the platform tenant API without a filter', () => {
    api.listTenants.mockReturnValueOnce(of([tenantDto]));

    let result: Tenant[] | undefined;
    service.listTenants().subscribe(r => (result = r));

    expect(api.listTenants).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([tenant]);
  });

  it('passes the lifecycle status through to the SDK call when filtering', () => {
    api.listTenants.mockReturnValueOnce(of([]));

    service.listTenants('SUSPENDED').subscribe();

    expect(api.listTenants).toHaveBeenCalledWith('SUSPENDED');
  });

  it('reads one tenant by id', () => {
    api.getTenant.mockReturnValueOnce(of(tenantDto));

    let result: Tenant | undefined;
    service.getTenant(tenant.id).subscribe(r => (result = r));

    expect(api.getTenant).toHaveBeenCalledWith(tenant.id);
    expect(result).toEqual(tenant);
  });

  it('registers a tenant with the request body as given — no tenant id of its own', () => {
    api.createTenant.mockReturnValueOnce(of(tenantDto));
    const request = {
      slug: 'acme-tire',
      displayName: 'Acme Tire & Auto',
      accountId: tenant.accountId,
      initialAdminEmail: 'owner@acme.example',
    };

    service.createTenant(request).subscribe();

    expect(api.createTenant).toHaveBeenCalledWith(request);
  });

  it('suspends and reactivates through the SDK lifecycle operations', () => {
    api.suspendTenant.mockReturnValue(of(tenantDto));
    api.reactivateTenant.mockReturnValue(of(tenantDto));

    service.suspendTenant(tenant.id).subscribe();
    service.reactivateTenant(tenant.id).subscribe();

    expect(api.suspendTenant).toHaveBeenNthCalledWith(1, tenant.id);
    expect(api.reactivateTenant).toHaveBeenNthCalledWith(1, tenant.id);
  });

  it('passes the raw id through to the SDK call, letting it own URL-encoding', () => {
    api.getTenant.mockReturnValueOnce(of(tenantDto));

    service.getTenant('a/b').subscribe();

    expect(api.getTenant).toHaveBeenCalledWith('a/b');
  });

  it('normalizes null cell/activatedAt/suspendedAt/decommissionedAt fields', () => {
    api.getTenant.mockReturnValueOnce(of({ ...tenantDto, cell: undefined }));

    let result: Tenant | undefined;
    service.getTenant(tenant.id).subscribe(r => (result = r));

    expect(result?.cell).toBeNull();
    expect(result?.activatedAt).toBeNull();
    expect(result?.suspendedAt).toBeNull();
    expect(result?.decommissionedAt).toBeNull();
  });
});
