import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { AccountSummary } from '../models/tenant.models';

/**
 * Platform Account API (`/tenant/v1/platform/accounts` through the gateway).
 *
 * Only the read the tenant pages need: the account list that a new tenant is
 * registered under. Needs `platform:account:read`. Local models until
 * `@durion-sdk/tenant` is generated (see `PlatformTenantService`).
 */
@Injectable({ providedIn: 'root' })
export class PlatformAccountService {
  private static readonly BASE = '/tenant/v1/platform/accounts';

  private readonly api = inject(ApiBaseService);

  /** `listAccounts` — every account, with the ids of the tenants it owns. */
  listAccounts(): Observable<AccountSummary[]> {
    return this.api.get<AccountSummary[]>(PlatformAccountService.BASE);
  }
}
