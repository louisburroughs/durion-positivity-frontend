import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  AttendanceDiscrepancyReportResponse,
  CreateEmployeeRequest,
  CreateEmployeeRequestStatusEnum,
  CreateStaffingAssignmentRequest,
  EmployeeAPIService,
  EmployeeProfileDto,
  EmployeeProfileDtoStatusEnum,
  UpdateEmployeeRequest,
  PeopleReportsAPIService,
  PeopleStaffingAssignmentsService,
  StaffingAssignmentResponse,
  StaffingAssignmentResponseStatusEnum,
  UpdateEmployeeRequestStatusEnum,
  WorkSessionDto,
  WorkSessionsAPIService,
} from '@durion-sdk/people';
import {
  PeopleAccessControlService,
  PersonRoleAssignmentRequest,
  RoleDto,
  UserRoleDto,
} from '@durion-sdk/people-contact';
import { ApiBaseService } from '../../../core/services/api-base.service';
import { PeopleService, WorkSessionSubmitRequest } from './people.service';

describe('PeopleService', () => {
  let service: PeopleService;

  const employeeApiStub = {
    getEmployee: vi.fn(),
    createEmployee: vi.fn(),
    updateEmployee: vi.fn(),
    disableEmployee: vi.fn(),
  };
  const reportsApiStub = {
    getAttendanceDiscrepancyReport: vi.fn(),
  };
  const staffingApiStub = {
    listStaffingAssignments: vi.fn(),
    createStaffingAssignment: vi.fn(),
    endStaffingAssignment: vi.fn(),
  };
  const accessControlApiStub = {
    listRoleAssignments: vi.fn(),
    listAssignableRoles: vi.fn(),
    assignRoleToPerson: vi.fn(),
    revokePersonRoleAssignment: vi.fn(),
  };
  const workSessionsApiStub = {
    startWorkSession: vi.fn(),
    stopWorkSession: vi.fn(),
    startWorkSessionBreak: vi.fn(),
    stopWorkSessionBreak: vi.fn(),
  };
  const apiBaseStub = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        PeopleService,
        { provide: EmployeeAPIService, useValue: employeeApiStub },
        { provide: PeopleReportsAPIService, useValue: reportsApiStub },
        { provide: PeopleStaffingAssignmentsService, useValue: staffingApiStub },
        { provide: PeopleAccessControlService, useValue: accessControlApiStub },
        { provide: WorkSessionsAPIService, useValue: workSessionsApiStub },
        { provide: ApiBaseService, useValue: apiBaseStub },
      ],
    });

    service = TestBed.inject(PeopleService);
  });

  it('getEmployee() delegates to EmployeeAPIService.getEmployee', () => {
    const response: EmployeeProfileDto = {
      id: 'emp-1',
      firstName: 'Jane',
      lastName: 'Doe',
      employeeNumber: 'EMP-1',
      status: EmployeeProfileDtoStatusEnum.Active,
      hireDate: '2026-05-01',
    };
    employeeApiStub.getEmployee.mockReturnValue(of(response));

    service.getEmployee('emp-1').subscribe(result => expect(result).toEqual(response));

    expect(employeeApiStub.getEmployee).toHaveBeenCalledWith('emp-1');
  });

  it('createEmployee() delegates to EmployeeAPIService.createEmployee', () => {
    const request: CreateEmployeeRequest = {
      firstName: 'Jane',
      lastName: 'Doe',
      employeeNumber: 'EMP-1',
      status: CreateEmployeeRequestStatusEnum.Active,
      hireDate: '2026-05-01',
    };
    const response: EmployeeProfileDto = {
      id: 'emp-1',
      firstName: 'Jane',
      lastName: 'Doe',
      employeeNumber: 'EMP-1',
      status: EmployeeProfileDtoStatusEnum.Active,
      hireDate: '2026-05-01',
    };
    employeeApiStub.createEmployee.mockReturnValue(of(response));

    service.createEmployee(request).subscribe(result => expect(result).toEqual(response));

    expect(employeeApiStub.createEmployee).toHaveBeenCalledWith(request);
  });

  it('updateEmployee() delegates to EmployeeAPIService.updateEmployee', () => {
    const request: UpdateEmployeeRequest = {
      firstName: 'Updated',
      lastName: 'Name',
      employeeNumber: 'EMP-1',
      status: UpdateEmployeeRequestStatusEnum.Active,
      hireDate: '2026-05-01',
    };
    const response: EmployeeProfileDto = {
      id: 'emp-1',
      firstName: 'Updated',
      lastName: 'Name',
      employeeNumber: 'EMP-1',
      status: EmployeeProfileDtoStatusEnum.Active,
      hireDate: '2026-05-01',
    };
    employeeApiStub.updateEmployee.mockReturnValue(of(response));

    service.updateEmployee('emp-1', request).subscribe(result => expect(result).toEqual(response));

    expect(employeeApiStub.updateEmployee).toHaveBeenCalledWith('emp-1', request);
  });

  it('disableEmployee() delegates to EmployeeAPIService.disableEmployee', () => {
    const request = { assignmentEndDate: '2026-05-31' };
    employeeApiStub.disableEmployee.mockReturnValue(of({ id: 'emp-1', firstName: 'Jane', lastName: 'Doe' }));

    service.disableEmployee('emp-1', request).subscribe();

    expect(employeeApiStub.disableEmployee).toHaveBeenCalledWith('emp-1', request);
  });

  it('getAttendanceDiscrepancyReport() delegates to PeopleReportsAPIService', () => {
    const response: AttendanceDiscrepancyReportResponse[] = [{
      technicianId: 'tech-1',
      technicianName: 'Alice',
      locationId: 'loc-1',
      reportDate: '2026-05-01',
      totalAttendanceHours: 8,
      totalJobHours: 7,
      discrepancyHours: 1,
      thresholdApplied: 15,
      isFlagged: true,
    }];
    reportsApiStub.getAttendanceDiscrepancyReport.mockReturnValue(of(response));

    service.getAttendanceDiscrepancyReport('2026-05-01', '2026-05-31', 'UTC', 'loc-1', ['tech-1'], true)
      .subscribe(result => expect(result).toEqual(response));

    expect(reportsApiStub.getAttendanceDiscrepancyReport).toHaveBeenCalledWith(
      '2026-05-01',
      '2026-05-31',
      'UTC',
      'loc-1',
      ['tech-1'],
      true,
    );
  });

  it('getLocationAssignments() delegates to PeopleStaffingAssignmentsService.getAssignments', () => {
    const response: StaffingAssignmentResponse[] = [{
      assignmentId: 'a-1',
      personId: 'p-1',
      locationId: 'loc-1',
      role: 'TECH',
      status: StaffingAssignmentResponseStatusEnum.Active,
      effectiveFrom: '2026-05-01',
      isPrimary: true,
    }];
    staffingApiStub.listStaffingAssignments.mockReturnValue(of(response));

    service.getLocationAssignments('p-1').subscribe(result => expect(result).toEqual(response));

    expect(staffingApiStub.listStaffingAssignments).toHaveBeenCalledWith('p-1');
  });

  it('createLocationAssignment() delegates to PeopleStaffingAssignmentsService.createAssignment', () => {
    const request: CreateStaffingAssignmentRequest = {
      personId: 'p-1',
      locationId: 'loc-1',
      role: 'TECH',
      effectiveFrom: '2026-05-01',
      isPrimary: true,
    };
    const response: StaffingAssignmentResponse = {
      assignmentId: 'a-1',
      personId: 'p-1',
      locationId: 'loc-1',
      role: 'TECH',
      status: StaffingAssignmentResponseStatusEnum.Active,
      effectiveFrom: '2026-05-01',
      isPrimary: true,
    };
    staffingApiStub.createStaffingAssignment.mockReturnValue(of(response));

    service.createLocationAssignment(request).subscribe(result => expect(result).toEqual(response));

    expect(staffingApiStub.createStaffingAssignment).toHaveBeenCalledWith(request);
  });

  it('endLocationAssignment() delegates to PeopleStaffingAssignmentsService.endAssignment', () => {
    staffingApiStub.endStaffingAssignment.mockReturnValue(of(void 0));

    service.endLocationAssignment('a-1').subscribe();

    expect(staffingApiStub.endStaffingAssignment).toHaveBeenCalledWith('a-1');
  });

  it('getRoleAssignments() delegates to PeopleAccessControlService.getAssignments', () => {
    const response: UserRoleDto[] = [{ userId: 'p-1', roleCode: 'ROLE_ADMIN' }];
    accessControlApiStub.listRoleAssignments.mockReturnValue(of(response));

    service.getRoleAssignments('p-1', true).subscribe(result => expect(result).toEqual(response));

    expect(accessControlApiStub.listRoleAssignments).toHaveBeenCalledWith('p-1', true);
  });

  it('getAvailableRoles() delegates to PeopleAccessControlService.getRoles', () => {
    const response: RoleDto[] = [{ code: 'ROLE_ADMIN', name: 'Admin' }];
    accessControlApiStub.listAssignableRoles.mockReturnValue(of(response));

    service.getAvailableRoles('p-1').subscribe(result => expect(result).toEqual(response));

    expect(accessControlApiStub.listAssignableRoles).toHaveBeenCalledWith('p-1');
  });

  it('createRoleAssignment() delegates to PeopleAccessControlService.createAssignment', () => {
    const request: PersonRoleAssignmentRequest = { roleCode: 'ROLE_ADMIN', startDate: '2026-05-01' };
    const response: UserRoleDto = { userId: 'p-1', roleCode: 'ROLE_ADMIN' };
    accessControlApiStub.assignRoleToPerson.mockReturnValue(of(response));

    service.createRoleAssignment('p-1', request).subscribe(result => expect(result).toEqual(response));

    expect(accessControlApiStub.assignRoleToPerson).toHaveBeenCalledWith('p-1', request);
  });

  it('revokeRoleAssignment() delegates to PeopleAccessControlService.revokeAssignment', () => {
    accessControlApiStub.revokePersonRoleAssignment.mockReturnValue(of(void 0));

    service.revokeRoleAssignment('p-1', 'ROLE_ADMIN').subscribe();

    expect(accessControlApiStub.revokePersonRoleAssignment).toHaveBeenCalledWith('p-1', 'ROLE_ADMIN');
  });

  it('listApprovalPeople() calls the approval people endpoint', () => {
    apiBaseStub.get.mockReturnValue(of({ items: [] }));

    service.listApprovalPeople().subscribe();

    expect(apiBaseStub.get).toHaveBeenCalledWith('/people/v1/people/timekeeping/approvals/people');
  });

  it('listTimePeriods() calls the time periods endpoint', () => {
    apiBaseStub.get.mockReturnValue(of({ items: [] }));

    service.listTimePeriods().subscribe();

    expect(apiBaseStub.get).toHaveBeenCalledWith('/people/v1/people/timekeeping/time-periods');
  });

  it('listTimekeepingEntries() calls the entries endpoint with personId and timePeriodId params', () => {
    apiBaseStub.get.mockReturnValue(of({ items: [] }));

    service.listTimekeepingEntries('p-1', 'tp-1').subscribe();

    const [path, params] = apiBaseStub.get.mock.calls[0];
    expect(path).toBe('/people/v1/people/timekeeping/timekeeping-entries');
    expect(params.get('personId')).toBe('p-1');
    expect(params.get('timePeriodId')).toBe('tp-1');
  });

  it('listTimePeriodApprovals() calls the approvals history endpoint with personId and timePeriodId params', () => {
    apiBaseStub.get.mockReturnValue(of({ items: [] }));

    service.listTimePeriodApprovals('p-1', 'tp-1').subscribe();

    const [path, params] = apiBaseStub.get.mock.calls[0];
    expect(path).toBe('/people/v1/people/timekeeping/time-period-approvals');
    expect(params.get('personId')).toBe('p-1');
    expect(params.get('timePeriodId')).toBe('tp-1');
  });

  it('approveTimePeriod() calls the approval endpoint with encoded identifiers', () => {
    apiBaseStub.post.mockReturnValue(of(void 0));

    service.approveTimePeriod('tp/1', 'person 1').subscribe();

    expect(apiBaseStub.post).toHaveBeenCalledWith(
      '/people/v1/people/timekeeping/time-periods/tp%2F1/people/person%201/approve',
      {},
    );
  });

  it('rejectTimePeriod() calls the rejection endpoint with encoded identifiers and request body', () => {
    apiBaseStub.post.mockReturnValue(of(void 0));
    const request = { comments: 'Needs correction' };

    service.rejectTimePeriod('tp/1', 'person 1', request).subscribe();

    expect(apiBaseStub.post).toHaveBeenCalledWith(
      '/people/v1/people/timekeeping/time-periods/tp%2F1/people/person%201/reject',
      request,
    );
  });

  it('startSession() delegates to WorkSessionsAPIService.startWorkSession', () => {
    const response: WorkSessionDto = { sessionId: 's-1', personId: 'p-1', status: 'ACTIVE' };
    workSessionsApiStub.startWorkSession.mockReturnValue(of(response));

    service.startSession('p-1').subscribe(result => expect(result).toEqual(response));

    expect(workSessionsApiStub.startWorkSession).toHaveBeenCalledWith({ personId: 'p-1' });
  });

  it('stopSession() delegates to WorkSessionsAPIService.stopWorkSession', () => {
    const response: WorkSessionDto = { sessionId: 's-1', personId: 'p-1', status: 'STOPPED', endedAt: '2026-05-05T12:00:00Z' };
    workSessionsApiStub.stopWorkSession.mockReturnValue(of(response));

    service.stopSession('p-1').subscribe(result => expect(result).toEqual(response));

    expect(workSessionsApiStub.stopWorkSession).toHaveBeenCalledWith({ personId: 'p-1' });
  });

  it('startBreak() delegates to WorkSessionsAPIService.startWorkSessionBreak', () => {
    const response = { startedAt: '2026-05-05T10:00:00Z' };
    workSessionsApiStub.startWorkSessionBreak.mockReturnValue(of(response));

    service.startBreak('s-1').subscribe(result => expect(result).toEqual(response));

    expect(workSessionsApiStub.startWorkSessionBreak).toHaveBeenCalledWith('s-1');
  });

  it('stopBreak() delegates to WorkSessionsAPIService.stopWorkSessionBreak', () => {
    const response = { endedAt: '2026-05-05T10:15:00Z' };
    workSessionsApiStub.stopWorkSessionBreak.mockReturnValue(of(response));

    service.stopBreak('s-1').subscribe(result => expect(result).toEqual(response));

    expect(workSessionsApiStub.stopWorkSessionBreak).toHaveBeenCalledWith('s-1');
  });

  it('submitWorkSession() calls the submit endpoint with an encoded session id', () => {
    const request: WorkSessionSubmitRequest = {
      billableMinutes: 120,
      breakMinutes: 15,
      submittedAt: '2026-05-05T12:00',
    };
    apiBaseStub.post.mockReturnValue(of({ correlationId: 'corr-1' }));

    service.submitWorkSession('session/1', request).subscribe();

    expect(apiBaseStub.post).toHaveBeenCalledWith(
      '/people/v1/people/workSessions/session%2F1/submit',
      request,
    );
  });
});
