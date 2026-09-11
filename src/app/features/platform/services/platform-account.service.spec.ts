import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PlatformAccountService } from './platform-account.service';
import { AccountSummary } from '../models/tenant.models';

const account: AccountSummary = {
  id: '01990000-0000-7000-8000-00000000a001',
  legalName: 'Acme Tire & Auto LLC',
  tradingName: 'Acme Tire',
  status: 'ACTIVE',
  homeCountry: 'US',
  homeCurrency: 'USD',
  tenantIds: [],
};

describe('PlatformAccountService', () => {
  let service: PlatformAccountService;
  const api = { get: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PlatformAccountService, { provide: ApiBaseService, useValue: api }],
    });
    service = TestBed.inject(PlatformAccountService);
  });

  it('lists accounts from the platform account API', () => {
    api.get.mockReturnValueOnce(of([account]));

    let result: AccountSummary[] | undefined;
    service.listAccounts().subscribe(r => (result = r));

    expect(api.get).toHaveBeenCalledWith('/tenant/v1/platform/accounts');
    expect(result).toEqual([account]);
  });
});
