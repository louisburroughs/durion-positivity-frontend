import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppointmentCreateRequestSourceTypeEnum,
  AppointmentsAPIService,
  AppointmentAssignmentsService,
  ConflictOverrideAPIService,
  MechanicAssignmentItemRoleEnum,
  ScheduleAPIService,
  ShopAPIService,
  ShopAuditService,
} from '@durion-sdk/shop-manager';
import type {
  AppointmentCreateRequest,
  CancelAppointmentRequest,
  ConflictOverrideRequest,
  CreateAssignmentRequest,
  RescheduleAppointmentRequest,
  ShopAuditFilter,
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
  private readonly shop = inject(ShopAPIService);
  private readonly shopAudit = inject(ShopAuditService);

  getAppointment(appointmentId: string): Observable<AppointmentDetail> {
    return this.appointments.getAppointment(appointmentId) as Observable<AppointmentDetail>;
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
      mechanics: body.mechanic?.mechanicId
        ? [{ mechanicPersonId: body.mechanic.mechanicId, role }]
        : undefined,
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
    return this.appointments.rescheduleAppointment(appointmentId, sdkRequest) as Observable<AppointmentDetail>;
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
    const filter: ShopAuditFilter = { appointmentId };
    return this.shopAudit.searchShopAudit(filter);
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
    return this.appointments.createAppointment(sdkRequest, idempotencyKey) as Observable<AppointmentDetail>;
  }

  executeOverride(appointmentId: string, body: { overrideReason: string }): Observable<AppointmentDetail> {
    const sdkRequest: ConflictOverrideRequest = {
      appointmentId,
      overrideReason: body.overrideReason,
    };
    return this.conflictOverride.executeOverride(appointmentId, sdkRequest) as Observable<AppointmentDetail>;
  }

  cancelAppointment(appointmentId: string, body: { cancellationReason: string; notes?: string }): Observable<AppointmentDetail> {
    const sdkRequest: CancelAppointmentRequest = {
      cancellationReason: (body.cancellationReason as CancelAppointmentRequest['cancellationReason']) ?? 'OTHER',
      notes: body.notes,
    };
    return this.appointments.cancelAppointment(appointmentId, sdkRequest) as Observable<AppointmentDetail>;
  }

  getShopServiceDetails(locationId: string, serviceId: string): Observable<unknown> {
    return this.shop.getShopServiceDetails(locationId, serviceId) as Observable<unknown>;
  }

  viewSchedule(locationId: string, date: string, resourceType?: string, resourceId?: string): Observable<unknown> {
    return this.schedule.viewSchedule(locationId, date, resourceType, resourceId) as Observable<unknown>;
  }
}
