import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AccountResponse, PlatformAccountAPIService } from '@durion-sdk/tenant';
import { AccountSummary } from '../models/tenant.models';

/**
 * Platform Account API (`@durion-sdk/tenant`, gateway `/tenant/v1/platform/accounts`).
 *
 * Only the read the tenant pages need: the account list that a new tenant is
 * registered under. Needs `platform:account:read`.
 *
 * ADR-0062 §7: `@durion-sdk/tenant` is consumed only under `features/platform`.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAccountService {
  private readonly api = inject(PlatformAccountAPIService);

  /** `listAccounts` — every account, with the ids of the tenants it owns. */
  listAccounts(): Observable<AccountSummary[]> {
    return this.api.listAccounts().pipe(map(accounts => accounts.map(a => this.toAccountSummary(a))));
  }

  private toAccountSummary(dto: AccountResponse): AccountSummary {
    return {
      id: dto.id,
      legalName: dto.legalName,
      tradingName: dto.tradingName ?? null,
      status: dto.status,
      homeCountry: dto.homeCountry,
      homeCurrency: dto.homeCurrency,
      tenantIds: dto.tenantIds ?? [],
    };
  }
}
