import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AttendanceDiscrepancyReportResponse,
  CreateEmployeeRequest,
  CreateStaffingAssignmentRequest,
  EmployeeAPIService,
  EmployeeProfileDto,
  PeopleReportsAPIService,
  PeopleStaffingAssignmentsService,
  StaffingAssignmentResponse,
  WorkSessionDto,
  WorkSessionsAPIService,
  UpdateEmployeeRequest,
} from '@durion-sdk/people';
import {
  PeopleAccessControlService,
  PersonRoleAssignmentRequest,
  RoleDto,
  UserRoleDto,
} from '@durion-sdk/people-contact';
import { ApiBaseService } from '../../../core/services/api-base.service';

export interface WorkSessionSubmitRequest {
  billableMinutes: number;
  breakMinutes: number;
  submittedAt: string;
}

type DisableEmployeeRequest = Parameters<EmployeeAPIService['disableEmployee']>[1];

@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly api = inject(ApiBaseService);
  private readonly employeeApi = inject(EmployeeAPIService);
  private readonly reportsApi = inject(PeopleReportsAPIService);
  private readonly staffingApi = inject(PeopleStaffingAssignmentsService);
  private readonly accessControlApi = inject(PeopleAccessControlService);
  private readonly workSessionsApi = inject(WorkSessionsAPIService);

  getEmployee(employeeId: string): Observable<EmployeeProfileDto> {
    return this.employeeApi.getEmployee(employeeId);
  }

  createEmployee(request: CreateEmployeeRequest): Observable<EmployeeProfileDto> {
    return this.employeeApi.createEmployee(request);
  }

  updateEmployee(employeeId: string, request: UpdateEmployeeRequest): Observable<EmployeeProfileDto> {
    return this.employeeApi.updateEmployee(employeeId, request);
  }

  disableEmployee(employeeId: string, request: DisableEmployeeRequest): Observable<EmployeeProfileDto> {
    return this.employeeApi.disableEmployee(employeeId, request);
  }

  getAttendanceDiscrepancyReport(
    startDate: string,
    endDate: string,
    timezone: string,
    locationId?: string,
    technicianIds?: string[],
    flaggedOnly?: boolean,
  ): Observable<AttendanceDiscrepancyReportResponse[]> {
    return this.reportsApi.getAttendanceDiscrepancyReport(
      startDate,
      endDate,
      timezone,
      locationId,
      technicianIds,
      flaggedOnly,
    );
  }

  getLocationAssignments(personId: string): Observable<StaffingAssignmentResponse[]> {
    return this.staffingApi.getAssignments(personId);
  }

  createLocationAssignment(request: CreateStaffingAssignmentRequest): Observable<StaffingAssignmentResponse> {
    return this.staffingApi.createAssignment(request);
  }

  endLocationAssignment(assignmentId: string): Observable<void> {
    return this.staffingApi.endAssignment(assignmentId);
  }

  getRoleAssignments(personUuid: string, includeHistory: boolean): Observable<UserRoleDto[]> {
    return this.accessControlApi.getAssignments(personUuid, includeHistory);
  }

  getAvailableRoles(personUuid: string): Observable<RoleDto[]> {
    return this.accessControlApi.getRoles(personUuid);
  }

  createRoleAssignment(personUuid: string, request: PersonRoleAssignmentRequest): Observable<UserRoleDto> {
    return this.accessControlApi.createAssignment(personUuid, request);
  }

  revokeRoleAssignment(personUuid: string, roleCode: string): Observable<void> {
    return this.accessControlApi.revokeAssignment(personUuid, roleCode);
  }

  listApprovalPeople(): Observable<unknown[]> {
    return this.api.get<unknown[]>('/people/v1/people/timekeeping/approvals/people');
  }

  listTimePeriods(): Observable<unknown[]> {
    return this.api.get<unknown[]>('/people/v1/people/timekeeping/time-periods');
  }

  listTimekeepingEntries(personId: string, timePeriodId: string): Observable<unknown[]> {
    return this.api.get<unknown[]>(
      '/people/v1/people/timekeeping/timekeeping-entries',
      this.timekeepingParams(personId, timePeriodId),
    );
  }

  listTimePeriodApprovals(personId: string, timePeriodId: string): Observable<Record<string, unknown>> {
    return this.api.get<Record<string, unknown>>(
      '/people/v1/people/timekeeping/time-period-approvals',
      this.timekeepingParams(personId, timePeriodId),
    );
  }

  approveTimePeriod(timePeriodId: string, personId: string): Observable<void> {
    return this.api.post<void>(
      `/people/v1/people/timekeeping/time-periods/${encodeURIComponent(timePeriodId)}/people/${encodeURIComponent(personId)}/approve`,
      {},
    );
  }

  rejectTimePeriod(timePeriodId: string, personId: string, request: Record<string, string>): Observable<void> {
    return this.api.post<void>(
      `/people/v1/people/timekeeping/time-periods/${encodeURIComponent(timePeriodId)}/people/${encodeURIComponent(personId)}/reject`,
      request,
    );
  }

  startSession(personId: string): Observable<WorkSessionDto> {
    return this.workSessionsApi.startWorkSession({ personId });
  }

  stopSession(personId: string): Observable<WorkSessionDto> {
    return this.workSessionsApi.stopWorkSession({ personId });
  }

  startBreak(sessionId: string): Observable<{ startedAt?: string; endedAt?: string }> {
    return this.workSessionsApi.startWorkSessionBreak(sessionId);
  }

  stopBreak(sessionId: string): Observable<{ startedAt?: string; endedAt?: string }> {
    return this.workSessionsApi.stopWorkSessionBreak(sessionId);
  }

  submitWorkSession(sessionId: string, request: WorkSessionSubmitRequest): Observable<Record<string, unknown> | null> {
    return this.api.post<Record<string, unknown> | null>(
      `/people/v1/people/workSessions/${encodeURIComponent(sessionId)}/submit`,
      request,
    );
  }

  private timekeepingParams(personId: string, timePeriodId: string): HttpParams {
    return new HttpParams()
      .set('personId', personId)
      .set('timePeriodId', timePeriodId);
  }
}
