import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PeopleComplianceAPIService } from '@durion-sdk/people';
import { IdentityComplianceFinding } from '../models/identity-compliance.models';

/**
 * Wraps the people SDK compliance endpoint
 * GET /v1/people/compliance/inactive-person-active-user.
 * Lists ACTIVE user-person links whose linked person is inactive.
 * Permission: people:compliance:view.
 */
@Injectable({ providedIn: 'root' })
export class IdentityComplianceService {
  private readonly complianceSdk = inject(PeopleComplianceAPIService);

  /** Empty array = compliant (no violations). */
  findActiveUsersForInactivePersons(): Observable<IdentityComplianceFinding[]> {
    return this.complianceSdk.listInactivePersonActiveUsers();
  }
}
