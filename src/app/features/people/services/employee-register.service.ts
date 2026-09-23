import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { EmployeeAPIService, EmployeeProfileDto } from '@durion-sdk/people';

import {
  EmployeeAction,
  EmployeeRegisterPage,
  EmployeeRegisterRow,
  EmployeeRoleChip,
  EmploymentStatus,
  EnrichedEmployeeSummaryDto,
  RoleScope,
} from '../models/employee-register.models';

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
  if (raw === 'GLOBAL') return 'GLOBAL';
  if (raw === 'LOCATION') return 'LOCATION';
  return null;
}

function toRoleChips(
  assignments: EnrichedEmployeeSummaryDto['roleAssignments'],
): readonly EmployeeRoleChip[] | undefined {
  // Same null-versus-undefined rule as the contact fields: an absent key means the projection
  // does not serve roles yet, while an explicit null means served and the employee has none —
  // which the template renders as "No roles", not "not available yet" (ADR-0064).
  if (assignments === undefined) return undefined;
  if (assignments === null) return [];
  return assignments
    .filter((a): a is { roleCode: string; scope?: string | null } => !!a.roleCode)
    .map(a => ({ code: a.roleCode, scope: toScope(a.scope) }));
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
  dto: EnrichedEmployeeSummaryDto,
  outer: 'contactInfo' | 'primaryLocation',
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
 * Transport is the generated `@durion-sdk/people` facade (ADR-0041). The register's row shape
 * is wider than `EmployeeSummaryDto` currently serves — roles, location, job role and contact
 * details arrive with backend issue #2155 — so `toRow` maps them defensively and leaves them
 * `undefined` until then.
 */
@Injectable({ providedIn: 'root' })
export class EmployeeRegisterService {
  private readonly employeeApi = inject(EmployeeAPIService);

  /**
   * `searchEmployees` takes no status filter and no sort (backend issue #2158), so the page
   * fetches a single generous page and filters, sorts and paginates client-side — the same
   * shape the sibling People directory uses. `totalElements` is carried through so the page
   * can tell the user when the tenant is larger than one fetch.
   */
  searchEmployees(query: string | undefined, size: number): Observable<EmployeeRegisterPage> {
    // NOTE on #2155: the enriched projection is served behind an `include=` query parameter so
    // existing callers keep the thin payload. The generated signature is `(q, page, size)` today
    // and carries no such parameter, so it cannot be passed yet — when the SDK is regenerated
    // this call must add it, or the register will keep receiving the thin rows and every
    // enrichment column will stay on "not available yet" with nothing failing to say so.
    return this.employeeApi.searchEmployees(query || undefined, 0, size).pipe(
      map(response => ({
        rows: (response.items ?? []).map(item => this.toRow(item as EnrichedEmployeeSummaryDto)),
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

  private toRow(dto: EnrichedEmployeeSummaryDto): EmployeeRegisterRow {
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
      email: nested(dto, 'contactInfo', 'email'),
      phone: nested(dto, 'contactInfo', 'phone'),
      roles: toRoleChips(dto.roleAssignments),
      primaryLocation: nested(dto, 'primaryLocation', 'name'),
      // Fourth field under the same rule, and the one the template reads as a claim: a served
      // null means "no other locations" and prints "Primary", while an absent key means the
      // count was not served and the page must not assert a number it does not have.
      otherLocationCount:
        'otherLocationCount' in dto ? (dto.otherLocationCount ?? null) : undefined,
      jobRole: dto.jobRole,
      allowedActions: toActions(dto.allowedActions),
    };
  }
}
