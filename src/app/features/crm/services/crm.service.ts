import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  BillingRule,
  BillingTermsRef,
  CreateCommercialAccountRequest,
  CreateCommercialAccountResponse,
  CreatePartyRelationshipRequest,
  CreatePartyRelationshipResponse,
  CreatePersonRequest,
  CreatePersonResponse,
  CreateVehicleRequest,
  CommunicationPreferences,
  Contact,
  DuplicateCheckResponse,
  MergePartiesRequest,
  MergePartiesResponse,
  PartyDetail,
  Relationship,
  UpdateContactRolesRequest,
  VehicleRef,
} from '../models/crm.models';

/**
 * CrmService — adapts CRM OpenAPI operations to Angular observables.
 *
 * operationId mapping:
 *   createCommercialAccount  → POST /v1/crm/accounts/parties
 *   mergeParties             → POST /v1/crm/accounts/parties/{partyId}/merge
 *   getParty                 → GET  /v1/crm/accounts/parties/{partyId}
 *   searchParties            → GET  /v1/crm/accounts/parties/search
 *   createPerson             → POST /v1/crm/persons
 *   getPerson                → GET  /v1/crm/persons/{personId}
 *   searchPersons            → GET  /v1/crm/persons
 *   createRelationship       → POST /v1/crm/commercial-accounts/{partyId}/relationships
 *   getContactsWithRoles_1   → GET  /v1/crm/accounts/parties/{partyId}/contacts
 *   updateContactRoles_1     → PUT  /v1/crm/accounts/parties/{partyId}/contacts/{contactId}/roles
 *   getCommunicationPreferences_1  → GET  /v1/crm/accounts/parties/{partyId}/communicationPreferences
 *   upsertCommunicationPreferences_1 → PUT /v1/crm/accounts/parties/{partyId}/communicationPreferences
 *   createVehicleForParty    → POST /v1/crm/accounts/parties/{partyId}/vehicles
 *   fetchByParty             → GET  /v1/crm/snapshot/party/{partyId}
 */
@Injectable({ providedIn: 'root' })
export class CrmService {
  constructor(private readonly api: ApiBaseService) {}

  // ── Billing terms (reference data) ─────────────────────────────────────────

  getBillingTerms(): Observable<BillingTermsRef[]> {
    return this.api.get<BillingTermsRef[]>('/v1/crm/billing-terms');
  }

  // ── Commercial account ──────────────────────────────────────────────────────

  /** operationId: createCommercialAccount */
  createCommercialAccount(
    request: CreateCommercialAccountRequest,
  ): Observable<CreateCommercialAccountResponse> {
    return this.api.post<CreateCommercialAccountResponse>(
      '/v1/crm/accounts/parties',
      request,
    );
  }

  /** operationId: mergeParties */
  mergeParties(partyId: string, request: MergePartiesRequest): Observable<MergePartiesResponse> {
    return this.api.post<MergePartiesResponse>(`/v1/crm/accounts/parties/${partyId}/merge`, request);
  }

  /** Duplicate check before create — uses searchParties with legalName. */
  checkCommercialAccountDuplicates(legalName: string): Observable<DuplicateCheckResponse> {
    const params = new HttpParams().set('legalName', legalName).set('duplicateCheck', 'true');
    return this.api.get<DuplicateCheckResponse>('/v1/crm/accounts/parties/search', params);
  }

  /** operationId: getParty */
  getParty(partyId: string): Observable<PartyDetail> {
    return this.api.get<PartyDetail>(`/v1/crm/accounts/parties/${partyId}`);
  }

  /** operationId: searchParties */
  searchParties(query: string): Observable<{ parties: PartyDetail[] }> {
    const params = new HttpParams().set('q', query);
    return this.api.get<{ parties: PartyDetail[] }>('/v1/crm/accounts/parties/search', params);
  }

  // ── Individual person ────────────────────────────────────────────────────────

  /** operationId: createPerson */
  createPerson(request: CreatePersonRequest): Observable<CreatePersonResponse> {
    return this.api.post<CreatePersonResponse>('/v1/crm/persons', request);
  }

  /** operationId: getPerson */
  getPerson(personId: string): Observable<CreatePersonResponse> {
    return this.api.get<CreatePersonResponse>(`/v1/crm/persons/${personId}`);
  }

  /** operationId: searchPersons */
  searchPersons(query: string): Observable<{ persons: CreatePersonResponse[] }> {
    const params = new HttpParams().set('q', query);
    return this.api.get<{ persons: CreatePersonResponse[] }>('/v1/crm/persons', params);
  }

  // ── Party relationships ──────────────────────────────────────────────────────

  /** operationId: createRelationship */
  createRelationship(
    partyId: string,
    request: CreatePartyRelationshipRequest,
  ): Observable<CreatePartyRelationshipResponse> {
    return this.api.post<CreatePartyRelationshipResponse>(
      `/v1/crm/commercial-accounts/${partyId}/relationships`,
      request,
    );
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  /** operationId: getContactsWithRoles_1 */
  getContactsWithRoles(partyId: string): Observable<Relationship[]> {
    return this.api.get<Relationship[]>(`/v1/crm/accounts/parties/${partyId}/contacts`);
  }

  /** operationId: updateContactRoles_1 */
  updateContactRoles(
    partyId: string,
    contactId: string,
    request: UpdateContactRolesRequest,
  ): Observable<Contact> {
    return this.api.put<Contact>(
      `/v1/crm/accounts/parties/${partyId}/contacts/${contactId}/roles`,
      request,
    );
  }

  designatePrimaryBillingContact(
    partyId: string,
    relationshipId: string,
  ): Observable<Relationship> {
    return this.api.put<Relationship>(
      `/v1/crm/accounts/parties/${partyId}/relationships/${relationshipId}/primary-billing`,
      {},
    );
  }

  deactivateRelationship(partyId: string, relationshipId: string): Observable<void> {
    return this.api.delete<void>(`/v1/crm/accounts/parties/${partyId}/relationships/${relationshipId}`);
  }

  // ── Communication preferences ─────────────────────────────────────────────

  /** operationId: getCommunicationPreferences_1 */
  getCommunicationPreferences(partyId: string): Observable<CommunicationPreferences> {
    return this.api.get<CommunicationPreferences>(
      `/v1/crm/accounts/parties/${partyId}/communicationPreferences`,
    );
  }

  /** operationId: upsertCommunicationPreferences_1 */
  upsertCommunicationPreferences(
    partyId: string,
    prefs: CommunicationPreferences,
  ): Observable<CommunicationPreferences> {
    return this.api.put<CommunicationPreferences>(
      `/v1/crm/accounts/parties/${partyId}/communicationPreferences`,
      prefs,
    );
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────

  /** operationId: createVehicleForParty */
  createVehicleForParty(
    partyId: string,
    request: CreateVehicleRequest,
  ): Observable<VehicleRef> {
    return this.api.post<VehicleRef>(
      `/v1/crm/accounts/parties/${partyId}/vehicles`,
      request,
    );
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /** operationId: fetchByParty */
  fetchPartySnapshot(partyId: string): Observable<PartyDetail> {
    return this.api.get<PartyDetail>(`/v1/crm/snapshot/party/${partyId}`);
  }

  fetchVehicleSnapshot(vehicleId: string): Observable<PartyDetail> {
    return this.api.get<PartyDetail>(`/v1/crm/snapshot/vehicle/${vehicleId}`);
  }

  getBillingRules(partyId: string): Observable<BillingRule[]> {
    return this.api.get<BillingRule[]>(`/v1/crm/accounts/parties/${partyId}/billing-rules`);
  }
}
