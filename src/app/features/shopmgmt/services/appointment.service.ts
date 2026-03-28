import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import type {
  AppointmentDetail,
  AssignmentDetail,
  RescheduleRequest,
  CreateAppointmentPayload,
} from '../models/appointment.models';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  constructor(private readonly api: ApiBaseService) { }

  getAppointment(appointmentId: string): Observable<AppointmentDetail> {
    return this.api.get<AppointmentDetail>(`/v1/appointments/${appointmentId}`);
  }

  listAssignments(appointmentId: string): Observable<AssignmentDetail[]> {
    return this.api.get<AssignmentDetail[]>(`/v1/appointments/${appointmentId}/assignments`);
  }

  createAssignment(appointmentId: string, body: Partial<AssignmentDetail>): Observable<AssignmentDetail> {
    return this.api.post<AssignmentDetail>(`/v1/appointments/${appointmentId}/assignments`, body);
  }

  rescheduleAppointment(appointmentId: string, body: RescheduleRequest): Observable<AppointmentDetail> {
    return this.api.put<AppointmentDetail>(`/v1/appointments/${appointmentId}/reschedule`, body);
  }

  searchAudit(appointmentId: string): Observable<unknown[]> {
    const params = new HttpParams().set('appointmentId', appointmentId);
    return this.api.get<unknown[]>('/v1/shop/audit', params);
  }

  createAppointment(body: CreateAppointmentPayload, idempotencyKey: string): Observable<AppointmentDetail> {
    return this.api.post<AppointmentDetail>('/v1/appointments', body, { headers: { 'Idempotency-Key': idempotencyKey } });
  }

  executeOverride(appointmentId: string, body: { overrideReason: string }): Observable<AppointmentDetail> {
    return this.api.post<AppointmentDetail>(`/v1/appointments/${appointmentId}/conflict-override`, body);
  }

  cancelAppointment(appointmentId: string, body: { cancellationReason: string; notes?: string }): Observable<AppointmentDetail> {
    return this.api.deleteWithBody<AppointmentDetail>(`/v1/appointments/${appointmentId}/cancel`, body);
  }

  getShopServiceDetails(locationId: string, serviceId: string): Observable<unknown> {
    return this.api.get<unknown>(`/v1/shop-manager/${locationId}/services/${serviceId}/details`);
  }

  viewSchedule(locationId: string, date: string): Observable<unknown> {
    const params = new HttpParams().set('locationId', locationId).set('date', date);
    return this.api.get<unknown>('/v1/schedules/view', params);
  }
}
