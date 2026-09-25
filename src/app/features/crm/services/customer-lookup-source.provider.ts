import { Provider, inject } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  CUSTOMER_LOOKUP_SOURCE,
  CustomerLookupResult,
  CustomerLookupSource,
} from '../../../shared/customer-lookup/customer-lookup.tokens';
import { CrmService } from './crm.service';
import { PartyDetail } from '../models/crm.models';

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
 */
export function provideCrmCustomerLookupSource(): Provider {
  return {
    provide: CUSTOMER_LOOKUP_SOURCE,
    useFactory: (): CustomerLookupSource => {
      const crm = inject(CrmService);
      return {
        search: query => crm.searchParties(query).pipe(map(res => (res.parties ?? []).map(toResult))),
        getById: id => crm.getParty(id).pipe(map(toResult)),
      };
    },
  };
}
