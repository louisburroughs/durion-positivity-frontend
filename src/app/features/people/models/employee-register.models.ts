import { EmployeeSummaryDto } from '@durion-sdk/people';

/**
 * Employment lifecycle (DECISION-PEOPLE-001). `DISABLED` is a reversible soft-offboard;
 * `TERMINATED` is terminal. `ON_LEAVE` and `SUSPENDED` carry an effective date and a reason,
 * so they are set on the profile, never from the register's switch.
 */
export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED' | 'DISABLED';

/**
 * The two statuses the register's activate/deactivate switch may move between. Every other
 * status renders as a read-only badge — see `Lifecycle.dc.html` in
 * `design/HR/EmployeeRegister/`.
 */
export const SWITCHABLE_STATUSES: readonly EmploymentStatus[] = ['ACTIVE', 'DISABLED'];

export function isSwitchableStatus(status: EmploymentStatus | null): boolean {
  return status !== null && SWITCHABLE_STATUSES.includes(status);
}

/** Role assignments are scope-aware (DECISION-PEOPLE-003). */
export type RoleScope = 'GLOBAL' | 'LOCATION';

export interface EmployeeRoleChip {
  readonly code: string;
  /** null when the projection sent a scope this client does not recognise — see `toScope`. */
  readonly scope: RoleScope | null;
}

/**
 * Per-record capability flags (DECISION-PEOPLE-013). Absent list = the backend does not yet
 * publish them, and the page falls back to gating on the caller's permissions plus the
 * status rules above. See backend issue #2159.
 */
export type EmployeeAction = 'VIEW_PII' | 'UPDATE' | 'DISABLE' | 'ENABLE';

/**
 * One row of the employee register.
 *
 * The first block comes from `EmployeeSummaryDto`, which pos-people serves today. The
 * enrichment block is `undefined` until the register projection ships (backend issue #2155);
 * the page renders those cells as "not available" rather than guessing, and lights up with
 * no further frontend change once the fields arrive.
 */
export interface EmployeeRegisterRow {
  readonly employeeId: string;
  readonly personId: string;
  readonly employeeNumber: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly status: EmploymentStatus | null;
  readonly active: boolean;

  // ── Enrichment — pending backend #2155 ──────────────────────────────────────────────
  readonly username?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly roles?: readonly EmployeeRoleChip[];
  readonly primaryLocation?: string | null;
  readonly otherLocationCount?: number | null;
  readonly jobRole?: string | null;
  readonly allowedActions?: readonly EmployeeAction[];
}

export interface EmployeeRegisterPage {
  readonly rows: readonly EmployeeRegisterRow[];
  readonly page: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}

/**
 * The register projection's forward contract (backend issue #2155).
 *
 * `EmployeeSummaryDto` as generated carries only the identity and status block. These optional
 * members are what #2155 adds; declaring them here keeps the mapping in
 * `employee-register.service.ts` typed instead of casting through `any`, and gives the
 * contract one place to change when the SDK is regenerated.
 */
export interface EnrichedEmployeeSummaryDto extends EmployeeSummaryDto {
  readonly username?: string | null;
  readonly contactInfo?: { readonly email?: string | null; readonly phone?: string | null } | null;
  readonly roleAssignments?: ReadonlyArray<{
    readonly roleCode?: string | null;
    readonly scope?: string | null;
  }> | null;
  readonly primaryLocation?: { readonly name?: string | null } | null;
  readonly otherLocationCount?: number | null;
  readonly jobRole?: string | null;
  readonly allowedActions?: readonly string[] | null;
}
