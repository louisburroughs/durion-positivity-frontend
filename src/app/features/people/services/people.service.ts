import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { DisableEmployeeRequest, Employee, UpdateEmployeeRequest } from '../models/employee.models';
import { CreateAssignmentRequest, Role, RoleAssignment } from '../models/people-rbac.models';

@Injectable({ providedIn: 'root' })
export class PeopleService {
  constructor(private readonly api: ApiBaseService) { }

  private idempotencyOptions(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : undefined;
  }

  // ── People ──────────────────────────────────────────────────────────────

  getAllPeople(): Observable<unknown[]> {
    return this.api.get<unknown[]>('/v1/people');
  }

  getPersonById(personId: string): Observable<unknown> {
    return this.api.get<unknown>(`/v1/people/${personId}`);
  }

  // ── Employees ────────────────────────────────────────────────────────────

  getEmployee(employeeId: string): Observable<Employee> {
    return this.api.get<Employee>(`/v1/people/employees/${encodeURIComponent(employeeId)}`);
  }

  createEmployee(body: Record<string, unknown>, idempotencyKey?: string): Observable<Employee> {
    return this.api.post<Employee>('/v1/people/employees', body, this.idempotencyOptions(idempotencyKey));
  }

  updateEmployee(employeeId: string, body: UpdateEmployeeRequest): Observable<Employee> {
    return this.api.put<Employee>(`/v1/people/employees/${encodeURIComponent(employeeId)}`, body);
  }

  disableEmployee(employeeId: string, body: DisableEmployeeRequest): Observable<Employee> {
    return this.api.patch<Employee>(`/v1/people/employees/${encodeURIComponent(employeeId)}/disable`, body);
  }

  // ── Availability ─────────────────────────────────────────────────────────

  getPeopleAvailability(params?: Record<string, string>): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { httpParams = httpParams.set(k, v); });
    }
    return this.api.get<unknown[]>('/v1/people/availability', httpParams);
  }

  getCurrentUserPrimaryLocation(): Observable<unknown> {
    return this.api.get<unknown>('/v1/people/me/primary-location');
  }

  // ── Time Entry Approval ──────────────────────────────────────────────────

  approveTimeEntries(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/timeEntries/approve', body, this.idempotencyOptions(idempotencyKey));
  }

  rejectTimeEntries(body: Record<string, unknown>): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/timeEntries/reject', body);
  }

  createAdjustment(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/timeEntries/adjustments', body, this.idempotencyOptions(idempotencyKey));
  }

  listAdjustmentsForTimeEntry(timeEntryId: string): Observable<unknown[]> {
    return this.api.get<unknown[]>(`/v1/people/timeEntries/${timeEntryId}/adjustments`);
  }

  listPendingTimeEntries(params?: Record<string, string>): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { httpParams = httpParams.set(k, v); });
    }
    return this.api.get<unknown[]>('/v1/people/timeEntries', httpParams);
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  getApprovedTimeForExport(params?: Record<string, string>): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { httpParams = httpParams.set(k, v); });
    }
    return this.api.get<unknown[]>('/v1/people/reports/approvedTime', httpParams);
  }

  getAttendanceDiscrepancyReport(params?: Record<string, string>): Observable<unknown[]> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => { httpParams = httpParams.set(k, v); });
    }
    return this.api.get<unknown[]>('/v1/people/reports/attendanceJobtimeDiscrepancy', httpParams);
  }

  // ── Work Sessions ────────────────────────────────────────────────────────

  startWorkSession(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/workSessions/start', body, this.idempotencyOptions(idempotencyKey));
  }

  stopWorkSession(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/workSessions/stop', body, this.idempotencyOptions(idempotencyKey));
  }

  startBreak(sessionId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(`/v1/people/workSessions/${sessionId}/breaks/start`, body, this.idempotencyOptions(idempotencyKey));
  }

  stopBreak(sessionId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(`/v1/people/workSessions/${sessionId}/breaks/stop`, body, this.idempotencyOptions(idempotencyKey));
  }

  submitWorkSession(sessionId: string, body: unknown, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(`/v1/people/workSessions/${sessionId}/submit`, body, this.idempotencyOptions(idempotencyKey));
  }

  getWorkSessionBreaks(sessionId: string): Observable<unknown[]> {
    return this.api.get<unknown[]>(`/v1/people/workSessions/${sessionId}/breaks`);
  }

  // Timekeeping Approval - period-atomic

  listApprovalScopedPeople(params?: { page?: number; pageSize?: number; q?: string }): Observable<unknown> {
    let httpParams = new HttpParams()
      .set('page', String(params?.page ?? 1))
      .set('pageSize', String(params?.pageSize ?? 50));
    if (params?.q) {
      httpParams = httpParams.set('q', params.q);
    }
    return this.api.get<unknown>('/v1/people/timekeeping/approvals/people', httpParams);
  }

  listTimePeriods(params?: { page?: number; pageSize?: number; status?: string }): Observable<unknown> {
    let httpParams = new HttpParams()
      .set('page', String(params?.page ?? 1))
      .set('pageSize', String(params?.pageSize ?? 50));
    if (params?.status) {
      httpParams = httpParams.set('status', params.status);
    }
    return this.api.get<unknown>('/v1/people/timekeeping/time-periods', httpParams);
  }

  listTimekeepingEntries(
    personId: string,
    timePeriodId: string,
    params?: { page?: number; pageSize?: number },
  ): Observable<unknown> {
    const httpParams = new HttpParams()
      .set('personId', personId)
      .set('timePeriodId', timePeriodId)
      .set('page', String(params?.page ?? 1))
      .set('pageSize', String(params?.pageSize ?? 100));
    return this.api.get<unknown>('/v1/people/timekeeping/timekeeping-entries', httpParams);
  }

  listTimePeriodApprovals(personId: string, timePeriodId: string): Observable<unknown> {
    const httpParams = new HttpParams()
      .set('personId', personId)
      .set('timePeriodId', timePeriodId)
      .set('page', '1')
      .set('pageSize', '25');
    return this.api.get<unknown>('/v1/people/timekeeping/time-period-approvals', httpParams);
  }

  approveTimePeriod(
    timePeriodId: string,
    personId: string,
    body: { requestId?: string; lastUpdatedStamp?: string },
    idempotencyKey?: string,
  ): Observable<unknown> {
    return this.api.post<unknown>(
      `/v1/people/timekeeping/time-periods/${timePeriodId}/people/${personId}/approve`,
      body,
      this.idempotencyOptions(idempotencyKey),
    );
  }

  rejectTimePeriod(
    timePeriodId: string,
    personId: string,
    body: { requestId?: string; comments?: string; lastUpdatedStamp?: string },
  ): Observable<unknown> {
    return this.api.post<unknown>(
      `/v1/people/timekeeping/time-periods/${timePeriodId}/people/${personId}/reject`,
      body,
    );
  }

  // ── RBAC / Role Assignments ──────────────────────────────────────────────

  getRoles(personUuid: string): Observable<Role[]> {
    return this.api.get<Role[]>(`/v1/people/${personUuid}/access/roles`);
  }

  getAssignments(personUuid: string, includeHistory?: boolean): Observable<RoleAssignment[]> {
    let params = new HttpParams().set('personId', personUuid);
    if (includeHistory !== undefined) {
      params = params.set('includeHistory', String(includeHistory));
    }
    return this.api.get<RoleAssignment[]>('/v1/people/staffing/assignments', params);
  }

  createAssignment(body: CreateAssignmentRequest, idempotencyKey?: string): Observable<RoleAssignment> {
    return this.api.post<RoleAssignment>('/v1/people/staffing/assignments', body, this.idempotencyOptions(idempotencyKey));
  }

  revokeAssignment(personUuid: string, roleCode: string): Observable<void> {
    return this.api.delete<void>(`/v1/people/${personUuid}/access/assignments/${roleCode}`);
  }

  // ── Location Assignments ─────────────────────────────────────────────────

  getPersonLocationAssignments(personId: string, includeHistory = false): Observable<unknown[]> {
    const params = new HttpParams().set('includeHistory', String(includeHistory));
    return this.api.get<unknown[]>(`/v1/people/persons/${personId}/location-assignments`, params);
  }

  createPersonLocationAssignment(personId: string, body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>(`/v1/people/persons/${personId}/location-assignments`, body, this.idempotencyOptions(idempotencyKey));
  }

  endPersonLocationAssignment(assignmentId: string, body: Record<string, unknown> = {}): Observable<unknown> {
    return this.api.post<unknown>(`/v1/people/location-assignments/${assignmentId}/end`, body);
  }
}
