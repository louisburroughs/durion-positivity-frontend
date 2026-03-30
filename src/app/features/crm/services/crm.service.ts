import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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
  Contact,
  CrmSnapshot,
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
 */
@Injectable({ providedIn: 'root' })
export class CrmService {
  constructor(private readonly api: ApiBaseService) { }

  getBillingTerms(): Observable<BillingTermsRef[]> {
    return this.api.get<BillingTermsRef[]>('/v1/crm/billing-terms');
  }

  createCommercialAccount(
    request: CreateCommercialAccountRequest,
  ): Observable<CreateCommercialAccountResponse> {
    return this.api.post<CreateCommercialAccountResponse>(
      '/v1/crm/accounts/parties',
      request,
    );
  }

  mergeParties(partyId: string, request: MergePartiesRequest): Observable<MergePartiesResponse> {
    return this.api.post<MergePartiesResponse>(`/v1/crm/accounts/parties/${partyId}/merge`, request);
  }

  checkCommercialAccountDuplicates(legalName: string): Observable<DuplicateCheckResponse> {
    const params = new HttpParams().set('legalName', legalName).set('duplicateCheck', 'true');
    return this.api.get<DuplicateCheckResponse>('/v1/crm/accounts/parties/search', params);
  }

  getParty(partyId: string): Observable<PartyDetail> {
    return this.api.get<PartyDetail>(`/v1/crm/accounts/parties/${partyId}`);
  }

  searchParties(query: string): Observable<{ parties: PartyDetail[] }> {
    const params = new HttpParams().set('q', query);
    return this.api.get<{ parties: PartyDetail[] }>('/v1/crm/accounts/parties/search', params);
  }

  createPerson(request: CreatePersonRequest): Observable<CreatePersonResponse> {
    return this.api.post<CreatePersonResponse>('/v1/crm/persons', request);
  }

  getPerson(personId: string): Observable<CreatePersonResponse> {
    return this.api.get<CreatePersonResponse>(`/v1/crm/persons/${personId}`);
  }

  searchPersons(query: string): Observable<{ persons: CreatePersonResponse[] }> {
    const params = new HttpParams().set('q', query);
    return this.api.get<{ persons: CreatePersonResponse[] }>('/v1/crm/persons', params);
  }

  createRelationship(
    partyId: string,
    request: CreatePartyRelationshipRequest,
  ): Observable<CreatePartyRelationshipResponse> {
    return this.api.post<CreatePartyRelationshipResponse>(
      `/v1/crm/commercial-accounts/${partyId}/relationships`,
      request,
    );
  }

  getContactsWithRoles(partyId: string): Observable<Relationship[]> {
    return this.api.get<Relationship[]>(`/v1/crm/accounts/parties/${partyId}/contacts`);
  }

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

  getCommunicationPreferences(partyId: string): Observable<CommunicationPreferences> {
    return this.api.get<CommunicationPreferences>(
      `/v1/crm/accounts/parties/${partyId}/communicationPreferences`,
    );
  }

  upsertCommunicationPreferences(
    partyId: string,
    prefs: CommunicationPreferences,
  ): Observable<CommunicationPreferences> {
    return this.api.put<CommunicationPreferences>(
      `/v1/crm/accounts/parties/${partyId}/communicationPreferences`,
      prefs,
    );
  }

  createVehicleForParty(
    partyId: string,
    request: CreateVehicleRequest,
  ): Observable<VehicleRef> {
    return this.api.post<VehicleRef>(
      `/v1/crm/accounts/parties/${partyId}/vehicles`,
      request,
    );
  }

  fetchByParty(partyId: string): Observable<CrmSnapshot> {
    return this.api.get<CrmSnapshot>(`/v1/crm/snapshot/party/${partyId}`);
  }

  fetchByVehicle(vehicleId: string): Observable<CrmSnapshot> {
    return this.api.get<CrmSnapshot>(`/v1/crm/snapshot/vehicle/${vehicleId}`);
  }

  getBillingRules(partyId: string): Observable<BillingRules> {
    return this.api.get<BillingRules>(`/v1/crm/accounts/parties/${partyId}/billing-rules`);
  }

  upsertBillingRules(partyId: string, rules: Partial<BillingRules>): Observable<BillingRules> {
    const { createdAt, updatedAt, ...payload } = rules;
    return this.api.put<BillingRules>(`/v1/crm/accounts/parties/${partyId}/billing-rules`, payload);
  }
}
