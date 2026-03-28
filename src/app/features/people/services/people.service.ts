import { Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiBaseService } from '../../../core/services/api-base.service';

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
}
