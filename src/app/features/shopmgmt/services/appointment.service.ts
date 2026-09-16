import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
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
  CancelAppointmentRequest,
  ConflictOverrideRequest,
  CreateAssignmentRequest,
  MechanicAssignmentItem,
  RescheduleAppointmentRequest,
} from '@durion-sdk/shop-manager';
import type {
  AppointmentDetail,
  AssignmentDetail,
  RescheduleRequest,
  CreateAppointmentPayload,
} from '../models/appointment.models';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly appointments = inject(AppointmentsAPIService);
  private readonly assignment = inject(AppointmentAssignmentsService);
  private readonly conflictOverride = inject(ConflictOverrideAPIService);
  private readonly schedule = inject(ScheduleAPIService);
  private readonly shopAudit = inject(ShopAuditService);

  getAppointment(appointmentId: string): Observable<AppointmentDetail> {
    return this.appointments.getAppointmentById(appointmentId) as unknown as Observable<AppointmentDetail>;
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
    return this.appointments.rescheduleAppointment(appointmentId, sdkRequest) as unknown as Observable<AppointmentDetail>;
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
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
    return this.appointments.createAppointment(sdkRequest, idempotencyKey) as unknown as Observable<AppointmentDetail>;
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
    return this.appointments.cancelAppointment(appointmentId, sdkRequest) as unknown as Observable<AppointmentDetail>;
  }

  viewSchedule(locationId: string, date: string, resourceType?: string, resourceId?: string): Observable<unknown> {
    return this.schedule.viewSchedule(locationId, date, resourceType, resourceId) as Observable<unknown>;
  }
}
