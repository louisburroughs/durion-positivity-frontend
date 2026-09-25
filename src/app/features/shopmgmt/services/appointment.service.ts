import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { LocationAPIService } from '@durion-sdk/location';
import {
  AppointmentAssignmentsService,
  AppointmentCreateRequestSourceTypeEnum,
  AppointmentsAPIService,
  ConflictOverrideAPIService,
  ConflictOverrideResponse,
  MechanicAssignmentItemRoleEnum,
  ScheduleAPIService,
  ShopAuditService,
} from '@durion-sdk/shop-manager';
import type {
  AppointmentCreateRequest,
  AppointmentResponse,
  CancelAppointmentRequest,
  ConflictOverrideRequest,
  CreateAssignmentRequest,
  MechanicAssignmentItem,
  RescheduleAppointmentRequest,
} from '@durion-sdk/shop-manager';
import type {
  AppointmentConflict,
  AppointmentDetail,
  AssignmentDetail,
  AuditEntry,
  RescheduleRequest,
  CreateAppointmentPayload,
} from '../models/appointment.models';

/**
 * Maps the generated `AppointmentResponse` onto the page-facing `AppointmentDetail` (ADR-0032).
 * The wire names differ from the ones every appointment page reads (`locationId` → `facilityId`,
 * `startAt`/`endAt` → `scheduledStart`/`scheduledEnd`) — a previous `as unknown as` cast on every
 * call site papered over the mismatch instead of translating it, so `facilityId` and the scheduled
 * times were always `undefined` at runtime.
 */
function toAppointmentDetail(response: AppointmentResponse): AppointmentDetail {
  return {
    appointmentId: response.appointmentId,
    status: response.status,
    facilityId: response.locationId,
    scheduledStart: response.startAt,
    scheduledEnd: response.endAt,
    conflicts: (response.conflicts ?? []).map(
      (conflict): AppointmentConflict => ({
        conflictId: conflict.conflictId,
        code: conflict.code,
        message: conflict.message,
        severity: conflict.severity,
        overridable: conflict.overridable,
        overridden: conflict.overridden,
        resourceId: conflict.resourceId,
      }),
    ),
  };
}

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly appointments = inject(AppointmentsAPIService);
  private readonly assignment = inject(AppointmentAssignmentsService);
  private readonly conflictOverride = inject(ConflictOverrideAPIService);
  private readonly schedule = inject(ScheduleAPIService);
  private readonly shopAudit = inject(ShopAuditService);
  private readonly locationApi = inject(LocationAPIService);

  getAppointment(appointmentId: string): Observable<AppointmentDetail> {
    return this.appointments.getAppointmentById(appointmentId).pipe(map(toAppointmentDetail));
  }

  /**
   * Resolves a facility/location id to its display name, the same way schedule-view and
   * dispatch-board do (`capacity-calendar.service.ts`'s `loadLocationName`) — degrading to
   * `undefined` on any failure so the page falls back to `COMMON.NOT_AVAILABLE` rather than a bare
   * UUID (ADR-0064 §5).
   */
  getFacilityName(locationId: string): Observable<string | undefined> {
    return this.locationApi.getLocationById(locationId).pipe(
      map(location => location.name),
      catchError(() => of(undefined)),
    );
  }

  listAssignments(appointmentId: string): Observable<AssignmentDetail[]> {
    return this.assignment.listAssignments(appointmentId) as Observable<AssignmentDetail[]>;
  }

  createAssignment(appointmentId: string, body: Partial<AssignmentDetail>): Observable<AssignmentDetail> {
    const role = body.assignmentType === 'ASSIST'
      ? MechanicAssignmentItemRoleEnum.Assist
      : MechanicAssignmentItemRoleEnum.Lead;
    let resourceType: string | undefined;
    if (body.mobileUnitId) {
      resourceType = 'MOBILE_UNIT';
    } else if (body.bayId) {
      resourceType = 'BAY';
    }

    const sdkRequest: CreateAssignmentRequest = {
      appointmentId,
      resourceId: body.bayId ?? body.mobileUnitId,
      resourceType,
      mechanics: (body.mechanic?.mechanicId
        ? [{ mechanicPersonId: body.mechanic.mechanicId, role }]
        : []) as MechanicAssignmentItem[],
    };
    return this.assignment.createAssignment(appointmentId, sdkRequest) as Observable<AssignmentDetail>;
  }

  rescheduleAppointment(appointmentId: string, body: RescheduleRequest): Observable<AppointmentDetail> {
    const sdkRequest: RescheduleAppointmentRequest = {
      newStartAt: body.scheduledStartDateTime,
      newEndAt: body.scheduledEndDateTime ?? body.scheduledStartDateTime,
      reason: (body.reason as RescheduleAppointmentRequest['reason']) ?? 'OTHER',
      rescheduleReasonNotes: body.notes,
    };
    return this.appointments.rescheduleAppointment(appointmentId, sdkRequest).pipe(map(toAppointmentDetail));
  }

  searchAudit(appointmentId: string): Observable<AuditEntry[]> {
    return this.shopAudit.searchShopAudit(undefined, appointmentId);
  }

  createAppointment(body: CreateAppointmentPayload, idempotencyKey: string): Observable<AppointmentDetail> {
    const sourceType = body.sourceType === 'WORKORDER'
      ? AppointmentCreateRequestSourceTypeEnum.WorkOrder
      : AppointmentCreateRequestSourceTypeEnum.Estimate;
    const sdkRequest: AppointmentCreateRequest = {
      crmCustomerId: body.crmCustomerId ?? '',
      crmVehicleId: body.crmVehicleId ?? '',
      locationId: body.facilityId,
      startAt: body.scheduledStartDateTime,
      endAt: body.scheduledEndDateTime ?? body.scheduledStartDateTime,
      serviceRequestIds: [],
      sourceType,
      sourceId: body.sourceId,
    };
    return this.appointments.createAppointment(sdkRequest, idempotencyKey).pipe(map(toAppointmentDetail));
  }

  /**
   * CAP-326 (spec D18.3): an override names the recorded SOFT conflicts it accepts; the appointment
   * is the path, not the body. Each id must be recorded against the appointment, SOFT and not yet
   * overridden, or the service answers 400 / 409 with the conflict envelope.
   */
  executeOverride(
    appointmentId: string,
    body: { conflictIds: string[]; overrideReason: string },
  ): Observable<ConflictOverrideResponse> {
    const sdkRequest: ConflictOverrideRequest = {
      conflictIds: body.conflictIds,
      overrideReason: body.overrideReason,
    };
    // 201 with the override record — who, when, which conflicts — not the appointment. A caller
    // that wants the appointment's new state re-reads it (the recorded conflicts change).
    return this.conflictOverride.executeConflictOverride(appointmentId, sdkRequest);
  }

  cancelAppointment(appointmentId: string, body: { cancellationReason: string; notes?: string }): Observable<AppointmentDetail> {
    const sdkRequest: CancelAppointmentRequest = {
      cancellationReason: (body.cancellationReason as CancelAppointmentRequest['cancellationReason']) ?? 'OTHER',
      notes: body.notes,
    };
    return this.appointments.cancelAppointment(appointmentId, sdkRequest).pipe(map(toAppointmentDetail));
  }

  viewSchedule(locationId: string, date: string, resourceType?: string, resourceId?: string): Observable<unknown> {
    return this.schedule.viewSchedule(locationId, date, resourceType, resourceId) as Observable<unknown>;
  }
}
