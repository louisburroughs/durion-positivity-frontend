import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import {
  EmployeeAPIService,
  EmployeeProfileDto,
  EmployeeProfileDtoStatusEnum,
  EmployeeSummaryDto,
} from '@durion-sdk/people';

import { EmployeeRegisterService } from './employee-register.service';
import { EnrichedEmployeeSummaryDto } from '../models/employee-register.models';

const thin: EmployeeSummaryDto = {
  active: true,
  employeeId: 'emp-1',
  employeeNumber: 'EMP-10428',
  firstName: 'Renee',
  lastName: 'Albright',
  personId: 'per-1',
  status: 'ACTIVE',
};

const enriched: EnrichedEmployeeSummaryDto = {
  ...thin,
  employeeId: 'emp-2',
  personId: 'per-2',
  username: 'renee.albright',
  contactInfo: { email: 'renee.albright@durion.internal', phone: '(704) 555-0142' },
  roleAssignments: [
    { roleCode: 'SERVICE_MANAGER', scope: 'LOCATION' },
    { roleCode: 'HR_ADMIN', scope: 'GLOBAL' },
    { roleCode: null, scope: 'GLOBAL' },
  ],
  primaryLocation: { name: 'Charlotte Main' },
  otherLocationCount: 1,
  jobRole: 'Service Manager',
  allowedActions: ['DISABLE', 'NOT_A_REAL_ACTION'],
};

const employeeApi = {
  searchEmployees: vi.fn(),
  disableEmployee: vi.fn(),
};

describe('EmployeeRegisterService', () => {
  let service: EmployeeRegisterService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        EmployeeRegisterService,
        { provide: EmployeeAPIService, useValue: employeeApi },
      ],
    });
    service = TestBed.inject(EmployeeRegisterService);
  });

  it('passes the query and a single generous page to the SDK', () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({ items: [], page: 0, size: 200, totalElements: 0, totalPages: 0 }),
    );
    service.searchEmployees('albright', 200).subscribe();
    expect(employeeApi.searchEmployees).toHaveBeenCalledWith('albright', 0, 200);
  });

  it('sends undefined rather than an empty query string', () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({ items: [], page: 0, size: 200, totalElements: 0, totalPages: 0 }),
    );
    service.searchEmployees('', 200).subscribe();
    expect(employeeApi.searchEmployees).toHaveBeenCalledWith(undefined, 0, 200);
  });

  it('leaves not-yet-served fields undefined so the page can say "not available"', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({ items: [thin], page: 0, size: 200, totalElements: 1, totalPages: 1 }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    const [mapped] = rows;

    expect(mapped.username).toBeUndefined();
    expect(mapped.email).toBeUndefined();
    expect(mapped.roles).toBeUndefined();
    expect(mapped.primaryLocation).toBeUndefined();
    expect(mapped.jobRole).toBeUndefined();
    // …while the fields pos-people serves today are mapped.
    expect(mapped.status).toBe('ACTIVE');
    expect(mapped.employeeNumber).toBe('EMP-10428');
  });

  it('maps the register projection when it arrives, dropping malformed members', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({ items: [enriched], page: 0, size: 200, totalElements: 1, totalPages: 1 }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    const [mapped] = rows;

    expect(mapped.username).toBe('renee.albright');
    expect(mapped.email).toBe('renee.albright@durion.internal');
    expect(mapped.primaryLocation).toBe('Charlotte Main');
    expect(mapped.otherLocationCount).toBe(1);
    // A role assignment with no code is dropped, not rendered as a blank chip.
    expect(mapped.roles).toEqual([
      { code: 'SERVICE_MANAGER', scope: 'LOCATION' },
      { code: 'HR_ADMIN', scope: 'GLOBAL' },
    ]);
    // An action the client does not model is discarded rather than trusted.
    expect(mapped.allowedActions).toEqual(['DISABLE']);
  });

  it('coerces an unrecognised status to null rather than rendering a raw value', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [{ ...thin, status: 'RETIRED' }],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    const [mapped] = rows;
    expect(mapped.status).toBeNull();
  });

  it('keeps null distinct from undefined: served-but-empty is not "not available"', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [
          {
            ...thin,
            username: null,
            contactInfo: { email: null, phone: null },
            primaryLocation: null,
            jobRole: null,
          },
        ],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    const [mapped] = rows;

    // The projection served these and they are genuinely empty, so the page must render
    // — / Unassigned, not "not available yet" (ADR-0064 read-outcome semantics).
    expect(mapped.username).toBeNull();
    expect(mapped.email).toBeNull();
    expect(mapped.phone).toBeNull();
    expect(mapped.jobRole).toBeNull();
    // contactInfo was present, so the fields are served even though both are null.
    expect(mapped.email).not.toBeUndefined();
    expect(mapped.primaryLocation).toBeNull();
  });

  it('sends the assignment end date on disable and emits the profile it returns', async () => {
    const disabled: EmployeeProfileDto = {
      employeeNumber: 'EMP-10428',
      firstName: 'Renee',
      hireDate: '2021-03-01',
      id: 'emp-1',
      lastName: 'Albright',
      status: EmployeeProfileDtoStatusEnum.Disabled,
    };
    employeeApi.disableEmployee.mockReturnValue(of(disabled));

    // Asserting the emission too: argument-only coverage would still pass if the wrapper
    // returned EMPTY or swapped the value (ADR-0035).
    const emitted = await firstValueFrom(service.disableEmployee('emp-1', '2026-09-22'));

    expect(employeeApi.disableEmployee).toHaveBeenCalledWith('emp-1', {
      assignmentEndDate: '2026-09-22',
    });
    expect(emitted).toEqual(disabled);
    expect(emitted.status).toBe(EmployeeProfileDtoStatusEnum.Disabled);
  });

  it('withholds the scope suffix rather than asserting LOCATION for an unknown scope', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [
          {
            ...thin,
            roleAssignments: [
              { roleCode: 'SERVICE_MANAGER', scope: 'REGION' },
              { roleCode: 'HR_ADMIN', scope: null },
              { roleCode: 'DISPATCHER', scope: 'GLOBAL' },
            ],
          },
        ],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));

    // Defaulting an unrecognised scope to LOCATION rendered "· L" — the page asserting a
    // scope check it never made (DECISION-PEOPLE-003). The role is real, so it is kept;
    // only the claim about its scope is withheld.
    expect(rows[0].roles).toEqual([
      { code: 'SERVICE_MANAGER', scope: null },
      { code: 'HR_ADMIN', scope: null },
      { code: 'DISPATCHER', scope: 'GLOBAL' },
    ]);
  });

  it('reads absence at the nested level too, not just the group level', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [
          {
            ...thin,
            // A partial projection: the group is served, one field inside it is not.
            contactInfo: { phone: '(704) 555-0142' },
            primaryLocation: {},
          },
        ],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    const [mapped] = rows;

    // `email` was never sent, so the cell must say "not available yet". Reading it as null
    // would render "—" — the page asserting the employee has no email address.
    expect(mapped.email).toBeUndefined();
    expect(mapped.phone).toBe('(704) 555-0142');
    expect(mapped.primaryLocation).toBeUndefined();
  });

  it('keeps a served zero location count distinct from one that was never sent', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [
          { ...thin, primaryLocation: { name: 'Charlotte Main' }, otherLocationCount: null },
          { ...thin, employeeId: 'emp-3', primaryLocation: { name: 'Charlotte Main' } },
        ],
        page: 0,
        size: 200,
        totalElements: 2,
        totalPages: 2,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));

    // Served and empty: the employee really has no other locations, so the cell may say
    // "Primary". Absent: the count was never sent, and claiming "Primary" would assert a
    // zero the page was never told (ADR-0064).
    expect(rows[0].otherLocationCount).toBeNull();
    expect(rows[1].otherLocationCount).toBeUndefined();
  });

  it('treats null allowedActions as "no capabilities", never as "not served"', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [{ ...thin, allowedActions: null }],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));

    // undefined would mean "the projection does not publish capabilities", and the page then
    // falls back to the caller's permissions — so collapsing null into it would GRANT the
    // PII cells and the disable switch on a row the server said nothing may be done to.
    expect(rows[0].allowedActions).toEqual([]);
    expect(rows[0].allowedActions).not.toBeUndefined();
  });

  it('treats null role assignments as "no roles", not "not available"', async () => {
    employeeApi.searchEmployees.mockReturnValue(
      of({
        items: [{ ...thin, roleAssignments: null }],
        page: 0,
        size: 200,
        totalElements: 1,
        totalPages: 1,
      }),
    );

    const { rows } = await firstValueFrom(service.searchEmployees(undefined, 200));
    expect(rows[0].roles).toEqual([]);
    expect(rows[0].roles).not.toBeUndefined();
  });
});
