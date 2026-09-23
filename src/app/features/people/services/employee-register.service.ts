import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EmployeeAPIService, EmployeeProfileDto, EmployeeSummaryDto } from '@durion-sdk/people';

import {
  EmployeeAction,
  EmployeeRegisterPage,
  EmployeeRegisterRow,
  EmployeeRoleChip,
  EmploymentStatus,
  RoleScope,
} from '../models/employee-register.models';

/** Every enrichment group the register renders (backend #2155, plus ALLOWED_ACTIONS from #2159). */
const REGISTER_INCLUDES: Array<
  'USERNAME' | 'CONTACT_INFO' | 'ROLE_ASSIGNMENTS' | 'LOCATION' | 'JOB_ROLE' | 'ALLOWED_ACTIONS'
> = ['USERNAME', 'CONTACT_INFO', 'ROLE_ASSIGNMENTS', 'LOCATION', 'JOB_ROLE', 'ALLOWED_ACTIONS'];

const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'TERMINATED',
  'DISABLED',
];

const EMPLOYEE_ACTIONS: readonly EmployeeAction[] = ['VIEW_PII', 'UPDATE', 'DISABLE', 'ENABLE'];

function toStatus(raw: string | undefined): EmploymentStatus | null {
  const found = EMPLOYMENT_STATUSES.find(s => s === raw);
  return found ?? null;
}

/**
 * An unrecognised scope is NOT location-scoped. Defaulting it there turned a malformed or
 * partial assignment into an asserted location role — the chip would read `· L` and the
 * viewer would believe the scope had been checked (DECISION-PEOPLE-003).
 *
 * Dropping the assignment would hide a role the employee genuinely holds, so the role is
 * kept and only the scope suffix is withheld.
 */
function toScope(raw: string | null | undefined): RoleScope | null {
  // pos-people serves `Role.locationScope`, whose tenant-wide value is `ALL` (ADR-0061 §1).
  if (raw === 'ALL') return 'GLOBAL';
  if (raw === 'LOCATION') return 'LOCATION';
  return null;
}

function toRoleChips(
  assignments: EmployeeSummaryDto['roleAssignments'],
): readonly EmployeeRoleChip[] | undefined {
  // Same null-versus-undefined rule as the contact fields: an absent key means the projection
  // does not serve roles yet, while an explicit null means served and the employee has none —
  // which the template renders as "No roles", not "not available yet" (ADR-0064).
  if (assignments === undefined) return undefined;
  if (assignments === null) return [];
  return assignments
    .filter(a => !!a.roleName)
    .map(a => ({ code: a.roleName, scope: toScope(a.roleLocationScope) }));
}

/**
 * Reads a field out of a nested projection object under the absent/null/value rule, at BOTH
 * levels — the distinction this codebase keeps getting wrong one layer at a time.
 *
 * The outer key decides whether the projection serves this group at all; the inner key decides
 * whether it serves this field. A `contactInfo` object that carries `phone` but omits `email`
 * is a partial projection, and reading the missing one as null would render it as "—" — the
 * page asserting the employee has no email when it was simply never sent (ADR-0064).
 */
function nested(
  dto: EmployeeSummaryDto,
  outer: 'contactInfo' | 'primaryLocation' | 'jobRole',
  field: string,
): string | null | undefined {
  if (!(outer in dto)) return undefined;
  const group = (dto as unknown as Record<string, unknown>)[outer];
  if (group === null || group === undefined) return null;
  if (typeof group !== 'object' || !(field in group)) return undefined;
  return ((group as Record<string, unknown>)[field] as string | null | undefined) ?? null;
}

function toActions(raw: readonly string[] | null | undefined): readonly EmployeeAction[] | undefined {
  // The same null-versus-undefined rule as the contact fields and roles, and the one place
  // where getting it wrong GRANTS rather than withholds: the page reads `undefined` as
  // "capabilities not served" and falls back to the caller's permissions, so collapsing an
  // explicit null into it would turn "this viewer may do nothing to this row" into
  // "no opinion" and re-expose the PII cells and the disable switch (ADR-0064, ADR-0040 §6a).
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  return raw.filter((value): value is EmployeeAction =>
    EMPLOYEE_ACTIONS.includes(value as EmployeeAction),
  );
}

/**
 * Reads for the employee register (`/app/people/employees`).
 *
 * Transport is the generated `@durion-sdk/people` facade (ADR-0041). Roles, location, job role,
 * contact details and allowed actions are served only when requested with `include=` (backend
 * #2155/#2159), so `toRow` maps them defensively and leaves any group the projection did not
 * serve `undefined`.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeRegisterService {
  private readonly employeeApi = inject(EmployeeAPIService);

  /**
   * Fetches a single generous page and filters, sorts and paginates client-side — the same
   * shape the sibling People directory uses. `totalElements` is carried through so the page
   * can tell the user when the tenant is larger than one fetch.
   */
  searchEmployees(query: string | undefined, size: number): Observable<EmployeeRegisterPage> {
    // Without `include=` the endpoint returns the thin row and every enrichment column would sit
    // on "not available yet" with nothing failing to say so.
    return this.employeeApi
      .searchEmployees(query || undefined, undefined, undefined, 0, size, REGISTER_INCLUDES)
      .pipe(
        map(response => ({
          rows: (response.items ?? []).map(item => this.toRow(item)),
          page: response.page ?? 0,
          size: response.size ?? size,
          totalElements: response.totalElements ?? (response.items ?? []).length,
          totalPages: response.totalPages ?? 1,
        })),
      );
  }

  /**
   * Moves ACTIVE → DISABLED. `assignmentEndDate` is exclusive (DECISION-PEOPLE-014) and ends
   * the employee's open role and location assignments.
   *
   * The reverse edge (DISABLED → ACTIVE) has no endpoint — see backend issue #2156 — so the
   * register renders a disabled employee's status as a read-only badge rather than offering a
   * switch it cannot honour.
   */
  disableEmployee(employeeId: string, assignmentEndDate: string): Observable<EmployeeProfileDto> {
    return this.employeeApi.disableEmployee(employeeId, { assignmentEndDate });
  }

  private toRow(dto: EmployeeSummaryDto): EmployeeRegisterRow {
    return {
      employeeId: dto.employeeId,
      personId: dto.personId,
      employeeNumber: dto.employeeNumber ?? null,
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      status: toStatus(dto.status),
      active: dto.active,
      // `undefined` and `null` are NOT interchangeable here (ADR-0064): undefined means the
      // projection does not serve this field yet (#2155) and the page says "not available";
      // null means served and genuinely empty, which renders as — / Unassigned.
      // Key PRESENCE is the test, not truthiness: `contactInfo: null` means the projection
      // served the field and the employee has none, which is null (renders as —), while an
      // absent key means it is not served yet, which is undefined ("not available yet").
      username: dto.username,
      email: nested(dto, 'contactInfo', 'primaryEmail'),
      phone: nested(dto, 'contactInfo', 'primaryPhone'),
      roles: toRoleChips(dto.roleAssignments),
      primaryLocation: nested(dto, 'primaryLocation', 'name'),
      // Fourth field under the same rule, and the one the template reads as a claim: a served
      // null means "no other locations" and prints "Primary", while an absent key means the
      // count was not served and the page must not assert a number it does not have.
      otherLocationCount:
        'otherLocationCount' in dto ? (dto.otherLocationCount ?? null) : undefined,
      jobRole: nested(dto, 'jobRole', 'name'),
      allowedActions: toActions(dto.allowedActions),
    };
  }
}
