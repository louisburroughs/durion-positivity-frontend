import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AppointmentsAPIService,
  AssignmentControllerService,
  ConflictOverrideAPIService,
  ScheduleAPIService,
  ShopAPIService,
  ShopAuditControllerService,
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
  private readonly assignment = inject(AssignmentControllerService);
  private readonly conflictOverride = inject(ConflictOverrideAPIService);
  private readonly schedule = inject(ScheduleAPIService);
  private readonly shop = inject(ShopAPIService);
  private readonly shopAudit = inject(ShopAuditControllerService);

  getAppointment(appointmentId: string): Observable<AppointmentDetail> {
    return this.appointments.getAppointment(appointmentId) as Observable<AppointmentDetail>;
  }

  listAssignments(appointmentId: string): Observable<AssignmentDetail[]> {
    return this.assignment.listAssignments(appointmentId) as Observable<AssignmentDetail[]>;
  }

  createAssignment(appointmentId: string, body: Partial<AssignmentDetail>): Observable<AssignmentDetail> {
    const sdkRequest: CreateAssignmentRequest = {
      appointmentId,
      resourceId: body.bayId ?? body.mobileUnitId,
      resourceType: body.assignmentType,
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
    return this.shopAudit.searchAudit(filter) as Observable<unknown[]>;
  }

  createAppointment(body: CreateAppointmentPayload, idempotencyKey: string): Observable<AppointmentDetail> {
    const sdkRequest: AppointmentCreateRequest = {
      crmCustomerId: body.sourceId,
      crmVehicleId: body.sourceId,
      locationId: body.facilityId,
      startAt: body.scheduledStartDateTime,
      endAt: body.scheduledEndDateTime ?? body.scheduledStartDateTime,
      serviceRequestIds: [],
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
