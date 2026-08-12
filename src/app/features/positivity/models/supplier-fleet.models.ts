/**
 * Fleet contract lookup and workorder authorization domain model
 * (issue #194, CAP-323).
 *
 * Interfaces only. `workorder` is one word everywhere — code, keys and copy.
 *
 * ── Authorization is an input, never a state machine this client runs ───────
 * Everything here is *read* state. There is no request, grant, deny, override,
 * escalate or resend shape anywhere in this file, and no field the UI is
 * allowed to compute. The fleet manager decides; the backend records the
 * decision; this frontend shows it. A frontend that could advance an
 * authorization would be able to tell a service advisor that Michelin approved
 * work Michelin has never seen — and the bill lands weeks later, at the shop.
 *
 * ── `NOT_FOUND` is an answer, not a failure ─────────────────────────────────
 * "This vehicle/contract is unknown to the fleet manager" is a complete,
 * successful reply to a lookup. It is modelled as an *outcome on a 200*, which
 * is what keeps it out of the error path in every consumer: an error state
 * would push the advisor toward retrying a question that has already been
 * answered.
 *
 * ── Vendor text is data ─────────────────────────────────────────────────────
 * `vendorReason` and the policy/contract description fields carry the fleet
 * manager's own words. They are rendered verbatim beside a translated label and
 * are never translated, re-worded, truncated to a code, or mapped onto a
 * client-side enum (ADR-0030). A denial the advisor has to read out at the
 * counter must be the words the fleet manager actually used.
 *
 * ── Two distinct time facts ─────────────────────────────────────────────────
 *   - `asOf`      — the vendor's own effective time for this state.
 *   - `fetchedAt` — the instant the platform last pulled it.
 * Staleness is computed against `asOf` only; see `supplier-freshness.util`.
 *
 * Contract effective dates are date-only `YYYY-MM-DD` values (ADR-0038) and are
 * never handed to `DatePipe` raw. Monetary limits are decimal **strings** for
 * the same reason as the AP surface: nothing here may round or re-scale a
 * figure the fleet manager set.
 */

/** Result of asking the fleet manager about a vehicle. Delivered on a 200. */
export type SupplierFleetLookupOutcome = 'FOUND' | 'NOT_FOUND';

/**
 * Authorization state for one fleet workorder, as reported by the backend.
 *
 * `MANUAL_REVIEW` is the state a failed completion approval lands in: the
 * platform could not obtain a decision and a human has to take it up with the
 * fleet manager. It is surfaced, never resolved, from this frontend.
 */
export type SupplierFleetAuthorizationState =
  | 'PENDING'
  | 'GRANTED'
  | 'DENIED'
  | 'MANUAL_REVIEW';

/**
 * Post-completion approval state for a fleet workorder.
 *
 * The backend drives the server-to-server call; `RETRYING` means it is still
 * trying, and `MANUAL_REVIEW` means it has stopped and wants a human.
 */
export type SupplierFleetCompletionApprovalState =
  | 'PENDING'
  | 'APPROVED'
  | 'RETRYING'
  | 'MANUAL_REVIEW';

/** One coverage policy under a fleet contract, as the fleet manager states it. */
export interface SupplierFleetPolicy {
  /** Vendor policy identifier. Display/tracking only — never a platform key. */
  policyId: string;
  /** Vendor's own policy name/description. Rendered verbatim. */
  description?: string | null;
  /** Vendor's own coverage note (limits, exclusions). Rendered verbatim. */
  coverageNote?: string | null;
}

/** One fleet contract applicable to a vehicle, exactly as delivered. */
export interface SupplierFleetContract {
  /** Vendor contract identifier. The `@for` tracking key. */
  contractId: string;
  /** Human contract number the fleet manager quotes. Display only. */
  contractNumber?: string | null;
  /** Fleet manager's name, e.g. the manufacturer running the contract. */
  fleetManagerName: string;
  /** Vendor status token for the contract. Shown verbatim when unrecognised. */
  status?: string | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  effectiveFrom?: string | null;
  /** Date-only `YYYY-MM-DD` (ADR-0038). */
  effectiveTo?: string | null;
  /** Policies under this contract. Empty when the vendor sends none. */
  policies: SupplierFleetPolicy[];
}

/** Vehicle identity as the fleet manager holds it. */
export interface SupplierFleetVehicle {
  /** The identifier that resolved — echoed back by the backend. */
  vehicleIdentifier: string;
  vin?: string | null;
  plate?: string | null;
  /** Vendor's own vehicle description. Rendered verbatim. */
  description?: string | null;
}

/** Answer to a vehicle/contract lookup against the fleet manager. */
export interface SupplierFleetVehicleLookup {
  /** `FOUND` or `NOT_FOUND`. Both are successful answers. */
  outcome: SupplierFleetLookupOutcome;
  /** The identifier that was asked about. Echoed so the panel can label it. */
  vehicleIdentifier: string;
  vendorProfileId?: string | null;
  vendorDisplayName?: string | null;
  /** Present on `FOUND`. Null on `NOT_FOUND` — there is nothing to describe. */
  vehicle?: SupplierFleetVehicle | null;
  /** Applicable contracts. Empty on `NOT_FOUND`, and possibly empty on `FOUND`. */
  contracts: SupplierFleetContract[];
  /** Fleet manager's own words about why it does not know this vehicle. */
  notFoundReason?: string | null;
  /** Vendor effective time for this answer. Null when the vendor sends none. */
  asOf: string | null;
  /** Instant the platform last pulled this — never presented as data currency. */
  readonly fetchedAt: string;
  /** Backend-delivered staleness threshold in minutes; `0` disables the check. */
  stalenessThresholdMinutes: number;
}

/** Post-completion approval state, read-only. The backend drives the S2S call. */
export interface SupplierFleetCompletionApproval {
  state: SupplierFleetCompletionApprovalState;
  /** Fleet manager's own words on the outcome. Rendered verbatim. */
  vendorReason?: string | null;
  /** Attempts the backend has made. Informational. */
  attemptCount?: number | null;
  readonly lastAttemptAt?: string | null;
  /**
   * When the backend intends to try again.
   *
   * Displayed so the advisor knows the platform is still working; there is no
   * control here that triggers the attempt, because the schedule is the
   * backend's.
   */
  readonly nextAttemptAt?: string | null;
}

/** Fleet authorization state for one workorder. Entirely read state. */
export interface SupplierFleetAuthorization {
  /** Platform workorder UUID. */
  workorderId: string;
  state: SupplierFleetAuthorizationState;
  /** Fleet manager's authorization number, when granted. An attribute. */
  authorizationReference?: string | null;
  vendorProfileId: string;
  vendorDisplayName: string;
  /** Contract the authorization was requested under, when the backend links one. */
  contract?: SupplierFleetContract | null;
  /**
   * Fleet manager's own reason text.
   *
   * Required reading on `DENIED`: the advisor repeats it at the counter. Also
   * carried on `PENDING` and `MANUAL_REVIEW` when the vendor explains itself.
   */
  vendorReason?: string | null;
  /** Amount the fleet manager authorized, as decimal text. Never recomputed. */
  authorizedAmount?: string | null;
  /** ISO-4217 code as delivered. Never localised into a symbol. */
  currency?: string | null;
  readonly requestedAt?: string | null;
  readonly decidedAt?: string | null;
  /** Present once the workorder is completed and approval has been attempted. */
  completionApproval?: SupplierFleetCompletionApproval | null;
  /** Vendor effective time for `state`. Null when the vendor sends none. */
  asOf: string | null;
  readonly fetchedAt: string;
  stalenessThresholdMinutes: number;
}
