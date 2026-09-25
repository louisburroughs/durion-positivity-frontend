import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountResponse, PlatformAccountAPIService } from '@durion-sdk/tenant';
import { PlatformAccountService } from './platform-account.service';
import { AccountSummary } from '../models/tenant.models';

const accountDto: AccountResponse = {
  id: '01990000-0000-7000-8000-00000000a001',
  legalName: 'Acme Tire & Auto LLC',
  tradingName: 'Acme Tire',
  status: 'ACTIVE' as AccountResponse['status'],
  homeCountry: 'US',
  homeCurrency: 'USD',
  tenantIds: [],
  contacts: [],
  createdAt: '2026-09-10T12:00:00Z',
  updatedAt: '2026-09-10T12:00:00Z',
};

const account: AccountSummary = {
  id: accountDto.id,
  legalName: accountDto.legalName,
  tradingName: accountDto.tradingName ?? null,
  status: 'ACTIVE',
  homeCountry: accountDto.homeCountry,
  homeCurrency: accountDto.homeCurrency,
  tenantIds: [],
};

describe('PlatformAccountService', () => {
  let service: PlatformAccountService;
  const api = { listAccounts: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [PlatformAccountService, { provide: PlatformAccountAPIService, useValue: api }],
    });
    service = TestBed.inject(PlatformAccountService);
  });

  it('lists accounts from the platform account API', () => {
    api.listAccounts.mockReturnValueOnce(of([accountDto]));

    let result: AccountSummary[] | undefined;
    service.listAccounts().subscribe(r => (result = r));

    expect(api.listAccounts).toHaveBeenCalledWith();
    expect(result).toEqual([account]);
  });

  it('maps a missing trading name to null', () => {
    const { tradingName: _tradingName, ...withoutTradingName } = accountDto;
    api.listAccounts.mockReturnValueOnce(of([withoutTradingName as AccountResponse]));

    let result: AccountSummary[] | undefined;
    service.listAccounts().subscribe(r => (result = r));

    expect(result?.[0].tradingName).toBeNull();
  });
});
