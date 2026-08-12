/**
 * Fleet vehicle/contract lookup and workorder authorization read client
 * (issue #194, CAP-323).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * `@durion-sdk/supplier` covers vendor profiles, auth configs, commercial
 * accounts, endpoint bindings and exchange audit only (issue #188). It exposes
 * **no** fleet-lookup or authorization operation, and `@durion-sdk/workexec`
 * owns the workorder's own state machine rather than the vendor-side
 * authorization that sits beside it. This service therefore calls
 * `ApiBaseService` directly (ADR-0010 — never `HttpClient` in a feature),
 * exactly as the PRICAT, availability, transmission and invoice surfaces do,
 * and the assumed contract is written down here so reconciling it against the
 * real controller is a diff rather than an investigation.
 *
 * ── Assumed endpoint contract (`/supplier/v1/**`) ────────────────────────────
 * Coded against durion-positivity-backend#1229.
 *
 *   GET /supplier/v1/fleet/vehicle-lookup?vehicleIdentifier&vendorProfileId
 *       → 200 SupplierFleetVehicleLookup with `outcome: 'FOUND' | 'NOT_FOUND'`
 *       → 403 caller may not query the fleet manager
 *       → 502/503/504 vendor unreachable — degrades the panel, nothing else
 *
 *       The identifier travels as a **query parameter**, not a path segment:
 *       plates and vendor fleet numbers contain slashes and spaces, and a path
 *       segment would make a perfectly ordinary plate look like a different
 *       endpoint.
 *
 *   GET /supplier/v1/fleet/workorders/{workorderId}/authorization
 *       → 200 SupplierFleetAuthorization
 *       → 202 same payload with `state: 'PENDING'` — the platform has asked the
 *             fleet manager and has no decision yet. The body carries the state,
 *             so no consumer needs to read the status line to render `PENDING`
 *             with a refresh (#194 §5).
 *       → 403 / 404 (404 = this workorder is not under a fleet contract)
 *
 * ── This service has no write path, by design ───────────────────────────────
 * #194 §6 is an acceptance criterion in its own right: "No frontend path
 * mutates authorization state." So there is no `post`, `put`, `patch` or
 * `delete` anywhere in this file, and no request/grant/deny/override/escalate/
 * retry method for one to hide in. Authorization is the fleet manager's
 * decision, recorded by the backend; a client that could write it could tell an
 * advisor that work is covered when nobody has agreed to cover it, and the
 * shop discovers otherwise at billing time — which is precisely the failure
 * this story exists to prevent. `supplier-fleet.service.spec.ts` asserts the
 * absence by scanning the prototype's method names, so adding one fails the
 * suite rather than review.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import {
  SupplierFleetAuthorization,
  SupplierFleetVehicleLookup,
} from '../models/supplier-fleet.models';

const FLEET = '/supplier/v1/fleet';

@Injectable({ providedIn: 'root' })
export class SupplierFleetService {
  private readonly api = inject(ApiBaseService);

  /**
   * Ask the fleet manager about one vehicle and the contracts covering it.
   *
   * A `NOT_FOUND` outcome arrives on a 200 and is returned like any other
   * answer — this method never converts it into an error, because the caller
   * must be able to render it as the distinct, non-error state #194 §4 requires.
   */
  lookupVehicle(
    vehicleIdentifier: string,
    vendorProfileId?: string,
  ): Observable<SupplierFleetVehicleLookup> {
    let params = new HttpParams().set('vehicleIdentifier', vehicleIdentifier);
    if (vendorProfileId) {
      params = params.set('vendorProfileId', vendorProfileId);
    }
    return this.api.get<SupplierFleetVehicleLookup>(`${FLEET}/vehicle-lookup`, params);
  }

  /**
   * Current fleet authorization state for one workorder, plus the
   * post-completion approval state once there is one.
   *
   * Re-calling this is how the UI refreshes a `PENDING` authorization. It is a
   * read: it asks the platform what the fleet manager has said, and can never
   * cause the platform to ask again on the caller's behalf.
   */
  getWorkorderAuthorization(workorderId: string): Observable<SupplierFleetAuthorization> {
    return this.api.get<SupplierFleetAuthorization>(
      `${FLEET}/workorders/${workorderId}/authorization`,
    );
  }
}
