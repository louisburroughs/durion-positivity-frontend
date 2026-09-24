import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  ApprovalPersonDto,
  AttendanceDiscrepancyReportResponse,
  CreateEmployeeRequest,
  CreateStaffingAssignmentRequest,
  EmployeeAPIService,
  EmployeeProfileDto,
  PeopleReportsAPIService,
  PeopleStaffingAssignmentsService,
  RejectTimePeriodRequest,
  StaffingAssignmentResponse,
  TimePeriodApprovalDto,
  TimePeriodDecisionResponse,
  TimePeriodDto,
  TimekeepingApprovalAPIService,
  TimekeepingEntryDto,
  WorkSessionDto,
  WorkSessionsAPIService,
  UpdateEmployeeRequest,
} from '@durion-sdk/people';
import {
  ContactPointDto,
  PeopleAPIService,
  PeopleAccessControlService,
  Person,
  PersonRoleAssignmentRequest,
  PostalAddressAPIService,
  PostalAddressDto,
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
  private readonly peopleApi = inject(PeopleAPIService);
  private readonly postalAddressApi = inject(PostalAddressAPIService);
  private readonly workSessionsApi = inject(WorkSessionsAPIService);
  private readonly timekeepingApi = inject(TimekeepingApprovalAPIService);

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
    return this.staffingApi.listStaffingAssignments(personId);
  }

  createLocationAssignment(request: CreateStaffingAssignmentRequest): Observable<StaffingAssignmentResponse> {
    return this.staffingApi.createStaffingAssignment(request);
  }

  endLocationAssignment(assignmentId: string): Observable<void> {
    return this.staffingApi.endStaffingAssignment(assignmentId);
  }

  getPerson(personUuid: string): Observable<Person> {
    return this.peopleApi.getPersonById(personUuid);
  }

  /**
   * Reads one person with their typed contact points. `getPersonById` leaves
   * `contactPoints` unpopulated, so this goes through the batch by-id read, which
   * attaches them; an unknown id is dropped from that result, surfaced here as `null`.
   */
  getPersonWithContactPoints(personId: string): Observable<Person | null> {
    return this.peopleApi.getPeopleByIds([personId]).pipe(
      map(people => people.find(person => person.id === personId) ?? null),
    );
  }

  updatePerson(personId: string, person: Person): Observable<Person> {
    return this.peopleApi.updatePerson(personId, person);
  }

  replaceContactPoints(personId: string, contactPoints: ContactPointDto[]): Observable<void> {
    return this.peopleApi.replaceContactPoints(personId, contactPoints);
  }

  /**
   * The endpoint answers "no address on file" with a 204 and no body, which HttpClient emits as
   * `null`; the generated signature types only the 200 body, so the absent case is made explicit.
   */
  getPersonPostalAddress(personId: string): Observable<PostalAddressDto | null> {
    return this.postalAddressApi.getPersonPostalAddress(personId).pipe(map(address => address ?? null));
  }

  putPersonPostalAddress(personId: string, address: PostalAddressDto): Observable<PostalAddressDto> {
    return this.postalAddressApi.putPersonPostalAddress(personId, address);
  }

  deletePersonPostalAddress(personId: string): Observable<void> {
    return this.postalAddressApi.deletePersonPostalAddress(personId);
  }

  getRoleAssignments(personUuid: string, includeHistory: boolean): Observable<UserRoleDto[]> {
    return this.accessControlApi.listRoleAssignments(personUuid, includeHistory);
  }

  getAvailableRoles(personUuid: string): Observable<RoleDto[]> {
    return this.accessControlApi.listAssignableRoles(personUuid);
  }

  createRoleAssignment(personUuid: string, request: PersonRoleAssignmentRequest): Observable<UserRoleDto> {
    return this.accessControlApi.assignRoleToPerson(personUuid, request);
  }

  revokeRoleAssignment(personUuid: string, roleCode: string): Observable<void> {
    return this.accessControlApi.revokePersonRoleAssignment(personUuid, roleCode);
  }

  listApprovalPeople(): Observable<ApprovalPersonDto[]> {
    return this.timekeepingApi.listTimekeepingApprovalPeople();
  }

  listTimePeriods(): Observable<TimePeriodDto[]> {
    return this.timekeepingApi.listTimePeriods();
  }

  listTimekeepingEntries(personId: string, timePeriodId: string): Observable<TimekeepingEntryDto[]> {
    return this.timekeepingApi.listTimekeepingEntries(personId, timePeriodId);
  }

  getTimePeriodApproval(personId: string, timePeriodId: string): Observable<TimePeriodApprovalDto> {
    return this.timekeepingApi.getTimePeriodApproval(personId, timePeriodId);
  }

  approveTimePeriod(timePeriodId: string, personId: string): Observable<TimePeriodDecisionResponse> {
    return this.timekeepingApi.approveTimePeriod(timePeriodId, personId);
  }

  rejectTimePeriod(
    timePeriodId: string,
    personId: string,
    request: RejectTimePeriodRequest,
  ): Observable<TimePeriodDecisionResponse> {
    return this.timekeepingApi.rejectTimePeriod(timePeriodId, personId, request);
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
}
