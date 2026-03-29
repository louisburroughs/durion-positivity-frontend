export type LocationStatus = 'ACTIVE' | 'INACTIVE';
export type LocationValidationStatus = 'VALID' | 'INVALID' | 'PENDING' | 'STALE';

export interface LocationRosterEntry {
  id: string;
  name: string;
  status: LocationStatus;
  region: string;
  lastValidatedAt: string;
  validationStatus: LocationValidationStatus;
}

export interface LocationRef {
  id: string;
  name: string;
}

export interface LocationValidationResult {
  locationId: string;
  valid: boolean;
  errors: string[];
  validatedAt: string;
}
