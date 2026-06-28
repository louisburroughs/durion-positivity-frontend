import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { UserPersonLinkingAPIService } from '@durion-sdk/people';
import { IdentityComplianceFinding } from '../models/identity-compliance.models';

/**
 * Wraps the people SDK reconcile/compliance endpoint
 * GET /v1/people/user-links/inactive-person-active-user.
 * Lists ACTIVE user-person links whose linked person is inactive.
 * Permission: people:userLink:view.
 */
@Injectable({ providedIn: 'root' })
export class IdentityComplianceService {
  private readonly linkingSdk = inject(UserPersonLinkingAPIService);

  /** Empty array = compliant (no violations). */
  findActiveUsersForInactivePersons(): Observable<IdentityComplianceFinding[]> {
    return this.linkingSdk.findActiveUsersForInactivePersons() as unknown as Observable<
      IdentityComplianceFinding[]
    >;
  }
}
