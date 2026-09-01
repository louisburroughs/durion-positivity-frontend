/**
 * Fleet vehicle lookup and workorder authorization read client
 * (issue #194, CAP-323; #201).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 * Calls the generated `SupplierFleetAuthorizationService` from
 * `@durion-sdk/supplier` and maps its DTOs into the local UI model field by
 * field (ADR-0010). Both generated reads are keyed by `supplierRef` — the
 * vendor profile alias — so both methods require it as their first argument.
 * `vendorProfileId` is a different identifier and must never be passed here.
 *
 * ── Read-only, structurally ─────────────────────────────────────────────────
 * The generated client also publishes a request-authorization operation. It is
 * deliberately not wrapped: #194 §6 makes "no frontend path mutates
 * authorization state" an acceptance criterion, and
 * `supplier-fleet.service.spec.ts` asserts the absence.
 */
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  FleetAuthorizationResponse,
  FleetVehicle,
  SupplierFleetAuthorizationService as SupplierFleetAuthorizationApi,
} from '@durion-sdk/supplier';
import {
  SupplierFleetAuthorization,
  SupplierFleetAuthorizationState,
  SupplierFleetCompletionApprovalState,
  SupplierFleetVehicleLookup,
} from '../models/supplier-fleet.models';

const KNOWN_STATES: ReadonlySet<string> = new Set<SupplierFleetAuthorizationState>([
  'PENDING',
  'GRANTED',
  'DENIED',
  'NOT_FOUND',
  'MANUAL_REVIEW',
]);

const KNOWN_APPROVALS: ReadonlySet<string> = new Set<SupplierFleetCompletionApprovalState>([
  'NOT_REQUESTED',
  'PENDING',
  'APPROVED',
  'MANUAL_REVIEW',
]);

/** Explicit DTO → UI projection for a vehicle lookup. */
export function toSupplierFleetVehicleLookup(
  dto: FleetVehicle,
  supplierRef: string,
  vehicleIdentifier: string,
): SupplierFleetVehicleLookup {
  // The vendor answered; `identifiable: false` is its way of saying "unknown".
  const found = dto.identifiable !== false;
  return {
    outcome: found ? 'FOUND' : 'NOT_FOUND',
    supplierRef,
    vehicleIdentifier,
    vehicle: found
      ? {
          vin: dto.vin ?? null,
          plate: dto.licensePlate ?? null,
          brand: dto.brand ?? null,
          model: dto.model ?? null,
          modelYear: dto.modelYear ?? null,
          fleetNumber: dto.fleetNumber ?? null,
          vendorVehicleId: dto.vendorVehicleId ?? null,
          odometer: dto.odometerValue ?? null,
          identifiable: dto.identifiable ?? null,
        }
      : null,
  };
}

/** Explicit DTO → UI projection for a workorder authorization. */
export function toSupplierFleetAuthorization(
  dto: FleetAuthorizationResponse,
  supplierRef: string,
  workorderId: string,
): SupplierFleetAuthorization {
  return {
    workorderId: dto.workorderId ?? workorderId,
    supplierRef: dto.supplierRef ?? supplierRef,
    state: dto.status && KNOWN_STATES.has(dto.status) ? (dto.status as SupplierFleetAuthorizationState) : null,
    vendorAuthorizationId: dto.vendorAuthorizationId ?? null,
    contractReference: dto.contractReference ?? null,
    vendorReason: dto.reasonText ?? null,
    vendorReasonCode: dto.reasonCode ?? null,
    reviewReason: dto.reviewReason ?? null,
    authorizedAmount: dto.authorizedAmount ?? null,
    currency: dto.currency ?? null,
    requestedAt: dto.requestedAt ?? null,
    decidedAt: dto.decidedAt ?? null,
    completionApproval:
      dto.approvalStatus && KNOWN_APPROVALS.has(dto.approvalStatus)
        ? (dto.approvalStatus as SupplierFleetCompletionApprovalState)
        : null,
  };
}

@Injectable({ providedIn: 'root' })
export class SupplierFleetService {
  private readonly api = inject(SupplierFleetAuthorizationApi);

  /**
   * Ask one fleet manager about one vehicle.
   *
   * A `NOT_FOUND` outcome is returned like any other answer — this method never
   * converts it into an error, because the caller must be able to render it as
   * the distinct, non-error state #194 §4 requires.
   */
  lookupVehicle(supplierRef: string, vehicleIdentifier: string): Observable<SupplierFleetVehicleLookup> {
    return this.api
      .lookupFleetVehicle(supplierRef, vehicleIdentifier)
      .pipe(map(dto => toSupplierFleetVehicleLookup(dto, supplierRef, vehicleIdentifier)));
  }

  /**
   * Current fleet authorization state for one workorder under one fleet manager.
   *
   * Re-calling this is how the UI refreshes a `PENDING` authorization. It is a
   * read: it asks the platform what the fleet manager has said, and can never
   * cause the platform to ask again on the caller's behalf.
   */
  getWorkorderAuthorization(supplierRef: string, workorderId: string): Observable<SupplierFleetAuthorization> {
    return this.api
      .getFleetWorkorderAuthorization(supplierRef, workorderId)
      .pipe(map(dto => toSupplierFleetAuthorization(dto, supplierRef, workorderId)));
  }
}
