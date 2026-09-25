import type { ShopAuditEntryResponse } from '@durion-sdk/shop-manager';

/**
 * One shop-audit trail entry (CAP-249). Re-exports the generated SDK response verbatim — its wire
 * fields (`actorUserId`, `recordedAt`, `eventType`, `changeSummaryText`) already match `GET
 * /v1/shop/audit`; the previous local shape (`id?/timestamp?/actor?/action?/details?`) never did
 * (ADR-0032).
 */
export type AuditEntry = ShopAuditEntryResponse;

/**
 * Appointment status codes (`pos-shop-manager` `AppointmentStatus`); translated via
 * `SHOPMGMT.APPOINTMENT_STATUS.*` — never rendered raw (ADR-0064 §5).
 */
export const APPOINTMENT_STATUS_CODES = [
  'SCHEDULED',
  'CHECKED_IN',
  'WORK_IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'QUALITY_CHECK',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'CANCELLED',
  'INVOICED',
  'REOPENED',
] as const;

/**
 * Reschedule reason codes (`RescheduleAppointmentRequestReasonEnum`, `@durion-sdk/shop-manager`) —
 * shared by appointment-reschedule-page and appointment-edit-page so both offer exactly what the
 * server's enum accepts, never free text (durion-positivity-frontend#359 review). Translated via
 * `SHOPMGMT.APPOINTMENT_RESCHEDULE.REASONS.*`.
 */
export const RESCHEDULE_REASON_CODES = [
  'CUSTOMER_REQUEST',
  'SHOP_CAPACITY',
  'EQUIPMENT_ISSUE',
  'MECHANIC_UNAVAILABLE',
  'PARTS_DELAY',
  'WEATHER',
  'EMERGENCY',
  'MANAGER_DISCRETION',
  'OTHER',
] as const;

/** The recorded scheduling-conflict codes `SchedulingConflictEvaluator` emits. */
const KNOWN_CONFLICT_CODES: ReadonlySet<string> = new Set([
  'FACILITY_CLOSED',
  'OUTSIDE_OPERATING_HOURS',
  'BAY_DOUBLE_BOOKED',
  'MECHANIC_UNAVAILABLE',
  'FACILITY_NEAR_CAPACITY',
  'NO_COMPETENT_MECHANIC_ROSTERED',
  'COMPETENT_MECHANIC_UNAVAILABLE',
]);

/**
 * Maps a conflict `code` to its translation key under `SHOPMGMT.APPOINTMENT_CONFLICT_CODE.*`,
 * falling back to a generic summary key for a code this catalog does not (yet) name — never the
 * server's own `message` prose (ADR-0030).
 */
export function conflictCodeKey(code: string): string {
  return KNOWN_CONFLICT_CODES.has(code)
    ? `SHOPMGMT.APPOINTMENT_CONFLICT_CODE.${code}`
    : 'SHOPMGMT.APPOINTMENT_CONFLICT_CODE.GENERIC';
}

/**
 * Maps an appointment `status` to its translation key under `SHOPMGMT.APPOINTMENT_STATUS.*`,
 * validated against `APPOINTMENT_STATUS_CODES` — a status the server sends outside that catalog
 * falls back to `COMMON.NOT_AVAILABLE` rather than a raw-status key the missing-key fallback would
 * expose as visible text (ADR-0064 §5).
 */
export function appointmentStatusKey(status: string | undefined | null): string {
  return status && (APPOINTMENT_STATUS_CODES as readonly string[]).includes(status)
    ? `SHOPMGMT.APPOINTMENT_STATUS.${status}`
    : 'COMMON.NOT_AVAILABLE';
}

export interface AppointmentDetail {
  appointmentId: string;
  status: string;
  facilityId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  facilityTimeZoneId?: string;
  rescheduleCount?: number;
  /** SOFT conflicts recorded against the appointment (CAP-326); HARD ones never reach here. */
  conflicts?: AppointmentConflict[];
}

/** One recorded scheduling conflict, as `POST /v1/appointments/{id}/conflict-override` names it. */
export interface AppointmentConflict {
  conflictId: string;
  code: string;
  message: string;
  severity: string;
  /** SOFT and not yet overridden. */
  overridable: boolean;
  overridden: boolean;
  resourceId?: string;
}

export interface AssignmentDetail {
  assignmentId: string;
  assignmentType?: string;
  bayId?: string;
  bayIdentifier?: string;
  bayName?: string;
  mobileUnitId?: string;
  mechanic?: { mechanicId: string; displayName?: string } | null;
  notes?: string;
  version?: number;
}

/**
 * One entry of the DECISION-SHOPMGMT-002 conflict envelope a 409 carries (`ConflictResponse.conflicts`
 * on the wire): `severity` is the wire name — HARD refused the booking, SOFT was recorded.
 */
export interface Conflict {
  severity: 'HARD' | 'SOFT';
  code: string;
  message: string;
  overridable?: boolean;
}

export interface TimeSlot {
  scheduledStartDateTime: string;
  scheduledEndDateTime: string;
  reason?: string;
}

export interface ConflictPayload {
  conflicts: Conflict[];
  suggestedAlternatives?: TimeSlot[];
}

/**
 * `overrideReason`/`approvalReason` were removed (durion-positivity-frontend#359 review): the
 * generated `RescheduleAppointmentRequest` (`@durion-sdk/shop-manager`) has no such fields, so a
 * value collected here could never reach the server — accepting a recorded SOFT conflict goes
 * through the separate `executeOverride` call instead (`appointment-conflict-override-page`).
 */
export interface RescheduleRequest {
  scheduledStartDateTime: string;
  scheduledEndDateTime?: string;
  reason: string;
  notes?: string;
  overrideSoftConflicts?: boolean;
  clientRequestId?: string;
}

export interface CreateAppointmentPayload {
  sourceType: 'ESTIMATE' | 'WORKORDER';
  sourceId: string;
  crmCustomerId?: string;
  crmVehicleId?: string;
  facilityId: string;
  scheduledStartDateTime: string;
  scheduledEndDateTime?: string;
  clientRequestId: string;
  overrideSoftConflicts?: boolean;
  overrideReason?: string;
}
