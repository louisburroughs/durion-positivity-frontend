import { EnvironmentInjector, Provider, inject, runInInjectionContext } from '@angular/core';
import { from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import {
  CUSTOMER_DIRECTORY_SOURCE,
  CustomerContact,
  CustomerDirectoryEntry,
  CustomerDirectorySource,
} from '../../../shared/customer-directory/customer-directory-source.tokens';
import type { CrmService } from './crm.service';
import type { PartyDetail } from '../models/crm.models';
import type { Relationship } from '../models/crm.models';

function toEntry(party: PartyDetail): CustomerDirectoryEntry {
  return {
    partyId: party.partyId,
    legalName: party.legalName,
    dba: party.dba,
    customerNumber: party.customerNumber,
  };
}

function toContact(rel: Relationship): CustomerContact {
  return {
    relationshipId: rel.relationshipId,
    personName: rel.personName,
    role: rel.role,
    status: rel.status,
  };
}

/**
 * Registers the `crm`-backed implementation of `shared/customer-directory`'s
 * `CustomerDirectorySource` contract. Registered once, at the composition
 * root (`app.config.ts`), so workexec's estimate pages need no import from
 * `crm` directly (LAY-03).
 *
 * `CrmService` is loaded via a dynamic `import()` rather than a static one,
 * same pattern (and the same lazily-resolved instance) as
 * `provideCrmCustomerLookupSource`.
 */
export function provideCrmCustomerDirectorySource(): Provider {
  return {
    provide: CUSTOMER_DIRECTORY_SOURCE,
    useFactory: (): CustomerDirectorySource => {
      const injector = inject(EnvironmentInjector);
      let crmPromise: Promise<CrmService> | undefined;
      const getCrm = (): Promise<CrmService> => {
        crmPromise ??= import('./crm.service').then(({ CrmService }) =>
          runInInjectionContext(injector, () => inject(CrmService)),
        );
        return crmPromise;
      };
      return {
        getById: partyId =>
          from(getCrm()).pipe(switchMap(crm => crm.getParty(partyId).pipe(map(toEntry)))),
        getContacts: partyId =>
          from(getCrm()).pipe(
            switchMap(crm => crm.getContactsWithRoles(partyId).pipe(map(rels => rels.map(toContact)))),
          ),
      };
    },
  };
}
