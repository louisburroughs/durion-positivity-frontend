import { AuthService } from '../services/auth.service';

/**
 * route-access.ts
 * ---------------
 * The single access decision shared by the route guard and the nav registry, so
 * a gated route can never be offered by a nav entry that disagrees with it.
 *
 * A route or nav entry may declare:
 *   `permissions` — fine-grained codes from the JWT `perm_bits` claim (preferred;
 *                   this is how the backend actually authorizes)
 *   `roles`       — coarse `ROLE_*` claims (legacy, and the fallback for tokens
 *                   issued before `perm_bits` existed)
 *
 * Both are "any of". When `permissions` is declared and the token carries a
 * `perm_bits` claim, permissions decide alone. Otherwise the decision falls back
 * to `roles`, and to "open" when neither is declared — which is the pre-existing
 * behavior and keeps mock-auth and legacy tokens working.
 *
 * This is a navigation/UX boundary, not the security boundary: the backend
 * authorizes every call regardless of what the UI allows.
 */
export interface RouteAccessRequirement {
  readonly roles?: readonly string[];
  readonly permissions?: readonly string[];
}

export function canAccess(auth: AuthService, requirement: RouteAccessRequirement): boolean {
  const requiredPermissions = requirement.permissions ?? [];
  if (requiredPermissions.length && auth.permissionsKnown()) {
    return auth.hasAnyPermission(requiredPermissions);
  }

  const requiredRoles = requirement.roles ?? [];
  if (requiredRoles.length) {
    return auth.hasAnyRole(requiredRoles);
  }

  return true;
}
