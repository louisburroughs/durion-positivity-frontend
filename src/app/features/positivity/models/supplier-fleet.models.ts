/**
 * Fleet vehicle lookup and workorder authorization domain model
 * (issue #194, CAP-323; contract aligned in #201).
 *
 * Interfaces only. `workorder` is one word everywhere — code, keys and copy.
 * Every field is a field-by-field projection of the generated `FleetVehicle`
 * and `FleetAuthorizationResponse` DTOs from `@durion-sdk/supplier`; the
 * mapping lives in `supplier-fleet.service.ts`.
 *
 * ── Authorization is an input, never a state machine this client runs ──────
 * Everything here is *read* state. There is no request, grant, deny, override,
 * escalate or resend shape anywhere in this file, and no field the UI is
 * allowed to compute. The fleet manager decides; the backend records the
 * decision; this frontend shows it.
 *
 * ── `NOT_FOUND` is an answer, not a failure ─────────────────────────────────
 * "This vehicle is unknown to the fleet manager" is a complete, successful
 * reply to a lookup. It is modelled as an *outcome*, which keeps it out of the
 * error path in every consumer.
 *
 * ── Vendor text is data ─────────────────────────────────────────────────────
 * `vendorReason`, `vendorReasonCode` and `reviewReason` carry the fleet
 * manager's or backend's own words. They are rendered verbatim beside a
 * translated label and are never translated, re-worded or truncated.
 *
 * ── Supplier reference is required ──────────────────────────────────────────
 * Both generated reads are keyed by `supplierRef` — the vendor profile alias —
 * which is a different identifier from `vendorProfileId`. A host that does not
 * hold a verified `supplierRef` must not render these panels.
 */

/** Result of asking the fleet manager about a vehicle. */
export type SupplierFleetLookupOutcome = 'FOUND' | 'NOT_FOUND';

/**
 * Authorization state for one fleet workorder, exactly the backend's `status`
 * token set. `NOT_FOUND` means the workorder is not under a fleet contract.
 */
export type SupplierFleetAuthorizationState =
  | 'PENDING'
  | 'GRANTED'
  | 'DENIED'
  | 'NOT_FOUND'
  | 'MANUAL_REVIEW';

/** Post-completion approval state, exactly the backend's `approvalStatus` token set. */
export type SupplierFleetCompletionApprovalState =
  | 'NOT_REQUESTED'
  | 'PENDING'
  | 'APPROVED'
  | 'MANUAL_REVIEW';

/** Vehicle identity as the fleet manager holds it. */
export interface SupplierFleetVehicle {
  vin: string | null;
  plate: string | null;
  brand: string | null;
  model: string | null;
  modelYear: number | null;
  /** Fleet manager's own fleet number. Display only. */
  fleetNumber: string | null;
  /** Fleet manager's own vehicle id. Display only — never a platform key. */
  vendorVehicleId: string | null;
  /** Odometer reading as the vendor states it, verbatim. */
  odometer: string | null;
  /** Whether the fleet manager could identify the vehicle. Null when unstated. */
  identifiable: boolean | null;
}

/** Answer to a vehicle lookup against one fleet manager. */
export interface SupplierFleetVehicleLookup {
  /** `FOUND` or `NOT_FOUND`. Both are successful answers. */
  outcome: SupplierFleetLookupOutcome;
  /** Vendor profile alias the question was put to. */
  supplierRef: string;
  /** The identifier that was asked about. Echoed so the panel can label it. */
  vehicleIdentifier: string;
  /** Present on `FOUND`. Null on `NOT_FOUND` — there is nothing to describe. */
  vehicle: SupplierFleetVehicle | null;
}

/** Fleet authorization state for one workorder. Entirely read state. */
export interface SupplierFleetAuthorization {
  /** Platform workorder UUID. */
  workorderId: string;
  /** Vendor profile alias. */
  supplierRef: string;
  /** Null when the backend sends a token this model does not know. */
  state: SupplierFleetAuthorizationState | null;
  /** The vendor's own authorization id. An attribute, never a navigation key. */
  vendorAuthorizationId: string | null;
  /** Contract the work was authorized under, as the vendor states it. */
  contractReference: string | null;
  /**
   * Fleet manager's own refusal text.
   *
   * Required reading on `DENIED`: the advisor repeats it at the counter.
   */
  vendorReason: string | null;
  /** Fleet manager's own refusal code, verbatim. */
  vendorReasonCode: string | null;
  /** Why this authorization needs a human; backend text, never a vendor decision. */
  reviewReason: string | null;
  /** Ceiling the vendor stated, when it stated one. Never recomputed. */
  authorizedAmount: number | null;
  /** ISO-4217 code as delivered. Never localised into a symbol. */
  currency: string | null;
  readonly requestedAt: string | null;
  readonly decidedAt: string | null;
  /** Null when the backend sends a token this model does not know. */
  completionApproval: SupplierFleetCompletionApprovalState | null;
}
