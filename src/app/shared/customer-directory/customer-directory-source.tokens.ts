import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Minimal, display-only shape workexec's estimate pages need. Kept separate
 * from `crm`'s `PartyDetail` so `shared/**` never depends on `features/**`
 * (LAY-02) — same split as `shared/customer-lookup`.
 */
export interface CustomerDirectoryEntry {
  readonly partyId: string;
  readonly legalName: string;
  readonly dba?: string;
  readonly customerNumber?: string;
}

/** A party's contact, for display only (role already resolved to one value). */
export interface CustomerContact {
  readonly relationshipId: string;
  readonly personName: string;
  readonly role: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Inversion point for the customer-directory reads workexec's estimate pages
 * need (a party's display fields, and its contacts): they only know this
 * contract, never `CrmService`/`PartyDetail`/`Relationship` directly. The
 * `crm` feature provides the real implementation once, at the composition
 * root (`app.config.ts`), via `provideCrmCustomerDirectorySource()`.
 *
 * This is deliberately a separate contract from `shared/customer-lookup`'s
 * `CustomerLookupSource` (a typeahead search), even though both are
 * `crm`-backed: this one resolves an already-known `partyId` to display data,
 * it does not search.
 */
export interface CustomerDirectorySource {
  getById(partyId: string): Observable<CustomerDirectoryEntry>;
  getContacts(partyId: string): Observable<readonly CustomerContact[]>;
}

export const CUSTOMER_DIRECTORY_SOURCE = new InjectionToken<CustomerDirectorySource>('CUSTOMER_DIRECTORY_SOURCE');

/**
 * Canonical customer display label: "Legal Name (DBA) · CUST-NUMBER",
 * omitting the DBA and/or number segments when absent. Moved from
 * `features/crm/utils/crm-labels.ts` (#347) alongside the contract above,
 * since workexec's estimate pages were its only callers outside `crm`.
 */
export function customerDirectoryLabel(entry: CustomerDirectoryEntry): string {
  const num = entry.customerNumber ? ` · ${entry.customerNumber}` : '';
  return entry.dba ? `${entry.legalName} (${entry.dba})${num}` : `${entry.legalName}${num}`;
}

/** Minimal shape needed to render a vehicle label (covers SDK VehicleSummary and VehicleResponse). */
export interface VehicleLike {
  year?: number;
  make?: string;
  model?: string;
  vin?: string;
  description?: string;
}

/**
 * Canonical vehicle display label: "YEAR MAKE MODEL — VIN", falling back to
 * the human description or VIN when the parts are missing. Already had no
 * dependency on `crm`'s models — moved here from `crm-labels.ts` with
 * `customerDirectoryLabel` because its only callers were workexec's estimate
 * pages (#347).
 */
export function vehicleLabel(v: VehicleLike): string {
  const desc = `${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
  if (desc && v.vin) return `${desc} — ${v.vin}`;
  return v.description || desc || v.vin || '';
}
