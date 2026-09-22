import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { EmployeeAPIService, EmployeeSummaryDto } from '@durion-sdk/people';

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
  additionalLocationCount: 1,
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
    expect(mapped.additionalLocationCount).toBe(1);
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

  it('sends the assignment end date on disable', () => {
    employeeApi.disableEmployee.mockReturnValue(of({}));
    service.disableEmployee('emp-1', '2026-09-22').subscribe();
    expect(employeeApi.disableEmployee).toHaveBeenCalledWith('emp-1', {
      assignmentEndDate: '2026-09-22',
    });
  });
});
