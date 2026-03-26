/**
 * CRM domain models.
 * Source of truth: durion-positivity-backend/pos-customer/openapi.yaml
 * Contract guide: domains/crm/.business-rules/BACKEND_CONTRACT_GUIDE.md
 */

// ── Party / Account ──────────────────────────────────────────────────────────

export interface BillingTermsRef {
  id: string;
  name: string;
}

export interface ExternalIdentifier {
  type: string;
  value: string;
}

export interface CreateCommercialAccountRequest {
  legalName: string;
  dba?: string;
  taxId?: string;
  defaultBillingTermsId: string;
  externalIdentifiers?: ExternalIdentifier[];
  /** Populated when user overrides a duplicate warning. */
  overrideDuplicateJustification?: string;
  overrideDuplicate?: boolean;
}

export interface PartyRef {
  partyId: string;
  legalName: string;
  dba?: string;
}

export interface CreateCommercialAccountResponse {
  partyId: string;
  legalName: string;
  dba?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface MergePartiesRequest {
  survivorPartyId: string;
  losingPartyId: string;
  justification?: string;
}

export interface MergePartiesResponse {
  mergeAuditId?: string;
  survivorPartyId: string;
  losingPartyId: string;
  mergedPartyAlias?: string;
  status?: string;
  completedAt?: string;
}

export interface DuplicateCandidate {
  partyId: string;
  legalName: string;
  dba?: string;
  taxId?: string;
  matchReasons?: string[];
}

export interface DuplicateCheckResponse {
  duplicates: DuplicateCandidate[];
}

// ── Individual Person ────────────────────────────────────────────────────────

export interface CreatePersonRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  defaultBillingTermsId?: string;
}

export interface CreatePersonResponse {
  personId: string;
  firstName: string;
  lastName: string;
  createdAt?: string;
  createdBy?: string;
}

export type RelationshipRole =
  | 'APPROVER'
  | 'BILLING'
  | 'PRIMARY_CONTACT'
  | 'DRIVER'
  | 'TECHNICAL'
  | string;

export interface CreatePartyRelationshipRequest {
  personId: string;
  roles: RelationshipRole[];
  effectiveStartDate: string;
  effectiveEndDate?: string;
  primaryBillingContact?: boolean;
}

export interface CreatePartyRelationshipResponse {
  relationshipId?: string;
  partyId?: string;
  personId?: string;
  roles?: RelationshipRole[];
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  createdAt?: string;
  previousPrimaryDemoted?: boolean;
}

// ── Contacts ─────────────────────────────────────────────────────────────────

export type ContactRole = 'PRIMARY' | 'BILLING' | 'TECHNICAL' | 'APPROVER' | 'DRIVER' | string;

export interface Contact {
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  roles: ContactRole[];
}

export interface UpdateContactRolesRequest {
  roles: ContactRole[];
}

// ── Communication Preferences ────────────────────────────────────────────────

export interface CommunicationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  preferredChannel?: string;
  optOutReasons?: string[];
}

// ── Vehicle ───────────────────────────────────────────────────────────────────

export interface CreateVehicleRequest {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  unitNumber?: string;
}

export interface VehicleRef {
  vehicleId: string;
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  unitNumber?: string;
}

// ── Party Detail (snapshot) ───────────────────────────────────────────────────

export interface PartyDetail {
  partyId: string;
  legalName: string;
  dba?: string;
  taxId?: string;
  defaultBillingTermsId?: string;
  contacts?: Contact[];
  vehicles?: VehicleRef[];
  createdAt?: string;
  createdBy?: string;
}
