import { AuthService } from '../services/auth.service';

/**
 * route-access.ts
 * ---------------
 * The single access decision shared by the route guard and the nav registry, so
 * a gated route can never be offered by a nav entry that disagrees with it.
 *
 * A route or nav entry may declare:
 *   `permissions`    — fine-grained codes from the JWT `perm_bits` claim
 *                      (preferred; this is how the backend actually authorizes).
 *                      Satisfied by holding *any* of them, matching Spring's
 *                      `hasAnyAuthority`.
 *   `allPermissions` — codes that must *all* be held, matching the handful of
 *                      endpoints whose `@PreAuthorize` ANDs two authorities
 *                      (e.g. cross-dock needs receiving:complete *and*
 *                      issue:parts).
 *   `roles`          — coarse `ROLE_*` claims (legacy, and the fallback for
 *                      tokens issued before `perm_bits` existed)
 *
 * When either permission list is declared and the token carries a `perm_bits`
 * claim, permissions decide alone. Otherwise the decision falls back to `roles`,
 * and to "open" when neither is declared — which is the pre-existing behavior
 * and keeps mock-auth and legacy tokens working.
 *
 * This is a navigation/UX boundary, not the security boundary: the backend
 * authorizes every call regardless of what the UI allows.
 */
export interface RouteAccessRequirement {
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
  readonly allPermissions?: readonly string[];
}

export function canAccess(auth: AuthService, requirement: RouteAccessRequirement): boolean {
  const anyOf = requirement.permissions ?? [];
  const allOf = requirement.allPermissions ?? [];

  if ((anyOf.length || allOf.length) && auth.permissionsKnown()) {
    if (anyOf.length && !auth.hasAnyPermission(anyOf)) return false;
    if (allOf.length && !allOf.every(permission => auth.hasPermission(permission))) return false;
    return true;
  }

  const requiredRoles = requirement.roles ?? [];
  if (requiredRoles.length) {
    return auth.hasAnyRole(requiredRoles);
  }

  return true;
}
