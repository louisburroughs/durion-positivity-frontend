import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CUSTOMER_LOOKUP_SOURCE,
  CustomerLookupResult,
  CustomerLookupSource,
} from '../../../shared/customer-lookup/customer-lookup.tokens';
import type { CrmService } from './crm.service';
import type { PartyDetail } from '../models/crm.models';

function toResult(party: PartyDetail): CustomerLookupResult {
  return {
    partyId: party.partyId,
    legalName: party.legalName,
    dba: party.dba,
    customerNumber: party.customerNumber,
  };
}

/**
 * Registers the `crm`-backed implementation of `shared/customer-lookup`'s
 * `CustomerLookupSource` contract. Registered once, at the composition root
 * (`app.config.ts`), so no feature importing `CustomerLookupComponent` needs to
 * import anything from `crm` directly (LAY-03).
 *
 * `CrmService` (and the generated `@durion-sdk/customer` API classes it wraps)
 * is loaded via a dynamic `import()` rather than a static one, so it lands in
 * its own chunk and is fetched only the first time a customer lookup actually
 * runs, instead of being pulled into the initial bundle by `app.config.ts`.
 */
export function provideCrmCustomerLookupSource(): Provider {
  return {
    provide: CUSTOMER_LOOKUP_SOURCE,
    useFactory: (): CustomerLookupSource => {
      const injector = inject(EnvironmentInjector);
      let crmPromise: Promise<CrmService> | undefined;
      const getCrm = (): Promise<CrmService> => {
        crmPromise ??= import('./crm.service').then(({ CrmService }) =>
          runInInjectionContext(injector, () => inject(CrmService)),
        );
        return crmPromise;
      };
      return {
        search: query =>
          from(getCrm()).pipe(
            switchMap(crm => crm.searchParties(query).pipe(map(res => (res.parties ?? []).map(toResult)))),
          ),
        getById: id => from(getCrm()).pipe(switchMap(crm => crm.getParty(id).pipe(map(toResult)))),
      };
    },
  };
}
