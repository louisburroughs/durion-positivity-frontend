/** Shape of the JWT claims expected from durion-positivity-backend. */
export interface JwtClaims {
  sub: string;          // username / subject
  roles?: string[];     // canonical UI-gating claim
  authorities?: string[]; // legacy compatibility only; not issued for new tokens
  exp: number;          // expiry epoch (seconds)
  iat?: number;
  /**
   * Base64URL-encoded permission bitset (ADR-0040). Absent on tokens issued
   * before the claim existed — absent means "permissions unknown", which is
   * not the same as the empty string, which means "no permissions granted".
   */
  perm_bits?: string;
  /** Backend permission-catalog version `perm_bits` was encoded against. */
  perm_ver?: number;
  /** Location-scope bitsets; backend-authoritative, not used for UI gating. */
  loc_fin_bits?: string;
  loc_oth_bits?: string;
  /**
   * Tenant id the session is bound to (ADR-0062). Issued on every token since
   * WS2b; optional in the type only for tokens minted before the claim existed.
   * The tenant is read from here and nowhere else — never from a route, a
   * header, or a request body.
   */
  tid?: string;
}

/**
 * The caller's tenant as `GET /v1/tenants/me` reports it (security-service's
 * replica of the tenant registry). Mirrors `TenantMeResponse` with the id
 * named for what it is.
 */
export interface TenantSummary {
  /** Tenant id — equals the token's `tid` claim. */
  tenantId: string;
  /** URL-safe unique name. */
  slug: string;
  /** Human-readable name; falls back to the slug when the registry has none. */
  displayName: string;
  /** Lifecycle status: PENDING, ACTIVE, SUSPENDED or DECOMMISSIONED. */
  status: string;
}
