import { TestBed } from '@angular/core/testing';
import { HttpParams } from '@angular/common/http';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PlatformTenantService } from './platform-tenant.service';
import { Tenant } from '../models/tenant.models';

const tenant: Tenant = {
  id: '01990000-0000-7000-8000-00000000c001',
  slug: 'acme-tire',
  displayName: 'Acme Tire & Auto',
  status: 'ACTIVE',
  accountId: '01990000-0000-7000-8000-00000000a001',
  cell: 'us-east-1',
  initialAdminEmail: 'owner@acme.example',
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
};

describe('PlatformTenantService', () => {
  let service: PlatformTenantService;
  const api = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PlatformTenantService, { provide: ApiBaseService, useValue: api }],
    });
    service = TestBed.inject(PlatformTenantService);
  });

  it('lists tenants from the platform tenant API without a filter', () => {
    api.get.mockReturnValueOnce(of([tenant]));

    let result: Tenant[] | undefined;
    service.listTenants().subscribe(r => (result = r));

    expect(api.get).toHaveBeenCalledWith('/tenant/v1/platform/tenants', undefined);
    expect(result).toEqual([tenant]);
  });

  it('passes the lifecycle status as a query parameter when filtering', () => {
    api.get.mockReturnValueOnce(of([]));

    service.listTenants('SUSPENDED').subscribe();

    const [path, params] = api.get.mock.calls[0] as [string, HttpParams];
    expect(path).toBe('/tenant/v1/platform/tenants');
    expect(params.get('status')).toBe('SUSPENDED');
    expect(params.keys()).toEqual(['status']);
  });

  it('reads one tenant by id', () => {
    api.get.mockReturnValueOnce(of(tenant));

    let result: Tenant | undefined;
    service.getTenant(tenant.id).subscribe(r => (result = r));

    expect(api.get).toHaveBeenCalledWith(`/tenant/v1/platform/tenants/${tenant.id}`);
    expect(result).toEqual(tenant);
  });

  it('registers a tenant with the request body as given — no tenant id of its own', () => {
    api.post.mockReturnValueOnce(of(tenant));
    const request = {
      slug: 'acme-tire',
      displayName: 'Acme Tire & Auto',
      accountId: tenant.accountId,
      initialAdminEmail: 'owner@acme.example',
    };

    service.createTenant(request).subscribe();

    expect(api.post).toHaveBeenCalledWith('/tenant/v1/platform/tenants', request);
    expect(api.post.mock.calls[0][2]).toBeUndefined();
  });

  it('suspends and reactivates through the lifecycle sub-resources with an empty body', () => {
    api.post.mockReturnValue(of(tenant));

    service.suspendTenant(tenant.id).subscribe();
    service.reactivateTenant(tenant.id).subscribe();

    expect(api.post).toHaveBeenNthCalledWith(1, `/tenant/v1/platform/tenants/${tenant.id}/suspend`, null);
    expect(api.post).toHaveBeenNthCalledWith(2, `/tenant/v1/platform/tenants/${tenant.id}/reactivate`, null);
  });

  it('URL-encodes the id segment', () => {
    api.get.mockReturnValueOnce(of(tenant));

    service.getTenant('a/b').subscribe();

    expect(api.get).toHaveBeenCalledWith('/tenant/v1/platform/tenants/a%2Fb');
  });
});
