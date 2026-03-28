import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';
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

  getEmployee(employeeId: string): Observable<unknown> {
    return this.api.get<unknown>(`/v1/people/employees/${employeeId}`);
  }

  createEmployee(body: Record<string, unknown>, idempotencyKey?: string): Observable<unknown> {
    return this.api.post<unknown>('/v1/people/employees', body, this.idempotencyOptions(idempotencyKey));
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

  // ── RBAC / Role Assignments ──────────────────────────────────────────────

  getRoles(personUuid: string): Observable<Role[]> {
    return this.api.get<Role[]>(`/v1/people/${personUuid}/access/roles`);
  }

  getAssignments(personId: string, includeHistory?: boolean): Observable<RoleAssignment[]> {
    let params = new HttpParams().set('personId', personId);
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
}
