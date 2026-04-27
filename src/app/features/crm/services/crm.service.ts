import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  CRMAccountsService,
  CRMCommunicationPreferencesService,
  CRMContactsService,
  CRMPartyRelationshipsService,
  CRMPersonsService,
  CRMSnapshotsService,
  CRMVehiclesService,
} from '@durion-sdk/customer';
import type {
  CreateCommercialAccountRequest as SdkCreateCommercialAccountRequest,
  MergePartiesRequest as SdkMergePartiesRequest,
  SearchPartiesRequest as SdkSearchPartiesRequest,
  CreatePersonRequest as SdkCreatePersonRequest,
  CreatePartyRelationshipRequest as SdkCreatePartyRelationshipRequest,
  UpdateContactRolesRequest as SdkUpdateContactRolesRequest,
  UpsertCommunicationPreferencesRequest as SdkUpsertCommunicationPreferencesRequest,
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

@Injectable({ providedIn: 'root' })
export class CrmService {
  private readonly api = inject(ApiBaseService);
  private readonly accountsApi = inject(CRMAccountsService);
  private readonly communicationPrefsApi = inject(CRMCommunicationPreferencesService);
  private readonly contactsApi = inject(CRMContactsService);
  private readonly relationshipsApi = inject(CRMPartyRelationshipsService);
  private readonly personsApi = inject(CRMPersonsService);
  private readonly snapshotsApi = inject(CRMSnapshotsService);
  private readonly vehiclesApi = inject(CRMVehiclesService);

  listBillingTerms(): Observable<BillingTermsRef[]> {
    return this.accountsApi.listBillingTerms() as Observable<BillingTermsRef[]>;
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
      justification: request.justification,
    };
    return this.accountsApi.mergeParties(partyId, sdkRequest) as Observable<MergePartiesResponse>;
  }

  checkCommercialAccountDuplicates(legalName: string): Observable<DuplicateCheckResponse> {
    const params = new HttpParams().set('legalName', legalName).set('duplicateCheck', 'true');
    return this.api.get<DuplicateCheckResponse>('/v1/crm/accounts/parties/search', params);
  }

  getParty(partyId: string): Observable<PartyDetail> {
    return this.accountsApi.getParty(partyId) as Observable<PartyDetail>;
  }

  searchParties(query: string): Observable<{ parties: PartyDetail[] }> {
    const sdkRequest: SdkSearchPartiesRequest = { name: query };
    return this.accountsApi.searchParties(sdkRequest).pipe(
      map(response => ({ parties: (response.results ?? []) as PartyDetail[] })),
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
    return this.relationshipsApi.createRelationship(partyId, sdkRequest) as Observable<CreatePartyRelationshipResponse>;
  }

  getContactsWithRoles(partyId: string): Observable<Relationship[]> {
    return this.contactsApi.getContactsWithRoles(partyId) as Observable<Relationship[]>;
  }

  updateContactRoles(
    partyId: string,
    contactId: string,
    request: UpdateContactRolesRequest,
  ): Observable<Contact> {
    const sdkRequest: SdkUpdateContactRolesRequest = {
      roles: request.roles.map(role => ({ roleCode: role as string })),
    };
    return this.contactsApi.updateContactRoles(partyId, contactId, sdkRequest) as Observable<Contact>;
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
    return this.communicationPrefsApi.getCommunicationPreferences(partyId) as Observable<CommunicationPreferences>;
  }

  upsertCommunicationPreferences(
    partyId: string,
    prefs: CommunicationPreferences,
  ): Observable<CommunicationPreferences> {
    const sdkRequest: SdkUpsertCommunicationPreferencesRequest = {
      emailPreference: prefs.emailEnabled ? 'ENABLED' : 'DISABLED',
      smsPreference: prefs.smsEnabled ? 'ENABLED' : 'DISABLED',
      phonePreference: prefs.preferredChannel,
    };
    return this.communicationPrefsApi.upsertCommunicationPreferences(partyId, sdkRequest) as Observable<CommunicationPreferences>;
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
    return this.snapshotsApi.fetchByParty(partyId) as Observable<CrmSnapshot>;
  }

  fetchByVehicle(vehicleId: string): Observable<CrmSnapshot> {
    return this.snapshotsApi.fetchByVehicle(vehicleId) as Observable<CrmSnapshot>;
  }

  getBillingRules(partyId: string): Observable<BillingRules> {
    return this.snapshotsApi.getBillingRules(partyId) as Observable<BillingRules>;
  }

  upsertBillingRules(partyId: string, rules: Partial<BillingRules>): Observable<BillingRules> {
    const { createdAt, updatedAt, ...payload } = rules;
    return this.api.put<BillingRules>(`/v1/crm/accounts/parties/${partyId}/billing-rules`, payload);
  }
}
