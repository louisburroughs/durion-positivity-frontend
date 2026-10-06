import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Minimal, display-only shape `CustomerLookupComponent` needs. Kept separate from
 * `crm`'s `PartyDetail` so `shared/**` never depends on `features/**` (LAY-02).
 */
export interface CustomerLookupResult {
  readonly partyId: string;
  readonly legalName: string;
  readonly dba?: string;
  readonly customerNumber?: string;
  /**
   * House-account kind when the party is a system house account (`CASH_SALE` is the
   * business's Walk-in customer); absent or null for every ordinary party. Recognise a
   * house account from this flag only, never from a name or customer number (CAP:550 S7).
   */
  readonly houseAccount?: string | null;
}

/**
 * Inversion point for the customer directory search: `shared/customer-lookup` only
 * knows this contract, never `CrmService` or `PartyDetail` directly. The `crm` feature
 * provides the real implementation once, at the composition root (`app.config.ts`),
 * via `provideCrmCustomerLookupSource()`.
 */
export interface CustomerLookupSource {
  search(query: string): Observable<CustomerLookupResult[]>;
  getById(id: string): Observable<CustomerLookupResult | null>;
}

export const CUSTOMER_LOOKUP_SOURCE = new InjectionToken<CustomerLookupSource>('CUSTOMER_LOOKUP_SOURCE');
