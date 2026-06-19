import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CRMAccountsService,
  CRMCommunicationPreferencesService,
  CRMPartyRelationshipsService,
  CRMPersonsService,
  CRMSnapshotsService,
  CRMVehiclesService,
} from '@durion-sdk/customer';
import type {
  CreateCommercialAccountRequest as SdkCreateCommercialAccountRequest,
  MergePartiesRequest as SdkMergePartiesRequest,
  Pageable as SdkPageable,
  CreatePersonRequest as SdkCreatePersonRequest,
  CreatePartyRelationshipRequest as SdkCreatePartyRelationshipRequest,
  UpsertCommunicationPreferencesRequest as SdkUpsertCommunicationPreferencesRequest,
  UpsertBillingRulesRequest,
  CreateVehicleForPartyRequest as SdkCreateVehicleForPartyRequest,
} from '@durion-sdk/customer';
import {
  BillingRules,
  BillingTermsRef,
  CreateCommercialAccountRequest,
  CreateCommercialAccountResponse,
  CreatePartyRelationshipRequest,
  CreatePartyRelationshipResponse,
  CreatePersonRequest,
  CreatePersonResponse,
  CreateVehicleRequest,
  CommunicationPreferences,
  CrmSnapshot,
  DuplicateCheckResponse,
  MergePartiesRequest,
  MergePartiesResponse,
  PartyDetail,
  Relationship,
  RelationshipRole,
  VehicleRef,
} from '../models/crm.models';

/** One server-side page of the customer directory. */
export interface PartyPage {
  parties: PartyDetail[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
}

export interface BrowsePartiesOptions {
  page?: number;
  size?: number;
  name?: string;
  status?: string;
  partyType?: string;
  customerNumber?: string;
  sortField?: 'name' | 'customerNumber';
  sortOrder?: 'asc' | 'desc';
}

@Injectable({ providedIn: 'root' })
export class CrmService {
  private readonly accountsApi = inject(CRMAccountsService);
  private readonly communicationPrefsApi = inject(CRMCommunicationPreferencesService);
  private readonly relationshipsApi = inject(CRMPartyRelationshipsService);
  private readonly personsApi = inject(CRMPersonsService);
  private readonly snapshotsApi = inject(CRMSnapshotsService);
  private readonly vehiclesApi = inject(CRMVehiclesService);

  listBillingTerms(): Observable<BillingTermsRef[]> {
    return this.accountsApi.listBillingTerms().pipe(
      map(terms => (terms ?? []).map(t => ({
        id: (t as { code?: string }).code ?? '',
        name: (t as { label?: string }).label ?? '',
      }))),
    );
  }

  createCommercialAccount(
    request: CreateCommercialAccountRequest,
  ): Observable<CreateCommercialAccountResponse> {
    const sdkRequest: SdkCreateCommercialAccountRequest = {
      legalName: request.legalName,
      taxId: request.taxId,
      billingTermsId: request.defaultBillingTermsId,
      externalIdentifiers: request.externalIdentifiers?.reduce<Record<string, string>>((acc, ei) => {
        acc[ei.type] = ei.value;
        return acc;
      }, {}),
    };
    return this.accountsApi.createCommercialAccount(sdkRequest) as Observable<CreateCommercialAccountResponse>;
  }

  mergeParties(partyId: string, request: MergePartiesRequest): Observable<MergePartiesResponse> {
    const sdkRequest: SdkMergePartiesRequest = {
      survivorPartyId: request.survivorPartyId,
      losingPartyId: request.losingPartyId,
      justification: request.justification as string,
    };
    return this.accountsApi.mergeParties(partyId, sdkRequest) as Observable<MergePartiesResponse>;
  }

  checkCommercialAccountDuplicates(legalName: string): Observable<DuplicateCheckResponse> {
    return this.accountsApi.checkPartyDuplicates(legalName).pipe(
      map(res => ({
        duplicates: (res.potentialDuplicates ?? []).map(m => ({
          partyId: m.partyId ?? '',
          legalName: m.legalName ?? '',
          matchReasons: m.matchType != null ? [String(m.matchType)] : undefined,
        })),
      } satisfies DuplicateCheckResponse)),
    );
  }

  getParty(partyId: string): Observable<PartyDetail> {
    return this.accountsApi.getParty(partyId) as Observable<PartyDetail>;
  }

  /**
   * Browse customers one server-side page at a time. The directory loads pages
   * incrementally as the user scrolls (see CustomerListComponent), so paging metadata
   * (totalCount, pageNumber, pageSize) is returned alongside the page contents.
   */
  browseParties(opts: BrowsePartiesOptions = {}): Observable<PartyPage> {
    const page = opts.page ?? 0;
    const size = opts.size ?? 25;
    const sdkPageable: SdkPageable = { page, size };

    return this.accountsApi
      .browseParties(
        sdkPageable,
        opts.name || undefined,
        opts.status || undefined,
        opts.partyType || undefined,
        opts.customerNumber || undefined,
        opts.sortField || undefined,
        opts.sortOrder || undefined,
      )
      .pipe(
        map(response => ({
          parties: (response.results ?? []) as PartyDetail[],
          totalCount: response.totalCount ?? 0,
          pageNumber: response.pageNumber ?? page,
          pageSize: response.pageSize ?? size,
        })),
      );
  }

  /**
   * Customer typeahead search across the full directory. Delegates to browseParties
   * (unified commercial accounts + individual person customers) rather than
   * accountsApi.searchParties, which matches commercial legalName only and never
   * returns individuals (CUST-PP-*). See issue #59.
   */
  searchParties(query: string): Observable<{ parties: PartyDetail[] }> {
    const normalizedQuery = query.trim();
    return this.browseParties({ name: normalizedQuery || undefined }).pipe(
      map(page => ({ parties: page.parties })),
    );
  }

  createPerson(request: CreatePersonRequest): Observable<CreatePersonResponse> {
    const sdkRequest: SdkCreatePersonRequest = {
      firstName: request.firstName,
      lastName: request.lastName,
      preferredContactMethod: 'NONE' as SdkCreatePersonRequest['preferredContactMethod'],
      emails: request.email ? [{ value: request.email }] : undefined,
      phones: request.phone ? [{ value: request.phone }] : undefined,
    };
    return this.personsApi.createPerson(sdkRequest) as Observable<CreatePersonResponse>;
  }

  getPerson(personId: string): Observable<CreatePersonResponse> {
    return this.personsApi.getPerson(personId) as Observable<CreatePersonResponse>;
  }

  searchPersons(query: string): Observable<{ persons: CreatePersonResponse[] }> {
    return this.personsApi.searchPersons(query).pipe(
      map(items => ({ persons: items as CreatePersonResponse[] })),
    );
  }

  createRelationship(
    partyId: string,
    request: CreatePartyRelationshipRequest,
  ): Observable<CreatePartyRelationshipResponse> {
    const sdkRequest: SdkCreatePartyRelationshipRequest = {
      personId: request.personId,
      roles: new Set(request.roles) as SdkCreatePartyRelationshipRequest['roles'],
      effectiveStartDate: request.effectiveStartDate,
      effectiveEndDate: request.effectiveEndDate,
      primaryBillingContact: request.primaryBillingContact,
    };
    return this.relationshipsApi.createRelationship(partyId, sdkRequest).pipe(
      map(res => ({
        relationshipId: res.relationshipId,
        partyId: res.partyId,
        personId: res.personId,
        roles: res.roles ? (Array.from(res.roles) as RelationshipRole[]) : undefined,
        effectiveStartDate: res.effectiveStartDate,
        effectiveEndDate: res.effectiveEndDate,
        createdAt: res.createdAt,
        previousPrimaryDemoted: res.previousPrimaryDemoted,
      } satisfies CreatePartyRelationshipResponse)),
    );
  }

  getContactsWithRoles(partyId: string): Observable<Relationship[]> {
    return this.relationshipsApi.getContacts(partyId).pipe(
      map(response => (response.contacts ?? []).map(c => ({
        relationshipId: c.relationshipId ?? '',
        personId: c.individualId ?? '',
        personName: c.individual?.displayName ?? '',
        email: c.individual?.email,
        phone: c.individual?.phone,
        role: (Array.from(c.roles ?? [])[0] ?? 'PRIMARY_CONTACT') as RelationshipRole,
        effectiveFrom: c.effectiveFrom ?? '',
        effectiveThru: c.effectiveTo,
        isPrimaryBilling: c.primaryBilling ?? false,
        status: (c.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE',
      } satisfies Relationship)))
    );
  }

  designatePrimaryBillingContact(
    partyId: string,
    relationshipId: string,
  ): Observable<Relationship> {
    return this.relationshipsApi.designatePrimaryBillingContact(partyId, relationshipId) as Observable<Relationship>;
  }

  deactivateRelationship(partyId: string, relationshipId: string): Observable<void> {
    return this.relationshipsApi.deactivateRelationship(partyId, relationshipId) as Observable<void>;
  }

  getCommunicationPreferences(partyId: string): Observable<CommunicationPreferences> {
    return this.communicationPrefsApi.getCommunicationPreferences(partyId).pipe(
      map(res => ({
        emailEnabled: String(res.emailPreference) === 'OPT_IN',
        smsEnabled: String(res.smsPreference) === 'OPT_IN',
      } satisfies CommunicationPreferences)),
    );
  }

  upsertCommunicationPreferences(
    partyId: string,
    prefs: CommunicationPreferences,
  ): Observable<CommunicationPreferences> {
    const sdkRequest: SdkUpsertCommunicationPreferencesRequest = {
      emailPreference: prefs.emailEnabled ? 'OPT_IN' : 'OPT_OUT',
      smsPreference: prefs.smsEnabled ? 'OPT_IN' : 'OPT_OUT',
    };
    // The upsert response confirms the write but does not echo the preference
    // values, so the saved request is the authoritative post-save state.
    return this.communicationPrefsApi
      .upsertCommunicationPreferences(partyId, sdkRequest)
      .pipe(map(() => prefs));
  }

  createVehicleForParty(
    partyId: string,
    request: CreateVehicleRequest,
  ): Observable<VehicleRef> {
    const sdkRequest: SdkCreateVehicleForPartyRequest = {
      vinNumber: request.vin,
      unitNumber: request.unitNumber,
    };
    return this.vehiclesApi.createVehicles(partyId, sdkRequest) as Observable<VehicleRef>;
  }

  fetchByParty(partyId: string): Observable<CrmSnapshot> {
    return this.snapshotsApi.fetchByParty(partyId) as unknown as Observable<CrmSnapshot>;
  }

  fetchByVehicle(vehicleId: string): Observable<CrmSnapshot> {
    return this.snapshotsApi.fetchByVehicle(vehicleId) as unknown as Observable<CrmSnapshot>;
  }

  getBillingRules(partyId: string): Observable<BillingRules> {
    return this.snapshotsApi.getBillingRules(partyId) as unknown as Observable<BillingRules>;
  }

  upsertBillingRules(partyId: string, rules: Partial<BillingRules>): Observable<BillingRules> {
    const { createdAt, updatedAt, ...payload } = rules;
    return this.accountsApi.upsertBillingRules(partyId, payload as UpsertBillingRulesRequest) as unknown as Observable<BillingRules>;
  }
}
